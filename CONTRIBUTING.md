# Contributing to Ably Agent Skills

Thanks for helping improve the skills bundle that ships to every Ably AI-coding integration.

## Working on a skill

- Each skill lives in its own directory under `skills/<skill-name>/` and must contain a `SKILL.md` with valid YAML frontmatter (`name`, `description`).
- Add reference docs, examples, or scripts as siblings of `SKILL.md`. The whole directory ships as the skill.
- Keep `SKILL.md` descriptions actionable — the description string is what causes agents to load the skill, so it must read like trigger criteria, not marketing copy.
- Run `npm run test:sanity` locally before opening a PR. CI runs the same checks plus `validate` on the plugin manifest and root files.

## Pull requests

- Open PRs against `main`. CI must be green before review.
- Don't bump versions or add release notes in your PR — releases are cut separately (see below).

---

## Releases

Skills are consumed by `ably-cli` (and other agentskills.io tools), which pin to the **latest published GitHub Release** of this repo. Cutting a release does two things:

1. **Builds a deterministic source tarball** (`git archive` of the tag, top-level dir `agent-skills-<tag>/`).
2. **Attests it via SLSA build provenance** — a Sigstore-signed in-toto statement, logged to the public Rekor transparency log, that binds the tarball's SHA-256 to *this* repo and *this* workflow run. Consumers verify the attestation before installing, so a stolen GPG key or a compromised collaborator cannot ship malicious skills as if they were ours.

Both happen automatically — see [`.github/workflows/release.yml`](.github/workflows/release.yml). You just push a tag (or publish a release in the UI).

### Cutting a release — UI flow (recommended)

1. Go to **[Releases](https://github.com/ably/agent-skills/releases) → Draft a new release**.
2. **Choose a tag** → type the new version (semver, e.g. `v0.2.0`) → **Create new tag: vX.Y.Z on publish**.
3. Set the title to the tag name.
4. Click **Generate release notes**, then edit if needed. (Don't worry about the verification footer — the workflow appends it automatically.)
5. Click **Save draft** first if you want to give the workflow time to attach the attested tarball before users see the release.
6. Click **Publish release**. The workflow will run, validate the layout, build the tarball, generate the attestation, attach the tarball as a release asset, and append the verification footer to your release notes.

After ~1 minute the release page will show:

- Your release notes + an appended **Verifiable artifact** block.
- A release asset `agent-skills-<tag>.tar.gz` (the attested file — this is what consumers download).
- GitHub's auto-generated `Source code (tar.gz)` and `Source code (zip)` links — **these are not attested**. Consumers should ignore them.

### Cutting a release — CLI flow

```bash
git checkout main
git pull
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

The tag push triggers the same workflow, which creates the release with auto-generated notes plus the verification footer.

### Verifying a release locally

Anyone (you, a reviewer, a security-conscious user) can verify a release end-to-end:

```bash
gh release download v0.2.0 --repo ably/agent-skills -p 'agent-skills-v0.2.0.tar.gz'
gh attestation verify agent-skills-v0.2.0.tar.gz --repo ably/agent-skills
# Expected: ✓ Verification succeeded.
```

This proves the tarball was produced by `ably/agent-skills`'s own release workflow at a specific commit — not by anyone with stolen credentials.

### Versioning

Use semantic versioning:

- **Patch** (`v0.2.0` → `v0.2.1`): typo fix, doc clarification, no behavioural change.
- **Minor** (`v0.2.0` → `v0.3.0`): new skill, new section, expanded coverage. Backwards-compatible.
- **Major** (`v0.x` → `v1.0`): breaking layout change (e.g. directory structure consumers depend on), removed skill, renamed skill directory.

The CLI consumes whatever release is `latest` at install time, so minor releases are picked up automatically. Try not to break consumers in patch/minor bumps.

### Re-running a failed release

If the release workflow fails (e.g. transient network hiccup mid-attestation), don't delete the tag. Instead:

1. Open the failed run in the **Actions** tab.
2. Click **Re-run failed jobs**, or trigger **workflow_dispatch** from the Release workflow page with the same tag — the workflow is idempotent (it'll skip duplicate footer appends and re-upload the tarball with `--clobber`).

### Yanking a release

If a release ships something broken or unsafe:

1. Go to the release page → **Edit release** → **Delete release** (this leaves the tag in place).
2. Cut a new patch release with the fix.

The CLI always pulls `latest`, so deleting a broken release immediately reroutes new installs to the previous good one. Existing installations are unaffected (the CLI overwrites on next `ably skills install`).
