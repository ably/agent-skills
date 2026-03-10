# AGENTS.md

Guidance for AI coding agents working with this repository.

> **Note:** `CLAUDE.md` is a symlink to this file.

## Repository Overview

Agent skills for building realtime applications with [Ably](https://ably.com). Skills are
packaged instructions that give AI agents the context they need to use Ably correctly —
product selection, SDK patterns, authentication, and common mistakes that cause production issues.

Skills follow the [Agent Skills](https://agentskills.io/) format and work with Claude Code,
Cursor, GitHub Copilot, and other compatible agents.

## Available Skills

| Skill | Purpose | Trigger |
|-------|---------|---------|
| `using-ably` | Curated knowledge + code generation: product selection, SDK architecture, auth, channel design, live doc verification, post-generation checks | Any Ably-related work (always-on) |
| `debugging-with-ably-cli` | Diagnostic decision trees, CLI capabilities, connection/channel state reference, environment-specific gotchas | Diagnosing Ably issues — messages not arriving, auth errors, connection failures, presence problems |

**`using-ably`** is the primary skill — it provides the domain knowledge agents get wrong (product selection, JWT auth, Chat attach lifecycle, React client creation, etc.) and enforces fetching current docs from `ably.com/llms.txt` before generating code, with a post-generation checklist to catch common mistakes.

**`debugging-with-ably-cli`** is the diagnostic skill — it teaches agents what's possible with the Ably CLI and when to use each capability for observing, simulating, and managing Ably resources during debugging.

## Skill Structure

```
skills/
  {skill-name}/
    SKILL.md              # Skill definition (frontmatter + instructions)
    AGENTS.md             # Optional: agent guidance for maintaining this skill
    MAINTAINING.md        # Optional: detailed maintenance guide (referenced from AGENTS.md)
```

## Progressive Disclosure

Skills use a three-tier loading model to minimize context window usage:

1. **Metadata** (~100 tokens) — `name` and `description` from SKILL.md frontmatter. Always loaded for all installed skills. The `description` is the trigger mechanism.
2. **Body** (<5k tokens) — The markdown body of SKILL.md. Loaded only when the skill triggers.
3. **External docs** — Fetched from `ably.com/llms.txt` at runtime. Provides current API references that can't be baked into the skill body.

## Key Design Principles

1. **Docs-first** — Code-generation skills fetch `https://ably.com/llms.txt` as their primary source. Web search supplements when needed. Non-code-generation skills (e.g., debugging) may rely on other sources like CLI help and error reference pages.
2. **Product-first rule** — Never build custom infrastructure when an Ably product handles it natively.
3. **Focus on what LLMs can't know** — Skills provide channel layout patterns, common gotchas, and design guidance — not product docs the agent can fetch itself.
4. **Graceful degradation** — If `llms.txt` is unavailable, skills fall back to web search or browsing `ably.com/docs` directly.

## Ably Products Covered

- **Pub/Sub** — Publish-subscribe messaging with channels, presence, and history
- **Chat** — Room-based chat with typing indicators, reactions, and moderation
- **Spaces** — Collaborative features: cursors, locking, member locations
- **LiveObjects** — Realtime state sync with counters and distributed maps
- **LiveSync** — Database-to-frontend sync (PostgreSQL, MongoDB)
- **AI Transport** — LLM token streaming, tool calls, human-in-the-loop

## Installation

### Claude Code Plugin
```bash
claude plugin marketplace add ably/agent-skills
claude plugin install ably@ably-agent-skills
```

### Agent Skills (cross-agent)
```bash
npx skills add ably/agent-skills
```

### Manual
```bash
cp -r skills/{skill-name} ~/.claude/skills/
```

## Recommended Permissions

Skills fetch Ably documentation via `WebFetch`. To avoid repeated permission prompts, add to `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "WebFetch(ably.com/*)",
      "WebSearch"
    ]
  }
}
```
