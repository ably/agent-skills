import { execSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT_DIR = join(__dirname, "..");
const SKILLS_DIR = join(ROOT_DIR, "skills");
const CLAUDE_SKILLS_DIR = join(ROOT_DIR, ".claude", "skills");
const MARKETPLACE_JSON_PATH = join(ROOT_DIR, ".claude-plugin", "marketplace.json");

const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_SKILL_BODY_LINES = 500;
const EXPECTED_SKILLS = ["using-ably"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Dynamically discover all skill names from the skills/ directory.
 */
function discoverSkillNames(): string[] {
	if (!existsSync(SKILLS_DIR)) {
		return [];
	}

	return readdirSync(SKILLS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.filter((entry) => existsSync(join(SKILLS_DIR, entry.name, "SKILL.md")))
		.map((entry) => entry.name);
}

// ---------------------------------------------------------------------------
// 1. Plugin structure tests (no npm install needed)
// ---------------------------------------------------------------------------

describe("plugin structure", () => {
	const skillNames = discoverSkillNames();

	it("should discover all expected skills", () => {
		expect(skillNames.length).toBe(EXPECTED_SKILLS.length);
		for (const expected of EXPECTED_SKILLS) {
			expect(skillNames).toContain(expected);
		}
	});

	it("should have a valid marketplace.json manifest", () => {
		expect(existsSync(MARKETPLACE_JSON_PATH)).toBe(true);
		const content = readFileSync(MARKETPLACE_JSON_PATH, "utf-8");
		const manifest = JSON.parse(content);

		expect(manifest.name).toBeDefined();
		expect(typeof manifest.name).toBe("string");
		expect(manifest.metadata?.version).toBeDefined();
		expect(manifest.metadata?.license).toBeDefined();
	});

	it("should have root AGENTS.md", () => {
		expect(existsSync(join(ROOT_DIR, "AGENTS.md"))).toBe(true);
	});

	it("should have root CLAUDE.md symlinked to AGENTS.md", () => {
		const claudePath = join(ROOT_DIR, "CLAUDE.md");
		expect(existsSync(claudePath)).toBe(true);
		expect(lstatSync(claudePath).isSymbolicLink()).toBe(true);
		expect(readlinkSync(claudePath)).toBe("AGENTS.md");
	});

	it("should have LICENSE file", () => {
		expect(existsSync(join(ROOT_DIR, "LICENSE"))).toBe(true);
	});

	it("should have README.md", () => {
		expect(existsSync(join(ROOT_DIR, "README.md"))).toBe(true);
	});
});

describe("skill files", () => {
	const skillNames = discoverSkillNames();

	for (const skillName of skillNames) {
		describe(skillName, () => {
			const skillDir = join(SKILLS_DIR, skillName);

			it("should have SKILL.md", () => {
				expect(existsSync(join(skillDir, "SKILL.md"))).toBe(true);
			});

			it("should have valid frontmatter with name and description", () => {
				const { data: frontmatter } = matter(
					readFileSync(join(skillDir, "SKILL.md"), "utf-8"),
				);
				expect(frontmatter.name).toBeDefined();
				expect(frontmatter.description).toBeDefined();
			});

			it("should have name matching directory name", () => {
				const { data: frontmatter } = matter(
					readFileSync(join(skillDir, "SKILL.md"), "utf-8"),
				);
				expect(frontmatter.name).toBe(skillName);
			});

			it("should have name in kebab-case", () => {
				const { data: frontmatter } = matter(
					readFileSync(join(skillDir, "SKILL.md"), "utf-8"),
				);
				expect(frontmatter.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
			});

			it(`should have description under ${MAX_DESCRIPTION_LENGTH} characters`, () => {
				const { data: frontmatter } = matter(
					readFileSync(join(skillDir, "SKILL.md"), "utf-8"),
				);
				const desc = frontmatter.description || "";
				expect(desc.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
			});

			it(`should have SKILL.md body under ${MAX_SKILL_BODY_LINES} lines`, () => {
				const { content: body } = matter(
					readFileSync(join(skillDir, "SKILL.md"), "utf-8"),
				);
				const lineCount = body.split("\n").length;
				expect(lineCount).toBeLessThanOrEqual(MAX_SKILL_BODY_LINES);
			});

			it("should reference ably.com/llms.txt in SKILL.md", () => {
				const content = readFileSync(
					join(skillDir, "SKILL.md"),
					"utf-8",
				);
				expect(content).toContain("ably.com/llms.txt");
			});
		});
	}
});

// ---------------------------------------------------------------------------
// 2. Skills add sanity check (requires npx skills CLI)
// ---------------------------------------------------------------------------

describe("skills add sanity check", () => {
	let commandOutput: string;
	let commandExitCode: number;
	const skillNames = discoverSkillNames();

	beforeAll(() => {
		// Clean up any existing .claude/skills directory
		if (existsSync(CLAUDE_SKILLS_DIR)) {
			rmSync(CLAUDE_SKILLS_DIR, { recursive: true, force: true });
		}

		// Run the skills add command using current directory (.) as source
		try {
			commandOutput = execSync("npx skills add . -a claude-code -y", {
				cwd: ROOT_DIR,
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
				timeout: 120000, // 2 minute timeout
			});
			commandExitCode = 0;
		} catch (error) {
			const execError = error as {
				stdout?: string;
				stderr?: string;
				status?: number;
			};
			commandOutput = `${execError.stdout || ""}\n${execError.stderr || ""}`;
			commandExitCode = execError.status ?? 1;
		}
	});

	afterAll(() => {
		// Clean up .claude/skills directory after tests
		if (existsSync(CLAUDE_SKILLS_DIR)) {
			rmSync(CLAUDE_SKILLS_DIR, { recursive: true, force: true });
		}
	});

	it("should have discovered skills in the repository", () => {
		expect(skillNames.length).toBeGreaterThan(0);
		console.log(
			`Discovered ${skillNames.length} skills: ${skillNames.join(", ")}`,
		);
	});

	it("should not contain errors in command output", () => {
		if (commandExitCode !== 0) {
			console.log("Command output:", commandOutput);
		}
		expect(commandExitCode).toBe(0);
		expect(commandOutput).not.toMatch(/\bError\b/i);
	});

	it("should create .claude/skills directory", () => {
		expect(existsSync(CLAUDE_SKILLS_DIR)).toBe(true);
	});

	it("should install all skills from the repository", () => {
		for (const skillName of skillNames) {
			const skillPath = join(CLAUDE_SKILLS_DIR, skillName);
			expect(
				existsSync(skillPath),
				`Expected skill "${skillName}" to be installed at ${skillPath}`,
			).toBe(true);
		}
	});

	it("should have SKILL.md in each installed skill", () => {
		for (const skillName of skillNames) {
			const skillMdPath = join(CLAUDE_SKILLS_DIR, skillName, "SKILL.md");
			expect(
				existsSync(skillMdPath),
				`Expected SKILL.md to exist at ${skillMdPath}`,
			).toBe(true);
		}
	});
});
