import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import type { PackDefinition, SeedlayerConfig } from "../src/index.ts";
import {
  canonicalJson,
  decodeConfig,
  encodeConfig,
  formatConfigError,
  parseConfig,
  projectNameSchema,
  resolveSelection,
  zipFiles,
} from "../src/index.ts";

const config = {
  schemaVersion: 1,
  preset: "custom",
  stack: {
    framework: "nextjs",
    language: "typescript",
    styling: "tailwind",
    components: "shadcn",
    tests: "vitest",
    database: "none",
    auth: "none",
    hosting: "vercel",
  },
  design: {
    palette: "ink",
    radius: "md",
    fontSans: "Inter",
    density: "comfortable",
  },
  codeStyle: {
    linter: "biome",
    strictness: "strict",
    maxFileLines: 300,
    folders: "feature",
    naming: "kebab-files",
    errorHandling: "throw",
  },
  git: {
    workflow: "agent-safe",
    commits: "conventional",
    maxPrLines: 400,
  },
  agents: ["claude-code", "cursor"],
  workflow: ["review", "plan"],
  quality: ["commitlint", "husky"],
  credit: true,
  packageManager: "npm",
  initGit: true,
  immediate: false,
} satisfies SeedlayerConfig;

test("parseConfig canonicalizes array order and rejects commitlint without husky", () => {
  const parsed = parseConfig(config);
  const legacy = structuredClone(config);
  legacy.design.palette = "neutral" as SeedlayerConfig["design"]["palette"];
  assert.equal(parseConfig(legacy).design.palette, "ink");
  assert.deepEqual(parsed.agents, ["cursor", "claude-code"]);
  assert.deepEqual(parsed.workflow, ["plan", "review"]);
  assert.deepEqual(parsed.quality, ["husky", "commitlint"]);
  assert.throws(() => parseConfig({ ...config, quality: ["commitlint"] }));
});

test("config codes round-trip and ignore object key order", () => {
  const parsed = parseConfig(config);
  const code = encodeConfig(parsed);
  assert.equal(code.startsWith("sl1."), true);
  assert.deepEqual(decodeConfig(code), parsed);
  const reversed = {
    quality: parsed.quality,
    workflow: parsed.workflow,
    agents: parsed.agents,
    git: parsed.git,
    codeStyle: parsed.codeStyle,
    design: parsed.design,
    stack: parsed.stack,
    preset: parsed.preset,
    schemaVersion: parsed.schemaVersion,
  };
  assert.equal(encodeConfig(parseConfig(reversed)), code);
  assert.throws(() => decodeConfig("nope"));
});

test("resolver applies option defaults, dependencies, and conflicts", () => {
  const agents: PackDefinition = {
    manifest: {
      name: "agents-core",
      version: "0.1.0",
      requires: [],
      conflicts: [],
      options: {},
      outputs: [],
      agentRules: [],
    },
    templates: {},
    rules: {},
  };
  const branching: PackDefinition = {
    manifest: {
      name: "branching-agent-safe",
      version: "0.1.0",
      requires: ["agents-core"],
      conflicts: ["branching-trunk"],
      options: {
        maxPrLines: { type: "number", default: 10, from: "git.maxPrLines" },
      },
      outputs: [],
      agentRules: [],
    },
    templates: {},
    rules: {},
  };
  const trunk: PackDefinition = {
    manifest: {
      name: "branching-trunk",
      version: "0.1.0",
      requires: [],
      conflicts: ["branching-agent-safe"],
      options: {},
      outputs: [],
      agentRules: [],
    },
    templates: {},
    rules: {},
  };
  const resolved = resolveSelection(
    ["branching-agent-safe"],
    [agents, branching, trunk],
    parseConfig(config),
  );
  assert.deepEqual(
    resolved.map((item) => item.pack.manifest.name),
    ["agents-core", "branching-agent-safe"],
  );
  assert.equal(resolved[1]?.options.maxPrLines, 400);
  assert.throws(() =>
    resolveSelection(
      ["branching-agent-safe", "branching-trunk"],
      [agents, branching, trunk],
      parseConfig(config),
    ),
  );
});

test("configs and sl1 codes without credit default to true", () => {
  const parsed = parseConfig(config);
  const { credit, ...legacy } = parsed;
  assert.equal(credit, true);
  assert.equal("credit" in legacy, false);
  assert.equal(parseConfig(legacy).credit, true);
  const raw = canonicalJson(legacy);
  assert.equal(raw.includes('"credit"'), false);
  const code = `sl1.${deflateSync(Buffer.from(raw, "utf8")).toString("base64url")}`;
  const decoded = decodeConfig(code);
  assert.equal(decoded.credit, true);
  assert.deepEqual(decoded, parsed);
});

