// {{path}}, {{#if}}, {{else}}, {{#each}}, and {{#if (eq path "text")}}.
// A block tag on its own line drops that line. Template text is never executed.

type Path = string[];
type Test = { kind: "path"; path: Path } | { kind: "eq"; left: Path; right: string | Path };
type Node =
  | { kind: "text"; value: string }
  | { kind: "var"; path: Path }
  | { kind: "if"; test: Test; yes: Node[]; no: Node[] }
  | { kind: "each"; path: Path; body: Node[] };
type Frame =
  | { name: "if"; test: Test; yes: Node[]; no?: Node[] }
  | { name: "each"; path: Path; body: Node[] };

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const EQ = /^\(\s*eq\s+(\S+)\s+(?:"([^"]*)"|(\S+))\s*\)$/;
const STANDALONE = /^[ \t]*(\{\{(?:#if\b[^}]*|#each\b[^}]*|else|\/if|\/each)\}\})[ \t]*\r?\n/gm;

export function renderTemplate(source: string, data: unknown, filename: string): string {
  return renderNodes(parse(source.replace(STANDALONE, "$1"), filename), data, filename);
}

function parse(source: string, filename: string): Node[] {
  const root: Node[] = [];
  const lists: Node[][] = [root];
  const frames: Frame[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const open = source.indexOf("{{", cursor);
    if (open === -1) {
      top(lists).push({ kind: "text", value: source.slice(cursor) });
      break;
    }
    if (open > cursor) top(lists).push({ kind: "text", value: source.slice(cursor, open) });
    const close = source.indexOf("}}", open + 2);
    if (close === -1) fail(filename, "Unclosed tag");
    const tag = source.slice(open + 2, close).trim();
    cursor = close + 2;
    if (tag === "else") {
      const frame = frames.at(-1);
      if (!isIf(frame) || frame.no) fail(filename, "Unexpected {{else}}");
      frame.no = [];
      lists[lists.length - 1] = frame.no;
      continue;
    }
    if (tag === "/if" || tag === "/each") {
      const frame = frames.pop();
      const expected = tag === "/if" ? "if" : "each";
      if (!frame || frame.name !== expected) fail(filename, `Unexpected {{${tag}}}`);
      lists.pop();
      top(lists).push(
        frame.name === "if"
          ? { kind: "if", test: frame.test, yes: frame.yes, no: frame.no ?? [] }
          : { kind: "each", path: frame.path, body: frame.body },
      );
      continue;
    }
    const ifExpr = openTag(tag, "if");
    if (ifExpr !== undefined) {
      if (!ifExpr) fail(filename, `Unknown tag "{{${tag}}}"`);
      const yes: Node[] = [];
      frames.push({ name: "if", test: parseTest(ifExpr, filename, tag), yes });
      lists.push(yes);
      continue;
    }
    const eachExpr = openTag(tag, "each");
    if (eachExpr !== undefined) {
      if (!eachExpr) fail(filename, `Unknown tag "{{${tag}}}"`);
      const body: Node[] = [];
      frames.push({ name: "each", path: mustPath(eachExpr, filename, tag), body });
      lists.push(body);
      continue;
    }
    if (PATH.test(tag)) {
      top(lists).push({ kind: "var", path: tag.split(".") });
      continue;
    }
    fail(filename, `Unknown tag "{{${tag}}}"`);
  }

  if (frames.length > 0) fail(filename, `Unclosed {{#${frames.at(-1)?.name ?? "block"}}}`);
  return root;
}

function parseTest(expr: string, filename: string, tag: string): Test {
  if (!expr.startsWith("(")) return { kind: "path", path: mustPath(expr, filename, tag) };
  const match = EQ.exec(expr);
  const left = match?.[1];
  if (!match || left === undefined) fail(filename, `Unknown tag "{{${tag}}}"`);
  const right = match[2] !== undefined ? match[2] : mustPath(match[3] ?? "", filename, tag);
  return { kind: "eq", left: mustPath(left, filename, tag), right };
}

function openTag(tag: string, name: "if" | "each"): string | undefined {
  const rest = tag.startsWith(`#${name}`) ? tag.slice(name.length + 1) : undefined;
  if (rest === undefined || (rest !== "" && rest[0] !== " " && rest[0] !== "\t")) return undefined;
  return rest.trim();
}

function mustPath(expr: string, filename: string, tag: string): Path {
  if (!PATH.test(expr)) fail(filename, `Unknown tag "{{${tag}}}"`);
  return expr.split(".");
}

function renderNodes(nodes: Node[], data: unknown, filename: string): string {
  let output = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        output += node.value;
        break;
      case "var":
        output += show(lookup(data, node.path, filename));
        break;
      case "if":
        output += renderNodes(
          truthy(testValue(node.test, data, filename)) ? node.yes : node.no,
          data,
          filename,
        );
        break;
      case "each": {
        const value = lookup(data, node.path, filename);
        if (!Array.isArray(value))
          fail(filename, `{{#each ${node.path.join(".")}}} expects an array`);
        for (const item of value) output += renderNodes(node.body, item, filename);
        break;
      }
      default: {
        const unexpected: never = node;
        throw new Error(`Unknown node ${String(unexpected)} in ${filename}`);
      }
    }
  }
  return output;
}

function testValue(test: Test, data: unknown, filename: string): unknown {
  switch (test.kind) {
    case "path":
      return lookup(data, test.path, filename);
    case "eq":
      return (
        lookup(data, test.left, filename) ===
        (typeof test.right === "string" ? test.right : lookup(data, test.right, filename))
      );
    default: {
      const unexpected: never = test;
      throw new Error(`Unknown test ${String(unexpected)} in ${filename}`);
    }
  }
}

function lookup(data: unknown, path: Path, filename: string): unknown {
  let current = data;
  for (const key of path) {
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, key)) {
      fail(filename, `Missing value "{{${path.join(".")}}}"`);
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isIf(frame: Frame | undefined): frame is Extract<Frame, { name: "if" }> {
  return frame?.name === "if";
}

function top(lists: Node[][]): Node[] {
  const list = lists.at(-1);
  if (!list) throw new Error("Template parser lost its place");
  return list;
}

function truthy(value: unknown): boolean {
  if (!value && value !== 0) return false;
  return !(Array.isArray(value) && value.length === 0);
}

function show(value: unknown): string {
  return value == null ? "" : String(value);
}

function fail(filename: string, message: string): never {
  throw new Error(`${message} in ${filename}`);
}
