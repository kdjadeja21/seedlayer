import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHOICES,
  decodeConfig,
  encodeConfig,
  renderProject,
  withConfigFlags,
} from "@seedlayer/core";
import { loadCatalog, loadPreset } from "@seedlayer/packs";

const ENTER = "\r";
const DOWN = "\u001b[B";
const UP = "\u001b[A";

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, "../src/bin.ts");

test("seedlayer writes a preset without installing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", bin, target, "--preset", "startup-speed", "--skip-install"],
    { cwd: path.resolve(here, "../../.."), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(path.join(target, "AGENTS.md")), true);
  assert.match(readFileSync(path.join(target, "package.json"), "utf8"), /"name": "my-app"/);
  const again = spawnSync(
    process.execPath,
    ["--import", "tsx", bin, target, "--preset", "startup-speed", "--skip-install"],
    { cwd: path.resolve(here, "../../.."), encoding: "utf8" },
  );
  assert.notEqual(again.status, 0);
});

test("preset flags write the chosen config", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = run(target, [
    "--preset",
    "startup-speed",
    "--palette",
    "harbor",
    "--font",
    "Geist",
    "--radius",
    "sm",
    "--agents",
    "cursor",
    "--lint",
    "eslint",
    "--branching",
    "trunk",
    "--skip-install",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8"));
  assert.equal(config.preset, "startup-speed");
  assert.equal(config.design.palette, "harbor");
  assert.equal(config.design.fontSans, "Geist");
  assert.equal(config.design.radius, "sm");
  assert.deepEqual(config.agents, ["cursor"]);
  assert.equal(config.codeStyle.linter, "eslint");
  assert.equal(config.git.workflow, "trunk");
  assert.equal(config.git.branchPrefix, undefined);
});

test("--no-credit omits the home page credit", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = run(target, ["--preset", "startup-speed", "--no-credit", "--skip-install"]);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8"));
  assert.equal(config.credit, false);
  assert.equal(existsSync(path.join(target, "components/seedlayer-credit.tsx")), false);
  const page = readFileSync(path.join(target, "app/page.tsx"), "utf8");
  assert.equal(page.includes("SeedlayerCredit"), false);
  const kept = run(path.join(root, "kept"), ["--preset", "hackathon-2h", "--skip-install"]);
  assert.equal(kept.status, 0, kept.stderr);
  const keptConfig = JSON.parse(
    readFileSync(path.join(root, "kept/.seedlayer/config.json"), "utf8"),
  );
  assert.equal(keptConfig.credit, true);
  assert.equal(existsSync(path.join(root, "kept/components/seedlayer-credit.tsx")), true);
  assert.match(readFileSync(path.join(root, "kept/app/page.tsx"), "utf8"), /<SeedlayerCredit \/>/);
});

test("--config together with --no-credit exits 1", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const result = run(path.join(root, "my-app"), [
    "--config",
    "sl1.not-a-real-code",
    "--no-credit",
    "--skip-install",
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--no-credit/);
});

test("the configurator adds --no-credit when the credit toggle is off", () => {
  const page = loadConfigurator();
  const credit = page.querySelector("#credit");
  assert.equal(credit.tag, "button");
  credit.click();
  assert.equal(
    page.querySelector("#command").textContent,
    "npx seedlayer my-app --preset startup-speed --no-credit",
  );
  page.querySelector("#presets button").click();
  assert.equal(
    page.querySelector("#command").textContent,
    "npx seedlayer my-app --preset startup-speed",
  );
});

test("a bad flag value exits 1 and lists the allowed values", () => {
  const cases = [
    ["preset", "startup-speed, team-strict, hackathon-2h"],
    ["palette", "ink, harbor, ember, iris, grove, dusk"],
    ["font", "Inter, Geist, system"],
    ["ui", "shadcn, none"],
    ["radius", "none, sm, md, lg"],
    ["density", "compact, comfortable, spacious"],
    ["agents", "cursor, claude-code. claude is a short name for claude-code"],
    ["lint", "biome, eslint"],
    ["branching", "trunk, github-flow, agent-safe"],
  ] as const;
  for (const [flag, allowed] of cases) {
    const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
    const result = run(path.join(root, "my-app"), [`--${flag}`, "nope", "--skip-install"]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, new RegExp(`Unknown --${flag} "nope"`));
    assert.match(result.stderr, new RegExp(allowed.replaceAll(".", "\\.")));
    assert.doesNotMatch(result.stderr, /ZodError|invalid_type/);
  }
});

test("a bad config file exits 1 with a readable field error", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const preset = JSON.parse(
    readFileSync(path.resolve(here, "../../packs/presets/startup-speed.json"), "utf8"),
  ) as { design: { palette: string }; agents: string[] };
  preset.design.palette = "nope";
  const paletteFile = path.join(root, "palette.json");
  writeFileSync(paletteFile, JSON.stringify(preset));
  const palette = run(path.join(root, "my-app"), ["--config", paletteFile, "--skip-install"]);
  assert.equal(palette.status, 1);
  assert.match(
    palette.stderr,
    /design\.palette: Expected one of: "ink", "harbor", "ember", "iris", "grove", "dusk"/,
  );
  assert.doesNotMatch(palette.stderr, /ZodError|invalid_value|\$Zod/);

  preset.design.palette = "ink";
  preset.agents = ["cursor", "cursor"];
  const agentsFile = path.join(root, "agents.json");
  writeFileSync(agentsFile, JSON.stringify(preset));
  const agents = run(path.join(root, "agents-app"), ["--config", agentsFile, "--skip-install"]);
  assert.equal(agents.status, 1);
  assert.equal(agents.stderr.trim(), "agents: Agents must be unique");

  const broken = path.join(root, "broken.json");
  writeFileSync(broken, "{");
  const syntax = run(path.join(root, "other-app"), ["--config", broken, "--skip-install"]);
  assert.equal(syntax.status, 1);
  assert.match(syntax.stderr, /JSON/);
  assert.doesNotMatch(syntax.stderr, /ZodError/);
});

