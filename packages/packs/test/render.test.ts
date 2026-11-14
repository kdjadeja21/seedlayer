import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AGENTS_MD_MAX_LINES, encodeConfig, renderProject } from "@seedlayer/core";
import { listPresets, loadCatalog, loadPreset } from "../src/index.ts";

const catalog = loadCatalog();

test("three presets render deterministic repos", () => {
  for (const preset of listPresets()) {
    const first = renderProject({ config: preset.config, projectName: "my-app", catalog });
    const second = renderProject({ config: preset.config, projectName: "my-app", catalog });
    assert.deepEqual(first, second);
    const agents = file(first, "AGENTS.md");
    assert.ok(agents.split(/\r?\n/).length <= AGENTS_MD_MAX_LINES);
    assert.match(agents, /DESIGN\.md/);
    assert.match(file(first, "app/tokens.css"), /--color-bg:/);
    assertGitRules(first, preset.config.agents.includes("claude-code"));
    assert.match(file(first, ".seedlayer/lock.json"), new RegExp(preset.id));
    assert.equal(file(first, ".seedlayer/config.json").includes("generatedAt"), false);
    assert.equal(encodeConfig(preset.config).startsWith("sl1."), true);
  }
});

test("presets differ where the product says they differ", () => {
  const startup = render(loadPreset("startup-speed"));
  const team = render(loadPreset("team-strict"));
  const hack = render(loadPreset("hackathon-2h"));

  assert.match(file(startup, "BRANCHING.md"), /agent-safe/);
  assert.match(file(startup, "BRANCHING.md"), /worktree/);
  assert.match(file(startup, "BRANCHING.md"), /Agents never merge their own pull requests/);
  assert.match(file(startup, "BRANCHING.md"), /feat\/128-login/);
  assert.equal(exists(startup, ".husky/pre-commit"), true);
  assert.equal(exists(startup, "biome.json"), true);
  assert.equal(exists(startup, "CLAUDE.md"), true);
  assert.equal(exists(startup, "components/ui/button.tsx"), true);

  assert.match(file(team, "BRANCHING.md"), /GitHub Flow/);
  assert.match(file(team, "BRANCHING.md"), /human review is required before merge/);
  assert.equal(exists(team, "eslint.config.mjs"), true);
  assert.equal(exists(team, "components/ui/Button.tsx"), true);
  assert.equal(exists(team, "lib/result.ts"), true);
  assert.match(file(team, "CODE_STYLE.md"), /200/);

  assert.match(file(hack, "BRANCHING.md"), /trunk-based/);
  assert.match(file(hack, "BRANCHING.md"), /vX\.Y\.Z/);
  assert.equal(exists(hack, "CLAUDE.md"), false);
  assert.equal(exists(hack, ".husky/pre-commit"), false);
  assert.equal(exists(hack, ".github/workflows/ci.yml"), true);
  assert.equal(exists(hack, ".cursor/commands/implement.md"), true);
  assert.equal(exists(hack, ".cursor/commands/plan.md"), false);
  assert.match(file(hack, "app/tokens.css"), /#047857/);
  assert.match(file(hack, "app/tokens.css"), /--color-highlight:/);
});

test("every preset ships the same git rules to every agent", () => {
  const fileCounts: Record<string, number> = {
    "startup-speed": 0,
    "team-strict": 0,
    "hackathon-2h": 0,
  };
  for (const preset of listPresets()) {
    const rendered = render(preset.config);
    fileCounts[preset.id] = rendered.length;
    assertGitRules(rendered, preset.config.agents.includes("claude-code"));
    assert.match(
      file(rendered, ".cursor/rules/branching.mdc"),
      /<type>\/<short-kebab-description>/,
    );
    assert.match(file(rendered, ".cursor/rules/branching.mdc"), /git fetch origin/);
    assert.match(file(rendered, ".cursor/rules/sync-branch-first.mdc"), /alwaysApply: true/);
    assert.match(file(rendered, ".cursor/rules/sync-branch-first.mdc"), /git fetch origin/);
    assert.match(file(rendered, "BRANCHING.md"), /<type>\/<short-kebab-description>/);
    assert.match(file(rendered, "BRANCHING.md"), /git fetch origin/);
    assert.match(file(rendered, "BRANCHING.md"), /npm run lint/);
    assert.match(file(rendered, "BRANCHING.md"), /npm run typecheck/);
    assert.match(file(rendered, "BRANCHING.md"), /npm run build/);
    assert.equal(
      rendered.some((entry) => /agent\/<ticket>|branch from main/i.test(entry.contents)),
      false,
    );
  }
  // sync-branch-first adds docs/agents/sync-branch-first.md and .cursor/rules/sync-branch-first.mdc.
  assert.deepEqual(fileCounts, {
    "startup-speed": 63,
    "team-strict": 65,
    "hackathon-2h": 48,
  });
  assert.equal(packSourcesMention(/agent\/<ticket>|branch from main/i), false);
});

test("startup-speed matches the published preset id", () => {
  const preset = loadPreset("startup-speed");
  assert.equal(preset.preset, "startup-speed");
  assert.equal(preset.git.workflow, "agent-safe");
  assert.deepEqual(preset.agents, ["cursor", "claude-code"]);
});

function assertGitRules(files: ReturnType<typeof render>, claude: boolean): void {
  const activeBranch = /active branch/;
  const noToolPrefix = /no `cursor\/`, no `agent\/`, no random IDs/;
  for (const filePath of ["AGENTS.md", ".cursor/rules/branching.mdc"]) {
    const contents = file(files, filePath);
    assert.match(contents, activeBranch);
    assert.match(contents, noToolPrefix);
  }
  if (!claude) return;
  const claudeDoc = file(files, "CLAUDE.md");
  assert.match(claudeDoc, activeBranch);
  assert.match(claudeDoc, noToolPrefix);
  assert.match(claudeDoc, /Read BRANCHING\.md before any git command/);
}

function render(config: ReturnType<typeof loadPreset>) {
  return renderProject({ config, projectName: "my-app", catalog });
}

function file(files: ReturnType<typeof render>, filePath: string): string {
  const match = files.find((entry) => entry.path === filePath);
  assert.ok(match, `missing ${filePath}`);
  return match.contents;
}

function exists(files: ReturnType<typeof render>, filePath: string): boolean {
  return files.some((entry) => entry.path === filePath);
}

function packSourcesMention(pattern: RegExp): boolean {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../content");
  const packs = ["branching-trunk", "branching-github-flow", "branching-agent-safe"];
  for (const pack of packs) {
    if (treeMentions(path.join(root, pack), pattern)) return true;
  }
  return false;
}

function treeMentions(dir: string, pattern: RegExp): boolean {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (treeMentions(entryPath, pattern)) return true;
      continue;
    }
    if (pattern.test(readFileSync(entryPath, "utf8"))) return true;
  }
  return false;
}
