import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { sourceLoader } from "./helpers/load-source.mjs";
import { Component } from "./helpers/obsidian-component.mjs";

const svg = '<svg viewBox="0 0 24 24"><path d="M12 5v16"/></svg>';
const load = sourceLoader({ obsidian: { Component, MarkdownView: class {}, TFile: class {} } });
const outline = load("core-outline-svg");

test("filtered Outline matches math and SVG-only headings to their source positions", () => {
  const specs = [
    { level: 1, label: "Root" },
    { level: 9, label: "test $\\approx$ test" },
    { level: 10, label: "", svgMarkup: [svg] },
    { level: 11, label: "Testing Document" },
    { level: 12, label: "Deep" },
  ];
  const result = outline.matchOutlineHeadingSpecs(["test \\approx test", svg, "Testing Document", "Deep"], specs);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [1, 2, 3, 4].map((specIndex, itemIndex) => ({ itemIndex, specIndex })));
});

for (const kind of ["unmatched", "above", "hidden", "below"]) {
  test(`Outline guide distinguishes ${kind} parents from clipped parents`, () => {
    const dom = new JSDOM('<body><div id="host"><div id="parent"></div></div></body>');
    const doc = dom.window.document, host = doc.querySelector("#host"), parent = doc.querySelector("#parent");
    host.getBoundingClientRect = () => ({ top: 100 });
    parent.getBoundingClientRect = () => kind === "above" ? { top: 40, bottom: 60, height: 20 }
      : kind === "hidden" ? { top: 0, bottom: 0, height: 0 } : { top: 500, bottom: 520, height: 20 };
    const renderer = new outline.CoreOutlineRenderer({});
    renderer.readStyleNumber = (_element, _name, fallback) => fallback;
    const layer = doc.createElementNS("http://www.w3.org/2000/svg", "g");
    const child = { specIndex: 1, model: { parentIndex: 0, orphan: false }, y: 300, endX: 200, clipTop: 0 };
    const attachment = { container: host, rowsBySpecIndex: kind === "unmatched" ? new Map() : new Map([[0, { row: parent }]]) };
    renderer.renderStaticGuides(attachment, new Map([[1, child]]), layer, 500, 500);
    assert.match(layer.firstChild.getAttribute("d"), new RegExp(`^M 178 ${kind === "above" ? 0 : 290} `));
    dom.window.close();
  });
}

test("partial Outline renders math and SVG-only headings, restores original labels and avoids duplicate decorations", async () => {
  const dom = new JSDOM('<body><div data-type="outline"></div></body>', { pretendToBeVisual: true });
  const doc = dom.window.document, container = doc.querySelector("div");
  doc.win = dom.window;
  dom.window.createSpan = () => doc.createElement("span");
  dom.window.HTMLElement.prototype.createSpan = function (options = {}) {
    const el = doc.createElement("span"); el.className = options.cls ?? ""; el.textContent = options.text ?? "";
    for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, value);
    this.append(el); return el;
  };
  const original = ["test \\approx test", svg, "Testing Document"];
  for (const label of original) {
    const row = doc.createElement("div"); row.className = "tree-item-self";
    const item = doc.createElement("div"); item.className = "tree-item-inner"; item.textContent = label;
    row.append(item); container.append(row);
  }
  class TFile {}
  const file = Object.assign(new TFile(), { path: "Folder/Rich.md" });
  const calls = [];
  const { CoreOutlineRenderer } = sourceLoader({ obsidian: {
    Component, TFile, MarkdownView: class {},
    // Only the fixed SVG fixture enters this host adapter.
    sanitizeHTMLToDom: markup => JSDOM.fragment(markup),
    MarkdownRenderer: { render: async (_app, markdown, element, path) => {
      calls.push({ markdown, path });
      element.replaceChildren(JSDOM.fragment(markdown.includes("approx") ? '<p>test <mjx-container>≈</mjx-container> test</p>'
        : '<p><a class="internal-link">Testing Document</a></p>'));
    } },
  } })("core-outline-svg");
  const renderer = new CoreOutlineRenderer({
    settings: { maximumLevel: 12, renderMarkdownInDefaultOutline: true, renderInlineSvgsInDefaultOutline: true, showOutlinePaneHeadingLevelMarkers: true },
    app: { workspace: { getLeavesOfType: () => [], getActiveFile: () => file }, metadataCache: { getFileCache: () => null },
      vault: { cachedRead: async () => '# Missing root\n######### test $\\approx$ test\n########## ' + svg + '\n########### [[Testing Document]]' } },
  });
  const leaf = { view: { file } };
  const attachment = { leaf, container, revision: 0, rowsBySpecIndex: new Map(), markdownCacheSignature: "", markdownTemplates: new Map(),
    observer: new dom.window.MutationObserver(() => {}), overlay: null, guideLayer: null, threadLayer: null };
  renderer.started = true; renderer.attachments.set(leaf, attachment);
  try {
    await renderer.runPass(attachment);
    assert.deepEqual(calls, [{ markdown: "test $\\approx$ test", path: "Folder/Rich.md" }, { markdown: "[[Testing Document]]", path: "Folder/Rich.md" }]);
    assert.equal(container.querySelectorAll("mjx-container").length, 1);
    assert.equal(container.querySelectorAll("svg").length, 1);
    assert.deepEqual([...container.querySelectorAll(".extended-heading-outline-level-marker")].map(el => el.textContent), ["H9", "H10", "H11"]);
    const svgItem = container.querySelectorAll(".tree-item-inner")[1];
    assert.equal(svgItem.querySelector("[hidden]").textContent, svg);
    assert(![...svgItem.childNodes].filter(node => !node.hidden).some(node => node.textContent.includes("<svg")));
    await renderer.runPass(attachment);
    assert.equal(container.querySelectorAll("svg").length, 1);
    assert.equal(container.querySelectorAll(".extended-heading-outline-level-marker").length, 3);
    assert.equal(calls.length, 2, "complete native-renderer templates are reused");
    renderer.clearDecorations(attachment); renderer.clearMarkdownCache(attachment);
    assert.deepEqual([...container.querySelectorAll(".tree-item-inner")].map(el => el.textContent), original);
  } finally { attachment.observer.disconnect(); dom.window.close(); }
});