test("a directory name that is not a slug exits 1", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const result = run(path.join(root, "My App"), ["--preset", "startup-speed", "--skip-install"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Use a lowercase project name such as my-app/);
});

test("--config together with --palette exits 1", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const result = run(path.join(root, "my-app"), [
    "--config",
    "sl1.not-a-real-code",
    "--palette",
    "ink",
    "--skip-install",
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--config/);
});

test("each configurator preset command exits 0", () => {
  const page = loadConfigurator();
  const buttons = page.querySelectorAll("#presets button");
  assert.equal(buttons.length, 3);
  for (const button of buttons) {
    button.click();
    const command = page.querySelector("#command").textContent;
    const preset = button.dataset.preset;
    assert.equal(command, `npx seedlayer my-app --preset ${preset}`);
    const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
    const target = path.join(root, "my-app");
    const result = run(target, ["--preset", preset, "--skip-install"]);
    assert.equal(result.status, 0, result.stderr);
    assertPresetGitRules(target, preset !== "hackathon-2h");
  }

  const name = page.querySelector("#name");
  name.value = "my app";
  name.dispatch("input");
  assert.equal(
    page.querySelector("#command").textContent,
    'npx seedlayer "my app" --preset hackathon-2h',
  );
});

test("claude-only generation points commands at claude skills", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = run(target, [
    "--preset",
    "team-strict",
    "--agents",
    "claude-code",
    "--skip-install",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const implement = readFileSync(path.join(target, ".claude/commands/implement.md"), "utf8");
  assert.match(implement, /\.claude\/skills\/implement\/SKILL\.md/);
  assert.doesNotMatch(implement, /\.cursor\/skills/);
  assert.equal(existsSync(path.join(target, ".claude/skills/implement/SKILL.md")), true);
  assert.equal(existsSync(path.join(target, ".cursor/commands/implement.md")), false);
  assert.equal(existsSync(path.join(target, ".cursor/rules/branching.mdc")), false);
  const config = JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8"));
  assert.equal(config.git.branchPrefix, undefined);
  assert.match(readFileSync(path.join(target, "CLAUDE.md"), "utf8"), /recorded branch/);
});

test("--version and -v print the package.json version and exit 0", () => {
  const { version } = JSON.parse(readFileSync(path.join(here, "../package.json"), "utf8")) as {
    version: string;
  };
  for (const flag of ["--version", "-v"]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", bin, flag], {
      cwd: path.resolve(here, "../../.."),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${version}\n`);
    assert.equal(result.stderr, "");
  }
  const help = spawnSync(process.execPath, ["--import", "tsx", bin, "--help"], {
    cwd: path.resolve(here, "../../.."),
    encoding: "utf8",
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--version, -v/);
  assert.match(help.stdout, /claude is a short name for claude-code/);
  assert.match(help.stdout, /Arrow keys move, Enter selects, and Space toggles\nagents/);
  assert.match(help.stdout, /--use-npm/);
  assert.match(help.stdout, /--use-pnpm/);
  assert.match(help.stdout, /--use-yarn/);
  assert.match(help.stdout, /--use-bun/);
  assert.match(help.stdout, /--disable-git/);
  assert.match(help.stdout, /--yes/);
  assert.match(help.stdout, /--interactive/);
  assert.match(help.stdout, /--no-interactive/);
  assert.match(help.stdout, /-i, --immediate/);
  assert.match(help.stdout, /--reset-preferences/);
});

test("arrow keys pick the preset, palette, and agents", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = runPrompt(target, [
    `${DOWN}${ENTER}`,
    `${DOWN}${ENTER}`,
    ` ${ENTER}`,
    ENTER,
    ENTER,
    ENTER,
    ENTER,
    ENTER,
    ENTER,
    ENTER,
    ENTER,
    ENTER,
    ENTER,
    ENTER,
  ]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const config = JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8"));
  assert.equal(config.preset, "team-strict");
  assert.equal(config.design.palette, "ember");
  assert.deepEqual(config.agents, ["claude-code"]);

  const defaults = path.join(root, "defaults");
  const empty = runPrompt(
    defaults,
    Array.from({ length: 14 }, () => ENTER),
  );
  assert.equal(empty.status, 0, `${empty.stdout}\n${empty.stderr}`);
  const defaultConfig = JSON.parse(
    readFileSync(path.join(defaults, ".seedlayer/config.json"), "utf8"),
  );
  assert.equal(defaultConfig.preset, "startup-speed");
  assert.equal(defaultConfig.design.palette, "ink");
  assert.equal(defaultConfig.design.fontSans, "Inter");
  assert.equal(defaultConfig.stack.components, "shadcn");
  assert.equal(defaultConfig.design.radius, "md");
  assert.equal(defaultConfig.design.density, "comfortable");
  assert.equal(defaultConfig.codeStyle.linter, "biome");
  assert.equal(defaultConfig.git.workflow, "agent-safe");
  assert.equal(defaultConfig.credit, true);
  assert.equal(defaultConfig.packageManager, "npm");
  assert.equal(defaultConfig.initGit, true);
  assert.equal(defaultConfig.immediate, false);
  assert.deepEqual(defaultConfig.agents, ["cursor", "claude-code"]);
});

test("a non-empty folder fails before any question is shown", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  mkdirSync(target);
  writeFileSync(path.join(target, "keep.txt"), "keep");
  const result = runPrompt(target, []);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /is not empty\. Pass --force to replace it\./);
  assert.doesNotMatch(result.stdout, /Preset/);
  assert.equal(readFileSync(path.join(target, "keep.txt"), "utf8"), "keep");
  assert.equal(existsSync(path.join(target, "package.json")), false);
});

test("question mode matches the same font, radius, lint, branching, and credit flags", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const prompted = path.join(root, "prompted", "my-app");
  const flagged = path.join(root, "flagged", "my-app");
  const promptedResult = runPrompt(prompted, [
    ENTER,
    ENTER,
    ENTER,
    `${DOWN}${ENTER}`,
    ENTER,
    `${UP}${ENTER}`,
    ENTER,
    `${DOWN}${ENTER}`,
    `${UP}${UP}${ENTER}`,
    "no\r",
    ENTER,
    ENTER,
    ENTER,
    ENTER,
  ]);
  assert.equal(promptedResult.status, 0, promptedResult.stdout);
  const flaggedResult = run(
    flagged,
    [
      "--preset",
      "startup-speed",
      "--font",
      "Geist",
      "--radius",
      "sm",
      "--lint",
      "eslint",
      "--branching",
      "trunk",
      "--no-credit",
      "--skip-install",
    ],
    {
      npm_config_user_agent: "npm/10.0.0 npm/? node/v22.0.0",
    },
  );
  assert.equal(flaggedResult.status, 0, flaggedResult.stderr);
  assertSameFiles(prompted, flagged);
});

test("a bad project name fails before any question", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "My App");
  const result = runPrompt(target, []);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Use a lowercase project name such as my-app/);
  assert.doesNotMatch(result.stdout, /Preset/);
  assert.equal(existsSync(target), false);
});

test("the summary shows a working sl1 code and n writes nothing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = runPrompt(target, [
    ENTER,
    `${DOWN}${ENTER}`,
    ENTER,
    `${DOWN}${ENTER}`,
    ENTER,
    `${UP}${ENTER}`,
    ENTER,
    `${DOWN}${ENTER}`,
    `${UP}${UP}${ENTER}`,
    "no\r",
    ENTER,
    ENTER,
    ENTER,
    "n\r",
  ]);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(existsSync(target), false);
  const esc = String.fromCharCode(27);
  const plain = result.stdout.replaceAll(new RegExp(`${esc}\\[[0-9;]*[A-Za-z]`, "g"), "");
  const code = plain.match(/sl1\.[A-Za-z0-9_-]+/)?.[0];
  assert.ok(code);
  const command = `npx seedlayer ${target} --config ${code}`;
  assert.ok(plain.includes(command), plain);
  assert.match(plain, /font: Geist/);
  assert.match(plain, /radius: sm/);
  assert.match(plain, /lint: eslint/);
  assert.match(plain, /branching: trunk/);
  assert.match(plain, /credit: no/);
  assert.match(plain, /palette: harbor/);
  const fromCode = path.join(root, "from-code", "my-app");
  const generated = run(fromCode, ["--config", code, "--skip-install"]);
  assert.equal(generated.status, 0, generated.stderr);
  const fromFlags = path.join(root, "from-flags", "my-app");
  const flagged = run(
    fromFlags,
    [
      "--preset",
      "startup-speed",
      "--palette",
      "harbor",
      "--font",
      "Geist",
      "--radius",
      "sm",
      "--lint",
      "eslint",
      "--branching",
      "trunk",
      "--no-credit",
      "--skip-install",
    ],
    {
      npm_config_user_agent: "npm/10.0.0 npm/? node/v22.0.0",
    },
  );
  assert.equal(flagged.status, 0, flagged.stderr);
  assertSameFiles(fromCode, fromFlags);
});

test("ctrl-c during a question quits without writing the app", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = runPrompt(target, ["\u0003"]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Aborted with Ctrl\+C/);
  assert.doesNotMatch(result.stdout, /Palette/);
  assert.equal(existsSync(path.join(target, "package.json")), false);
});

test("the credit question accepts y, yes, n, and no in any case", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const answers = [
    ["YES", true],
    ["y", true],
    ["no", false],
    ["N", false],
  ] as const;
  for (const [answer, credit] of answers) {
    const target = path.join(root, `credit-${answer}`, "my-app");
    const result = runPrompt(target, [
      ...Array.from({ length: 9 }, () => ENTER),
      `${answer}\r`,
      ENTER,
      ENTER,
      ENTER,
      ENTER,
    ]);
    assert.equal(result.status, 0, `${answer}\n${result.stdout}\n${result.stderr}`);
    const config = JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8"));
    assert.equal(config.credit, credit, answer);
  }

  const rejected = path.join(root, "rejected", "my-app");
  const again = runPrompt(rejected, [
    ...Array.from({ length: 9 }, () => ENTER),
    "maybe\r",
    "\u0015no\r",
    ENTER,
    ENTER,
    ENTER,
    ENTER,
  ]);
  assert.equal(again.status, 0, `${again.stdout}\n${again.stderr}`);
  assert.match(plainText(again.stdout), /"maybe" is not an answer/);
  const config = JSON.parse(readFileSync(path.join(rejected, ".seedlayer/config.json"), "utf8"));
  assert.equal(config.credit, false);
});

test("package manager flags, detection, and next steps", () => {
  for (const manager of ["npm", "pnpm", "yarn", "bun"] as const) {
    const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
    const target = path.join(root, "my-app");
    const result = run(target, [`--use-${manager}`, "--skip-install", "--no-interactive"], {
      npm_config_user_agent: "yarn/1.22.0 npm/? node/v22.0.0",
    });
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8"));
    assert.equal(config.packageManager, manager);
    assert.match(result.stdout, new RegExp(`\\n  ${manager} install\\n`));
    assert.match(result.stdout, new RegExp(`\\n  ${manager} run dev\\n`));
  }

  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const detected = run(path.join(root, "detected"), ["--yes", "--skip-install"], {
    npm_config_user_agent: "pnpm/10.12.1 npm/? node/v22.0.0",
  });
  assert.equal(detected.status, 0, detected.stderr);
  assert.equal(
    JSON.parse(readFileSync(path.join(root, "detected/.seedlayer/config.json"), "utf8"))
      .packageManager,
    "pnpm",
  );
  assert.match(detected.stdout, /\n {2}pnpm install\n/);
  const fallback = run(path.join(root, "fallback"), ["--yes", "--skip-install"], {
    npm_config_user_agent: "deno/1.0.0",
  });
  assert.equal(fallback.status, 0, fallback.stderr);
  assert.equal(
    JSON.parse(readFileSync(path.join(root, "fallback/.seedlayer/config.json"), "utf8"))
      .packageManager,
    "npm",
  );
  const both = run(path.join(root, "both"), ["--use-npm", "--use-bun", "--skip-install"]);
  assert.equal(both.status, 1);
  assert.match(both.stderr, /Pass only one of --use-npm, --use-pnpm, --use-yarn, --use-bun/);
});

test("--yes skips questions and keeps the flags", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = runPrompt(target, [], { args: ["--yes", "--palette", "ember", "--no-credit"] });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stdout, /Preset/);
  const config = JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8"));
  assert.equal(config.preset, "startup-speed");
  assert.equal(config.design.palette, "ember");
  assert.equal(config.credit, false);
  assert.equal(existsSync(path.join(target, "package.json")), true);
});

test("--disable-git skips the repository and the default makes the first commit", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const skipped = path.join(root, "skipped");
  const skipResult = run(skipped, ["--disable-git", "--yes", "--skip-install"]);
  assert.equal(skipResult.status, 0, skipResult.stderr);
  assert.equal(existsSync(path.join(skipped, ".git")), false);
  assert.equal(
    JSON.parse(readFileSync(path.join(skipped, ".seedlayer/config.json"), "utf8")).initGit,
    false,
  );

  const committed = path.join(root, "committed");
  const commitResult = run(committed, ["--yes", "--skip-install"], {
    GIT_AUTHOR_NAME: "Seedlayer Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Seedlayer Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  });
  assert.equal(commitResult.status, 0, commitResult.stderr);
  assert.doesNotMatch(commitResult.stderr, /Git commit failed/);
  const log = spawnSync("git", ["log", "-1", "--format=%s"], {
    cwd: committed,
    encoding: "utf8",
  });
  assert.equal(log.status, 0, log.stderr);
  assert.equal(log.stdout.trim(), "Initial commit from seedlayer");
});

test("a missing git or a failed commit warns and still writes the app", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const missing = path.join(root, "missing");
  const emptyBin = path.join(root, "empty-bin");
  mkdirSync(emptyBin);
  const missingResult = run(missing, ["--yes", "--skip-install"], { PATH: emptyBin });
  assert.equal(missingResult.status, 0, missingResult.stderr);
  assert.match(missingResult.stderr, /Git is not available\. Continuing without a repository\./);
  assert.equal(existsSync(path.join(missing, "package.json")), true);
  assert.equal(existsSync(path.join(missing, ".git")), false);

  const binDir = path.join(root, "bin");
  mkdirSync(binDir);
  const fake = path.join(binDir, "git");
  writeFileSync(
    fake,
    `#!/bin/sh
if [ "$1" = "rev-parse" ]; then
  exit 1
fi
if [ "$1" = "init" ]; then
  exec /usr/bin/git "$@"
fi
echo "Author identity unknown" >&2
exit 128
`,
  );
  chmodSync(fake, 0o755);
  const failed = path.join(root, "failed");
  const failedResult = run(failed, ["--yes", "--skip-install"], { PATH: binDir });
  assert.equal(failedResult.status, 0, failedResult.stderr);
  assert.match(failedResult.stderr, /Git commit failed\. Continuing without a commit\./);
  assert.equal(existsSync(path.join(failed, "package.json")), true);
  const log = spawnSync("git", ["log", "-1", "--format=%s"], { cwd: failed, encoding: "utf8" });
  assert.notEqual(log.stdout.trim(), "Initial commit from seedlayer");
});

test("--immediate installs and starts the dev server", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const binDir = path.join(root, "bin");
  const log = path.join(root, "commands.log");
  mkdirSync(binDir);
  const npm = path.join(binDir, "npm");
  writeFileSync(
    npm,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$SEEDLAYER_LOG"
exit 0
`,
  );
  chmodSync(npm, 0o755);
  const target = path.join(root, "my-app");
  const result = run(target, ["-i", "--skip-verify", "--use-npm"], {
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    SEEDLAYER_LOG: log,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(log, "utf8"), "install\nrun dev\n");
  assert.equal(
    JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8")).immediate,
    true,
  );

  const skipped = path.join(root, "skipped");
  const skipResult = run(skipped, ["--immediate", "--skip-install"]);
  assert.equal(skipResult.status, 0, skipResult.stderr);
  assert.match(skipResult.stderr, /Skipping the dev server because --skip-install was passed\./);
});

test("preferences become the next defaults and --reset-preferences clears them", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const home = path.join(root, "home");
  mkdirSync(home);
  const first = path.join(root, "first", "my-app");
  const saved = runPrompt(
    first,
    [
      ENTER,
      ENTER,
      ENTER,
      `${DOWN}${ENTER}`,
      `${DOWN}${ENTER}`,
      ENTER,
      `${DOWN}${ENTER}`,
      ENTER,
      ENTER,
      ENTER,
      `${DOWN}${ENTER}`,
      ENTER,
      ENTER,
      ENTER,
    ],
    { home },
  );
  assert.equal(saved.status, 0, `${saved.stdout}\n${saved.stderr}`);
  const prefs = JSON.parse(readFileSync(path.join(home, ".seedlayer.json"), "utf8"));
  assert.equal(prefs.font, "Geist");
  assert.equal(prefs.ui, "none");
  assert.equal(prefs.density, "spacious");
  assert.equal(prefs.packageManager, "pnpm");
  assert.equal(prefs.preset, "startup-speed");

  const second = path.join(root, "second", "my-app");
  const again = runPrompt(
    second,
    Array.from({ length: 14 }, () => ENTER),
    { home },
  );
  assert.equal(again.status, 0, `${again.stdout}\n${again.stderr}`);
  const againConfig = JSON.parse(readFileSync(path.join(second, ".seedlayer/config.json"), "utf8"));
  assert.equal(againConfig.design.fontSans, "Geist");
  assert.equal(againConfig.stack.components, "none");
  assert.equal(againConfig.design.density, "spacious");
  assert.equal(againConfig.packageManager, "pnpm");

  const yes = path.join(root, "yes", "my-app");
  const skipped = run(yes, ["--yes", "--skip-install"], {
    HOME: home,
    npm_config_user_agent: "npm/10.0.0 npm/? node/v22.0.0",
  });
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.equal(
    JSON.parse(readFileSync(path.join(yes, ".seedlayer/config.json"), "utf8")).packageManager,
    "npm",
  );

  const reset = path.join(root, "reset", "my-app");
  const cleared = run(reset, ["--reset-preferences", "--yes", "--skip-install"], { HOME: home });
  assert.equal(cleared.status, 0, cleared.stderr);
  assert.match(cleared.stdout, /Cleared saved answers/);
  assert.equal(existsSync(path.join(home, ".seedlayer.json")), false);
  assert.equal(
    JSON.parse(readFileSync(path.join(reset, ".seedlayer/config.json"), "utf8")).design.fontSans,
    "Inter",
  );
});

test("interactive flags force questions on or off", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const quiet = run(path.join(root, "quiet"), ["--no-interactive", "--skip-install"]);
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.equal(existsSync(path.join(root, "quiet/package.json")), true);

  const forced = run(path.join(root, "forced"), ["--interactive", "--skip-install"]);
  assert.equal(forced.status, 1);
  assert.match(forced.stderr, /Interactive mode needs a terminal/);

  const both = run(path.join(root, "both"), [
    "--interactive",
    "--no-interactive",
    "--skip-install",
  ]);
  assert.equal(both.status, 1);
  assert.match(both.stderr, /Don't pass --interactive with --no-interactive/);

  const yes = run(path.join(root, "yes"), ["--yes", "--interactive", "--skip-install"]);
  assert.equal(yes.status, 1);
  assert.match(yes.stderr, /Don't pass --yes with --interactive/);

  const config = run(path.join(root, "config"), [
    "--config",
    "sl1.not-a-real-code",
    "--use-npm",
    "--disable-git",
    "--immediate",
    "--skip-install",
  ]);
  assert.equal(config.status, 1);
  assert.match(config.stderr, /--use-npm/);
  assert.match(config.stderr, /--disable-git/);
  assert.match(config.stderr, /--immediate/);
});

test("the configurator and the CLI write the same files", async () => {
  const page = loadConfigurator();
  const bun = page
    .querySelectorAll("#managers button")
    .find((button) => button.dataset.manager === "bun");
  if (!bun) throw new Error("bun choice missing");
  bun.click();
  page.querySelector("#git-init").click();
  page.querySelector("#immediate").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const command = page.querySelector("#command").textContent;
  assert.equal(
    command,
    "npx seedlayer my-app --preset startup-speed --use-bun --disable-git --immediate",
  );
  const params = new URL(page.lastCountUrl, "http://localhost").searchParams;
  const route = readFileSync(
    path.resolve(here, "../../../apps/web/app/api/count/route.ts"),
    "utf8",
  );
  for (const key of ["packageManager", "initGit", "immediate", "ui", "density", "encodeConfig"]) {
    assert.match(route, new RegExp(key));
  }
  assert.equal(params.get("packageManager"), "bun");
  assert.equal(params.get("initGit"), "false");
  assert.equal(params.get("immediate"), "true");
  const code = encodeConfig(configFromCount(params));
  assert.equal(page.querySelector("#code").textContent, code);

  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = run(target, [
    "--preset",
    "startup-speed",
    "--use-bun",
    "--disable-git",
    "--immediate",
    "--skip-install",
    "--no-interactive",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const written = JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8"));
  const decoded = decodeConfig(code);
  assert.deepEqual(decoded, written);
  const rendered = renderProject({
    config: decoded,
    projectName: "my-app",
    catalog: loadCatalog(),
  });
  const files = listFiles(target);
  assert.deepEqual(files, rendered.map((file) => file.path).sort());
  for (const file of rendered) {
    assert.equal(readFileSync(path.join(target, file.path), "utf8"), file.contents, file.path);
  }
  assert.equal(existsSync(path.join(target, ".git")), false);
});

test("--agents claude writes the same files as claude-code", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const canonical = path.join(root, "canonical", "my-app");
  const alias = path.join(root, "alias", "my-app");
  const canonicalResult = run(canonical, [
    "--preset",
    "startup-speed",
    "--agents",
    "claude-code",
    "--skip-install",
  ]);
  const aliasResult = run(alias, [
    "--preset",
    "startup-speed",
    "--agents",
    "claude",
    "--skip-install",
  ]);
  assert.equal(canonicalResult.status, 0, canonicalResult.stderr);
  assert.equal(aliasResult.status, 0, aliasResult.stderr);
  assert.match(canonicalResult.stdout, /Wrote 48 files/);
  assert.match(aliasResult.stdout, /Wrote 48 files/);
  assert.equal(listFiles(canonical).length, 48);
  assertSameFiles(canonical, alias);
  const config = JSON.parse(readFileSync(path.join(alias, ".seedlayer/config.json"), "utf8"));
  assert.deepEqual(config.agents, ["claude-code"]);

  const both = path.join(root, "both", "my-app");
  const mixed = path.join(root, "mixed", "my-app");
  const bothResult = run(both, [
    "--preset",
    "startup-speed",
    "--agents",
    "cursor,claude-code",
    "--skip-install",
  ]);
  const mixedResult = run(mixed, [
    "--preset",
    "startup-speed",
    "--agents",
    "cursor,claude",
    "--skip-install",
  ]);
  assert.equal(bothResult.status, 0, bothResult.stderr);
  assert.equal(mixedResult.status, 0, mixedResult.stderr);
  assertSameFiles(both, mixed);
  const mixedConfig = JSON.parse(readFileSync(path.join(mixed, ".seedlayer/config.json"), "utf8"));
  assert.deepEqual(mixedConfig.agents, ["cursor", "claude-code"]);
});

test("--ui none and --ui shadcn set the component library and the agent rules", () => {
  const step = /shadcn components live in `components\/ui`/;
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  for (const ui of ["none", "shadcn"] as const) {
    const target = path.join(root, ui, "my-app");
    const result = run(target, ["--preset", "startup-speed", "--ui", ui, "--skip-install"]);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8"));
    assert.equal(config.stack.components, ui);
    assert.equal(existsSync(path.join(target, "components.json")), ui === "shadcn");
    assert.equal(existsSync(path.join(target, "components/ui/button.tsx")), ui === "shadcn");
    assert.equal(existsSync(path.join(target, "components/ui")), ui === "shadcn");
    const shared = readFileSync(path.join(target, "docs/agents/design.md"), "utf8");
    const cursor = readFileSync(path.join(target, ".cursor/rules/design.mdc"), "utf8");
    assert.equal(cursor.replace(/^---[\s\S]*?---\n/, "").trim(), shared.trim());
    for (const file of instructionFiles(target)) {
      if (ui === "none") {
        assert.doesNotMatch(file.text, /components\/ui/, file.path);
        assert.doesNotMatch(file.text, /components\.json/, file.path);
      }
    }
    const design = readFileSync(path.join(target, "DESIGN.md"), "utf8");
    if (ui === "none") assert.match(design, /does not install shadcn/);
    else assert.match(design, step);
    for (const file of CHOICE_RULES) {
      const text = readFileSync(path.join(target, file), "utf8");
      if (ui === "none") assert.doesNotMatch(text, step, file);
      else assert.match(text, step, file);
    }
  }
});

test("every --density value sets spacing and the agent rules", () => {
  const space = {
    compact: "1.5rem",
    comfortable: "2.5rem",
    spacious: "4rem",
  } as const;
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  for (const density of CHOICES.density) {
    const target = path.join(root, density, "my-app");
    const result = run(target, [
      "--preset",
      "startup-speed",
      "--density",
      density,
      "--skip-install",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8"));
    assert.equal(config.design.density, density);
    assert.match(
      readFileSync(path.join(target, "app/tokens.css"), "utf8"),
      new RegExp(`--space-section: ${space[density]}`),
    );
    assert.match(
      readFileSync(path.join(target, "DESIGN.md"), "utf8"),
      new RegExp(`density \`${density}\``),
    );
    const shared = readFileSync(path.join(target, "docs/agents/design.md"), "utf8");
    const cursor = readFileSync(path.join(target, ".cursor/rules/design.mdc"), "utf8");
    assert.equal(cursor.replace(/^---[\s\S]*?---\n/, "").trim(), shared.trim());
    assert.match(shared, new RegExp(`Density is \`${density}\``));
    for (const file of CHOICE_RULES) {
      assert.match(
        readFileSync(path.join(target, file), "utf8"),
        new RegExp(`Density is \`${density}\``),
        file,
      );
    }
  }
});

test("the configurator adds --ui and --density when they leave the preset", () => {
  const page = loadConfigurator();
  const none = page.querySelectorAll("#uis button").find((button) => button.dataset.ui === "none");
  if (!none) throw new Error("ui choice missing");
  none.click();
  assert.equal(
    page.querySelector("#command").textContent,
    "npx seedlayer my-app --preset startup-speed --ui none",
  );
  const compact = page
    .querySelectorAll("#densities button")
    .find((button) => button.dataset.density === "compact");
  if (!compact) throw new Error("density choice missing");
  compact.click();
  assert.equal(
    page.querySelector("#command").textContent,
    "npx seedlayer my-app --preset startup-speed --ui none --density compact",
  );
  const spacious = page
    .querySelectorAll("#densities button")
    .find((button) => button.dataset.density === "spacious");
  if (!spacious) throw new Error("spacious choice missing");
  spacious.click();
  assert.equal(
    page.querySelector("#command").textContent,
    "npx seedlayer my-app --preset startup-speed --ui none --density spacious",
  );
  const shadcn = page
    .querySelectorAll("#uis button")
    .find((button) => button.dataset.ui === "shadcn");
  if (!shadcn) throw new Error("shadcn choice missing");
  shadcn.click();
  assert.equal(
    page.querySelector("#command").textContent,
    "npx seedlayer my-app --preset startup-speed --density spacious",
  );
  page.querySelector("#presets button").click();
  assert.equal(
    page.querySelector("#command").textContent,
    "npx seedlayer my-app --preset startup-speed",
  );
});

const CHOICE_RULES = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/agents/design.md",
  ".cursor/rules/design.mdc",
  ".claude/skills/implement/SKILL.md",
  ".cursor/skills/implement/SKILL.md",
];

function instructionFiles(target: string): Array<{ path: string; text: string }> {
  return listFiles(target)
    .filter(
      (file) =>
        file === "AGENTS.md" ||
        file === "CLAUDE.md" ||
        file === "DESIGN.md" ||
        file.startsWith("docs/agents/") ||
        file.startsWith(".claude/") ||
        file.startsWith(".cursor/"),
    )
    .map((file) => ({
      path: file,
      text: readFileSync(path.join(target, file), "utf8"),
    }));
}

function assertPresetGitRules(target: string, claude: boolean): void {
  const activeBranch = /active branch/;
  const noToolPrefix = /no `cursor\/`, no `agent\/`, no random IDs/;
  const recorded = /recorded branch/;
  const typeName = /<type>\/<short-kebab-description>/;
  const syncFirst = /git fetch origin/;
  const branching = readFileSync(path.join(target, ".cursor/rules/branching.mdc"), "utf8");
  const sync = readFileSync(path.join(target, ".cursor/rules/sync-branch-first.mdc"), "utf8");
  const agents = readFileSync(path.join(target, "AGENTS.md"), "utf8");
  const doc = readFileSync(path.join(target, "BRANCHING.md"), "utf8");
  for (const contents of [branching, agents, doc]) {
    assert.match(contents, activeBranch);
    assert.match(contents, noToolPrefix);
    assert.match(contents, recorded);
    assert.doesNotMatch(contents, /unless (?:that branch|the active branch) is/i);
  }
  assert.match(branching, typeName);
  assert.match(branching, syncFirst);
  assert.match(sync, /alwaysApply: true/);
  assert.match(sync, syncFirst);
  assert.doesNotMatch(doc, /agent\/<ticket>|branch from main/i);
  const cursorImplement = readFileSync(path.join(target, ".cursor/commands/implement.md"), "utf8");
  assert.match(cursorImplement, /\.cursor\/skills\/implement\/SKILL\.md/);
  assert.equal(existsSync(path.join(target, ".cursor/skills/implement/SKILL.md")), true);
  if (!claude) {
    assert.equal(existsSync(path.join(target, "CLAUDE.md")), false);
    assert.equal(existsSync(path.join(target, ".claude/commands/implement.md")), false);
    return;
  }
  const claudeDoc = readFileSync(path.join(target, "CLAUDE.md"), "utf8");
  assert.match(claudeDoc, activeBranch);
  assert.match(claudeDoc, noToolPrefix);
  assert.match(claudeDoc, recorded);
  const claudeImplement = readFileSync(path.join(target, ".claude/commands/implement.md"), "utf8");
  assert.match(claudeImplement, /\.claude\/skills\/implement\/SKILL\.md/);
  assert.doesNotMatch(claudeImplement, /\.cursor\/skills/);
  assert.equal(existsSync(path.join(target, ".claude/skills/implement/SKILL.md")), true);
}

function run(target: string, args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", bin, target, ...args], {
    cwd: path.resolve(here, "../../.."),
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : undefined,
  });
}

function runPrompt(
  target: string,
  steps: string[],
  options: { args?: string[]; env?: NodeJS.ProcessEnv; home?: string } = {},
) {
  const home = options.home ?? path.join(path.dirname(target), `.home-${path.basename(target)}`);
  mkdirSync(home, { recursive: true });
  const script = [
    "import fcntl, json, os, pty, select, struct, sys, termios, time",
    "home, cwd = sys.argv[1], sys.argv[2]",
    "cmd = sys.argv[3:]",
    "steps = json.loads(sys.stdin.buffer.read().decode())",
    "pid, fd = pty.fork()",
    "if pid == 0:",
    "    os.environ['TERM'] = 'xterm-256color'",
    "    os.environ['COLUMNS'] = '200'",
    "    os.environ['HOME'] = home",
    "    os.environ.pop('CI', None)",
    "    os.environ.pop('ACCESSIBLE', None)",
    "    winsz = struct.pack('HHHH', 40, 200, 0, 0)",
    "    fcntl.ioctl(1, termios.TIOCSWINSZ, winsz)",
    "    os.chdir(cwd)",
    "    os.execvp(cmd[0], cmd)",
    "output = b''",
    "index = 0",
    "saw_new = False",
    "last = time.time()",
    "quiet = 0.25",
    "deadline = time.time() + 25",
    "def take(timeout):",
    "    ready, _, _ = select.select([fd], [], [], timeout)",
    "    if not ready:",
    "        return b''",
    "    try:",
    "        return os.read(fd, 8192)",
    "    except OSError:",
    "        return b''",
    "def send(data):",
    "    view = memoryview(data)",
    "    while len(view):",
    "        view = view[os.write(fd, view):]",
    "while time.time() < deadline:",
    "    chunk = take(0.05)",
    "    now = time.time()",
    "    if chunk:",
    "        output += chunk",
    "        saw_new = True",
    "        last = now",
    "    elif saw_new and now - last >= quiet and index < len(steps):",
    "        send(steps[index].encode())",
    "        index += 1",
    "        saw_new = False",
    "        last = now",
    "    wpid, status = os.waitpid(pid, os.WNOHANG)",
    "    if wpid == 0:",
    "        continue",
    "    while True:",
    "        chunk = take(0)",
    "        if not chunk:",
    "            break",
    "        output += chunk",
    "    sys.stdout.buffer.write(output)",
    "    if os.WIFEXITED(status):",
    "        raise SystemExit(os.WEXITSTATUS(status))",
    "    if os.WIFSIGNALED(status):",
    "        raise SystemExit(128 + os.WTERMSIG(status))",
    "    raise SystemExit(1)",
    "os.kill(pid, 9)",
    "os.waitpid(pid, 0)",
    "sys.stdout.buffer.write(output)",
    "raise SystemExit(124)",
  ].join("\n");
  return spawnSync(
    "python3",
    [
      "-c",
      script,
      home,
      path.resolve(here, "../../.."),
      process.execPath,
      "--import",
      "tsx",
      bin,
      target,
      "--skip-install",
      ...(options.args ?? []),
    ],
    {
      input: JSON.stringify(steps),
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_user_agent: "npm/10.0.0 npm/? node/v22.0.0",
        ...options.env,
        HOME: home,
      },
    },
  );
}

function configFromCount(params: URLSearchParams) {
  const agents = params.get("agents");
  return withConfigFlags(loadPreset(params.get("preset") ?? "startup-speed"), {
    palette: params.get("palette") ?? undefined,
    font: params.get("font") ?? undefined,
    ui: params.get("ui") ?? undefined,
    radius: params.get("radius") ?? undefined,
    density: params.get("density") ?? undefined,
    lint: params.get("lint") ?? undefined,
    branching: params.get("branching") ?? undefined,
    agents: agents === null ? undefined : agents.split(","),
    credit: boolParam(params.get("credit")),
    packageManager: params.get("packageManager") ?? undefined,
    initGit: boolParam(params.get("initGit")),
    immediate: boolParam(params.get("immediate")),
  });
}

function boolParam(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function plainText(value: string): string {
  const esc = String.fromCharCode(27);
  return value.replaceAll(new RegExp(`${esc}\\[[0-9;]*[A-Za-z]`, "g"), "");
}

function assertSameFiles(left: string, right: string): void {
  const leftFiles = listFiles(left);
  const rightFiles = listFiles(right);
  assert.deepEqual(rightFiles, leftFiles);
  for (const file of leftFiles) {
    assert.equal(
      readFileSync(path.join(right, file), "utf8"),
      readFileSync(path.join(left, file), "utf8"),
      file,
    );
  }
}

function listFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return files.sort();
}

function loadConfigurator() {
  const htmlPath = path.resolve(here, "../../../apps/web/configurator.html");
  const html = readFileSync(htmlPath, "utf8");
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  if (!script) throw new Error("configurator script missing");
  const document = createDocument();
  const choices = document.querySelector("#seedlayer-choices");
  if (!choices) throw new Error("choices missing");
  choices.textContent = JSON.stringify(CHOICES);
  const fetch = (url: string) => {
    document.lastCountUrl = String(url);
    const params = new URL(String(url), "http://localhost").searchParams;
    const config = configFromCount(params);
    const files = renderProject({
      config,
      projectName: "my-app",
      catalog: loadCatalog(),
    });
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ count: files.length, code: encodeConfig(config) }),
    });
  };
  const context: Record<string, unknown> = {
    document,
    window: { setTimeout },
    setTimeout,
    clearTimeout,
    URLSearchParams,
    console,
    fetch,
  };
  // The page script is a classic script, so run it against the stub document.
  const runner = new Function(
    ...Object.keys(context),
    `${script}\nreturn { command: document.querySelector("#command").textContent };`,
  );
  runner(...Object.values(context));
  return document;
}

