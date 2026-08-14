import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/reference-utils.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, decodeURIComponent, encodeURIComponent });

const {
  headingSubpathMatches,
  normalizeHeadingAnchor,
  replaceReferenceHeadingSubpath,
} = module.exports;

test("normalizes heading text using Obsidian-compatible anchor punctuation", () => {
  assert.equal(normalizeHeadingAnchor("One: Two / Three"), "One Two Three");
});

test("matches literal and percent-encoded heading subpaths but not block IDs", () => {
  assert.equal(headingSubpathMatches("#One%20Two", "One Two"), true);
  assert.equal(headingSubpathMatches("#one two", "One Two"), true);
  assert.equal(headingSubpathMatches("#^one-two", "One Two"), false);
});

test("rewrites wikilink and embed heading destinations without changing aliases", () => {
  assert.equal(
    replaceReferenceHeadingSubpath("[[Note#Old heading|Label]]", "New heading"),
    "[[Note#New heading|Label]]",
  );
  assert.equal(
    replaceReferenceHeadingSubpath("![[#Old heading]]", "New heading"),
    "![[#New heading]]",
  );
});

test("rewrites Markdown link anchors while retaining URL encoding", () => {
  assert.equal(
    replaceReferenceHeadingSubpath("[Label](Note.md#Old%20heading)", "New heading"),
    "[Label](Note.md#New%20heading)",
  );
});
