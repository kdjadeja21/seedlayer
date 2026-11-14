import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { SeedlayerConfig } from "@seedlayer/core";
import { AGENTS_MD_MAX_LINES, encodeConfig, parseConfig, renderProject } from "@seedlayer/core";
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
    assertRecordedTarget(rendered, preset.config.agents);
    assert.equal(JSON.parse(file(rendered, ".seedlayer/config.json")).git.branchPrefix, undefined);
    assert.equal(
      rendered.some((entry) => /agent\/<ticket>|branch from main/i.test(entry.contents)),
      false,
    );
  }
  // The home page credit adds components/seedlayer-credit.tsx.
  // sync-branch-first adds docs/agents/sync-branch-first.md and .cursor/rules/sync-branch-first.mdc.
  assert.deepEqual(fileCounts, {
    "startup-speed": 64,
    "team-strict": 66,
    "hackathon-2h": 49,
  });
  assert.equal(packSourcesMention(/agent\/<ticket>|branch from main/i), false);
});

test("every workflow and agent combination agrees on git rules and skill paths", () => {
  const workflows = ["trunk", "github-flow", "agent-safe"] as const;
  const agentSets = [["cursor"], ["claude-code"], ["cursor", "claude-code"]] as const;
  const base = loadPreset("startup-speed");
  for (const workflow of workflows) {
    for (const agents of agentSets) {
      const config = parseConfig({
        ...base,
        preset: "custom",
        agents: [...agents],
        git: { workflow, commits: "conventional", maxPrLines: 400 },
      });
      const rendered = render(config);
      assert.equal(
        JSON.parse(file(rendered, ".seedlayer/config.json")).git.branchPrefix,
        undefined,
      );
      assertRecordedTarget(rendered, config.agents);
      assert.match(file(rendered, "BRANCHING.md"), /1\. Record the active branch/);
      assert.match(file(rendered, "BRANCHING.md"), /2\. Sync that recorded branch/);
      assert.match(file(rendered, "BRANCHING.md"), /3\. Create the work branch/);
      assert.match(file(rendered, "BRANCHING.md"), /4\. Implement the change/);
      assert.match(file(rendered, "BRANCHING.md"), /5\. Run `npm run lint`/);
      assert.match(
        file(rendered, "BRANCHING.md"),
        /7\. Open the pull request into the recorded branch/,
      );
      assert.match(file(rendered, "BRANCHING.md"), /8\. Review the pull request/);
      if (workflow === "trunk") assert.match(file(rendered, "BRANCHING.md"), /vX\.Y\.Z/);
      if (workflow === "github-flow") {
        assert.match(file(rendered, "BRANCHING.md"), /human review is required before merge/);
      }
      if (workflow === "agent-safe") {
        assert.match(file(rendered, "BRANCHING.md"), /worktree/);
        assert.match(file(rendered, "BRANCHING.md"), /Agents never merge their own pull requests/);
      }
      assert.equal(
        rendered.some((entry) =>
          /unless (?:that branch|the active branch) is/i.test(entry.contents),
        ),
        false,
      );
    }
  }
});

test("the home page credit is included unless credit is false", () => {
  const onCounts = {
    "startup-speed": 64,
    "team-strict": 66,
    "hackathon-2h": 49,
  };
  const offCounts = {
    "startup-speed": 63,
    "team-strict": 65,
    "hackathon-2h": 48,
  };
  for (const preset of listPresets()) {
    const on = render(preset.config);
    assert.equal(on.length, onCounts[preset.id]);
    assertCredit(on, true);
    const off = render(parseConfig({ ...preset.config, credit: false }));
    assert.equal(off.length, offCounts[preset.id]);
    assert.equal(off.length, on.length - 1);
    assertCredit(off, false);
  }

  const { credit, ...legacy } = loadPreset("startup-speed");
  assert.equal(credit, true);
  const rendered = render(parseConfig(legacy));
  assert.equal(rendered.length, onCounts["startup-speed"]);
  assertCredit(rendered, true);
});

