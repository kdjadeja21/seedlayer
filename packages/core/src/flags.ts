import { parseConfig, type SeedlayerConfig } from "./schema.js";

export function withConfigFlags(
  base: SeedlayerConfig,
  flags: {
    palette?: string;
    font?: string;
    radius?: string;
    lint?: string;
    branching?: string;
    agents?: readonly string[];
  },
): SeedlayerConfig {
  return parseConfig({
    ...base,
    design: {
      ...base.design,
      ...(flags.palette !== undefined ? { palette: flags.palette } : {}),
      ...(flags.font !== undefined ? { fontSans: flags.font } : {}),
      ...(flags.radius !== undefined ? { radius: flags.radius } : {}),
    },
    codeStyle: {
      ...base.codeStyle,
      ...(flags.lint !== undefined ? { linter: flags.lint } : {}),
    },
    git: {
      ...base.git,
      ...(flags.branching !== undefined ? { workflow: flags.branching } : {}),
    },
    ...(flags.agents !== undefined ? { agents: [...flags.agents] } : {}),
  });
}
