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

function loadModule(code, localRequire, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(code, {
    ...globals,
    module,
    exports: module.exports,
    require: localRequire,
  });
  return module.exports;
}

const headings = loadModule(compile("../src/headings.ts"), () => {
  throw new Error("headings.ts has no runtime dependencies");
});
const referenceUtils = loadModule(compile("../src/reference-utils.ts"), () => {
  throw new Error("reference-utils.ts has no runtime dependencies");
});
const clipboardWrites = [];
const generatedSubpaths = [];
class Notice {}
const references = loadModule(
  compile("../src/reference-commands.ts"),
  (specifier) => {
    if (specifier === "obsidian") return { Notice, stripHeading: (heading) => heading };
    if (specifier === "./headings") return headings;
    if (specifier === "./reference-utils") return referenceUtils;
    throw new Error(`Unexpected dependency: ${specifier}`);
  },
  {
    navigator: {
      clipboard: {
        async writeText(value) {
          clipboardWrites.push(value);
        },
      },
    },
  },
);
const { ReferenceCommandService } = references;

class MockEditor {
  constructor(text, line) {
    this.text = text;
    this.lines = text.split("\n");
    this.line = line;
  }

  getCursor() { return { line: this.line, ch: 0 }; }
  getLine(line) { return this.lines[line]; }
  getValue() { return this.text; }
}

test("copies distinct fully nested references and supports the shorter legacy behavior", async () => {
  clipboardWrites.length = 0;
  generatedSubpaths.length = 0;
  const text = [
    "# Standing Workstation Ergonomics",
    "## Ergonomic Typical Use Guidelines",
    "## Standing Desk Ergonomics",
    "### Ergonomic Typical Use Guidelines",
  ].join("\n");
  const file = { basename: "Ergonomics" };
  const app = {
    fileManager: {
      generateMarkdownLink(_file, _sourcePath, subpath) {
        generatedSubpaths.push(subpath);
        return `[[Ergonomics${subpath}]]`;
      },
    },
  };
  const nestedService = new ReferenceCommandService(app, () => 12, () => true);
  const truncatedService = new ReferenceCommandService(app, () => 12, () => false);

  await nestedService.copyCurrent(new MockEditor(text, 1), { file }, false);
  await nestedService.copyCurrent(new MockEditor(text, 3), { file }, true);
  await truncatedService.copyCurrent(new MockEditor(text, 3), { file }, false);
  await truncatedService.copyCurrent(new MockEditor(text, 3), { file }, true);

  assert.deepEqual(generatedSubpaths, [
    "#Standing Workstation Ergonomics#Ergonomic Typical Use Guidelines",
    "#Standing Workstation Ergonomics#Standing Desk Ergonomics#Ergonomic Typical Use Guidelines",
    "#Ergonomic Typical Use Guidelines",
    "#Ergonomic Typical Use Guidelines",
  ]);
  assert.deepEqual(clipboardWrites, [
    "[[Ergonomics#Standing Workstation Ergonomics#Ergonomic Typical Use Guidelines]]",
    "![[Ergonomics#Standing Workstation Ergonomics#Standing Desk Ergonomics#Ergonomic Typical Use Guidelines]]",
    "[[Ergonomics#Ergonomic Typical Use Guidelines]]",
    "![[Ergonomics#Ergonomic Typical Use Guidelines]]",
  ]);
});