type StubNode = {
  tag: string;
  id: string;
  className: string;
  textContent: string;
  value: string;
  hidden: boolean;
  disabled: boolean;
  type: string;
  parent: StubNode | null;
  children: StubNode[];
  dataset: Record<string, string>;
  style: { setProperty: (name: string, value: string) => void } & Record<string, string>;
  listeners: Record<string, Array<(event: { target: StubNode }) => void>>;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  removeAttribute: (name: string) => void;
  addEventListener: (type: string, fn: (event: { target: StubNode }) => void) => void;
  append: (...nodes: StubNode[]) => void;
  replaceChildren: (...nodes: StubNode[]) => void;
  querySelector: (selector: string) => StubNode | null;
  querySelectorAll: (selector: string) => StubNode[];
  closest: (selector: string) => StubNode | null;
  click: () => void;
  dispatch: (type: string) => void;
  focus: () => void;
  innerHTML: string;
};

function createDocument() {
  const documentElement = node("html");
  const named = (id: string, tag = "div") => {
    const element = node(tag);
    element.id = id;
    return element;
  };
  const name = named("name", "input");
  name.value = "my-app";
  const settings = named("settings");
  for (const id of [
    "presets",
    "palettes",
    "radii",
    "densities",
    "fonts",
    "uis",
    "linters",
    "gits",
    "agents",
    "managers",
  ]) {
    settings.append(named(id));
  }
  settings.append(
    named("credit", "button"),
    named("git-init", "button"),
    named("immediate", "button"),
  );
  const stage = named("stage");
  stage.append(named("stage-name"), named("primary"), named("highlight"), named("surface"));
  documentElement.append(
    name,
    named("error"),
    named("fix"),
    named("copy"),
    settings,
    stage,
    named("command"),
    named("code"),
    named("summary"),
    named("file-count"),
    named("seedlayer-choices", "script"),
  );
  return {
    documentElement,
    lastCountUrl: "",
    createElement(tag: string) {
      return node(tag);
    },
    querySelector(selector: string) {
      return queryAll(documentElement, selector)[0] ?? null;
    },
    querySelectorAll(selector: string) {
      return queryAll(documentElement, selector);
    },
  };
}

