import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/wiki-links.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
const require = createRequire(import.meta.url);
vm.runInNewContext(compiled, { module, exports: module.exports, require });
const { scanHeadingSubpathLinks } = module.exports;

test("finds heading-subpath links and preserves absolute editor ranges", () => {
  const body = "Before [[Testing Document#Test Heading Level 7]] after";
  const links = scanHeadingSubpathLinks(body, 20);
  assert.equal(links.length, 1);
  assert.equal(links[0].raw, "[[Testing Document#Test Heading Level 7]]");
  assert.equal(links[0].from, 27);
  assert.equal(links[0].to, 27 + links[0].raw.length);
});

test("supports current-file headings and aliases", () => {
  const links = scanHeadingSubpathLinks("[[#Local heading|Alias]]");
  assert.equal(links.length, 1);
  assert.equal(links[0].raw, "[[#Local heading|Alias]]");
});

test("leaves ordinary links, block links, embeds, escapes, and code spans alone", () => {
  const body = [
    "[[Another note]]",
    "[[Testing Document#^block-id]]",
    "![[Testing Document#Heading]]",
    "\\[[Testing Document#Heading]]",
    "`[[Testing Document#Heading]]`",
  ].join(" ");
  assert.deepEqual(Array.from(scanHeadingSubpathLinks(body)), []);
});

test("finds multiple heading links in source order", () => {
  const links = scanHeadingSubpathLinks("[[A#Seven]] and [[B#Eight|8]]");
  assert.deepEqual(Array.from(links, (link) => link.raw), ["[[A#Seven]]", "[[B#Eight|8]]"]);
  assert.ok(links[0].to < links[1].from);
});