test("startup-speed matches the published preset id", () => {
  const preset = loadPreset("startup-speed");
  assert.equal(preset.preset, "startup-speed");
  assert.equal(preset.git.workflow, "agent-safe");
  assert.deepEqual(preset.agents, ["cursor", "claude-code"]);
});

function assertCredit(files: ReturnType<typeof render>, enabled: boolean): void {
  assert.equal(JSON.parse(file(files, ".seedlayer/config.json")).credit, enabled);
  assert.equal(file(files, "app/layout.tsx").includes("SeedlayerCredit"), false);
  assert.equal(exists(files, "components/seedlayer-credit.tsx"), enabled);
  const page = file(files, "app/page.tsx");
  assert.equal(page.includes("SeedlayerCredit"), enabled);
  if (!enabled) return;
  assert.match(page, /import \{ SeedlayerCredit \} from "@\/components\/seedlayer-credit";/);
  assert.match(page, /<SeedlayerCredit \/>/);
  const credit = file(files, "components/seedlayer-credit.tsx");
  assert.match(credit, /<footer/);
  assert.match(credit, /text-muted-foreground/);
  assert.match(credit, /text-sm/);
  assert.match(credit, /text-center/);
  assert.match(credit, /Built with/);
  assert.match(credit, /href="https:\/\/github.com\/kdjadeja21\/seedlayer"/);
  assert.match(credit, /rel="noopener"/);
  assert.match(credit, /target="_blank"/);
}

function assertGitRules(files: ReturnType<typeof render>, claude: boolean): void {
  const activeBranch = /active branch/;
  const noToolPrefix = /no `cursor\/`, no `agent\/`, no random IDs/;
  for (const filePath of ["AGENTS.md", ".cursor/rules/branching.mdc"]) {
    const contents = file(files, filePath);
    assert.match(contents, activeBranch);
    assert.match(contents, noToolPrefix);
    assert.match(contents, /recorded branch/);
  }
  if (!claude) return;
  const claudeDoc = file(files, "CLAUDE.md");
  assert.match(claudeDoc, activeBranch);
  assert.match(claudeDoc, noToolPrefix);
  assert.match(claudeDoc, /recorded branch/);
  assert.match(claudeDoc, /Read BRANCHING\.md before any git command/);
}

function assertRecordedTarget(
  files: ReturnType<typeof render>,
  agents: SeedlayerConfig["agents"],
): void {
  const recorded =
    /Record the active branch when the task starts\. Create the work branch from it and target the PR back into that recorded branch\. Target `main` only if `main` was the recorded active branch\./;
  assert.match(file(files, "BRANCHING.md"), recorded);
  assert.match(file(files, "AGENTS.md"), recorded);
  if (agents.includes("claude-code")) assert.match(file(files, "CLAUDE.md"), recorded);
  for (const command of ["plan", "implement", "review"] as const) {
    if (agents.includes("cursor") && exists(files, `.cursor/commands/${command}.md`)) {
      const commandFile = file(files, `.cursor/commands/${command}.md`);
      const skill = `.cursor/skills/${command}/SKILL.md`;
      assert.match(commandFile, new RegExp(skill.replaceAll("/", "\\/")));
      assert.equal(exists(files, skill), true);
      assert.doesNotMatch(commandFile, /\.claude\/skills/);
    } else {
      assert.equal(exists(files, `.cursor/commands/${command}.md`), false);
    }
    if (agents.includes("claude-code") && exists(files, `.claude/commands/${command}.md`)) {
      const commandFile = file(files, `.claude/commands/${command}.md`);
      const skill = `.claude/skills/${command}/SKILL.md`;
      assert.match(commandFile, new RegExp(skill.replaceAll("/", "\\/")));
      assert.equal(exists(files, skill), true);
      assert.doesNotMatch(commandFile, /\.cursor\/skills/);
    } else if (!agents.includes("claude-code")) {
      assert.equal(exists(files, `.claude/commands/${command}.md`), false);
    }
  }
  if (!agents.includes("cursor")) {
    assert.equal(exists(files, ".cursor/rules/branching.mdc"), false);
  }
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
