import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
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
    ["radius", "none, sm, md, lg"],
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
  assert.match(
    help.stdout,
    /asks for the preset, palette, agents, font, radius, lint,\nbranching, and credit/,
  );
});

test("a wrong answer, then a right one, creates the app with the right one", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = runPrompt(
    target,
    ["nope", "team-strict", "purple", "ember", "bogus", "claude", "", "", "", "", "", "", ""].join(
      "\n",
    ),
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stdout,
    /"nope" is not a preset\. Pick one of: startup-speed, team-strict, hackathon-2h/,
  );
  assert.match(
    result.stdout,
    /"purple" is not a palette\. Pick one of: ink, harbor, ember, iris, grove, dusk/,
  );
  assert.match(
    result.stdout,
    /"bogus" is not an agent\. Pick one of: cursor, claude-code\. claude is a short name for claude-code/,
  );
  const config = JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8"));
  assert.equal(config.preset, "team-strict");
  assert.equal(config.design.palette, "ember");
  assert.deepEqual(config.agents, ["claude-code"]);

  const defaults = path.join(root, "defaults");
  const empty = runPrompt(defaults, "\n".repeat(9));
  assert.equal(empty.status, 0, `${empty.stdout}\n${empty.stderr}`);
  assert.doesNotMatch(empty.stdout, /is not a /);
  const defaultConfig = JSON.parse(
    readFileSync(path.join(defaults, ".seedlayer/config.json"), "utf8"),
  );
  assert.equal(defaultConfig.preset, "startup-speed");
  assert.equal(defaultConfig.design.palette, "ink");
  assert.equal(defaultConfig.design.fontSans, "Inter");
  assert.equal(defaultConfig.design.radius, "md");
  assert.equal(defaultConfig.codeStyle.linter, "biome");
  assert.equal(defaultConfig.git.workflow, "agent-safe");
  assert.equal(defaultConfig.credit, true);
  assert.deepEqual(defaultConfig.agents, ["cursor", "claude-code"]);
});

test("a non-empty folder fails before any question is shown", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  mkdirSync(target);
  writeFileSync(path.join(target, "keep.txt"), "keep");
  const result = runPrompt(target, ["team-strict", "ember", "claude"].join("\n"));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /is not empty\. Pass --force to replace it\./);
  assert.doesNotMatch(result.stdout, /preset \(/);
  assert.equal(readFileSync(path.join(target, "keep.txt"), "utf8"), "keep");
  assert.equal(existsSync(path.join(target, "package.json")), false);
});

test("question mode matches the same font, radius, lint, branching, and credit flags", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const prompted = path.join(root, "prompted", "my-app");
  const flagged = path.join(root, "flagged", "my-app");
  const promptedResult = runPrompt(
    prompted,
    ["", "", "", "Geist", "sm", "eslint", "trunk", "no", "Y"].join("\n"),
  );
  assert.equal(promptedResult.status, 0, promptedResult.stdout);
  const flaggedResult = run(flagged, [
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
  ]);
  assert.equal(flaggedResult.status, 0, flaggedResult.stderr);
  assertSameFiles(prompted, flagged);
});

test("a bad project name fails before any question", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "My App");
  const result = runPrompt(target, "startup-speed\n");
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Use a lowercase project name such as my-app/);
  assert.doesNotMatch(result.stdout, /preset \(/);
  assert.equal(existsSync(target), false);
});

test("the summary shows a working sl1 code and n writes nothing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = runPrompt(
    target,
    ["", "harbor", "", "Geist", "sm", "eslint", "trunk", "no", "n"].join("\n"),
  );
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
  const flagged = run(fromFlags, [
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
  ]);
  assert.equal(flagged.status, 0, flagged.stderr);
  assertSameFiles(fromCode, fromFlags);
});

test("ctrl-c during a question quits without writing the app", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = runPrompt(target, "\u0003");
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Aborted with Ctrl\+C/);
  assert.doesNotMatch(result.stdout, /palette \(/);
  assert.equal(existsSync(path.join(target, "package.json")), false);
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

function run(target: string, args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", bin, target, ...args], {
    cwd: path.resolve(here, "../../.."),
    encoding: "utf8",
  });
}

function runPrompt(target: string, input: string) {
  const script = [
    "import fcntl, os, pty, re, select, struct, sys, termios, time",
    "cwd, cmd = sys.argv[1], sys.argv[2:]",
    "payload = sys.stdin.buffer.read()",
    "ctrl_c = payload == b'\\x03'",
    "if payload and not ctrl_c and not payload.endswith(b'\\n'):",
    "    payload += b'\\n'",
    "lines = [] if ctrl_c else payload.splitlines()",
    "pid, fd = pty.fork()",
    "if pid == 0:",
    "    os.environ['TERM'] = 'xterm-256color'",
    "    os.environ['COLUMNS'] = '200'",
    "    winsz = struct.pack('HHHH', 40, 200, 0, 0)",
    "    fcntl.ioctl(1, termios.TIOCSWINSZ, winsz)",
    "    os.chdir(cwd)",
    "    os.execvp(cmd[0], cmd)",
    "output = b''",
    "index = 0",
    "sent_ctrl = False",
    "saw_new = False",
    "last = time.time()",
    "quiet = 0.3",
    "waiting = re.compile(rb'(?:\\]: |\\[Y/n\\] )(?:\\x1b\\[\\d+G)?$')",
    "deadline = time.time() + 20",
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
    "    elif saw_new and now - last >= quiet and waiting.search(output):",
    "        if ctrl_c and not sent_ctrl:",
    "            send(b'\\x03')",
    "            sent_ctrl = True",
    "        elif index < len(lines):",
    "            send(lines[index] + b'\\n')",
    "            index += 1",
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
      path.resolve(here, "../../.."),
      process.execPath,
      "--import",
      "tsx",
      bin,
      target,
      "--skip-install",
    ],
    { input, encoding: "utf8" },
  );
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
  const context: Record<string, unknown> = {
    document,
    window: { setTimeout },
    setTimeout,
    clearTimeout,
    URLSearchParams,
    console,
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
  for (const id of ["presets", "palettes", "radii", "fonts", "linters", "gits", "agents"]) {
    settings.append(named(id));
  }
  settings.append(named("credit", "button"));
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
    named("summary"),
    named("file-count"),
  );
  return {
    documentElement,
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
