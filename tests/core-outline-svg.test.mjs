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

test("integrates a sanitized, reversible renderer with Obsidian's default Outline", () => {
  assert.match(source, /export class CoreOutlineSvgRenderer/);
  assert.match(source, /sanitizeHTMLToDom\(/);
  assert.match(source, /new MutationObserver\(/);
  assert.match(source, /getLeavesOfType\("outline"\)/);
  assert.match(source, /\.tree-item-inner/);
  assert.match(source, /extended-heading-outline-svg/);
  assert.match(source, /destroy\(\): void/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);

  assert.match(main, /CoreOutlineSvgRenderer/);
  assert.match(main, /coreOutlineSvgRenderer\?\.destroy\(\)/);
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
