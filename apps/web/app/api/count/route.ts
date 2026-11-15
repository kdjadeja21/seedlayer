import {
  CHOICES,
  encodeConfig,
  formatConfigError,
  renderProject,
  withConfigFlags,
} from "@seedlayer/core";
import { loadCatalog, loadPreset } from "@seedlayer/packs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    const preset = oneOf(url.searchParams.get("preset"), CHOICES.preset) ?? "startup-speed";
    const agents = url.searchParams.get("agents");
    const config = withConfigFlags(loadPreset(preset), {
      palette: oneOf(url.searchParams.get("palette"), CHOICES.palette),
      font: oneOf(url.searchParams.get("font"), CHOICES.font),
      radius: oneOf(url.searchParams.get("radius"), CHOICES.radius),
      lint: oneOf(url.searchParams.get("lint"), CHOICES.lint),
      branching: oneOf(url.searchParams.get("branching"), CHOICES.branching),
      agents: agents === null ? undefined : parseAgents(agents),
      credit: parseBool("credit", url.searchParams.get("credit")),
      packageManager: oneOf(url.searchParams.get("packageManager"), CHOICES.packageManager),
      initGit: parseBool("initGit", url.searchParams.get("initGit")),
      immediate: parseBool("immediate", url.searchParams.get("immediate")),
    });
    const files = renderProject({
      config,
      projectName: "my-app",
      catalog: loadCatalog(),
    });
    return Response.json({ count: files.length, code: encodeConfig(config) });
  } catch (error) {
    return new Response(formatConfigError(error), { status: 400 });
  }
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (value === null || value === "") return undefined;
  const match = allowed.find((item) => item === value);
  if (!match) {
    throw new Error(`Unknown value "${value}". Expected one of: ${allowed.join(", ")}`);
  }
  return match;
}

function parseBool(name: string, value: string | null): boolean | undefined {
  if (value === null || value === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Unknown ${name} "${value}". Expected true or false.`);
}

function parseAgents(value: string): string[] {
  const agents = value.split(",").map((item) => item.trim());
  if (
    agents.length === 0 ||
    agents.some((agent) => !CHOICES.agents.find((item) => item === agent))
  ) {
    throw new Error(
      `Unknown agents "${value}". Expected a comma-separated list of: ${CHOICES.agents.join(", ")}`,
    );
  }
  return agents;
}
