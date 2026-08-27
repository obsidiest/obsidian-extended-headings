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
  class Component {}
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(specifier) {
      if (specifier === "obsidian") {
        return {
          Component,
          MarkdownRenderer: { render: async () => {} },
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

test("normalizes internal-link-only headings to their rendered Outline labels", () => {
  assert.equal(typeof outlineSvg.normalizeOutlineLabel, "function");
  assert.equal(
    outlineSvg.normalizeOutlineLabel(
      "[[General Keyboard Shortcuts (or General Hotkeys)#Cycle Through Screen Elements in a Window or on the Desktop]]",
    ),
    "General Keyboard Shortcuts (or General Hotkeys) > Cycle Through Screen Elements in a Window or on the Desktop",
  );
  assert.equal(
    outlineSvg.normalizeOutlineLabel("[[Reference Note#Target heading|Visible alias]]"),
    "Visible alias",
  );
  assert.equal(
    outlineSvg.normalizeOutlineLabel("[Visible Markdown link](Reference.md#Target)"),
    "Visible Markdown link",
  );

  const matches = outlineSvg.matchOutlineHeadingSpecs(
    [
      "Plain heading",
      "General Keyboard Shortcuts (or General Hotkeys) > Cycle Through Screen Elements in a Window or on the Desktop",
    ],
    [
      { label: "Plain heading", level: 3 },
      {
        label:
          "[[General Keyboard Shortcuts (or General Hotkeys)#Cycle Through Screen Elements in a Window or on the Desktop]]",
        level: 4,
      },
    ],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(matches)), [
    { itemIndex: 0, specIndex: 0 },
    { itemIndex: 1, specIndex: 1 },
  ]);

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        outlineSvg.matchOutlineHeadingSpecs(
          ["Rendered first", "Rendered internal link"],
          [
            { label: "Source first", level: 2 },
            { label: "[[Source#Internal link]]", level: 4 },
          ],
        ),
      ),
    ),
    [
      { itemIndex: 0, specIndex: 0 },
      { itemIndex: 1, specIndex: 1 },
    ],
  );
});

test("matches embedded links and Markdown-formatted headings in partial Outlines", () => {
  assert.equal(
    outlineSvg.normalizeOutlineLabel("![[Art#Aesthetic Unity]]"),
    "Art > Aesthetic Unity",
  );
  assert.equal(
    outlineSvg.normalizeOutlineLabel("Art#Aesthetic Unity"),
    "Art > Aesthetic Unity",
  );
  assert.equal(
    outlineSvg.normalizeOutlineLabel(
      "*Amatorifrictio* (Lit. English: **Romantic Rubbing**) and ==highlight==",
    ),
    "Amatorifrictio (Lit. English: Romantic Rubbing) and highlight",
  );

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        outlineSvg.matchOutlineHeadingSpecs(
          [
            "Amatorifrictio (Lit. English: Romantic Rubbing)",
            "A non-heading tree item",
            "Art#Aesthetic Unity",
          ],
          [
            {
              label: "*Amatorifrictio* (Lit. English: *Romantic Rubbing*)",
              level: 2,
            },
            { label: "![[Art#Aesthetic Unity]]", level: 3 },
          ],
        ),
      ),
    ),
    [
      { itemIndex: 0, specIndex: 0 },
      { itemIndex: 2, specIndex: 1 },
    ],
  );
});

test("matches aliased embeds by either their alias or compact target label", () => {
  assert.equal(typeof outlineSvg.outlineLabelCandidatesFromHeadingBody, "function");
  const raw =
    "![[Plot (or Plot Line) (Narrative)#Narrative Reality Creation Tips|Narrative Reality Creation Tips]]";
  assert.deepEqual(
    Array.from(outlineSvg.outlineLabelCandidatesFromHeadingBody(raw)),
    [
      "Narrative Reality Creation Tips",
      "Plot (or Plot Line) (Narrative) > Narrative Reality Creation Tips",
    ],
  );

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        outlineSvg.matchOutlineHeadingSpecs(
          [
            "Story",
            "Plot (or Plot Line) (Narrative)#Narrative Reality Creation Tips",
          ],
          [
            { label: "Story", level: 3 },
            {
              alternateLabels: [
                "Plot (or Plot Line) (Narrative) > Narrative Reality Creation Tips",
              ],
              label: "Narrative Reality Creation Tips",
              level: 4,
            },
            { label: "Collapsed descendant", level: 5 },
          ],
        ),
      ),
    ),
    [
      { itemIndex: 0, specIndex: 0 },
      { itemIndex: 1, specIndex: 1 },
    ],
  );
});