test("old configs without package manager, git init, or immediate stay valid", () => {
  const parsed = parseConfig(config);
  const { packageManager, initGit, immediate, ...legacy } = parsed;
  assert.equal(packageManager, "npm");
  assert.equal(initGit, true);
  assert.equal(immediate, false);
  assert.equal("packageManager" in legacy, false);
  assert.equal("initGit" in legacy, false);
  assert.equal("immediate" in legacy, false);
  const decoded = decodeConfig(
    `sl1.${deflateSync(Buffer.from(canonicalJson(legacy), "utf8")).toString("base64url")}`,
  );
  assert.equal(decoded.packageManager, "npm");
  assert.equal(decoded.initGit, true);
  assert.equal(decoded.immediate, false);
  assert.deepEqual(decoded, parsed);
});

test("a legacy config with branchPrefix and no credit still parses", () => {
  const parsed = parseConfig(config);
  const { credit, ...withoutCredit } = parsed;
  const legacy = {
    ...withoutCredit,
    design: { ...parsed.design, palette: "neutral" as SeedlayerConfig["design"]["palette"] },
    git: { ...parsed.git, branchPrefix: "agent/" },
  };
  assert.equal(credit, true);
  assert.equal("credit" in legacy, false);
  assert.deepEqual(parseConfig(legacy), parsed);
  const code = `sl1.${deflateSync(Buffer.from(canonicalJson(legacy), "utf8")).toString("base64url")}`;
  const decoded = decodeConfig(code);
  assert.deepEqual(decoded, parsed);
  assert.equal(decoded.credit, true);
  assert.equal(decoded.design.palette, "ink");
  assert.equal("branchPrefix" in decoded.git, false);
});

test("bad configs name the field and how to fix it", () => {
  assert.equal(
    configError({ ...config, design: { ...config.design, palette: "nope" } }),
    'design.palette: Expected one of: "ink", "harbor", "ember", "iris", "grove", "dusk". Received "nope"',
  );
  assert.equal(
    configError({ ...config, schemaVersion: 2 }),
    "schemaVersion: Expected 1, received 2",
  );
  assert.equal(configError({ ...config, extra: true }), '(root): Unrecognized key: "extra"');
  assert.equal(
    configError({ ...config, stack: { ...config.stack, extra: true } }),
    'stack: Unrecognized key: "extra"',
  );
  assert.equal(
    configError({ ...config, agents: ["cursor", "cursor"] }),
    "agents: Agents must be unique",
  );
  assert.match(configError({ ...config, packageManager: "nope" }), /packageManager/);
  assert.equal(
    configError({ ...config, quality: ["commitlint"] }),
    "quality: commitlint needs the husky gate so the commit-msg hook is installed",
  );
  assert.equal(
    configError({ ...config, codeStyle: { ...config.codeStyle, maxFileLines: 10 } }),
    "codeStyle.maxFileLines: Must be at least 80",
  );
  assert.equal(
    configError({ ...config, codeStyle: { ...config.codeStyle, maxFileLines: 80.5 } }),
    "codeStyle.maxFileLines: Expected an integer",
  );
  assert.equal(configError({ ...config, agents: [] }), "agents: Must include at least 1 item");
  assert.equal(
    configError({ ...config, stack: "next" }),
    "stack: Expected object, received string",
  );
  const { stack, ...missingStack } = config;
  assert.equal(stack.framework, "nextjs");
  assert.equal(configError(missingStack), "stack: Required");
  assert.equal(configError(null), "(root): Expected object, received null");
  const name = projectNameSchema.safeParse("My App");
  assert.equal(name.success, false);
  if (!name.success) {
    assert.equal(
      name.error.issues.map((issue) => issue.message).join("\n"),
      "Use a lowercase project name such as my-app",
    );
  }
});

function configError(input: unknown): string {
  try {
    parseConfig(input);
  } catch (error) {
    return formatConfigError(error);
  }
  throw new Error("expected config to fail");
}

test("a legacy branchPrefix is accepted and then ignored", () => {
  const parsed = parseConfig(config);
  const legacy = {
    ...parsed,
    git: { ...parsed.git, branchPrefix: "agent/" },
  };
  assert.deepEqual(parseConfig(legacy), parsed);
  const code = `sl1.${deflateSync(Buffer.from(canonicalJson(legacy), "utf8")).toString("base64url")}`;
  const decoded = decodeConfig(code);
  assert.deepEqual(decoded, parsed);
  assert.equal("branchPrefix" in decoded.git, false);
  assert.equal(encodeConfig(decoded), encodeConfig(parsed));
});

test("zip archives round-trip", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "seedlayer-zip-"));
  const zipPath = path.join(dir, "out.zip");
  writeFileSync(zipPath, zipFiles([{ path: "docs/hello.txt", contents: "hi\n" }]));
  const text = execFileSync(
    "python3",
    [
      "-c",
      "import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read('docs/hello.txt').decode(), end='')",
      zipPath,
    ],
    { encoding: "utf8" },
  );
  assert.equal(text, "hi\n");
});
