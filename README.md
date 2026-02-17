# Ably Agent Skills

[Agent skills](https://agentskills.io) for building with [Ably](https://ably.com)'s realtime infrastructure.

## Why?

AI coding agents frequently make mistakes when integrating realtime messaging — wrong SDK choice, exposed API keys, outdated patterns, incorrect auth. These skills give agents the context they need to use Ably correctly, so developers spend less time debugging AI-generated code and more time building.

Skills work with any [agentskills.io-compatible](https://agentskills.io) coding agent, including Claude Code, Cursor, Codex, Windsurf, Gemini CLI, and [many more](https://agentskills.io).

## Skills

| Skill | Description |
|-------|-------------|
| [using-ably](./using-ably/) | Product selection, SDK architecture, JWT auth, modern patterns, and production checklist for Ably Pub/Sub, Chat, Spaces, LiveObjects, LiveSync, and AI Transport |

## Installation

Install with the [skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add ably/agent-skills
```

This installs skills into your coding agent's configuration. The CLI supports Claude Code, Cursor, Codex, Windsurf, Gemini CLI, and other compatible agents — it will prompt you to choose.

### Manual

Copy the skill directory into your project's `.skills/` folder or wherever your agent loads skills from:

```bash
git clone https://github.com/ably/agent-skills.git
cp -r agent-skills/using-ably .skills/
```

## Skill Format

All skills follow the [agentskills.io specification](https://agentskills.io/specification):

```
skill-name/
├── SKILL.md           # Required: frontmatter + instructions
├── references/        # Optional: detailed documentation
├── scripts/           # Optional: executable code
└── assets/            # Optional: templates, schemas
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on creating and submitting skills.

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.
