#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  AGENT_IDS,
  CHOICES,
  decodeConfig,
  formatConfigError,
  type PackageManager,
  parseConfig,
  projectNameSchema,
  renderProject,
  type SeedlayerConfig,
  SeedlayerError,
  withConfigFlags,
} from "@seedlayer/core";
import { loadCatalog, loadPreset } from "@seedlayer/packs";
import { loadPreferences, resetPreferences } from "./preferences.js";
import { promptConfig } from "./prompt.js";

const CONFIG_FLAGS = [
  "preset",
  "palette",
  "font",
  "ui",
  "radius",
  "density",
  "agents",
  "lint",
  "branching",
] as const;

const AGENT_CHOICES = `${AGENT_IDS.join(", ")}. claude is a short name for claude-code`;

type Flags = {
  config?: string;
  preset?: string;
  palette?: string;
  font?: string;
  ui?: string;
  radius?: string;
  density?: string;
  agents?: string;
  lint?: string;
  branching?: string;
  "no-credit": boolean;
  "skip-install": boolean;
  "skip-verify": boolean;
  force: boolean;
  "use-npm": boolean;
  "use-pnpm": boolean;
  "use-yarn": boolean;
  "use-bun": boolean;
  yes: boolean;
  "disable-git": boolean;
  interactive: boolean;
  "no-interactive": boolean;
  immediate: boolean;
  "reset-preferences": boolean;
  version: boolean;
  help: boolean;
};

