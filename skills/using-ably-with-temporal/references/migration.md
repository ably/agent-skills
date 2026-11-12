# Converting an Existing Temporal App to Stream Over Ably

Read [SKILL.md](../SKILL.md) first — the invariants there apply unchanged. This file
covers only what is different when the workflow already exists.

The published docs are greenfield tutorials. There is no documented conversion path,
so work from the app's current structure rather than trying to reshape it into the
tutorial's file layout.

## What Changes, and What Does Not

| Keep as-is | Change |
|------------|--------|
| Worker setup, task queue, `Worker.create` registration | Add the new activities to the registration |
| Existing non-agent activities and workflows | Leave untouched |
| Temporal Cloud connection and credentials | Nothing |
| Existing observability and deployment | Nothing |
| — | `workflowId` must become the invocation id |
| — | The HTTP entry point stops returning a response body |
| — | One agent step per activity, not one turn per activity |
| — | Cancellation moves off Temporal signals |

Most conversions touch three files: the HTTP handler, the agent workflow, and the
activity that currently calls the model.

## Step 1: Inventory

Answer these before editing anything:

1. **Where does model output currently go?** An HTTP stream, a database row, a
   webhook, polling? That consumer is what Ably replaces.
2. **What sets `workflowId` today?** This is the most common structural conflict — see
   step 3.
3. **Is the whole turn one activity?** Multi-step tool loops inside a single activity
   are typical and must be split.
4. **How is cancellation handled?** A signal handler, a cancellation scope, or not at
   all.
5. **Are retry policies bounded?** Unbounded `maximumAttempts` prevents the
   workflow-level cleanup from ever running.

## Step 2: Client and Setup First

Get the Ably side working before touching the workflow, so failures are attributable:

1. Enable the `mutableMessages` channel rule on the namespace (SKILL.md section 6).
2. Add the token endpoint with `publish`, `subscribe`, `history` on the namespace
   wildcard.
3. Wire the client session or `useChat` transport, and confirm a hand-published test
   message reaches the browser.

Only then change the workflow. If streaming does not work at this point, it is not a
Temporal problem.

## Step 3: The `workflowId` Conflict

AI Transport pins run identity to the Temporal `workflowId`, so it must equal the
invocation id the client generated — one workflow per POST.

Existing apps usually set it to something else: a user id, a conversation id, a
deterministic business key, or a fixed id to enforce single-instance semantics.

| Current pattern | Conversion |
|-----------------|------------|
| Random or per-request id | Rename to the invocation id. Easiest case. |
| Conversation or session id (long-lived workflow) | The turn becomes a **child workflow** with `workflowId = invocationId`. The parent keeps its own id. |
| Business key for deduplication | Keep the dedup workflow; move the agent turn into a child workflow. |
| Fixed id (singleton worker loop) | The loop stays; each turn is a child workflow. |

Do not pin `runId` to anything but the workflow id of the workflow that opens the run.
If a long-lived parent workflow opens the run directly, retries of the opening
activity cannot re-enter the same run correctly.

## Step 4: Splitting the Existing Activity

An existing single-activity turn typically looks like this:

```javascript
// BEFORE: whole turn in one activity, model loops internally
export async function runAgentTurn(input) {
  const result = await generateText({
    model,
    messages: input.messages,
    tools,               // execute present → the SDK runs the tool loop here
  });
  await db.save(result.text);
}
```

Split it into the shape SKILL.md describes: an opening activity, an inference activity
per model call, and a tool activity per tool call, with the workflow looping. Three
changes carry most of the risk:

- **Strip `execute` from server tools** in the inference call, so the model stops after
  emitting a tool call instead of running it inside the activity.
- **Add `stopWhen: stepCountIs(1)`**, so one activity is one step.
- **Return an outcome the workflow can route on** — a discriminated union of terminal
  kinds plus one non-terminal "server tools pending" kind — rather than the model
  result itself. Activity results must be serialisable, so return ids and plain data,
  never a session, run, or stream.

If the app persists turns to its own database, keep that write. Ably carries the live
stream and replayable history; it does not replace a system of record. See the
database-hydration feature docs for reading history back from a store instead of the
channel.

## Step 5: Cancellation

Replace signal-based cancellation with channel-based routing (SKILL.md section 5).

If a signal handler must stay for other reasons, do not have it publish the run
terminal — that would race the activity's own cancel handling and risk two terminal
events for one run. Let the SDK's cancel routing own the run's terminal state, and use
the signal only for workflow-level concerns.

## Step 6: Failure Path

New code, not a conversion. Existing apps rarely have an equivalent, because without a
live client there was nothing to unstick. Add both layers from SKILL.md section 4 —
per-activity `detach()` and rethrow, plus a workflow-catch cleanup activity that ends
the run once.

Bound every step activity's `maximumAttempts` at the same time.

## Verification

- [ ] A turn streams token-by-token to the browser
- [ ] Killing the worker mid-turn and restarting it resumes without a duplicate run
- [ ] A tool that throws retries, and the retried attempt supersedes the failed
      output rather than appending a second copy
- [ ] Cancelling from the client stops the model call and the run reports cancelled
- [ ] An activity failing past its retry limit leaves the run ended, not spinning
- [ ] A page refresh mid-turn rejoins the live stream and shows prior history
- [ ] Two browser tabs on the same session both stream
- [ ] Pre-existing non-agent workflows still pass their own tests