function node(tag: string): StubNode {
  const element = {
    tag,
    id: "",
    className: "",
    textContent: "",
    value: "",
    hidden: false,
    disabled: false,
    type: "",
    parent: null,
    children: [],
    dataset: {},
    style: new Proxy({ setProperty() {} }, { set: () => true }),
    listeners: {},
    setAttribute(name: string, value: string) {
      if (name === "id") element.id = value;
      if (name.startsWith("data-")) element.dataset[name.slice(5)] = value;
    },
    getAttribute(name: string) {
      if (name === "id") return element.id;
      return null;
    },
    removeAttribute() {},
    addEventListener(type: string, fn: (event: { target: StubNode }) => void) {
      element.listeners[type] = [...(element.listeners[type] ?? []), fn];
    },
    append(...nodes: StubNode[]) {
      for (const child of nodes) {
        child.parent = element;
        element.children.push(child);
      }
    },
    replaceChildren(...nodes: StubNode[]) {
      element.children = [];
      element.append(...nodes);
    },
    querySelector(selector: string) {
      return queryAll(element, selector)[0] ?? null;
    },
    querySelectorAll(selector: string) {
      return queryAll(element, selector);
    },
    closest(selector: string) {
      let current: StubNode | null = element;
      while (current) {
        if (matches(current, selector)) return current;
        current = current.parent;
      }
      return null;
    },
    click() {
      element.dispatch("click");
    },
    dispatch(type: string) {
      const event = { target: element };
      let current: StubNode | null = element;
      while (current) {
        for (const listener of current.listeners[type] ?? []) listener(event);
        current = current.parent;
      }
    },
    focus() {},
  } as StubNode;
  Object.defineProperty(element, "innerHTML", {
    set(value: string) {
      element.children = [];
      if (!value.includes("<strong>")) return;
      const strong = node("strong");
      const span = node("span");
      span.className = "desc";
      element.append(strong, span);
    },
  });
  return element;
}

function queryAll(root: StubNode, selector: string): StubNode[] {
  const parts = selector.trim().split(/\s+/);
  let current = [root];
  for (const part of parts) {
    const next: StubNode[] = [];
    for (const item of current) {
      for (const descendant of collect(item)) {
        if (matches(descendant, part)) next.push(descendant);
      }
    }
    current = next;
  }
  return current;
}

function collect(root: StubNode): StubNode[] {
  const all: StubNode[] = [];
  const walk = (item: StubNode) => {
    for (const child of item.children) {
      all.push(child);
      walk(child);
    }
  };
  walk(root);
  return all;
}

function matches(item: StubNode, selector: string): boolean {
  if (selector.startsWith("#")) return item.id === selector.slice(1);
  if (selector.startsWith(".")) return item.className.split(/\s+/).includes(selector.slice(1));
  const [tag, className] = selector.split(".");
  if (item.tag !== tag) return false;
  return className === undefined || item.className.split(/\s+/).includes(className);
}
