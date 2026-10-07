import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import process from "node:process";
import { JSDOM } from "jsdom";
import { sourceLoader } from "./helpers/load-source.mjs";
import { Component } from "./helpers/obsidian-component.mjs";
import { loadObsidianNativeParser } from "./helpers/obsidian-native-parser.mjs";

const load = sourceLoader({ obsidian: { Component, MarkdownView: class {}, TFile: class {} } });
const outline = load("core-outline-svg");
const { HeadingFootnotes } = load("heading-footnotes");
const fixture = JSON.parse(readFileSync(new URL("./fixtures/footnote-renderer-1.14.4.json", import.meta.url), "utf8"));
const native = process.env.OBSIDIAN_APP_JS ? loadObsidianNativeParser(process.env.OBSIDIAN_APP_JS) : null;
const render = markdown => {
  assert(Object.hasOwn(fixture.renders, markdown), `No parser snapshot for ${markdown}`);
  const html = fixture.renders[markdown];
  if (native) assert.equal(native.render(markdown), html, "snapshot agrees with the actual 1.14.4 parser");
  return html;
};
const references = element => [...element.querySelectorAll("sup.footnote-ref")].map(sup => ({
  id: sup.querySelector("a")?.dataset.footref, label: sup.textContent,
}));
function newDOM(html, options) {
  const dom = new JSDOM(html, options);
  dom.window.HTMLElement.prototype.createDiv = function () {
    const el = this.ownerDocument.createElement("div"); this.append(el); return el;
  };
  return dom;
}

test("footnote-only headings enter the Outline Markdown rendering path at every level", () => {
  const renderer = new outline.CoreOutlineRenderer({ settings: { maximumLevel: 12 },
    app: { metadataCache: { getFileCache: () => null } } });
  const specs = renderer.buildSpecs(Array.from({ length: 12 }, (_, i) => `${"#".repeat(i + 1)} Testing[^1]`).join("\n"), {});
  assert.equal(specs.length, 12);
  for (const spec of specs) assert.equal(spec.markdown, "Testing[^1]");
});

test("filtered Outline matches core's flattened footnote labels without losing heading identity", () => {
  const specs = [
    { level: 1, label: "Hidden" },
    ...["Testing[^1]", "**Named**[^Note]", "Repeated[^1][^1]"].map(raw => ({
      level: 11, label: raw, alternateLabels: outline.outlineLabelCandidatesFromHeadingBody(raw),
    })),
  ];
  const actual = outline.matchOutlineHeadingSpecs(["Testing1", "Namednote", "Repeated11"], specs);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), [1, 2, 3].map((specIndex, itemIndex) => ({ itemIndex, specIndex })));
});

test("literal escaped and code footnote syntax does not gain a flattened Outline match", () => {
  for (const raw of ["Testing\\[^1]", "Testing`[^1]`", "Testing``[^1]``"]) {
    assert(!outline.outlineLabelCandidatesFromHeadingBody(raw).includes("Testing1"));
  }
});

test("1.14.4 parser output reproduces the missing-definition cause, including native metadata", () => {
  assert.equal(render("Testing[^1]"), "<p>Testing1</p>");
  const context = new HeadingFootnotes(fixture.source, fixture.cache);
  assert.match(render(context.withDefinitions("Testing[^1]")), /<sup class="footnote-ref"/);
  assert(!context.withDefinitions("Testing[^1]").includes("Must not be embedded"));
  if (native) {
    assert.deepEqual(JSON.parse(JSON.stringify(native.metadata(fixture.source))), fixture.cache);
    for (const heading of fixture.headings) assert.equal(native.text(heading.rawBody), heading.coreLabel);
  }
});

test("breadcrumbs keep document-wide superscripts for H1–H12, named, repeated and inline notes", async () => {
  const dom = newDOM("<body></body>");
  const calls = [];
  const { BreadcrumbContent } = sourceLoader({ obsidian: { Component, MarkdownRenderer: {
    render: async (_app, markdown, label, sourcePath) => {
      calls.push({ markdown, sourcePath });
      label.replaceChildren(JSDOM.fragment(render(markdown)));
    },
  } } })("breadcrumb-content");
  const renderer = new BreadcrumbContent(); renderer.load();
  const context = new HeadingFootnotes(fixture.source, fixture.cache);
  try {
    for (const heading of fixture.headings) {
      const label = dom.window.document.createElement("div");
      await renderer.render({}, heading.rawBody, label, "Folder/Footnotes.md", context, heading.line);
      assert.deepEqual(references(label), heading.expectedRefs, heading.rawBody);
      assert.equal(label.querySelector(".footnotes"), null);
      assert.equal(label.querySelector("[id], [data-footnote-id]"), null);
      for (const link of label.querySelectorAll("a.footnote-link")) {
        assert(link.classList.contains("internal-link"));
        assert.equal(link.dataset.href, `#[^${link.dataset.footref}]`);
        assert.equal(link.getAttribute("href"), link.dataset.href);
      }
    }
    assert(calls.every(call => call.sourcePath === "Folder/Footnotes.md"));
  } finally { renderer.dispose(); dom.window.close(); }
});

