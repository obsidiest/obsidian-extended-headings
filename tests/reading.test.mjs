import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { sourceLoader } from "./helpers/load-source.mjs";

function readingRenderer(dom) {
  const win = dom.window, document = win.document;
  document.win = win;
  Object.assign(win, { createDiv: () => document.createElement("div"), createSpan: () => document.createElement("span"),
    createEl: (tag) => document.createElement(tag) });
  return sourceLoader({}, { NodeFilter: win.NodeFilter })("reading");
}

for (const folding of [true, false]) {
  test(`embedded H1–H12 headings have complete markers and no extra fold with folding=${folding}`, () => {
    const dom = new JSDOM('<body><div class="internal-embed"><div class="markdown-preview-view"></div></div></body>');
    const document = dom.window.document;
    const { renderExtendedHeadings } = readingRenderer(dom);
    // Obsidian may postprocess detached sections before mounting the embed.
    const section = document.createElement("div"); section.className = "markdown-preview-section";
    const links = new Map();
    for (let level = 1; level <= 12; level++) {
      const paragraph = document.createElement(level <= 6 ? `h${level}` : "p");
      const link = document.createElement("a"); link.className = "internal-link";
      link.dataset.href = "Other"; link.textContent = `Linked H${level}`;
      links.set(level, link);
      if (level <= 6) { paragraph.dataset.heading = `Linked H${level}`; paragraph.id = `heading-${level}`; }
      else paragraph.append(`${"#".repeat(level)} `);
      paragraph.append(link); section.append(paragraph);
    }
    const settings = { maximumLevel: 12, readingModeFolding: folding };
    renderExtendedHeadings(section, () => settings);
    document.querySelector(".markdown-preview-view").append(section);
    renderExtendedHeadings(section, () => settings);
    for (let level = 1; level <= 12; level++) {
      const heading = section.querySelector(level <= 6 ? `h${level}` : `.extended-heading-${level}`);
      if (level > 6) assert.equal(heading.getAttribute("aria-level"), String(level));
      else assert.equal(heading.id, `heading-${level}`);
      assert.equal(heading.dataset.heading, `Linked H${level}`, "markers never enter the heading's link identity");
      assert.equal(heading.querySelectorAll(":scope > .extended-heading-embed-marker").length, 1);
      assert.equal(heading.querySelector(".extended-heading-embed-marker").textContent, `H${level}`);
      assert.equal(heading.querySelector(".extended-heading-embed-marker").getAttribute("aria-hidden"), "true");
      assert.equal(heading.querySelectorAll(".extended-heading-fold").length, 0);
      assert.equal(heading.querySelector("a").dataset.href, "Other");
      if (level <= 6) assert.equal(heading.querySelector("a"), links.get(level), "native links keep their identity and listeners");
      assert.equal(heading.ownerDocument, document);
    }
    dom.window.close();
  });
}

test("embed markers respect the configured maximum heading level", () => {
  const dom = new JSDOM('<body><div><p>####### Seven</p><p>######## Eight</p></div></body>');
  const { renderExtendedHeadings } = readingRenderer(dom);
  const root = dom.window.document.querySelector("div");
  renderExtendedHeadings(root, () => ({ maximumLevel: 7, readingModeFolding: true }));
  assert.equal(root.querySelectorAll(".extended-heading-embed-marker").length, 1);
  assert.equal(root.querySelector("p").textContent, "######## Eight");
  dom.window.close();
});

test("native heading roots are decorated once without replacing links or native collapse controls", () => {
  const dom = new JSDOM('<body><h4 data-heading="Linked title" id="native"><span class="heading-collapse-indicator"></span><a href="#target">Linked title</a></h4></body>');
  const { renderExtendedHeadings } = readingRenderer(dom);
  const root = dom.window.document.querySelector("h4");
  const link = root.querySelector("a"), fold = root.querySelector(".heading-collapse-indicator");
  let clicks = 0; link.addEventListener("click", (event) => { event.preventDefault(); clicks++; });
  for (let i = 0; i < 2; i++) renderExtendedHeadings(root, () => ({ maximumLevel: 12, readingModeFolding: true }));
  assert.equal(root.querySelectorAll(":scope > .extended-heading-embed-marker").length, 1);
  assert.equal(root.querySelector(".extended-heading-embed-marker").textContent, "H4");
  assert.equal(root.querySelectorAll(":scope > .extended-heading-embed-content").length, 1);
  assert.equal(root.querySelector("a"), link);
  assert.equal(fold.parentElement, root);
  assert.equal(root.dataset.heading, "Linked title");
  assert.equal(root.id, "native");
  link.click(); assert.equal(clicks, 1);
  dom.window.close();
});

test("connected embeds never create the extended Reading fold button", () => {
  const dom = new JSDOM('<body><div class="internal-embed"><div id="section"><p>####### Embedded</p></div></div></body>');
  const { renderExtendedHeadings } = readingRenderer(dom);
  const section = dom.window.document.querySelector("#section");
  renderExtendedHeadings(section, () => ({ maximumLevel: 12, readingModeFolding: true }));
  assert.equal(section.querySelectorAll(".extended-heading-fold").length, 0);
  assert.equal(section.querySelector(".extended-heading-embed-marker").textContent, "H7");
  dom.window.close();
});

test("a fold created while detached cannot fold the containing note after embed attachment", () => {
  const dom = new JSDOM('<body><div class="markdown-preview-view"><div class="markdown-preview-section"><div class="internal-embed"></div><div id="outside">Outside text</div></div></div></body>');
  const { renderExtendedHeadings, toggleReadingFold } = readingRenderer(dom);
  const document = dom.window.document, section = document.createElement("div");
  const paragraph = document.createElement("p"); paragraph.textContent = "############ Embedded"; section.append(paragraph);
  renderExtendedHeadings(section, () => ({ maximumLevel: 12, readingModeFolding: true }));
  const button = section.querySelector(".extended-heading-fold");
  assert.ok(button, "detached sections still support ordinary Reading folding");
  document.querySelector(".internal-embed").append(section);
  toggleReadingFold(button);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(document.querySelectorAll("[data-extended-hidden-by], [data-extended-folded]").length, 0);
  dom.window.close();
});

test("ordinary Reading views keep working extended heading folding", () => {
  const dom = new JSDOM('<body><div class="markdown-preview-view"><div class="markdown-preview-section"><div><p>####### First</p></div><div id="body"><p>Body</p></div><div id="next"><p>####### Next</p></div></div></div></body>');
  const { renderExtendedHeadings, toggleReadingFold } = readingRenderer(dom);
  const document = dom.window.document;
  renderExtendedHeadings(document.body, () => ({ maximumLevel: 12, readingModeFolding: true }));
  const button = document.querySelector(".extended-heading-fold");
  toggleReadingFold(button);
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.ok(document.querySelector("#body").dataset.extendedHiddenBy);
  assert.equal(document.querySelector("#next").dataset.extendedHiddenBy, undefined);
  toggleReadingFold(button);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(document.querySelector("#body").dataset.extendedHiddenBy, undefined);
  dom.window.close();
});