main().catch((error: unknown) => {
  console.error(formatConfigError(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      config: { type: "string" },
      preset: { type: "string" },
      palette: { type: "string" },
      font: { type: "string" },
      ui: { type: "string" },
      radius: { type: "string" },
      density: { type: "string" },
      agents: { type: "string" },
      lint: { type: "string" },
      branching: { type: "string" },
      "no-credit": { type: "boolean", default: false },
      "use-npm": { type: "boolean", default: false },
      "use-pnpm": { type: "boolean", default: false },
      "use-yarn": { type: "boolean", default: false },
      "use-bun": { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      "disable-git": { type: "boolean", default: false },
      interactive: { type: "boolean", default: false },
      "no-interactive": { type: "boolean", default: false },
      immediate: { type: "boolean", short: "i", default: false },
      "reset-preferences": { type: "boolean", default: false },
      "skip-install": { type: "boolean", default: false },
      "skip-verify": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      version: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const flags: Flags = values;

  if (flags.version) {
    console.log(cliVersion());
    return;
  }
  if (flags.help) {
    printHelp();
    return;
  }
  if (flags["reset-preferences"]) {
    resetPreferences();
    console.log("Cleared saved answers.");
  }

  const directory = positionals[0];
  if (!directory || positionals.length !== 1) {
    if (flags["reset-preferences"] && positionals.length === 0) return;
    printHelp();
    throw new SeedlayerError("Pass one directory.");
  }

  const target = path.resolve(directory);
  const projectName = path.basename(target);
  const parsedName = projectNameSchema.safeParse(projectName);
  if (!parsedName.success) {
    throw new SeedlayerError(parsedName.error.issues.map((issue) => issue.message).join("\n"));
  }

  const config = await resolveConfig(flags, directory, target);
  if (!config) return;

  prepareDirectory(target, flags.force);
  const files = renderProject({
    config,
    projectName: parsedName.data,
    catalog: loadCatalog(),
  });
  for (const file of files) {
    const dest = path.join(target, file.path);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, file.contents, { mode: file.executable ? 0o755 : 0o644 });
  }
  console.log(`Wrote ${files.length} files to ${target}`);

  const manager = packageManagerOf(config.packageManager);
  ensureGit(target, config.initGit);
  if (flags["skip-install"]) {
    if (config.immediate) {
      console.error("Skipping the dev server because --skip-install was passed.");
    }
    printNextSteps(directory, manager, false);
    return;
  }
  run(manager, ["install"], target);
  if (!flags["skip-verify"]) {
    run(manager, ["run", "lint"], target);
    run(manager, ["run", "typecheck"], target);
  }
  if (config.immediate) {
    run(manager, ["run", "dev"], target);
    return;
  }
  printNextSteps(directory, manager, true);
}

async function resolveConfig(
  flags: Flags,
  directory: string,
  target: string,
): Promise<SeedlayerConfig | undefined> {
  const conflicts = conflictingFlags(flags);
  if (flags.config !== undefined && conflicts.length > 0) {
    throw new SeedlayerError(`Don't pass --config with ${conflicts.join(", ")}.`);
  }
  if (flags.interactive && flags["no-interactive"]) {
    throw new SeedlayerError("Don't pass --interactive with --no-interactive.");
  }
  if (flags.yes && flags.interactive) {
    throw new SeedlayerError("Don't pass --yes with --interactive.");
  }
  if (flags.config !== undefined) {
    if (flags.interactive) throw new SeedlayerError("Don't pass --interactive with --config.");
    return readConfig(flags.config);
  }
  if (shouldPrompt(flags)) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new SeedlayerError("Interactive mode needs a terminal.");
    }
    assertDirectory(target, flags.force);
    return promptConfig(directory, promptFlags(flags), loadPreferences(), detectPackageManager());
  }
  return configFromFlags(flags);
}

function shouldPrompt(flags: Flags): boolean {
  if (flags.yes || flags["no-interactive"]) return false;
  if (flags.interactive) return true;
  const passed =
    CONFIG_FLAGS.some((flag) => flags[flag] !== undefined) ||
    flags["no-credit"] ||
    flags["disable-git"] ||
    flags.immediate ||
    selectedPackageManager(flags) !== undefined;
  if (passed) return false;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function conflictingFlags(flags: Flags): string[] {
  const names = CONFIG_FLAGS.filter((flag) => flags[flag] !== undefined).map((flag) => `--${flag}`);
  if (flags["no-credit"]) names.push("--no-credit");
  for (const manager of CHOICES.packageManager) {
    if (packageManagerFlag(manager, flags)) names.push(`--use-${manager}`);
  }
  if (flags["disable-git"]) names.push("--disable-git");
  if (flags.immediate) names.push("--immediate");
  return names;
}

function promptFlags(flags: Flags) {
  return {
    preset: flags.preset,
    palette: flags.palette,
    font: flags.font,
    ui: flags.ui,
    radius: flags.radius,
    density: flags.density,
    lint: flags.lint,
    branching: flags.branching,
    agents: flags.agents === undefined ? undefined : parseAgents(flags.agents),
    credit: flags["no-credit"] ? false : undefined,
    packageManager: selectedPackageManager(flags),
    initGit: flags["disable-git"] ? false : undefined,
    immediate: flags.immediate ? true : undefined,
  };
}

function configFromFlags(flags: Flags): SeedlayerConfig {
  const preset = oneOf("preset", flags.preset, CHOICES.preset) ?? "startup-speed";
  return withConfigFlags(loadPreset(preset), {
    palette: oneOf("palette", flags.palette, CHOICES.palette),
    font: oneOf("font", flags.font, CHOICES.font),
    ui: oneOf("ui", flags.ui, CHOICES.ui),
    radius: oneOf("radius", flags.radius, CHOICES.radius),
    density: oneOf("density", flags.density, CHOICES.density),
    lint: oneOf("lint", flags.lint, CHOICES.lint),
    branching: oneOf("branching", flags.branching, CHOICES.branching),
    agents: flags.agents === undefined ? undefined : parseAgents(flags.agents),
    credit: flags["no-credit"] ? false : undefined,
    packageManager: selectedPackageManager(flags) ?? detectPackageManager(),
    initGit: !flags["disable-git"],
    immediate: flags.immediate,
  });
}

function selectedPackageManager(flags: Flags): PackageManager | undefined {
  const selected = CHOICES.packageManager.filter((manager) => packageManagerFlag(manager, flags));
  if (selected.length > 1) {
    throw new SeedlayerError(
      `Pass only one of ${CHOICES.packageManager.map((manager) => `--use-${manager}`).join(", ")}.`,
    );
  }
  return selected[0];
}

function packageManagerFlag(manager: PackageManager, flags: Flags): boolean {
  switch (manager) {
    case "npm":
      return flags["use-npm"];
    case "pnpm":
      return flags["use-pnpm"];
    case "yarn":
      return flags["use-yarn"];
    case "bun":
      return flags["use-bun"];
    default: {
      const unreachable: never = manager;
      return unreachable;
    }
  }
}

function detectPackageManager(): PackageManager {
  const name = (process.env.npm_config_user_agent ?? "").split("/")[0];
  return CHOICES.packageManager.find((manager) => manager === name) ?? "npm";
}

function packageManagerOf(value: string): PackageManager {
  const match = CHOICES.packageManager.find((manager) => manager === value);
  if (!match) throw new SeedlayerError(`Unknown package manager "${value}".`);
  return match;
}

function oneOf<T extends string>(
  flag: string,
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) return undefined;
  const match = allowed.find((item) => item === value);
  if (!match) {
    throw new SeedlayerError(
      `Unknown --${flag} "${value}". Expected one of: ${allowed.join(", ")}`,
    );
  }
  return match;
}

function parseAgents(value: string): string[] {
  const agents = listedAgents(value);
  if (!agents) {
    throw new SeedlayerError(
      `Unknown --agents "${value}". Expected a comma-separated list of: ${AGENT_CHOICES}`,
    );
  }
  return agents;
}

function listedAgents(value: string): string[] | undefined {
  const agents = value.split(",").map((item) => aliasAgent(item.trim()));
  const unknown = agents.some((agent) => !AGENT_IDS.find((item) => item === agent));
  if (agents.length === 0 || unknown) return undefined;
  return agents;
}

function aliasAgent(agent: string): string {
  return agent === "claude" ? "claude-code" : agent;
}

function cliVersion(): string {
  const packageJsonPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../package.json",
  );
  const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (!hasVersion(parsed)) throw new SeedlayerError("CLI package.json is missing a version.");
  return parsed.version;
}

