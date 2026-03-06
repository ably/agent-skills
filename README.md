# Ably Agent Skills

Agent skills that give AI coding agents the context they need to use [Ably](https://ably.com) correctly. Covers product selection, SDK architecture, authentication, channel design, and the common mistakes that cause production issues.

Skills work with any [agentskills.io-compatible](https://agentskills.io) coding agent, including Claude Code, Cursor, Codex, Windsurf, Gemini CLI, and [many more](https://agentskills.io).

## Skills

| Skill | Purpose | Auto-triggers when |
|-------|---------|-------------------|
| `using-ably` | Product selection, SDK patterns, auth, channel design, common gotchas | Any Ably-related work |

### `using-ably` — Primary Knowledge Skill

The core skill. Provides curated domain knowledge that agents frequently get wrong: choosing the right product/SDK, JWT vs token auth, modern v2.x patterns, Chat SDK lifecycle (attach before subscribe!), React integration pitfalls, and a production checklist.

## Installation

### Claude Code Plugin

```bash
claude plugin marketplace add ably/agent-skills
claude plugin install ably@ably-agent-skills
```

### Agent Skills CLI (cross-agent)

```bash
npx skills add ably/agent-skills
```

### Manual

Copy the skill directory into your agent's configuration:

```bash
git clone https://github.com/ably/agent-skills.git
cp -r agent-skills/skills/using-ably .skills/
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

## How It Works

The skill provides curated knowledge — architectural decisions, SDK patterns, auth, and common mistakes that documentation alone doesn't prevent. Every claim is verified against current Ably docs. Directs agents to fetch `ably.com/llms.txt` before writing code.

## License

Apache-2.0
