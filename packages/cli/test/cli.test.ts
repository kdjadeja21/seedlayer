import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, "../src/bin.ts");

test("seedlayer writes a preset without installing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", bin, target, "--preset", "startup-speed", "--skip-install"],
    { cwd: path.resolve(here, "../../.."), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(path.join(target, "AGENTS.md")), true);
  assert.match(readFileSync(path.join(target, "package.json"), "utf8"), /"name": "my-app"/);
  const again = spawnSync(
    process.execPath,
    ["--import", "tsx", bin, target, "--preset", "startup-speed", "--skip-install"],
    { cwd: path.resolve(here, "../../.."), encoding: "utf8" },
  );
  assert.notEqual(again.status, 0);
});

test("preset flags write the chosen config", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const target = path.join(root, "my-app");
  const result = run(target, [
    "--preset",
    "startup-speed",
    "--palette",
    "harbor",
    "--font",
    "Geist",
    "--radius",
    "sm",
    "--agents",
    "cursor",
    "--lint",
    "eslint",
    "--branching",
    "trunk",
    "--skip-install",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(readFileSync(path.join(target, ".seedlayer/config.json"), "utf8"));
  assert.equal(config.preset, "startup-speed");
  assert.equal(config.design.palette, "harbor");
  assert.equal(config.design.fontSans, "Geist");
  assert.equal(config.design.radius, "sm");
  assert.deepEqual(config.agents, ["cursor"]);
  assert.equal(config.codeStyle.linter, "eslint");
  assert.equal(config.git.workflow, "trunk");
});

test("a bad flag value exits 1 and lists the allowed values", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const result = run(path.join(root, "my-app"), ["--palette", "nope", "--skip-install"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ink, harbor, ember, iris, grove, dusk/);
});

test("--config together with --palette exits 1", () => {
  const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
  const result = run(path.join(root, "my-app"), [
    "--config",
    "sl1.not-a-real-code",
    "--palette",
    "ink",
    "--skip-install",
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--config/);
});

test("each configurator preset command exits 0", () => {
  const page = loadConfigurator();
  const buttons = page.querySelectorAll("#presets button");
  assert.equal(buttons.length, 3);
  for (const button of buttons) {
    button.click();
    const command = page.querySelector("#command").textContent;
    const preset = button.dataset.preset;
    assert.equal(command, `npx seedlayer my-app --preset ${preset}`);
    const root = mkdtempSync(path.join(tmpdir(), "seedlayer-cli-"));
    const target = path.join(root, "my-app");
    const result = run(target, ["--preset", preset, "--skip-install"]);
    assert.equal(result.status, 0, result.stderr);
    assertPresetGitRules(target, preset !== "hackathon-2h");
  }

  const name = page.querySelector("#name");
  name.value = "my app";
  name.dispatch("input");
  assert.equal(
    page.querySelector("#command").textContent,
    'npx seedlayer "my app" --preset hackathon-2h',
  );
});

function assertPresetGitRules(target: string, claude: boolean): void {
  const activeBranch = /active branch/;
  const noToolPrefix = /no `cursor\/`, no `agent\/`, no random IDs/;
  const typeName = /<type>\/<short-kebab-description>/;
  const syncFirst = /git fetch origin/;
  const branching = readFileSync(path.join(target, ".cursor/rules/branching.mdc"), "utf8");
  const sync = readFileSync(path.join(target, ".cursor/rules/sync-branch-first.mdc"), "utf8");
  const agents = readFileSync(path.join(target, "AGENTS.md"), "utf8");
  const doc = readFileSync(path.join(target, "BRANCHING.md"), "utf8");
  for (const contents of [branching, agents, doc]) {
    assert.match(contents, activeBranch);
    assert.match(contents, noToolPrefix);
  }
  assert.match(branching, typeName);
  assert.match(branching, syncFirst);
  assert.match(sync, /alwaysApply: true/);
  assert.match(sync, syncFirst);
  assert.doesNotMatch(doc, /agent\/<ticket>|branch from main/i);
  if (!claude) {
    assert.equal(existsSync(path.join(target, "CLAUDE.md")), false);
    return;
  }
  const claudeDoc = readFileSync(path.join(target, "CLAUDE.md"), "utf8");
  assert.match(claudeDoc, activeBranch);
  assert.match(claudeDoc, noToolPrefix);
}

function run(target: string, args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", bin, target, ...args], {
    cwd: path.resolve(here, "../../.."),
    encoding: "utf8",
  });
}

function loadConfigurator() {
  const htmlPath = path.resolve(here, "../../../apps/web/configurator.html");
  const html = readFileSync(htmlPath, "utf8");
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  if (!script) throw new Error("configurator script missing");
  const document = createDocument();
  const context: Record<string, unknown> = {
    document,
    window: { setTimeout },
    setTimeout,
    clearTimeout,
    URLSearchParams,
    console,
  };
  // The page script is a classic script, so run it against the stub document.
  const runner = new Function(
    ...Object.keys(context),
    `${script}\nreturn { command: document.querySelector("#command").textContent };`,
  );
  runner(...Object.values(context));
  return document;
}

