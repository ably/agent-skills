---
name: using-ably-with-temporal
description: >
  ALWAYS use when running an Ably AI Transport agent inside a Temporal workflow —
  building a durable AI chat or agent app on Temporal, or converting an existing
  Temporal app to stream its agent output over Ably. Covers the workflow/activity
  split, one-step-per-activity retry semantics, pinning run identity to the Temporal
  workflowId, detach-vs-end teardown, closing a run exactly once when retries are
  exhausted, cancellation without Temporal signals, and the mutableMessages channel
  rule. Fetches current docs from ably.com/llms.txt before generating code. Not for
  general Ably work (use the using-ably skill) or single-process agents with no
  durable execution engine.
license: Apache-2.0
metadata:
  tags: ably, ai-transport, temporal, durable-execution, workflow, activity, ai-agents, streaming, llm
---

# Using Ably AI Transport with Temporal

Temporal gives an AI turn durability and retries. Ably AI Transport gives it a live
client: token streaming, cancellation, multi-device sync, and replayable history.
This skill covers how the two compose — which system owns what, and the invariants
that make retries safe.

Two entry points: standing up a new durable agent, or converting an existing
Temporal app to stream over Ably. For conversion, read
[references/migration.md](./references/migration.md) after this file.

## Documentation

Fetch `https://ably.com/llms.txt?source=using-ably-with-temporal` for the doc index,
then the three Temporal pages it lists (getting-started, frameworks, and the
`/temporal` API reference). The guidance below is the composition rules and failure
modes that the docs do not spell out — it does not replace them.

---

## Before Writing Code

**The run/step API is pre-1.0 and moves between releases.** Run identity recently
moved from the runtime options object into its own argument on `createRun` and
`adoptRun`, and `RunRuntime` was renamed. Code generated from memory will not
compile.

1. Read the installed version: `npm ls @ably/ai-transport` (or the `package.json` pin)
2. Fetch the agent-session API reference and verify `createRun`, `adoptRun`,
   `createStep`, `pipe`, and `end` against **that** version
3. Only then write activity code

If you are installing fresh, pin explicitly rather than floating — the published docs
track the latest release, so an unpinned install can outrun the samples you just read.

---

## 1. Division of Labour

| Layer | Owns | Must not |
|-------|------|----------|
| **HTTP route** | Starting one workflow per POST; returning immediately | Stream a response body, or wait for the turn |
| **Workflow** | Sequencing activities, routing on their outcomes, failure cleanup | Touch Ably, the model SDK, or anything with I/O |
| **Activity** | All I/O: its own Ably client + session, one step's output | Span more than one step, or outlive its session |
| **Client** | `useChat` / client session over the Ably channel | Know that Temporal exists |

```
Client POST /api/chat
  └── route: workflow.start(chatWorkflow, { workflowId: invocationId })  → returns { invocationId }
        └── workflow (no I/O):
              ├── openRun activity            → creates + starts the run, returns ids
              ├── inference activity          → one step: streamText → step.pipe
              ├── tool activity (per call)    → one step: execute → step.send
              ├── ...loop until terminal outcome
              └── catch → cleanup activity    → run.end({ reason: 'error' })
```

The client is unchanged from a non-durable setup. Whether the agent side is one
`streamText` call or a Temporal workflow is invisible over the wire.

**Split opening the run from the first inference.** Two activities, not one. An
inference failure then retries the inference alone and never republishes the run's
opening event, and the run ids reach the workflow before any model call — so a later
failure still has ids to hand to cleanup instead of orphaning an active run.

---

## 2. Identity Invariants

These three bindings are what make a retry idempotent rather than duplicating work.

| Bind | To | Why |
|------|-----|-----|
| `workflowId` | the invocation id | One workflow per HTTP POST; gives every retry a stable name |
| `runId` | the same invocation id | A fresh-process retry of the opening activity re-enters the *same* run |
| `stepId` | `stepIdFor(invocationId)` | Derives from the Temporal activity id, so a retry supersedes its own prior output |

```javascript
// Opening activity — the only place a run is created.
const run = session.createRun(Invocation.fromJSON(input.invocation), {
  invocationId: input.invocationId,
  runId: input.invocationId, // pin to the Temporal workflowId
});
// Verify the argument shape against the agent-session API reference for your
// installed version — run identity moved between arguments in a recent release.
```

