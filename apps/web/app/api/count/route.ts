import {
  AGENT_IDS,
  BRANCHING_IDS,
  FONT_IDS,
  formatConfigError,
  LINTER_IDS,
  PALETTE_IDS,
  RADIUS_IDS,
  renderProject,
  withConfigFlags,
} from "@seedlayer/core";
import { loadCatalog, loadPreset } from "@seedlayer/packs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    const preset = url.searchParams.get("preset") ?? "startup-speed";
    const agents = url.searchParams.get("agents");
    const config = withConfigFlags(loadPreset(preset), {
      palette: oneOf(url.searchParams.get("palette"), PALETTE_IDS),
      font: oneOf(url.searchParams.get("font"), FONT_IDS),
      radius: oneOf(url.searchParams.get("radius"), RADIUS_IDS),
      lint: oneOf(url.searchParams.get("lint"), LINTER_IDS),
      branching: oneOf(url.searchParams.get("branching"), BRANCHING_IDS),
      agents: agents === null ? undefined : parseAgents(agents),
    });
    const files = renderProject({
      config,
      projectName: "my-app",
      catalog: loadCatalog(),
    });
    return Response.json({ count: files.length });
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

function parseAgents(value: string): string[] {
  const agents = value.split(",").map((item) => item.trim());
  if (agents.length === 0 || agents.some((agent) => !AGENT_IDS.find((item) => item === agent))) {
    throw new Error(
      `Unknown agents "${value}". Expected a comma-separated list of: ${AGENT_IDS.join(", ")}`,
    );
  }
  return agents;
}
