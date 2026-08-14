import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/heading-commands.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
const require = createRequire(import.meta.url);
vm.runInNewContext(compiled, { module, exports: module.exports, require });
const {
  applyHeadingToLine,
  childListIndentationChanges,
  headingLevelFromLine,
  removeConfiguredStyles,
} = module.exports;

const defaults = {
  removeUnorderedListMarker: true,
  removeOrderedListMarker: true,
  customBeginningPatterns: [],
  removeBold: false,
  removeItalic: false,
  customSurroundingPatterns: [],
};

test("shifts native H6 into extended H7 syntax", () => {
  assert.equal(headingLevelFromLine("###### Six"), 6);
  assert.equal(applyHeadingToLine("###### Six", 7, defaults), "####### Six");
  assert.equal(applyHeadingToLine("  ####### Seven", 8, defaults), "  ######## Seven");
});

test("sets paragraphs and H1 through H12 without destroying heading content", () => {
  assert.equal(applyHeadingToLine("Title", 12, defaults), `${"#".repeat(12)} Title`);
  assert.equal(applyHeadingToLine("######## Title ##", 0, defaults), "Title ##");
  assert.equal(applyHeadingToLine("", 7, defaults), "####### ");
});

test("uses Heading Shifter-compatible style cleanup defaults", () => {
  assert.equal(removeConfiguredStyles("- Item", defaults), "Item");
  assert.equal(removeConfiguredStyles("12. Item", defaults), "Item");
  assert.equal(removeConfiguredStyles("**Item**", defaults), "**Item**");
});

test("supports optional surrounding and user-defined cleanup", () => {
  const options = {
    ...defaults,
    removeBold: true,
    removeItalic: true,
    customBeginningPatterns: ["🤔\\s*"],
    customSurroundingPatterns: ["~"],
  };
  assert.equal(removeConfiguredStyles("**Item**", options), "Item");
  assert.equal(removeConfiguredStyles("_Item_", options), "Item");
  assert.equal(removeConfiguredStyles("🤔 Item", options), "Item");
  assert.equal(removeConfiguredStyles("~Item~", options), "Item");
});

test("re-indents a child-list subtree while preserving relative nesting", () => {
  const lines = ["Title", "        - Child", "            - Grandchild", "Next paragraph"];
  assert.deepEqual(
    JSON.parse(JSON.stringify(childListIndentationChanges(lines, 0, 3, "outdent to zero", 4))),
    [
      { line: 1, text: "- Child" },
      { line: 2, text: "    - Grandchild" },
    ],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(childListIndentationChanges(lines, 0, 3, "sync with headings", 4))),
    [],
  );
});
