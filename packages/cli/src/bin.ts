#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  AGENT_IDS,
  BRANCHING_IDS,
  decodeConfig,
  FONT_IDS,
  formatConfigError,
  LINTER_IDS,
  PALETTE_IDS,
  PRESET_IDS,
  parseConfig,
  projectNameSchema,
  RADIUS_IDS,
  renderProject,
  type SeedlayerConfig,
  SeedlayerError,
  withConfigFlags,
} from "@seedlayer/core";
import { loadCatalog, loadPreset } from "@seedlayer/packs";

const CONFIG_FLAGS = [
  "preset",
  "palette",
  "font",
  "radius",
  "agents",
  "lint",
  "branching",
] as const;

const LOADABLE_PRESETS = PRESET_IDS.filter((id) => id !== "custom");
const AGENT_CHOICES = `${AGENT_IDS.join(", ")}. claude is a short name for claude-code`;

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
      radius: { type: "string" },
      agents: { type: "string" },
      lint: { type: "string" },
      branching: { type: "string" },
      "no-credit": { type: "boolean", default: false },
      "skip-install": { type: "boolean", default: false },
      "skip-verify": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      version: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  if (values.version) {
    console.log(cliVersion());
    return;
  }

  if (values.help) {
    printHelp();
    return;
  }

  const directory = positionals[0];
  if (!directory || positionals.length !== 1) {
    printHelp();
    throw new SeedlayerError("Pass one directory.");
  }

  const target = path.resolve(directory);
  const config = await resolveConfig(values, target, values.force);
  const projectName = path.basename(target);
  const parsedName = projectNameSchema.safeParse(projectName);
  if (!parsedName.success) {
    throw new SeedlayerError(parsedName.error.issues.map((issue) => issue.message).join("\n"));
  }

  prepareDirectory(target, values.force);
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

  ensureGit(target);
  if (values["skip-install"]) return;
  run("npm", ["install"], target);
  if (values["skip-verify"]) return;
  run("npm", ["run", "lint"], target);
  run("npm", ["run", "typecheck"], target);
}

async function resolveConfig(
  values: Partial<Record<(typeof CONFIG_FLAGS)[number] | "config", string>> & {
    "no-credit"?: boolean;
  },
  target: string,
  force: boolean,
): Promise<SeedlayerConfig> {
  const passed = CONFIG_FLAGS.filter((flag) => values[flag] !== undefined);
  const noCredit = values["no-credit"] === true;
  if (values.config !== undefined && (passed.length > 0 || noCredit)) {
    const names = [...passed.map((flag) => `--${flag}`), ...(noCredit ? ["--no-credit"] : [])];
    throw new SeedlayerError(`Don't pass --config with ${names.join(", ")}.`);
  }
  if (values.config !== undefined) return readConfig(values.config);
  if (passed.length === 0 && !noCredit) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      assertDirectory(target, force);
      return promptConfig();
    }
    return loadPreset("startup-speed");
  }

  const preset = oneOf("preset", values.preset, LOADABLE_PRESETS) ?? "startup-speed";
  return withConfigFlags(loadPreset(preset), {
    palette: oneOf("palette", values.palette, PALETTE_IDS),
    font: oneOf("font", values.font, FONT_IDS),
    radius: oneOf("radius", values.radius, RADIUS_IDS),
    lint: oneOf("lint", values.lint, LINTER_IDS),
    branching: oneOf("branching", values.branching, BRANCHING_IDS),
    agents: values.agents === undefined ? undefined : parseAgents(values.agents),
    credit: noCredit ? false : undefined,
  });
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

async function promptConfig(): Promise<SeedlayerConfig> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const preset = await ask(rl, "preset", LOADABLE_PRESETS, "startup-speed");
    const base = loadPreset(preset);
    const palette = await ask(rl, "palette", PALETTE_IDS, base.design.palette);
    const agents = await askAgents(rl, base.agents.join(","));
    return withConfigFlags(base, { palette, agents });
  } finally {
    rl.close();
  }
}

async function ask<T extends string>(
  rl: Interface,
  flag: string,
  allowed: readonly T[],
  fallback: T,
): Promise<T> {
  const choices = allowed.join(", ");
  for (;;) {
    const answer = (await rl.question(`${flag} (${choices}) [${fallback}]: `)).trim();
    if (answer === "") return fallback;
    const match = allowed.find((item) => item === answer);
    if (match) return match;
    reportChoice(answer, `a ${flag}`, choices);
  }
}

async function askAgents(rl: Interface, fallback: string): Promise<string[]> {
  for (;;) {
    const answer = (await rl.question(`agents (${AGENT_CHOICES}) [${fallback}]: `)).trim();
    const agents = listedAgents(answer === "" ? fallback : answer);
    if (agents) return agents;
    reportChoice(answer, "an agent", AGENT_IDS.join(", "));
  }
}

function reportChoice(answer: string, kind: string, choices: string): void {
  process.stdout.write(`"${answer}" is not ${kind}. Pick one of: ${choices}\r\n`);
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

function ensureGit(target: string): void {
  const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: target,
    stdio: "ignore",
  });
  if (inside.status === 0) return;
  const created = spawnSync("git", ["init", "-b", "main"], { cwd: target, stdio: "inherit" });
  if (created.status !== 0) process.exit(created.status ?? 1);
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function printHelp(): void {
  console.log(`seedlayer <directory> [options]

Start from a preset and apply any flags you pass. With no config flags, an
interactive terminal asks for the preset, palette, and agents.

Options:
  --config <code-or-file>  sl1 code or a JSON config file
  --preset <name>          ${LOADABLE_PRESETS.join(", ")} (default startup-speed)
  --palette <name>         ${PALETTE_IDS.join(", ")}
  --font <name>            ${FONT_IDS.join(", ")}
  --radius <name>          ${RADIUS_IDS.join(", ")}
  --agents <list>          comma-separated ${AGENT_CHOICES}
  --lint <name>            ${LINTER_IDS.join(", ")}
  --branching <name>       ${BRANCHING_IDS.join(", ")}
  --no-credit              Omit the Seedlayer credit on the home page
  --skip-install           Write files only
  --skip-verify            Install dependencies and skip lint and typecheck
  --force                  Replace a non-empty directory
  --version, -v            Print the CLI version
  --help                   Show this help

--config cannot be combined with the other config flags.
`);
}
