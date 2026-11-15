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
    credit?: boolean;
    packageManager?: string;
    initGit?: boolean;
    immediate?: boolean;
  },
): SeedlayerConfig {
  return parseConfig({
    ...base,
    ...(flags.credit !== undefined ? { credit: flags.credit } : {}),
    ...(flags.packageManager !== undefined ? { packageManager: flags.packageManager } : {}),
    ...(flags.initGit !== undefined ? { initGit: flags.initGit } : {}),
    ...(flags.immediate !== undefined ? { immediate: flags.immediate } : {}),
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
