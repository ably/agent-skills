# Contributing Skills

Thanks for your interest in contributing agent skills for Ably.

## Skill Format

All skills must follow the [agentskills.io specification](https://agentskills.io/specification).

### Required Structure

```
skill-name/
├── SKILL.md           # Required: frontmatter + instructions
├── references/        # Optional: detailed reference docs
├── scripts/           # Optional: executable code
└── assets/            # Optional: templates, schemas, data
```

### SKILL.md Frontmatter

```yaml
---
name: skill-name
description: What this skill does and when to use it.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: tag1, tag2, tag3
---
```

**Required fields:**
- `name` — lowercase kebab-case, must match directory name, max 64 chars
- `description` — what the skill does and when to use it, max 1024 chars

**Recommended fields:**
- `license` — `Apache-2.0` for open-source contributions
- `metadata.version` — semantic version
- `metadata.tags` — comma-separated keywords

### SKILL.md Body

The body contains instructions for the AI agent. Keep the main SKILL.md under 500 lines. Move detailed reference material to `references/` files.

Recommended sections:
- Overview of what the skill enables
- Step-by-step instructions
- Examples of inputs and outputs
- Common edge cases and gotchas

### Progressive Disclosure

Structure skills for efficient context usage:

1. **Metadata** (~100 tokens) — `name` and `description` loaded at discovery
2. **Instructions** (<5000 tokens) — SKILL.md body loaded on activation
3. **References** (as needed) — files in `references/` loaded on demand

## Quality Checklist

Before submitting:

- [ ] `name` matches directory name
- [ ] `description` clearly explains when to use the skill
- [ ] SKILL.md body is under 500 lines
- [ ] Reference files are focused and individually useful
- [ ] Code samples are tested and work with current Ably SDKs
- [ ] No hardcoded API keys or credentials

## Submitting

1. Fork this repository
2. Create a branch: `feat/skill-name`
3. Add your skill directory
4. Open a pull request with a description of the skill and its intended audience

## Validating

Use the agentskills.io reference validator:

```bash
npx skills-ref validate ./your-skill
```