test("stale metadata never supplies definitions from unrelated source offsets", () => {
  const context = new HeadingFootnotes("Inserted line\n" + fixture.source, fixture.cache);
  assert.equal(context.withDefinitions("Testing[^1]"), "Testing[^1]");
});

test("inline footnotes without metadata remain superscripted without a dead fragment link or definition list", () => {
  const dom = new JSDOM(render("Inline^[Inline **body**]"));
  try {
    new HeadingFootnotes().finish(dom.window.document.body, 0);
    assert.equal(dom.window.document.querySelector("sup")?.textContent, "[1]");
    assert.equal(dom.window.document.querySelector("a, .footnotes"), null);
  } finally { dom.window.close(); }
});

test("late rendering from replaced footnote context cannot overwrite the refreshed label", async () => {
  const dom = newDOM("<body><div></div></body>");
  const pending = [];
  const { BreadcrumbContent } = sourceLoader({ obsidian: { Component, MarkdownRenderer: {
    render: (_app, markdown, label) => new Promise(resolve => pending.push(() => {
      label.textContent = markdown; resolve();
    })),
  } } })("breadcrumb-content");
  const old = new BreadcrumbContent(), current = new BreadcrumbContent();
  old.load(); current.load();
  try {
    const label = dom.window.document.querySelector("div");
    const before = old.render({}, "Old footnote context", label, "Test.md");
    old.dispose();
    const after = current.render({}, "Current footnote context", label, "Test.md");
    pending[1](); await after;
    pending[0](); await before;
    assert.equal(label.textContent, "Current footnote context");
  } finally { current.dispose(); dom.window.close(); }
});

for (const partial of [false, true]) test(`${partial ? "filtered" : "complete"} Outline preserves footnotes, markers, template reuse and restoration`, async () => {
  const dom = new JSDOM('<body><div data-type="outline"></div></body>', { pretendToBeVisual: true });
  const doc = dom.window.document, container = doc.querySelector("div");
  doc.win = dom.window;
  dom.window.createSpan = () => doc.createElement("span");
  dom.window.HTMLElement.prototype.createSpan = function (options = {}) {
    const el = doc.createElement("span"); el.className = options.cls ?? ""; el.textContent = options.text ?? "";
    for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, value);
    this.append(el); return el;
  };
  const headings = partial ? fixture.headings.filter(h => h.expectedRefs.length) : fixture.headings;
  for (const heading of headings) {
    const row = doc.createElement("div"); row.className = "tree-item-self";
    const item = doc.createElement("div"); item.className = "tree-item-inner"; item.textContent = heading.coreLabel;
    row.append(item); container.append(row);
  }
  class TFile {}
  const file = Object.assign(new TFile(), { path: "Folder/Footnotes.md" });
  let calls = 0;
  const { CoreOutlineRenderer } = sourceLoader({ obsidian: {
    Component, TFile, MarkdownView: class {},
    MarkdownRenderer: { render: async (_app, markdown, element) => {
      calls++; element.replaceChildren(JSDOM.fragment(render(markdown)));
    } },
  } })("core-outline-svg");
  const renderer = new CoreOutlineRenderer({
    settings: { maximumLevel: 12, renderMarkdownInDefaultOutline: true, showOutlinePaneHeadingLevelMarkers: true },
    app: { workspace: { getLeavesOfType: () => [], getActiveFile: () => file }, metadataCache: { getFileCache: () => fixture.cache },
      vault: { cachedRead: async () => fixture.source } },
  });
  const leaf = { view: { file } };
  const attachment = { leaf, container, revision: 0, rowsBySpecIndex: new Map(), markdownCacheSignature: "", markdownTemplates: new Map(),
    observer: new dom.window.MutationObserver(() => {}), overlay: null, guideLayer: null, threadLayer: null };
  renderer.started = true; renderer.attachments.set(leaf, attachment);
  try {
    await renderer.runPass(attachment);
    for (const [index, row] of [...container.children].entries()) {
      assert.deepEqual(references(row), headings[index].expectedRefs);
      assert.equal(row.querySelector(".extended-heading-outline-level-marker")?.textContent, `H${headings[index].level}`);
      assert.equal(row.dataset.extendedBreadcrumbLine, String(headings[index].line));
    }
    assert.equal(container.querySelector(".footnotes"), null);
    const initialCalls = calls;
    await renderer.runPass(attachment);
    assert.equal(calls, initialCalls, "rendered templates are reused");
    assert.equal(container.querySelectorAll(".extended-heading-outline-level-marker").length, headings.length);
    renderer.clearDecorations(attachment); renderer.clearMarkdownCache(attachment);
    assert.deepEqual([...container.querySelectorAll(".tree-item-inner")].map(el => el.textContent), headings.map(h => h.coreLabel));
  } finally { attachment.observer.disconnect(); dom.window.close(); }
});