Without the `runId` pin, a retried opening activity mints a new id and opens a second
run in parallel with the first. With it, the republished start event folds
idempotently onto the existing run.

`stepIdFor` comes from `@ably/ai-transport/temporal` and reads
`Context.current().info.activityId`, so it **must be called inside an activity**.
`@temporalio/activity` is an optional peer dependency — install it.

---

## 3. `detach()`, Not `end()`

The single most damaging mistake in this integration. Each activity closes its
session when done, and which method it calls decides whether a retry can succeed.

```javascript
// WRONG: ends the run, marking it terminal
} catch (error) {
  await session.end();   // publishes run-end; the retry now writes to a read-only run
  throw error;
}

// RIGHT: detach, leaving the run active for the retry to adopt
} catch (error) {
  await safeSessionDetach(session);   // your own helper — see section 7
  throw error;
} finally {
  ably.close();          // the session does not own the client's lifecycle
}
```

`end()` publishes a run-end event and marks the run terminal. Every subsequent retry
then fails with "run is terminal (read-only)", and the client's UI is stuck on a run
that reports finished with no output. Use `detach()` on **every** retryable path —
success and failure alike. `end()` belongs in exactly one place: the cleanup activity
in section 4.

Each activity builds its own `Ably.Realtime` and its own session, and closes the
client in `finally`. Do not try to share a client or session across activities —
activities can run in different processes.

---

## 4. Close the Run Exactly Once

An open run is a spinner on someone's screen. If Temporal exhausts an activity's
retries and nothing publishes a terminal event, the client waits forever. The
published getting-started guide names this obligation but ships no code for it, so
write it yourself, in two layers:

1. **Per-activity catch** — `detach()`, leave the run active, rethrow. Temporal
   retries. (Section 3.)
2. **Workflow catch** — retries are now exhausted, so schedule a cleanup activity
   that adopts the run and publishes `run.end({ reason: 'error' })`.

```javascript
// In the workflow. Cleanup is best-effort: one attempt, tight timeout, no retry —
// a failing cleanup must not cascade into another failure.
const { cleanupRun } = proxyActivities({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 1 },
});

try {
  ids = await openRun({ invocation, invocationId });
  // ...drive inference and tool activities
} catch (err) {
  if (ids) {
    try {
      await cleanupRun({ ids, invocation, errorMessage: String(err) });
    } catch { /* best-effort */ }
  }
  throw err; // Temporal still needs to see the original failure
}
```

The cleanup activity adopts the run and calls `load()` first. `load()` status-gates:
it rejects if the run is already suspended (the client will resume it) or already
terminal. Either way there is nothing to clean up — swallow and return.

**Bound every retry policy.** `maximumAttempts` must be finite on step activities,
or a permanently failing activity retries forever and the workflow catch never runs.

---

## 5. Cancellation Without Signals

**Do not define a Temporal signal for cancellation.** The client publishes a cancel
event on the Ably channel; each activity's own session routes it to
`run.abortSignal` through the SDK's built-in cancel routing.

```javascript
const cancelSignal = Context.current().cancellationSignal;
const run = session.adoptRun(/* ... */, { signal: cancelSignal });

const result = streamText({
  model,
  messages: await convertToModelMessages(conversation),
  abortSignal: run.abortSignal,
  stopWhen: stepCountIs(1), // the workflow drives multi-step; this call must not loop
});
```

Two distinct signals, both needed: Temporal's `cancellationSignal` (the workflow is
being cancelled) goes *into* the run, and `run.abortSignal` (a client cancelled the
turn) goes into the model call.

`stopWhen: stepCountIs(1)` is not optional. Without it the AI SDK runs its own
multi-step tool loop inside one activity, so several logical steps collapse into one
Temporal activity and lose independent retries.

---

## 6. Ably Setup Gates

Two things must be configured before any of this streams. Both fail in ways that look
like application bugs.

**The channel rule.** Every namespace used with AI Transport needs *Message
annotations, updates, deletes, and appends* (`mutableMessages: true`). Streaming
appends tokens to a single message; without the rule, appends are rejected with error
`93002`. The initial message succeeds, so the symptom is an assistant message that is
empty or holds only the first token. Offer to run it:

```shell
ably apps rules create "conversations" --mutable-messages
```

