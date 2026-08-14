import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function compile(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

function loadModule(code, localRequire) {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire });
  return module.exports;
}

const headings = loadModule(compile("../src/headings.ts"), () => {
  throw new Error("headings.ts has no runtime dependencies");
});
const headingCommands = loadModule(compile("../src/heading-commands.ts"), () => {
  throw new Error("heading-commands.ts has no runtime dependencies");
});
const notices = [];
class Notice {
  constructor(message) {
    notices.push(message);
  }
}
const editorCommands = loadModule(compile("../src/editor-commands.ts"), (specifier) => {
  if (specifier === "obsidian") return { Notice };
  if (specifier === "./headings") return headings;
  if (specifier === "./heading-commands") return headingCommands;
  throw new Error(`Unexpected dependency: ${specifier}`);
});
const { shiftHeadings } = editorCommands;

const settings = {
  maximumLevel: 12,
  lowerHeadingLimit: 1,
  removeUnorderedListMarker: true,
  removeOrderedListMarker: true,
  customBeginningPatterns: "",
  removeBold: false,
  removeItalic: false,
  customSurroundingPatterns: "",
  childListBehavior: "noting",
  tabSize: 4,
};

class MockEditor {
  constructor(text, selections = [{ anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } }]) {
    this.lines = text.split("\n");
    this.selections = selections;
  }

  getValue() { return this.lines.join("\n"); }
  getLine(line) { return this.lines[line]; }
  lineCount() { return this.lines.length; }
  listSelections() { return this.selections; }

  transaction({ changes = [] }) {
    for (const change of [...changes].sort((left, right) => right.from.line - left.from.line)) {
      this.lines[change.from.line] = change.text;
    }
  }
}

test("increases the cursor heading across the native/extended boundary", () => {
  const editor = new MockEditor("###### Six");
  assert.equal(shiftHeadings(editor, 1, settings), true);
  assert.equal(editor.getValue(), "####### Six");
});

test("increases every heading in a multi-line selection atomically", () => {
  const editor = new MockEditor(
    "##### Five\nText\n###### Six",
    [{ anchor: { line: 0, ch: 0 }, head: { line: 2, ch: 10 } }],
  );
  assert.equal(shiftHeadings(editor, 1, settings), true);
  assert.equal(editor.getValue(), "###### Five\nText\n####### Six");
});

test("honors maximum and lower heading boundaries", () => {
  notices.length = 0;
  const maximum = new MockEditor(`${"#".repeat(12)} Twelve`);
  assert.equal(shiftHeadings(maximum, 1, settings), true);
  assert.equal(maximum.getValue(), `${"#".repeat(12)} Twelve`);

  const minimum = new MockEditor("# One");
  assert.equal(shiftHeadings(minimum, -1, settings), true);
  assert.equal(minimum.getValue(), "# One");
  assert.equal(notices.length, 2);
});

test("forced increase converts non-heading lines using cleanup settings", () => {
  const editor = new MockEditor("- Item");
  assert.equal(shiftHeadings(editor, 1, settings, true), true);
  assert.equal(editor.getValue(), "# Item");
});