function hasVersion(value: unknown): value is { version: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "string"
  );
}

function readConfig(value: string): SeedlayerConfig {
  if (value.startsWith("sl1.")) return decodeConfig(value);
  if (existsSync(value)) return parseConfig(JSON.parse(readFileSync(value, "utf8")) as unknown);
  throw new SeedlayerError(`Config "${value}" is not an sl1 code or a file.`);
}

function assertDirectory(target: string, force: boolean): void {
  if (target === path.parse(target).root) {
    throw new SeedlayerError("Refusing to write to the filesystem root.");
  }
  if (!existsSync(target) || readdirSync(target).length === 0 || force) return;
  throw new SeedlayerError(`${target} is not empty. Pass --force to replace it.`);
}

function prepareDirectory(target: string, force: boolean): void {
  assertDirectory(target, force);
  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true });
    return;
  }
  if (readdirSync(target).length === 0) return;
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
}

function ensureGit(target: string, initGit: boolean): void {
  if (!initGit) return;
  const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: target,
    stdio: "ignore",
  });
  if (missingGit(inside)) {
    console.error("Git is not available. Continuing without a repository.");
    return;
  }
  if (inside.status === 0) return;
  const created = spawnSync("git", ["init", "-b", "main"], { cwd: target, stdio: "inherit" });
  if (missingGit(created)) {
    console.error("Git is not available. Continuing without a repository.");
    return;
  }
  if (created.status !== 0) {
    console.error("Git init failed. Continuing without a repository.");
    return;
  }
  const added = spawnSync("git", ["add", "-A"], { cwd: target, stdio: "inherit" });
  if (added.status !== 0) {
    console.error("Git commit failed. Continuing without a commit.");
    return;
  }
  const committed = spawnSync("git", ["commit", "-m", "Initial commit from seedlayer"], {
    cwd: target,
    stdio: "inherit",
  });
  if (committed.status !== 0) {
    console.error("Git commit failed. Continuing without a commit.");
  }
}

function missingGit(result: { error?: Error }): boolean {
  return result.error !== undefined && "code" in result.error && result.error.code === "ENOENT";
}

function printNextSteps(directory: string, manager: PackageManager, installed: boolean): void {
  const lines = ["", "Next steps:", `  cd ${shellArg(directory)}`];
  if (!installed) lines.push(`  ${manager} install`);
  lines.push(`  ${manager} run dev`);
  console.log(lines.join("\n"));
}

function shellArg(value: string): string {
  return /^[A-Za-z0-9._@/:+-]+$/.test(value) ? value : `'${value.replaceAll("'", `'"'"'`)}'`;
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    throw new SeedlayerError(
      `Could not run ${command}. Install it or pass a different --use-* flag.`,
    );
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function printHelp(): void {
  console.log(`seedlayer <directory> [options]

Start from a preset and apply any flags you pass. With no config flags, an
interactive terminal picks the preset, palette, agents, font, UI components,
radius, density, lint, branching, credit, package manager, git, and whether to
start the dev server, then confirms before writing. Arrow keys move, Enter selects, and Space toggles
agents. --yes skips the questions and the confirmation.

Options:
  --config <code-or-file>  sl1 code or a JSON config file
  --preset <name>          ${CHOICES.preset.join(", ")} (default startup-speed)
  --palette <name>         ${CHOICES.palette.join(", ")}
  --font <name>            ${CHOICES.font.join(", ")}
  --ui <name>              ${CHOICES.ui.join(", ")}
  --radius <name>          ${CHOICES.radius.join(", ")}
  --density <name>         ${CHOICES.density.join(", ")}
  --agents <list>          comma-separated ${AGENT_CHOICES}
  --lint <name>            ${CHOICES.lint.join(", ")}
  --branching <name>       ${CHOICES.branching.join(", ")}
  --no-credit              Omit the Seedlayer credit on the home page
  --use-npm                Install and run scripts with npm
  --use-pnpm               Install and run scripts with pnpm
  --use-yarn               Install and run scripts with yarn
  --use-bun                Install and run scripts with bun
  --disable-git            Skip git init and the first commit
  --yes                    Skip questions and use the preset defaults plus flags
  --interactive            Ask the questions even when flags are passed
  --no-interactive         Skip the questions
  -i, --immediate          Install, then start the dev server
  --reset-preferences      Forget the saved answers
  --skip-install           Write files only
  --skip-verify            Install dependencies and skip lint and typecheck
  --force                  Replace a non-empty directory
  --version, -v            Print the CLI version
  --help                   Show this help

--config cannot be combined with the other config flags.
`);
}