type StubNode = {
  tag: string;
  id: string;
  className: string;
  textContent: string;
  value: string;
  hidden: boolean;
  disabled: boolean;
  type: string;
  parent: StubNode | null;
  children: StubNode[];
  dataset: Record<string, string>;
  style: { setProperty: (name: string, value: string) => void } & Record<string, string>;
  listeners: Record<string, Array<(event: { target: StubNode }) => void>>;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  removeAttribute: (name: string) => void;
  addEventListener: (type: string, fn: (event: { target: StubNode }) => void) => void;
  append: (...nodes: StubNode[]) => void;
  replaceChildren: (...nodes: StubNode[]) => void;
  querySelector: (selector: string) => StubNode | null;
  querySelectorAll: (selector: string) => StubNode[];
  closest: (selector: string) => StubNode | null;
  click: () => void;
  dispatch: (type: string) => void;
  focus: () => void;
  innerHTML: string;
};

function createDocument() {
  const documentElement = node("html");
  const named = (id: string, tag = "div") => {
    const element = node(tag);
    element.id = id;
    return element;
  };
  const name = named("name", "input");
  name.value = "my-app";
  const settings = named("settings");
  for (const id of ["presets", "palettes", "radii", "fonts", "linters", "gits", "agents"]) {
    settings.append(named(id));
  }
  const stage = named("stage");
  stage.append(named("stage-name"), named("primary"), named("highlight"), named("surface"));
  documentElement.append(
    name,
    named("error"),
    named("fix"),
    named("copy"),
    settings,
    stage,
    named("command"),
    named("summary"),
    named("file-count"),
  );
  return {
    documentElement,
    createElement(tag: string) {
      return node(tag);
    },
    querySelector(selector: string) {
      return queryAll(documentElement, selector)[0] ?? null;
    },
    querySelectorAll(selector: string) {
      return queryAll(documentElement, selector);
    },
  };
}

function node(tag: string): StubNode {
  const element = {
    tag,
    id: "",
    className: "",
    textContent: "",
    value: "",
    hidden: false,
    disabled: false,
    type: "",
    parent: null,
    children: [],
    dataset: {},
    style: new Proxy({ setProperty() {} }, { set: () => true }),
    listeners: {},
    setAttribute(name: string, value: string) {
      if (name === "id") element.id = value;
      if (name.startsWith("data-")) element.dataset[name.slice(5)] = value;
    },
    getAttribute(name: string) {
      if (name === "id") return element.id;
      return null;
    },
    removeAttribute() {},
    addEventListener(type: string, fn: (event: { target: StubNode }) => void) {
      element.listeners[type] = [...(element.listeners[type] ?? []), fn];
    },
    append(...nodes: StubNode[]) {
      for (const child of nodes) {
        child.parent = element;
        element.children.push(child);
      }
    },
    replaceChildren(...nodes: StubNode[]) {
      element.children = [];
      element.append(...nodes);
    },
    querySelector(selector: string) {
      return queryAll(element, selector)[0] ?? null;
    },
    querySelectorAll(selector: string) {
      return queryAll(element, selector);
    },
    closest(selector: string) {
      let current: StubNode | null = element;
      while (current) {
        if (matches(current, selector)) return current;
        current = current.parent;
      }
      return null;
    },
    click() {
      element.dispatch("click");
    },
    dispatch(type: string) {
      const event = { target: element };
      let current: StubNode | null = element;
      while (current) {
        for (const listener of current.listeners[type] ?? []) listener(event);
        current = current.parent;
      }
    },
    focus() {},
  } as StubNode;
  Object.defineProperty(element, "innerHTML", {
    set(value: string) {
      element.children = [];
      if (!value.includes("<strong>")) return;
      const strong = node("strong");
      const span = node("span");
      span.className = "desc";
      element.append(strong, span);
    },
  });
  return element;
}

function queryAll(root: StubNode, selector: string): StubNode[] {
  const parts = selector.trim().split(/\s+/);
  let current = [root];
  for (const part of parts) {
    const next: StubNode[] = [];
    for (const item of current) {
      for (const descendant of collect(item)) {
        if (matches(descendant, part)) next.push(descendant);
      }
    }
    current = next;
  }
  return current;
}

function collect(root: StubNode): StubNode[] {
  const all: StubNode[] = [];
  const walk = (item: StubNode) => {
    for (const child of item.children) {
      all.push(child);
      walk(child);
    }
  };
  walk(root);
  return all;
}

function matches(item: StubNode, selector: string): boolean {
  if (selector.startsWith("#")) return item.id === selector.slice(1);
  if (selector.startsWith(".")) return item.className.split(/\s+/).includes(selector.slice(1));
  const [tag, className] = selector.split(".");
  if (item.tag !== tag) return false;
  return className === undefined || item.className.split(/\s+/).includes(className);
}
