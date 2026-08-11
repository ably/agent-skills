# Maintaining the using-ably-with-temporal Skill

## Design Philosophy

This skill teaches agents **how Ably AI Transport and Temporal compose, and what breaks
when they are composed wrongly** — not how to use either product. Both have their own
documentation; the skill's value is entirely in the seam between them.

It shadows two fast-moving externals: the `@ably/ai-transport` run/step API (pre-1.0)
and the Temporal TypeScript SDK. It deliberately does **not** carry the churning
signatures. Instead it names the invariants (identity pinning, one step per activity,
detach-not-end, close-once) and instructs the agent to verify call shapes against the
API reference for the installed version. That indirection is the point — do not
"helpfully" inline current signatures to make the skill more concrete, because they
will be wrong within a release or two and the agent will trust them over the docs.

The skill focuses on:

- **Composition rules** (which layer owns what) — not either product's feature set
- **Failure modes that look like application bugs** (error `93002`, terminal-run
  retries, orphaned runs) — the things an agent cannot infer
- **Conversion of existing apps** — undocumented anywhere else, so the reference file
  is the skill's most load-bearing content

## Maintenance Triggers

1. **Run/step API changes in `@ably/ai-transport`** (`createRun`, `adoptRun`,
   `createStep`, `pipe`, `end`): usually NO update needed — that is what the
   verify-against-docs instruction is for. Update only if an *invariant* changes, e.g.
   run identity stops being caller-suppliable, or steps stop superseding by id.

2. **A helper moves from demo-local into the SDK.** Section 7 lists what the SDK
   exports versus what the developer must write. `safeSessionDetach` / `safeSessionEnd`
   and the cleanup activity are earmarked for extraction upstream — when they land in
   a published release, move them across in that table and drop the hand-rolling
   guidance.

3. **A new entry point or subpath ships** (e.g. a Temporal-specific session factory):
   add to the section 7 import table.

4. **The Temporal getting-started guide gains a failure path.** Section 4 exists
   because the guide names the close-once obligation without implementing it. If the
   docs ship it, cut section 4 down to a pointer.

5. **Temporal SDK changes** to worker registration, sandbox restrictions, or module
   resolution: update sections 8 and 9. The ESM/CJS guidance is the most fragile part.

6. **Temporal Cloud gets documented for this integration**: replace the "do not invent
   option names" warning in section 9 with a link.

## What NOT to Add

- Current `createRun` / `adoptRun` signatures — see Design Philosophy
- A step-by-step build tutorial — the getting-started guide owns that, and procedural
  workflows degrade agent performance
- Content that duplicates the `using-ably` skill (auth, channel design, product
  selection) — link to it instead; this skill assumes it
- Temporal's own concepts (what a workflow is, how task queues work) — Temporal's docs
  own these
- A second durable-execution engine. If Vercel WDK or another engine needs coverage,
  add a sibling skill rather than widening this one; the directory name is public API
  and renaming it is a major version bump.

## Validation Checklist

When updating, verify:

- [ ] SKILL.md body stays under 500 lines and ideally under ~350 — every token loads
      into context whenever an agent touches a Temporal + Ably app
- [ ] No run/step signature is hardcoded anywhere in SKILL.md
- [ ] Every `ably.com` link carries `?source=using-ably-with-temporal` and returns 200
- [ ] Section 7's "SDK gives you" table matches the actual exports of the entry-point
      `index.ts` files — check the package, not the demo's comments, which have been
      wrong about this
- [ ] No overlap with `using-ably` skill content
- [ ] The description still reads as trigger criteria and keeps its `Not for` clause

## How to Check for Drift

```bash
# What the entry points actually export
npm view @ably/ai-transport version
grep -E "^export" node_modules/@ably/ai-transport/dist/index.d.ts

# Whether the doc pages the skill links still exist
# (every link in SKILL.md's Quick Reference should return 200)

# Whether the getting-started guide has grown a failure path
# — search it for run.end({ reason: 'error' }) in a catch or cleanup step
```

The reference implementation to check invariants against is the Temporal demo in
`ably/ably-ai-transport-js` (`demo/temporal/`), not the published guide — the demo is
tested against the SDK's main branch and is consistently ahead of the docs. Read its
comments; they explain the reasoning behind detach-vs-end and the two-layer failure
model.
