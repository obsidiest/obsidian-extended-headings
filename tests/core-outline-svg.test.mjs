import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const moduleUrl = new URL("../src/core-outline-svg.ts", import.meta.url);
const source = existsSync(moduleUrl) ? readFileSync(moduleUrl, "utf8") : "";
const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/settings.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function loadOutlineSvgModule() {
  if (!source) return {};
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  class MarkdownView {}
  class TFile {}
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(specifier) {
      if (specifier === "obsidian") {
        return {
          MarkdownView,
          TFile,
          sanitizeHTMLToDom() {
            throw new Error("The pure helpers must not sanitize DOM during module loading");
          },
        };
      }
      if (specifier === "./headings") return { scanHeadings: () => [] };
      throw new Error(`Unexpected dependency: ${specifier}`);
    },
  });
  return module.exports;
}

const outlineSvg = loadOutlineSvgModule();

function loadHeadingsModule() {
  const headingsSource = readFileSync(new URL("../src/headings.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(headingsSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports });
  return module.exports;
}

test("extracts the supplied H6 inline SVG without changing its Outline label", () => {
  assert.equal(typeof outlineSvg.extractInlineSvgFragments, "function");
  const sourceHeading = '###### book-open-text <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-open-text-icon lucide-book-open-text"><path d="M12 5v16"/><path d="M16 13h2"/><path d="M16 9h2"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/><path d="M6 13h2"/><path d="M6 9h2"/></svg>';
  const [heading] = loadHeadingsModule().scanHeadings(sourceHeading, 1, 12);
  assert.equal(heading?.level, 6);
  const parsed = outlineSvg.extractInlineSvgFragments(
    heading?.rawBody ?? "",
  );
  assert.equal(parsed?.label, "book-open-text");
  assert.equal(parsed?.svgMarkup.length, 1);
  assert.match(parsed?.svgMarkup[0] ?? "", /^<svg\b/);
});

test("extracts multiple inline SVGs in source order and collapses label whitespace", () => {
  assert.equal(typeof outlineSvg.extractInlineSvgFragments, "function");
  const parsed = outlineSvg.extractInlineSvgFragments(
    '  Before <svg><path d="first"/></svg>   Middle <svg><path d="second"/></svg> After  ',
  );
  assert.equal(parsed?.label, "Before Middle After");
  assert.deepEqual(
    Array.from(parsed?.svgMarkup ?? [], (markup) => markup.match(/d="([^"]+)"/)?.[1]),
    ["first", "second"],
  );
  assert.equal(outlineSvg.extractInlineSvgFragments("No inline image"), null);
});

test("matches and preserves an SVG enclosed by trailing parentheses", () => {
  assert.equal(typeof outlineSvg.extractInlineSvgFragments, "function");
  const parsed = outlineSvg.extractInlineSvgFragments(
    'book-open-text (<svg viewBox="0 0 24 24"><path d="M12 5v16"/></svg>)',
  );

  assert.equal(parsed?.label, "book-open-text ()");
  assert.equal(parsed?.placement, "inside-trailing-parentheses");
  assert.deepEqual(
    JSON.parse(JSON.stringify(outlineSvg.matchOutlineSvgSpecs(["book-open-text ()"], [parsed]))),
    [
      {
        itemIndex: 0,
        placement: "inside-trailing-parentheses",
        svgMarkup: ['<svg viewBox="0 0 24 24"><path d="M12 5v16"/></svg>'],
      },
    ],
  );
  assert.match(source, /insertBeforeTrailingParenthesis/);
});

test("matches duplicate Outline labels only when their SVG assignment is unambiguous", () => {
  assert.equal(typeof outlineSvg.matchOutlineSvgSpecs, "function");
  const exact = outlineSvg.matchOutlineSvgSpecs(
    ["Repeated", "Repeated"],
    [
      { label: "Repeated", svgMarkup: ["<svg id=\"first\"></svg>"] },
      { label: "Repeated", svgMarkup: ["<svg id=\"second\"></svg>"] },
    ],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(exact)),
    [
      { itemIndex: 0, svgMarkup: ["<svg id=\"first\"></svg>"] },
      { itemIndex: 1, svgMarkup: ["<svg id=\"second\"></svg>"] },
    ],
  );

  const filteredAmbiguous = outlineSvg.matchOutlineSvgSpecs(
    ["Repeated"],
    [
      { label: "Repeated", svgMarkup: ["<svg id=\"first\"></svg>"] },
      { label: "Repeated", svgMarkup: ["<svg id=\"second\"></svg>"] },
    ],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(filteredAmbiguous)), []);
});

test("maps every repeated heading to its source level when the Outline is complete", () => {
  assert.equal(typeof outlineSvg.matchOutlineHeadingSpecs, "function");
  const specs = [
    { label: "Repeated", level: 1 },
    { label: "Child", level: 10 },
    { label: "Repeated", level: 12 },
  ];
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        outlineSvg.matchOutlineHeadingSpecs(
          ["Repeated", "Child", "Repeated"],
          specs,
        ),
      ),
    ),
    [
      { itemIndex: 0, specIndex: 0 },
      { itemIndex: 1, specIndex: 1 },
      { itemIndex: 2, specIndex: 2 },
    ],
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        outlineSvg.matchOutlineHeadingSpecs(["Repeated"], specs),
      ),
    ),
    [],
  );
});

