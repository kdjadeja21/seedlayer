import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { CHOICES } from "@seedlayer/core";

export type SavedAnswers = {
  preset: string;
  palette: string;
  font: string;
  radius: string;
  lint: string;
  branching: string;
  agents: string[];
  credit: boolean;
  packageManager: string;
  initGit: boolean;
  immediate: boolean;
};

export function preferencesPath(): string {
  return path.join(homedir(), ".seedlayer.json");
}

export function loadPreferences(): SavedAnswers | undefined {
  const file = preferencesPath();
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isSaved(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function savePreferences(answers: SavedAnswers): void {
  writeFileSync(preferencesPath(), `${JSON.stringify(answers, null, 2)}\n`);
}

export function resetPreferences(): void {
  rmSync(preferencesPath(), { force: true });
}

function isSaved(value: unknown): value is SavedAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    listed(CHOICES.preset, record.preset) &&
    listed(CHOICES.palette, record.palette) &&
    listed(CHOICES.font, record.font) &&
    listed(CHOICES.radius, record.radius) &&
    listed(CHOICES.lint, record.lint) &&
    listed(CHOICES.branching, record.branching) &&
    Array.isArray(record.agents) &&
    record.agents.length > 0 &&
    record.agents.every((agent) => listed(CHOICES.agents, agent)) &&
    new Set(record.agents).size === record.agents.length &&
    typeof record.credit === "boolean" &&
    listed(CHOICES.packageManager, record.packageManager) &&
    typeof record.initGit === "boolean" &&
    typeof record.immediate === "boolean"
  );
}

function listed<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === "string" && options.some((item) => item === value);
}
