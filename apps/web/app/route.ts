import { readFile } from "node:fs/promises";
import path from "node:path";
import { CHOICES } from "@seedlayer/core";

export async function GET() {
  const html = (await readFile(path.join(process.cwd(), "configurator.html"), "utf8")).replace(
    "__SEEDLAYER_CHOICES__",
    JSON.stringify(CHOICES).replaceAll("<", "\\u003c"),
  );
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