test("integrates a sanitized, reversible renderer with Obsidian's default Outline", () => {
  assert.match(source, /export class CoreOutlineRenderer/);
  assert.match(source, /sanitizeHTMLToDom\(/);
  assert.match(source, /new MutationObserver\(/);
  assert.match(source, /getLeavesOfType\("outline"\)/);
  assert.match(source, /\.tree-item-inner/);
  assert.match(source, /extended-heading-outline-svg/);
  assert.match(source, /destroy\(\): void/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);

  assert.match(main, /CoreOutlineRenderer/);
  assert.match(main, /coreOutlineRenderer\?\.destroy\(\)/);
});

test("enables core Outline inline SVG rendering by default", () => {
  assert.match(settings, /renderInlineSvgsInDefaultOutline:\s*boolean/);
  assert.match(settings, /renderInlineSvgsInDefaultOutline:\s*true/);
  assert.match(settings, /name: "Render inline SVGs in default Outline"/);
  assert.match(settings, /key: "renderInlineSvgsInDefaultOutline"/);
});

test("sizes core Outline SVGs without overriding their source colors", () => {
  assert.match(styles, /\.extended-heading-outline-svg/);
  assert.match(styles, /\.extended-heading-outline-svg\s*>\s*svg/);
  assert.doesNotMatch(styles, /\.extended-heading-outline-svg[^}]*\bstroke\s*:/s);
  assert.doesNotMatch(styles, /\.extended-heading-outline-svg[^}]*\bfill\s*:/s);
});

test("models normal H1 trees and top-level H2-H12 orphan trees", () => {
  assert.equal(typeof outlineSvg.buildOutlineTreeModel, "function");
  assert.deepEqual(
    JSON.parse(JSON.stringify(outlineSvg.buildOutlineTreeModel([1, 2, 4, 2, 1, 3]))),
    [
      { depth: 0, level: 1, orphan: false, parentIndex: null, rootIndex: 0 },
      { depth: 1, level: 2, orphan: false, parentIndex: 0, rootIndex: 0 },
      { depth: 2, level: 4, orphan: false, parentIndex: 1, rootIndex: 0 },
      { depth: 1, level: 2, orphan: false, parentIndex: 0, rootIndex: 0 },
      { depth: 0, level: 1, orphan: false, parentIndex: null, rootIndex: 4 },
      { depth: 1, level: 3, orphan: false, parentIndex: 4, rootIndex: 4 },
    ],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(outlineSvg.buildOutlineTreeModel([3, 4, 6, 3, 5]))),
    [
      { depth: 0, level: 3, orphan: true, parentIndex: null, rootIndex: 0 },
      { depth: 1, level: 4, orphan: true, parentIndex: 0, rootIndex: 0 },
      { depth: 2, level: 6, orphan: true, parentIndex: 1, rootIndex: 0 },
      { depth: 0, level: 3, orphan: true, parentIndex: null, rootIndex: 3 },
      { depth: 1, level: 5, orphan: true, parentIndex: 3, rootIndex: 3 },
    ],
  );
});

test("builds measured static and rounded threading paths", () => {
  assert.equal(typeof outlineSvg.buildOutlineGuidePath, "function");
  assert.equal(typeof outlineSvg.buildRoundedOutlineThreadPath, "function");
  assert.equal(typeof outlineSvg.buildOutlineRootThreadPath, "function");
  assert.equal(
    outlineSvg.buildOutlineGuidePath({
      connectors: [{ endX: 30, y: 30 }, { endX: 30, y: 50 }],
      endY: 50,
      spineX: 12,
      startY: 10,
    }),
    "M 12 10 V 50 M 12 30 H 30 M 12 50 H 30",
  );
  assert.equal(
    outlineSvg.buildRoundedOutlineThreadPath({
      endX: 80,
      endY: 60,
      radius: 8,
      startX: 40,
      startY: 20,
    }),
    "M 40 20 V 52 Q 40 60 48 60 H 80",
  );
  assert.equal(
    outlineSvg.buildOutlineRootThreadPath({
      connectors: [{ endX: 30, y: 30 }, { endX: 30, y: 50 }],
      radius: 8,
      spineX: 12,
      startY: 10,
    }),
    "M 12 30 H 30 M 12 10 V 42 Q 12 50 20 50 H 30",
  );
});

test("decorates only default Outline leaves with markers, guides, and hover threads", () => {
  assert.match(source, /getLeavesOfType\("outline"\)/);
  assert.match(source, /extended-heading-outline-level-marker/);
  assert.match(source, /extended-heading-outline-guide-path/);
  assert.match(source, /extended-heading-outline-thread-path/);
  assert.match(source, /pointermove/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /marker\.dataset\.level/);
});
