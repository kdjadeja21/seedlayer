import { confirm, isCancel, multiselect, select, text } from "@clack/prompts";
import {
  CHOICES,
  encodeConfig,
  type SeedlayerConfig,
  SeedlayerError,
  withConfigFlags,
} from "@seedlayer/core";
import { loadPreset } from "@seedlayer/packs";
import { type SavedAnswers, savePreferences } from "./preferences.js";

export type PromptFlags = {
  preset?: string;
  palette?: string;
  font?: string;
  radius?: string;
  lint?: string;
  branching?: string;
  agents?: string[];
  credit?: boolean;
  packageManager?: string;
  initGit?: boolean;
  immediate?: boolean;
};

export async function promptConfig(
  directory: string,
  flags: PromptFlags,
  saved: SavedAnswers | undefined,
  detectedPackageManager: string,
): Promise<SeedlayerConfig | undefined> {
  const preset = await pick(
    "Preset",
    CHOICES.preset,
    first(flags.preset, saved?.preset, "startup-speed", CHOICES.preset),
  );
  const base = loadPreset(preset);
  const remembered = saved?.preset === preset ? saved : undefined;
  const palette = await pick(
    "Palette",
    CHOICES.palette,
    first(flags.palette, remembered?.palette, base.design.palette, CHOICES.palette),
  );
  const agents = await pickAgents(flags.agents ?? remembered?.agents ?? [...base.agents]);
  const font = await pick(
    "Font",
    CHOICES.font,
    first(flags.font, remembered?.font, base.design.fontSans, CHOICES.font),
  );
  const radius = await pick(
    "Radius",
    CHOICES.radius,
    first(flags.radius, remembered?.radius, base.design.radius, CHOICES.radius),
  );
  const lint = await pick(
    "Lint",
    CHOICES.lint,
    first(flags.lint, remembered?.lint, base.codeStyle.linter, CHOICES.lint),
  );
  const branching = await pick(
    "Branching",
    CHOICES.branching,
    first(flags.branching, remembered?.branching, base.git.workflow, CHOICES.branching),
  );
  const credit = await askYesNo(
    "Include the Seedlayer credit?",
    flags.credit ?? remembered?.credit ?? base.credit,
  );
  const packageManager = await pick(
    "Package manager",
    CHOICES.packageManager,
    first(
      flags.packageManager,
      saved?.packageManager,
      detectedPackageManager,
      CHOICES.packageManager,
    ),
  );
  const initGit = await askConfirm(
    "Initialize a git repository?",
    flags.initGit ?? saved?.initGit ?? true,
  );
  const immediate = await askConfirm(
    "Start the dev server?",
    flags.immediate ?? saved?.immediate ?? false,
  );
  const config = withConfigFlags(base, {
    palette,
    font,
    radius,
    lint,
    branching,
    agents,
    credit,
    packageManager,
    initGit,
    immediate,
  });
  const code = encodeConfig(config);
  console.log(
    [
      `preset: ${config.preset}`,
      `palette: ${config.design.palette}`,
      `agents: ${config.agents.join(",")}`,
      `font: ${config.design.fontSans}`,
      `radius: ${config.design.radius}`,
      `lint: ${config.codeStyle.linter}`,
      `branching: ${config.git.workflow}`,
      `credit: ${config.credit ? "yes" : "no"}`,
      `package manager: ${config.packageManager}`,
      `git: ${config.initGit ? "yes" : "no"}`,
      `immediate: ${config.immediate ? "yes" : "no"}`,
      code,
      `npx seedlayer ${quoteArg(directory)} --config ${code}`,
    ].join("\n"),
  );
  if (!(await askYesNo("Create it?", true))) return undefined;
  savePreferences({
    preset: config.preset,
    palette: config.design.palette,
    font: config.design.fontSans,
    radius: config.design.radius,
    lint: config.codeStyle.linter,
    branching: config.git.workflow,
    agents: [...config.agents],
    credit: config.credit,
    packageManager: config.packageManager,
    initGit: config.initGit,
    immediate: config.immediate,
  });
  return config;
}

async function pick(message: string, options: readonly string[], initial: string): Promise<string> {
  const value = await select({
    message,
    options: options.map((option) => ({ value: option, label: option })),
    initialValue: initial,
    showInstructions: false,
  });
  if (isCancel(value)) abort();
  return value;
}

async function pickAgents(initial: readonly string[]): Promise<string[]> {
  const initialValues = CHOICES.agents.filter((agent) => initial.includes(agent));
  const fallbackAgent = CHOICES.agents[0];
  if (fallbackAgent === undefined) throw new SeedlayerError("There is no agent to offer.");
  const value = await multiselect({
    message: "Agents",
    options: CHOICES.agents.map((agent) => ({ value: agent, label: agent })),
    initialValues: initialValues.length > 0 ? initialValues : [fallbackAgent],
    required: true,
    showInstructions: false,
  });
  if (isCancel(value)) abort();
  return value;
}

async function askYesNo(message: string, fallback: boolean): Promise<boolean> {
  const value = await text({
    message: `${message} [${fallback ? "Y/n" : "y/N"}]`,
    placeholder: fallback ? "yes" : "no",
    defaultValue: fallback ? "yes" : "no",
    validate(input) {
      const answer = (input ?? "").trim();
      if (answer === "" || /^(y|yes|n|no)$/i.test(answer)) return;
      return `"${answer}" is not an answer. Pick one of: y, yes, n, no`;
    },
  });
  if (isCancel(value)) abort();
  const answer = value.trim();
  if (answer === "") return fallback;
  return /^(y|yes)$/i.test(answer);
}

async function askConfirm(message: string, initial: boolean): Promise<boolean> {
  const value = await confirm({ message, initialValue: initial });
  if (isCancel(value)) abort();
  return value;
}

function first<T extends string>(
  flag: string | undefined,
  saved: string | undefined,
  fallback: string,
  options: readonly T[],
): T {
  const chosen =
    options.find((item) => item === flag) ??
    options.find((item) => item === saved) ??
    options.find((item) => item === fallback) ??
    options[0];
  if (chosen === undefined) {
    throw new SeedlayerError("There is no choice to offer.");
  }
  return chosen;
}

function quoteArg(value: string): string {
  return /^[A-Za-z0-9._@/:+-]+$/.test(value) ? value : `'${value.replaceAll("'", `'"'"'`)}'`;
}

function abort(): never {
  process.stdout.write("Aborted with Ctrl+C\n");
  process.exit(1);
}
