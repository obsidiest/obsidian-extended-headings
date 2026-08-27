import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/headings.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
const require = createRequire(import.meta.url);
vm.runInNewContext(compiled, { module, exports: module.exports, require });
const { hasHeadingContent, headingPathAtLine, parseHeadingLine, scanHeadings } = module.exports;

test("recognizes H7 through configured maximum", () => {
  const headings = scanHeadings("####### Seven\n######## Eight\n######### Nine\n########## Ten", 7, 9);
  assert.deepEqual(Array.from(headings, (heading) => heading.level), [7, 8, 9]);
  assert.deepEqual(Array.from(headings, (heading) => heading.rawBody), ["Seven", "Eight", "Nine"]);
});

test("requires whitespace after hashes", () => {
  assert.equal(parseHeadingLine("#######not a heading", 0, 0, 7, 9), null);
});

test("ignores YAML frontmatter and fenced code", () => {
  const text = "---\nkey: value\n####### Not heading\n---\n```md\n####### Also not\n```\n####### Real";
  const headings = scanHeadings(text, 7, 9);
  assert.equal(headings.length, 1);
  assert.equal(headings[0].rawBody, "Real");
  assert.equal(headings[0].line, 7);
});

test("uses a typed first-line fallback while recognizing BOM-prefixed frontmatter", () => {
  assert.match(source, /const firstLine = lines\[0\] \?\? "";/);
  assert.match(source, /let frontmatter = firstLine\.replace\(/);
  assert.doesNotMatch(source, /lines\[0\]\.replace\(/);

  const text = "\uFEFF---\nkey: value\n####### Not heading\n---\n####### Real";
  const headings = scanHeadings(text, 7, 12);
  assert.equal(headings.length, 1);
  assert.equal(headings[0].rawBody, "Real");
  assert.deepEqual(Array.from(scanHeadings("", 7, 12)), []);
});

test("removes optional closing hashes", () => {
  const heading = parseHeadingLine("  ####### Title ###  ", 3, 20, 7, 9);
  assert.equal(heading?.rawBody, "Title");
  assert.equal(heading?.markerFrom, 22);
});

test("distinguishes blank headings from content-bearing headings", () => {
  const content = parseHeadingLine("####### Heading", 1, 11, 7, 12);
  const blankWithClosingHashes = parseHeadingLine(
    "####### #######   ",
    2,
    30,
    7,
    12,
  );

  assert.ok(content);
  assert.ok(blankWithClosingHashes);
  assert.equal(hasHeadingContent(content), true);
  assert.equal(blankWithClosingHashes.rawBody, "");
  assert.equal(hasHeadingContent(blankWithClosingHashes), false);
  for (let level = 7; level <= 12; level += 1) {
    const blank = parseHeadingLine(`${"#".repeat(level)}   `, level, 0, 7, 12);
    assert.ok(blank);
    assert.equal(hasHeadingContent(blank), false);
  }
});

test("preserves punctuation in extended-heading display text", () => {
  const heading = parseHeadingLine("####### Test Heading (Level:7)", 0, 0, 7, 12);
  assert.equal(heading?.rawBody, "Test Heading (Level:7)");
});

test("tracks offsets with CRLF", () => {
  const headings = scanHeadings("Text\r\n####### Heading\r\nBody", 7, 9);
  assert.equal(headings[0].from, 6);
  assert.equal(headings[0].to, 21);
});

test("builds the complete ancestor path for repeated heading names", () => {
  const text = [
    "# Standing Workstation Ergonomics",
    "## Ergonomic Typical Use Guidelines",
    "## Standing Desk Ergonomics",
    "### Ergonomic Typical Use Guidelines",
  ].join("\n");

  assert.deepEqual(
    Array.from(headingPathAtLine(text, 1), (heading) => heading.rawBody),
    ["Standing Workstation Ergonomics", "Ergonomic Typical Use Guidelines"],
  );
  assert.deepEqual(
    Array.from(headingPathAtLine(text, 3), (heading) => heading.rawBody),
    [
      "Standing Workstation Ergonomics",
      "Standing Desk Ergonomics",
      "Ergonomic Typical Use Guidelines",
    ],
  );
});

test("returns no heading path for a non-heading target line", () => {
  assert.deepEqual(Array.from(headingPathAtLine("# Parent\nBody", 1)), []);
});
