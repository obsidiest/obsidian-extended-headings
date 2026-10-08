// Real Chromium layout/interaction with captured Obsidian 1.14.4 parser
// output (or its extracted parser when OBSIDIAN_APP_JS is supplied).
// Obsidian UI, postprocessors and the user's theme are not running here.
// Explicit identifier expectations follow the user's editor screenshots;
// the native Reading renderer's sequential labels are not the label oracle.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import process from "node:process";
import { build } from "esbuild";
import { loadObsidianNativeParser } from "../helpers/obsidian-native-parser.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const fixture = JSON.parse(await readFile(root + "tests/fixtures/footnote-renderer-1.14.4.json", "utf8"));
const identifiers = JSON.parse(await readFile(root + "tests/fixtures/footnote-identifiers-1.14.4.json", "utf8"));
const cases = [
  { name: "H1–H12", fixture, level: 11, unresolved: "Testing1", id: "1",
    expectedBreadcrumbs: fixture.headings.slice(1, 12).flatMap(h => h.expectedRefs.map(ref => ref.label)) },
  { name: "reported identifiers", fixture: identifiers, level: 12, unresolved: "Extended Heading Level 123", id: "3",
    expectedBreadcrumbs: ["[6]", "[4]", "[3]"] },
];
const native = process.env.OBSIDIAN_APP_JS ? loadObsidianNativeParser(process.env.OBSIDIAN_APP_JS) : null;
const css = await readFile(root + "styles.css", "utf8");
const hostCSS = process.env.OBSIDIAN_APP_CSS ? await readFile(process.env.OBSIDIAN_APP_CSS, "utf8") : ".footnote-ref{vertical-align:super}";
const bundle = await build({ entryPoints: [root + "tests/browser/footnote-harness.mjs"], bundle: true, write: false, format: "iife",
  alias: { obsidian: root + "tests/browser/obsidian-stub.mjs" } });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ["--no-sandbox"] });
