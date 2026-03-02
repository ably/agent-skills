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

**`using-ably`** is the primary skill — it provides the domain knowledge agents get wrong (product selection, JWT auth, Chat attach lifecycle, React client creation, etc.) and enforces fetching current docs from `ably.com/llms.txt` before generating code, with a post-generation checklist to catch common mistakes.

## Skill Structure

```
skills/
  {skill-name}/
    SKILL.md              # Skill definition (frontmatter + instructions)
```

## Progressive Disclosure

Skills use a three-tier loading model to minimize context window usage:

1. **Metadata** (~100 tokens) — `name` and `description` from SKILL.md frontmatter. Always loaded for all installed skills. The `description` is the trigger mechanism.
2. **Body** (<5k tokens) — The markdown body of SKILL.md. Loaded only when the skill triggers.
## Key Design Principles

1. **Docs-first** — Every skill fetches `https://ably.com/llms.txt` as its primary source. Web search supplements when needed.
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