test("matches a visible repeated short heading without requiring every occurrence", () => {
  const specs = [
    { label: "Non-Penetrative Sex", level: 1 },
    { label: "n.", level: 2 },
    { label: "Chest Stimulation", level: 2 },
    { label: "n.", level: 4 },
    { label: "Later unique heading", level: 4 },
    { label: "n.", level: 7 },
  ];
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        outlineSvg.matchOutlineHeadingSpecs(
          ["Non-Penetrative Sex", "n.", "Chest Stimulation"],
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
});

test("prepares compact, reversible Markdown for default Outline labels", () => {
  assert.equal(typeof outlineSvg.outlineMarkdownFromHeadingBody, "function");
  assert.equal(
    outlineSvg.outlineMarkdownFromHeadingBody(
      '![[Art#Aesthetic Unity]] (<svg viewBox="0 0 24 24"></svg>)',
    ),
    "[[Art#Aesthetic Unity]] ()",
  );
  assert.match(source, /MarkdownRenderer\.render\(/);
  assert.match(source, /OUTLINE_MARKDOWN_SOURCE_CLASS/);
  assert.match(source, /OUTLINE_MARKDOWN_RENDERED_CLASS/);
  assert.match(source, /markdownComponent\?\.unload\(\)/);
  assert.match(styles, /\.extended-heading-outline-markdown-rendered/);
  assert.match(
    styles,
    /\.extended-heading-outline-markdown-rendered\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
  );
  assert.doesNotMatch(
    styles,
    /\.extended-heading-outline-markdown-rendered[^,{]*,[^{]*\{\s*display:\s*contents;/s,
  );
  assert.match(
    styles,
    /\.extended-heading-outline-expand-long-titles[^{]*\.extended-heading-outline-markdown-rendered\s*\{[^}]*overflow:\s*visible;[^}]*text-overflow:\s*clip;[^}]*white-space:\s*normal;/s,
  );
  assert.match(source, /OUTLINE_EXPAND_LONG_TITLES_CLASS/);
  assert.match(source, /expandLongOutlinePaneHeadingTitles/);
});

test("keeps inline-code headings with numbered titles out of Markdown list blocks", () => {
  assert.equal(typeof outlineSvg.escapeOutlineMarkdownBlockStart, "function");
  assert.equal(
    outlineSvg.outlineMarkdownFromHeadingBody(
      "2. Test `LATEST VERSION NUMBER` locally first",
    ),
    "2\\. Test `LATEST VERSION NUMBER` locally first",
  );
  assert.equal(
    outlineSvg.outlineMarkdownFromHeadingBody(
      "4. Create the `LATEST VERSION NUMBER` release",
    ),
    "4\\. Create the `LATEST VERSION NUMBER` release",
  );
  assert.equal(
    outlineSvg.escapeOutlineMarkdownBlockStart("3) Parenthesized marker"),
    "3\\) Parenthesized marker",
  );
  assert.equal(
    outlineSvg.escapeOutlineMarkdownBlockStart("- Literal leading hyphen"),
    "\\- Literal leading hyphen",
  );
  assert.equal(
    outlineSvg.escapeOutlineMarkdownBlockStart("> Literal leading angle bracket"),
    "\\> Literal leading angle bracket",
  );
  assert.equal(
    outlineSvg.escapeOutlineMarkdownBlockStart("Ordinary `inline code`"),
    "Ordinary `inline code`",
  );
});

test("prepares and caches link templates for every source heading, not only visible rows", () => {
  assert.equal(typeof outlineSvg.outlineMarkdownItemsFromSpecs, "function");
  assert.equal(typeof outlineSvg.outlineMarkdownRequiresLink, "function");

  const suppliedHeadings = [
    "[[Non-Penetrative Sex (Neo-Latin - Impenetrativicoitus; or Outercourse {Neo-Latin - Extracursus; or Externicursus}; or External Intercourse {Neo-Latin - Coitus Externus})#Suaviatio or Saviatio or Deep Erotic Kissing]]",
    "![[Prose]]",
    "![[Art#Genre Art]]",
  ];
  const markdownItems = outlineSvg.outlineMarkdownItemsFromSpecs([
    { markdown: outlineSvg.outlineMarkdownFromHeadingBody(suppliedHeadings[0]) },
    {},
    { markdown: outlineSvg.outlineMarkdownFromHeadingBody(suppliedHeadings[1]) },
    { markdown: outlineSvg.outlineMarkdownFromHeadingBody(suppliedHeadings[2]) },
    { markdown: outlineSvg.outlineMarkdownFromHeadingBody(suppliedHeadings[1]) },
  ]);

  assert.deepEqual(Array.from(markdownItems), [
    suppliedHeadings[0],
    "[[Prose]]",
    "[[Art#Genre Art]]",
  ]);
  assert.equal(markdownItems.every(outlineSvg.outlineMarkdownRequiresLink), true);
  assert.equal(outlineSvg.outlineMarkdownRequiresLink("*Plain emphasis*"), false);
  assert.match(source, /const markdownItems = outlineMarkdownItemsFromSpecs\(specs\)/);
  assert.doesNotMatch(
    source,
    /Promise\.all\([\s\S]{0,300}MarkdownRenderer\.render/,
  );
  assert.match(
    source,
    /outlineMarkdownRequiresLink\(markdown\)[\s\S]{0,100}!rendered\.querySelector\("a"\)/,
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

test("enables default Outline Markdown rendering by default", () => {
  assert.match(settings, /renderMarkdownInDefaultOutline:\s*boolean/);
  assert.match(settings, /renderMarkdownInDefaultOutline:\s*true/);
  assert.match(settings, /expandLongOutlinePaneHeadingTitles:\s*boolean/);
  assert.match(settings, /expandLongOutlinePaneHeadingTitles:\s*true/);
  assert.match(settings, /name: "Outline Pane Markdown Rendering"/);
  assert.match(settings, /key: "renderMarkdownInDefaultOutline"/);
  assert.match(settings, /name: "Outline Pane – Expand Long Heading Titles"/);
  assert.match(settings, /key: "expandLongOutlinePaneHeadingTitles"/);
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

test("targets an Outline heading across the full pane width by measured row height", () => {
  assert.equal(typeof outlineSvg.findOutlineRowAtClientY, "function");
  const rows = [
    { top: 100, bottom: 124 },
    { top: 132, bottom: 156 },
  ];
  assert.equal(outlineSvg.findOutlineRowAtClientY(rows, 112), 0);
  assert.equal(outlineSvg.findOutlineRowAtClientY(rows, 145), 1);
  assert.equal(outlineSvg.findOutlineRowAtClientY(rows, 128), null);
  assert.equal(outlineSvg.findOutlineRowAtClientY(rows, Number.NaN), null);
  assert.match(source, /event\.clientY/);
});

test("measures visible row portions and excludes rows outside the Outline viewport", () => {
  assert.equal(typeof outlineSvg.visibleOutlineRowCenter, "function");
  assert.equal(typeof outlineSvg.visibleOutlineRowMeasurement, "function");
  assert.equal(
    outlineSvg.visibleOutlineRowCenter(
      { bottom: 120, top: 96 },
      [{ bottom: 900, top: 140 }],
    ),
    null,
  );
  assert.equal(
    outlineSvg.visibleOutlineRowCenter(
      { bottom: 164, top: 140 },
      [{ bottom: 900, top: 140 }],
    ),
    152,
  );
  assert.equal(
    outlineSvg.visibleOutlineRowCenter(
      { bottom: 924, top: 900 },
      [{ bottom: 900, top: 140 }],
    ),
    null,
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        outlineSvg.visibleOutlineRowMeasurement(
          { bottom: 164, top: 140 },
          [
            { bottom: 1000, top: 0 },
            { bottom: 900, top: 120 },
          ],
        ),
      ),
    ),
    { bottom: 164, center: 152, clipBottom: 900, clipTop: 120, top: 140 },
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        outlineSvg.visibleOutlineRowMeasurement(
          { bottom: 180, top: 100 },
          [{ bottom: 900, top: 140 }],
        ),
      ),
    ),
    { bottom: 180, center: 160, clipBottom: 900, clipTop: 140, top: 140 },
  );
  assert.match(source, /overflowY/);
});

test("finds the visible Outline row range with logarithmic bounds reads", () => {
  assert.equal(typeof outlineSvg.findVisibleOutlineRowRange, "function");
  let boundsReads = 0;
  const range = outlineSvg.findVisibleOutlineRowRange(
    1000,
    (index) => {
      boundsReads += 1;
      return { bottom: index * 24 + 20, top: index * 24 };
    },
    { bottom: 960, top: 480 },
    1,
  );
  assert.deepEqual(Array.from(range), [19, 41]);
  assert.ok(boundsReads < 30, `expected logarithmic reads, received ${boundsReads}`);
  assert.deepEqual(
    Array.from(
      outlineSvg.findVisibleOutlineRowRange(
        0,
        () => {
          throw new Error("empty ranges must not read bounds");
        },
        { bottom: 480, top: 0 },
      ),
    ),
    [0, 0],
  );
});

test("binary-searches cached visible Outline rows before guide measurements", () => {
  assert.equal(typeof outlineSvg.outlineVerticalBoundsIntersect, "function");
  assert.equal(
    outlineSvg.outlineVerticalBoundsIntersect(
      { bottom: 24, top: 0 },
      { bottom: 480, top: 0 },
    ),
    true,
  );
  assert.equal(
    outlineSvg.outlineVerticalBoundsIntersect(
      { bottom: 504, top: 480 },
      { bottom: 480, top: 0 },
    ),
    false,
  );

  let itemRectReads = 0;
  let rowRectReads = 0;
  let rowVisibilityReads = 0;
  let sharedAncestorStyleReads = 0;
  const ownerDocument = {
    defaultView: {
      getComputedStyle() {
        sharedAncestorStyleReads += 1;
        return { overflowY: "visible" };
      },
    },
  };
  const hostRect = { bottom: 480, left: 0, top: 0 };
  const container = {
    getBoundingClientRect: () => hostRect,
    ownerDocument,
    querySelectorAll: () => orderedRows,
  };
  const sharedAncestor = {
    classList: { contains: () => false },
    parentElement: container,
  };
  const rowsBySpecIndex = new Map();
  const orderedRows = [];
  for (let index = 0; index < 1000; index += 1) {
    const top = index * 24;
    const row = {
      dataset: { extendedHeadingSpecIndex: String(index) },
      getBoundingClientRect() {
        rowRectReads += 1;
        return { bottom: top + 20, height: 20, top };
      },
      getClientRects() {
        rowVisibilityReads += 1;
        return [{}];
      },
      parentElement: sharedAncestor,
    };
    orderedRows.push(row);
    rowsBySpecIndex.set(index, {
      item: {
        getBoundingClientRect() {
          itemRectReads += 1;
          return { left: 100, width: 300 };
        },
      },
      model: {
        depth: 0,
        level: 1,
        orphan: false,
        parentIndex: null,
        rootIndex: index,
      },
      row,
      specIndex: index,
    });
  }

  const renderer = new outlineSvg.CoreOutlineRenderer({});
  const attachment = {
    container,
    measurementRows: [],
    measurementRowsDirty: true,
    rowsBySpecIndex,
  };
  const measured = renderer.measureRows(
    attachment,
    600,
    480,
  );
  assert.equal(measured.size, 20);
  assert.equal(rowVisibilityReads, 1000);
  assert.ok(rowRectReads < 60, `expected visible-slice reads, received ${rowRectReads}`);
  assert.equal(itemRectReads, 20);
  assert.equal(sharedAncestorStyleReads, 1);

  itemRectReads = 0;
  rowRectReads = 0;
  rowVisibilityReads = 0;
  sharedAncestorStyleReads = 0;
  const measuredAgain = renderer.measureRows(attachment, 600, 480);
  assert.equal(measuredAgain.size, 20);
  assert.equal(rowVisibilityReads, 0);
  assert.ok(rowRectReads < 60, `expected cached visible-slice reads, received ${rowRectReads}`);
  assert.equal(itemRectReads, 20);
  assert.equal(sharedAncestorStyleReads, 1);
});

test("targets Outline refreshes and ignores focus-only geometry callbacks", () => {
  assert.doesNotMatch(source, /workspace\.on\("editor-change"/);
  assert.match(source, /workspace\.on\("layout-change", \(\) => this\.refreshLayout\(\)\)/);
  assert.match(source, /metadataCache\.on\("changed", \(file\)[\s\S]{0,100}refreshFile\(file\)/);
  assert.match(source, /signature === attachment\.visualStyleSignature/);
  assert.match(source, /width === attachment\.visualWidth/);
  assert.match(source, /height === attachment\.visualHeight/);
});

test("reuses static guide geometry for pointer-only thread updates", () => {
  assert.match(source, /visualGeometryDirty/);
  assert.match(source, /renderThreadVisuals\(attachment\)/);
  assert.match(source, /scheduleVisualPass\(attachment, false\)/);
  assert.match(settings, /OUTLINE_VISUAL_ONLY_SETTINGS/);
  assert.match(main, /outlineVisualOnly[\s\S]{0,200}refreshVisuals\(\)/);
});

test("continues visible guides and threads when their parent row is clipped above", () => {
  assert.match(
    source,
    /parent\s*\?\s*undefined\s*:\s*Math\.min\(\.\.\.children\.map\(\(entry\) => entry\.clipTop\)\)/s,
  );
  assert.match(source, /parent\?\.y \?\? child\.clipTop/);
  assert.match(source, /clipTop:\s*clamp\(visibleMeasurement\.clipTop - hostRect\.top/);
});

test("recognizes Obsidian's selected Outline row states", () => {
  assert.equal(typeof outlineSvg.isSelectedOutlineRowState, "function");
  assert.equal(
    outlineSvg.isSelectedOutlineRowState({
      classNames: ["tree-item-self", "is-active"],
    }),
    true,
  );
  assert.equal(
    outlineSvg.isSelectedOutlineRowState({
      ariaSelected: "true",
      classNames: ["tree-item-self"],
    }),
    true,
  );
  assert.equal(
    outlineSvg.isSelectedOutlineRowState({
      classNames: ["tree-item-self"],
    }),
    false,
  );
  assert.match(source, /activeSelectedOutlinePaneHeadingThreading/);
  assert.match(source, /findSelectedSpecIndex/);
  assert.match(source, /aria-selected/);
});

test("combines orphan and H1 roots only when both tree types are present", () => {
  assert.equal(
    typeof outlineSvg.collectRootLevelOrphanTreeRootIndexes,
    "function",
  );
  const combined = outlineSvg.buildOutlineTreeModel([6, 7, 1, 2, 1, 3]);
  assert.deepEqual(
    Array.from(outlineSvg.collectRootLevelOrphanTreeRootIndexes(combined)),
    [0, 2, 4],
  );
  assert.deepEqual(
    Array.from(
      outlineSvg.collectRootLevelOrphanTreeRootIndexes(
        outlineSvg.buildOutlineTreeModel([1, 2, 1, 3]),
      ),
    ),
    [],
  );
  assert.deepEqual(
    Array.from(
      outlineSvg.collectRootLevelOrphanTreeRootIndexes(
        outlineSvg.buildOutlineTreeModel([4, 5, 4, 6]),
      ),
    ),
    [],
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

test("decorates only default Outline leaves with markers, guides, and active threads", () => {
  assert.match(source, /getLeavesOfType\("outline"\)/);
  assert.match(source, /extended-heading-outline-level-marker/);
  assert.match(source, /extended-heading-outline-guide-path/);
  assert.match(source, /extended-heading-outline-thread-path/);
  assert.match(source, /pointermove/);
  assert.match(source, /findOutlineRowAtClientY/);
  assert.match(source, /collectRootLevelOrphanTreeRootIndexes/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /marker\.dataset\.level/);
});
