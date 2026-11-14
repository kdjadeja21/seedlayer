import assert from "node:assert/strict";
import test from "node:test";
import { renderTemplate } from "../src/template.ts";

const file = "demo.hbs";

test("variables insert dotted paths and numbers without escaping", () => {
  const source = "{{name}} {{config.max}} {{note}}";
  assert.equal(
    renderTemplate(source, { name: "Ada", config: { max: 300 }, note: "A & B <C>" }, file),
    "Ada 300 A & B <C>",
  );
});

test("if else chooses a branch, including eq", () => {
  const flag = "{{#if on}}yes{{else}}no{{/if}}";
  assert.equal(renderTemplate(flag, { on: true }, file), "yes");
  assert.equal(renderTemplate(flag, { on: false }, file), "no");
  const eq = '{{#if (eq name "Ada")}}eq{{else}}ne{{/if}}';
  assert.equal(renderTemplate(eq, { name: "Ada" }, file), "eq");
  assert.equal(renderTemplate(eq, { name: "Grace" }, file), "ne");
  const block = "{{#if on}}\nyes\n{{else}}\nno\n{{/if}}\n";
  assert.equal(renderTemplate(block, { on: false }, file), "no\n");
  assert.equal(renderTemplate(block, { on: true }, file), "yes\n");
});

test("each repeats the block for every item", () => {
  const source = "{{#each items}}\n- {{name}}\n{{/each}}\n";
  assert.equal(
    renderTemplate(source, { items: [{ name: "a" }, { name: "b" }] }, file),
    "- a\n- b\n",
  );
  assert.equal(renderTemplate(source, { items: [] }, file), "");
});

test("missing values throw and name the file", () => {
  assert.throws(
    () => renderTemplate("{{missing}}", {}, file),
    /Missing value "\{\{missing\}\}" in demo\.hbs/,
  );
  assert.throws(
    () => renderTemplate("{{#if config.missing}}x{{/if}}", { config: {} }, file),
    /demo\.hbs/,
  );
});

test("unknown tags throw and name the file", () => {
  assert.throws(
    () => renderTemplate("{{#unless x}}y{{/unless}}", {}, file),
    /Unknown tag[\s\S]*demo\.hbs/,
  );
  assert.throws(
    () => renderTemplate("{{> partial}}", {}, file),
    /Unknown tag "\{\{> partial\}\}" in demo\.hbs/,
  );
  assert.throws(() => renderTemplate("{{#with item}}{{/with}}", { item: {} }, file), /demo\.hbs/);
});
