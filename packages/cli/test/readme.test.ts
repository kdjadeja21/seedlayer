import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, "../src/bin.ts");
const readmePath = path.join(here, "../README.md");

test("README lists every flag from --help", () => {
  const help = spawnSync(process.execPath, ["--import", "tsx", bin, "--help"], {
    cwd: path.resolve(here, "../../.."),
    encoding: "utf8",
  });
  assert.equal(help.status, 0, help.stderr);
  const readme = readFileSync(readmePath, "utf8");
  const flags = [
    ...new Set(
      [...help.stdout.matchAll(/(?:^|\s)(-{1,2}[a-z][a-z0-9-]*)/g)].map((match) => match[1]),
    ),
  ];
  assert.ok(flags.includes("--preset"));
  assert.ok(flags.includes("--help"));
  const missing = flags.filter((flag) => !documents(readme, flag));
  assert.deepEqual(missing, []);
});

function documents(readme: string, flag: string): boolean {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s\`])${escaped}(?=$|[\\s\`,.)])`, "m").test(readme);
}