let checks = 0;
async function geometry(page, selector) {
  const measurements = await page.locator(selector).evaluateAll(labels => labels.flatMap(label => {
    const sup = label.querySelector("sup.footnote-ref");
    if (!sup) return [];
    const walker = label.ownerDocument.createTreeWalker(label, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode())) if (text.textContent.trim() && !text.parentElement.closest("sup")) break;
    if (!text) return [];
    const range = label.ownerDocument.createRange(); range.selectNodeContents(text);
    const raised = sup.getBoundingClientRect(), box = label.getBoundingClientRect();
    const style = label.ownerDocument.defaultView.getComputedStyle(sup);
    const labelStyle = label.ownerDocument.defaultView.getComputedStyle(label);
    // A wrapped text node has one rectangle per line. Its combined bounding
    // box starts on the first line even when the reference is on the last.
    const lines = Array.from(range.getClientRects());
    const plain = lines.at(-1);
    const singleLine = box.height <= parseFloat(labelStyle.lineHeight) * 1.5;
    return [{ label: label.textContent, plainTop: plain.top, plainBottom: plain.bottom, supTop: raised.top, supBottom: raised.bottom,
      singleLine, raised: style.verticalAlign === "super", referenceLines: sup.getClientRects().length,
      clipped: raised.top < box.top - 1 || raised.bottom > box.bottom + 1,
      small: parseFloat(style.fontSize) < parseFloat(labelStyle.fontSize) }];
  }));
  assert(measurements.length > 0);
  for (const measurement of measurements) {
    assert(measurement.small && measurement.raised && (!measurement.singleLine
      || measurement.supTop < measurement.plainTop && measurement.supBottom < measurement.plainBottom),
      `Reference must be smaller and raised: ${JSON.stringify(measurement)}`);
    assert.equal(measurement.referenceLines, 1, `A reference must not split across lines: ${JSON.stringify(measurement)}`);
    assert(!measurement.clipped, `Reference is clipped: ${JSON.stringify(measurement)}`);
    checks++;
  }
}
try {
  await mkdir(root + "release/validation", { recursive: true });
  for (const { name, fixture, level, unresolved, id, expectedBreadcrumbs } of cases)
  for (const width of [1200, 360]) for (const mode of ["source", "livePreview", "outline"]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.setDefaultTimeout(5000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    try {
      await page.setContent('<html><head></head><body class="theme-dark"></body></html>');
      await page.addStyleTag({ content: hostCSS + css + '\nbody{font:16px Arial;--text-muted:#999;--font-smallest:12px;overflow:auto;} .breadcrumb-test-editor{width:min(700px,100%);height:450px;overflow:auto;position:relative;} .cm-line{padding-block:3px;} .cm-heading-marker{display:inline-block;min-width:30px;} .tree-item-self{padding:5px;} .breadcrumb-test-outline{width:320px;} .footnote-test-outline{width:300px;margin-top:20px;} .extended-heading-outline-markdown-rendered{font-size:16px;line-height:1.6;}' });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.evaluate(({ fixture, mode, renders }) => {
        window.extendedRenderMarkdown = async (_app, markdown, label) => {
          const html = renders[markdown];
          if (html === undefined) throw new Error(`Missing native fixture: ${markdown}`);
          label.replaceChildren(...new DOMParser().parseFromString(html, "text/html").body.childNodes);
        };
        window.setupBreadcrumb({ breadcrumbNavigateBeforeTimeout: false }, { text: fixture.source, mode, outline: mode === "outline" });
        const app = window.breadcrumbTest.manager.plugin.app;
        window.footnoteCache = null; // Open during metadata lag, then deliver the cache event.
        app.metadataCache.getFileCache = () => window.footnoteCache;
        window.links = []; app.workspace.openLinkText = (...args) => window.links.push(args);
      }, { fixture, mode, renders: native ? Object.fromEntries(Object.keys(fixture.renders).map(markdown => [markdown, native.render(markdown)])) : fixture.renders });
      const marker = page.locator(mode === "outline" ? ".breadcrumb-test-outline .extended-heading-outline-level-marker" : ".cm-extended-heading-gutter .cm-heading-marker").filter({ hasText: new RegExp(`^H${level}$`) });
      await marker.hover();
      await page.waitForFunction(expected => document.querySelector(".extended-breadcrumb-row.is-current .extended-breadcrumb-label")?.textContent === expected, unresolved);
      await page.evaluate(cache => {
        window.footnoteCache = cache;
        window.breadcrumbTest.handlers.get("metadata-changed")(window.breadcrumbTest.view.file);
      }, fixture.cache);
      const current = page.locator(".extended-breadcrumb-row.is-current .extended-breadcrumb-label");
      await current.locator("sup").waitFor();
      await page.waitForFunction(count => document.querySelectorAll(".extended-breadcrumb-label sup").length === count, expectedBreadcrumbs.length);
      await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
      assert.equal(await current.locator("sup").innerText(), `[${id}]`);
      assert.deepEqual(await page.locator(".extended-breadcrumb-label sup").allTextContents(), expectedBreadcrumbs);
      assert.equal(await page.locator(".extended-breadcrumb-label .footnotes").count(), 0);
      await geometry(page, ".extended-breadcrumb-label");
      if (name === "reported identifiers" && width === 1200 && mode === "source")
        await page.screenshot({ path: root + "release/validation/footnote-identifiers-breadcrumb.png" });
      await current.locator("a.footnote-link").click();
      assert.deepEqual(await page.evaluate(() => window.links), [[`#[^${id}]`, "Test.md", false]]);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".extended-breadcrumb-popover").count(), 0);
      await page.evaluate(fixture => window.setupFootnoteOutline(fixture), fixture);
      assert.equal(await page.locator(".footnote-test-outline .extended-heading-outline-level-marker").count(), fixture.headings.length);
      assert.deepEqual(await page.locator(".footnote-test-outline sup").allTextContents(), fixture.headings.flatMap(h => h.expectedRefs.map(ref => ref.label)));
      await geometry(page, ".footnote-test-outline .extended-heading-outline-markdown-rendered");
      if (name === "reported identifiers") {
        assert.deepEqual((await page.locator(".footnote-test-outline sup").allTextContents()).slice(0, 5),
          ["[1]", "[6]", "[4]", "[3]", "[5]"]);
        if (width === 1200 && mode === "source")
          await page.screenshot({ path: root + "release/validation/footnote-identifiers-outline.png" });
      }
      assert.deepEqual(errors, []);
      process.stdout.write(`PASS ${name}, ${width}px ${mode}: footnote geometry, metadata refresh, links and Outline\n`);
    } catch (error) {
      process.stderr.write(JSON.stringify(await page.evaluate(() => ({ popup: document.querySelector(".extended-breadcrumb-popover")?.textContent,
        metadata: !!window.footnoteCache, links: window.links }))) + "\n");
      await page.screenshot({ path: root + "release/validation/footnote-browser-failure.png" });
      throw error;
    } finally { await page.close(); }
  }
  process.stdout.write(`Passed 12 footnote browser scenarios and ${checks} superscript geometry checks in Chromium ${browser.version()}.\n`);
} finally { await browser.close(); }
