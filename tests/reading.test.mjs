import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { sourceLoader } from "./helpers/load-source.mjs";

function readingRenderer(dom) {
  const win = dom.window, document = win.document;
  document.win = win;
  Object.assign(win, { createDiv: () => document.createElement("div"), createSpan: () => document.createElement("span"),
    createEl: (tag) => document.createElement(tag) });
  return sourceLoader({}, { NodeFilter: win.NodeFilter })("reading").renderExtendedHeadings;
}

for (const folding of [true, false]) {
  test(`embedded H7–H12 headings have independent, complete markers with folding=${folding}`, () => {
    const dom = new JSDOM('<body><div class="internal-embed"><div class="markdown-preview-view"></div></div></body>');
    const document = dom.window.document;
    const renderExtendedHeadings = readingRenderer(dom);
    // Obsidian may postprocess detached sections before mounting the embed.
    const section = document.createElement("div"); section.className = "markdown-preview-section";
    const native = document.createElement("h6"); native.textContent = "Native heading"; section.append(native);
    for (let level = 7; level <= 12; level++) {
      const paragraph = document.createElement("p");
      const link = document.createElement("a"); link.className = "internal-link";
      link.dataset.href = "Other"; link.textContent = `Linked H${level}`;
      paragraph.append(`${"#".repeat(level)} `, link); section.append(paragraph);
    }
    const settings = { maximumLevel: 12, readingModeFolding: folding };
    renderExtendedHeadings(section, () => settings);
    document.querySelector(".markdown-preview-view").append(section);
    renderExtendedHeadings(section, () => settings);
    for (let level = 7; level <= 12; level++) {
      const heading = section.querySelector(`.extended-heading-${level}`);
      assert.equal(heading.getAttribute("aria-level"), String(level));
      assert.equal(heading.dataset.heading, `Linked H${level}`, "markers never enter the heading's link identity");
      assert.equal(heading.querySelectorAll(":scope > .extended-heading-embed-marker").length, 1);
      assert.equal(heading.querySelector(".extended-heading-embed-marker").textContent, `H${level}`);
      assert.equal(heading.querySelector(".extended-heading-embed-marker").getAttribute("aria-hidden"), "true");
      assert.equal(heading.querySelectorAll(".extended-heading-fold").length, folding ? 1 : 0);
      assert.equal(heading.querySelector(".extended-heading-reading-content > a").dataset.href, "Other");
      assert.equal(heading.ownerDocument, document);
    }
    assert.equal(native.childElementCount, 0, "native heading content is untouched");
    dom.window.close();
  });
}

test("embed markers respect the configured maximum heading level", () => {
  const dom = new JSDOM('<body><div><p>####### Seven</p><p>######## Eight</p></div></body>');
  const renderExtendedHeadings = readingRenderer(dom);
  const root = dom.window.document.querySelector("div");
  renderExtendedHeadings(root, () => ({ maximumLevel: 7, readingModeFolding: true }));
  assert.equal(root.querySelectorAll(".extended-heading-embed-marker").length, 1);
  assert.equal(root.querySelector("p").textContent, "######## Eight");
  dom.window.close();
});
