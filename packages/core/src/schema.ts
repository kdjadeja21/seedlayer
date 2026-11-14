import { z } from "zod";
import "./zod-error.js";

export const SCHEMA_VERSION = 1 as const;
export const SEEDLAYER_VERSION = "0.1.0";
export const AGENTS_MD_MAX_LINES = 80;

export const PRESET_IDS = ["startup-speed", "team-strict", "hackathon-2h", "custom"] as const;
export const PALETTE_IDS = ["ink", "harbor", "ember", "iris", "grove", "dusk"] as const;
export const RADIUS_IDS = ["none", "sm", "md", "lg"] as const;
export const FONT_IDS = ["Inter", "Geist", "system"] as const;
export const LINTER_IDS = ["biome", "eslint"] as const;
export const BRANCHING_IDS = ["trunk", "github-flow", "agent-safe"] as const;
export const AGENT_IDS = ["cursor", "claude-code"] as const;

export const presetIdSchema = z.enum(PRESET_IDS);

const LEGACY_PALETTES: Record<string, (typeof PALETTE_IDS)[number]> = {
  neutral: "ink",
  slate: "harbor",
  zinc: "iris",
  vivid: "grove",
};

export const paletteSchema = z.preprocess((value) => {
  if (typeof value === "string" && value in LEGACY_PALETTES) {
    return LEGACY_PALETTES[value];
  }
  return value;
}, z.enum(PALETTE_IDS));
export const agentTargetSchema = z.enum(AGENT_IDS);
export const workflowCommandSchema = z.enum(["plan", "implement", "review"]);
export const qualityGateSchema = z.enum(["husky", "commitlint", "ci", "pr-review"]);

const WORKFLOW_ORDER = ["plan", "implement", "review"] as const;
const QUALITY_ORDER = ["husky", "commitlint", "ci", "pr-review"] as const;

export const seedlayerConfigSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    preset: presetIdSchema,
    credit: z.boolean().default(true),
    stack: z.strictObject({
      framework: z.enum(["nextjs"]),
      language: z.enum(["typescript"]),
      styling: z.enum(["tailwind"]),
      components: z.enum(["shadcn", "none"]),
      tests: z.enum(["vitest", "none"]),
      database: z.enum(["none"]),
      auth: z.enum(["none"]),
      hosting: z.enum(["vercel", "none"]),
    }),
    design: z.strictObject({
      palette: paletteSchema,
      radius: z.enum(RADIUS_IDS),
      fontSans: z.enum(FONT_IDS),
      density: z.enum(["compact", "comfortable", "spacious"]),
    }),
    codeStyle: z.strictObject({
      linter: z.enum(LINTER_IDS),
      strictness: z.enum(["relaxed", "standard", "strict"]),
      maxFileLines: z.number().int().min(80).max(1000),
      folders: z.enum(["feature", "type"]),
      naming: z.enum(["kebab-files", "pascal-components"]),
      errorHandling: z.enum(["throw", "result"]),
    }),
    git: z.strictObject({
      workflow: z.enum(BRANCHING_IDS),
      commits: z.enum(["conventional"]),
      maxPrLines: z.number().int().min(50).max(2000),
    }),
    agents: z.array(agentTargetSchema).min(1),
    workflow: z.array(workflowCommandSchema).min(1),
    quality: z.array(qualityGateSchema),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.agents).size !== value.agents.length) {
      ctx.addIssue({
        code: "custom",
        path: ["agents"],
        message: "Agents must be unique",
      });
    }
    if (new Set(value.workflow).size !== value.workflow.length) {
      ctx.addIssue({
        code: "custom",
        path: ["workflow"],
        message: "Workflow commands must be unique",
      });
    }
    if (new Set(value.quality).size !== value.quality.length) {
      ctx.addIssue({
        code: "custom",
        path: ["quality"],
        message: "Quality gates must be unique",
      });
    }
    if (value.quality.includes("commitlint") && !value.quality.includes("husky")) {
      ctx.addIssue({
        code: "custom",
        path: ["quality"],
        message: "commitlint needs the husky gate so the commit-msg hook is installed",
      });
    }
  });

export type SeedlayerConfig = z.infer<typeof seedlayerConfigSchema>;
export type AgentTarget = z.infer<typeof agentTargetSchema>;
export type WorkflowCommand = z.infer<typeof workflowCommandSchema>;
export type QualityGate = z.infer<typeof qualityGateSchema>;

export const projectNameSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, { error: "Use a lowercase project name such as my-app" });

export function parseConfig(input: unknown): SeedlayerConfig {
  const parsed = seedlayerConfigSchema.parse(withoutBranchPrefix(input));
  return {
    ...parsed,
    agents: AGENT_IDS.filter((agent) => parsed.agents.includes(agent)),
    workflow: WORKFLOW_ORDER.filter((command) => parsed.workflow.includes(command)),
    quality: QUALITY_ORDER.filter((gate) => parsed.quality.includes(gate)),
  };
}

function withoutBranchPrefix(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  const git = record.git;
  if (!git || typeof git !== "object" || Array.isArray(git) || !("branchPrefix" in git)) {
    return input;
  }
  const gitRecord = { ...(git as Record<string, unknown>) };
  delete gitRecord.branchPrefix;
  return { ...record, git: gitRecord };
}

export function formatConfigError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
  }
  if (error instanceof Error) return error.message;
  return "Unknown config error";
}