Rules match the namespace literally up to the first colon — `conversation` does not
match `conversations:*`. Use one spelling across the channel name, the rule, and the
token capability. Note the rule also persists messages in that namespace, which is
billable.

**Token capability.** The client needs `publish`, `subscribe`, and `history` on the
namespace wildcard, because the session's channel name is not known when the token is
signed. Add `presence` for agent presence. The agent side, running in a trusted
worker, uses the API key directly.

---

## 7. What the SDK Gives You

Check before writing a helper — but do not assume one exists.

| Import from | You get |
|-------------|---------|
| `@ably/ai-transport` | `createAgentSession` (core), `Invocation`, `ErrorCode`, logger, run/session types |
| `@ably/ai-transport/vercel` | `createAgentSession`/`createClientSession` with the codec bound, `vercelRunOutcome`, `stripToolExecutes`, `pendingToolCalls`, `approvedPendingToolCalls` |
| `@ably/ai-transport/temporal` | `stepIdFor` |

You write yourself — there are no SDK exports for these:

- **`safeSessionDetach` / `safeSessionEnd`** — a dozen lines each: no-op when the
  session is undefined (the throw may predate construction), swallow the teardown's
  own error so the real failure propagates, never throw.
- **The cleanup activity** — section 4.
- **Any wait-for-run-start helper** the route needs before returning.

Prefer the codec-bound `createAgentSession` from the `/vercel` subpath over the core
one, which requires you to pass a codec.

---

## 8. Workflow Sandbox Purity

Temporal loads workflow bundles in an isolated sandbox with no access to Ably, the
model SDK, or `crypto` at import time. A workflow file that transitively imports any
of them fails at worker startup, often with an opaque error.

```javascript
// WRONG: in a file the workflow imports
import Ably from 'ably';
export const TASK_QUEUE = 'agent-turns';

// RIGHT: shared file stays plain data and types
import type { InvocationData } from '@ably/ai-transport';
export interface ChatWorkflowInput { invocation: InvocationData; invocationId: string }
```

Keep the shared module types-and-constants only. Type-only imports are erased, so
importing `InvocationData` as a type is safe; importing a value from `ably` is not.

---

## 9. Common Mistakes

- **Module system.** `workflowsPath: require.resolve('./workflows')` and `__dirname`
  are CommonJS, but Next config is `.mjs` and workflow imports use `./shared.js`
  specifiers. Under ESM use `fileURLToPath(import.meta.url)`. Settle the module setup
  before scaffolding, not after the worker fails to boot.
- **Streaming from the HTTP route.** The route starts a workflow and returns ids. If
  you find yourself returning a stream from it, the architecture is wrong.
- **One session for the whole turn.** Threading a session through activity arguments
  cannot work — activities may run in separate processes, and sessions are not
  serialisable.
- **Unbounded tool loops.** Server tools have their `execute` stripped so the model
  stops after emitting the call; the workflow then dispatches one activity per call.
  Leaving `execute` in place runs tools inside the inference activity, outside
  Temporal's retry boundary.
- **Temporal Cloud.** The docs only cover a local dev server. Cloud needs an address,
  namespace, and TLS or API-key credentials on the worker connection — none of it is
  documented for this integration, so read Temporal's own docs and do not invent
  option names.

---

## Quick Reference

**Docs:** [Get started](https://ably.com/docs/ai-transport/getting-started/temporal?source=using-ably-with-temporal)
| [Frameworks: Temporal](https://ably.com/docs/ai-transport/frameworks/temporal?source=using-ably-with-temporal)
| [`stepIdFor`](https://ably.com/docs/ai-transport/api/javascript/temporal?source=using-ably-with-temporal)
| [Agent session API](https://ably.com/docs/ai-transport/api/javascript/core/agent-session?source=using-ably-with-temporal)
| [Durable execution](https://ably.com/docs/ai-transport/features/durable-execution?source=using-ably-with-temporal)

**Setup gates:** [Channel rules](https://ably.com/docs/ai-transport/getting-started/channel-rules?source=using-ably-with-temporal)
| [Authentication](https://ably.com/docs/ai-transport/getting-started/authentication?source=using-ably-with-temporal)

**When it breaks:** [Troubleshooting](https://ably.com/docs/ai-transport/troubleshooting?source=using-ably-with-temporal)
— start there for `93002` and capability errors.

**Converting an existing app:** [references/migration.md](./references/migration.md)
