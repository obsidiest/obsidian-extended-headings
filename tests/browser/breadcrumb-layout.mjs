// Optional real-browser checks: npm install --no-save --package-lock=false playwright
// then npx playwright install chromium && npm run test:browser.
// BROWSER_EXECUTABLE and PLAYWRIGHT_MODULE can point to existing local installations.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import process from "node:process";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const bundle = await build({ entryPoints: [fileURLToPath(new URL("./breadcrumb-harness.mjs", import.meta.url))], bundle: true, write: false, format: "iife",
  alias: { obsidian: fileURLToPath(new URL("./obsidian-stub.mjs", import.meta.url)) } });
const styles = await readFile(`${root}styles.css`, "utf8");
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-software-rasterizer"] });
let checks = 0;
try {
  for (const width of [1200, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent('<!doctype html><html><body class="theme-dark"></body></html>');
    for (const path of [process.env.OBSIDIAN_CSS, process.env.THEME_CSS].filter(Boolean)) await page.addStyleTag({ content: await readFile(path, "utf8") });
    await page.addStyleTag({ content: styles });
    await page.addStyleTag({ content: `body { margin: 0; font-family: Arial, sans-serif; --text-muted: #999; --text-faint: #888; --font-smallest: 12px; --cursor-link: pointer; }
      .breadcrumb-test-editor { position: absolute; inset: 40px 16px auto; height: 690px; }
      .breadcrumb-test-editor .cm-editor { height: 100%; }
      .breadcrumb-test-editor .cm-scroller { overflow: auto; }
      .breadcrumb-test-editor .cm-line { padding-block: 12px; font-size: 14px; line-height: 20px; }
      .breadcrumb-test-editor .cm-gutterElement { padding-inline: 12px; }
      .breadcrumb-test-editor .cm-heading-marker { display: inline-block; min-width: 30px; }
      .breadcrumb-test-editor .markdown-source-view { height: 100%; }
      .breadcrumb-test-has-outline { right: 420px; }
      .breadcrumb-test-outline { position: fixed; right: 16px; top: 40px; width: 370px; height: 690px; overflow: auto; }
      .breadcrumb-test-outline .tree-item-self { min-height: 36px; padding: 4px; display: flex; }` });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.setupBreadcrumb());
    await page.locator('.cm-heading-marker[data-level="12"]').hover();
    const popup = page.locator(".extended-breadcrumb-popover");
    await popup.waitFor();
    const layout = await popup.evaluate((element) => {
      const rect = element.getBoundingClientRect(), tree = element.querySelector(".extended-breadcrumb-tree");
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height,
        client: tree.clientHeight, scroll: tree.scrollHeight, scrollWidth: tree.scrollWidth, clientWidth: tree.clientWidth,
        count: element.querySelectorAll(".extended-breadcrumb-row").length,
        marker: getComputedStyle(element.querySelector(".extended-breadcrumb-level-marker")).fontVariant,
        wrap: getComputedStyle(element.querySelector(".extended-breadcrumb-label")).whiteSpace };
    });
    assert.equal(layout.count, 12); assert.equal(layout.wrap, "normal"); assert.equal(layout.marker, "all-small-caps");
    assert.ok(layout.left >= 7 && layout.right <= width - 7, JSON.stringify(layout));
    assert.ok(layout.top >= 7 && layout.bottom <= 843 && layout.height <= 401, JSON.stringify(layout));
    assert.ok(layout.scroll > layout.client, JSON.stringify(layout));
    assert.ok(layout.scrollWidth <= layout.clientWidth + 1, JSON.stringify(layout));
    checks += 6;
    // Browser focus/selection, scrolling, and decoration transactions are real CodeMirror here.
    const last = popup.locator(".extended-breadcrumb-row").last();
    await last.click();
    const caret = await page.evaluate(() => window.breadcrumbTest.cm.state.selection.main.head);
    assert.equal(caret, await page.evaluate(() => window.breadcrumbTest.cm.state.doc.line(12).from)); checks++;
    await popup.locator(".extended-breadcrumb-row").first().hover();
    assert.equal(await page.evaluate(() => window.breadcrumbTest.cm.state.selection.main.head), caret); checks++;
    await page.keyboard.press("Escape");
    assert.equal(await popup.count(), 0); checks++;
    // A pane override inherits the complete shared style until explicitly enabled.
    await page.addStyleTag({ content: 'body { --extended-editor-breadcrumb-level-marker-font-size: 1.75em; }' });
    await page.evaluate(() => {
      window.breadcrumbTest.settings.breadcrumbExpandTitles = false;
      window.breadcrumbTest.manager.refresh();
      document.body.classList.add("extended-editor-breadcrumb-style-overrides");
    });
    await page.locator('.cm-heading-marker[data-level="12"]').hover();
    const appearance = await popup.evaluate((element) => ({
      wrap: getComputedStyle(element.querySelector(".extended-breadcrumb-label")).whiteSpace,
      marker: parseFloat(getComputedStyle(element.querySelector(".extended-breadcrumb-level-marker")).fontSize),
      row: parseFloat(getComputedStyle(element.querySelector(".extended-breadcrumb-row")).fontSize),
    }));
    assert.equal(appearance.wrap, "nowrap"); assert.ok(Math.abs(appearance.marker / appearance.row - 1.75) < 0.01); checks += 2;
    assert.deepEqual(errors, []); checks++;
    if (process.env.BREADCRUMB_SCREENSHOT && width === 1200) await page.screenshot({ path: process.env.BREADCRUMB_SCREENSHOT });
    // Short hierarchies previously inherited SVG's 300x150 default scroll area.
    const text = Array.from({ length: 12 }, (_, i) => `${"#".repeat(i + 1)} Heading Level ${i + 1}`).join("\n");
    await page.evaluate((text) => {
      document.body.classList.remove("extended-editor-breadcrumb-style-overrides");
      window.setupBreadcrumb({}, { text });
    }, text);
    for (let level = 1; level <= 12; level++) {
      await page.keyboard.press("Escape");
      await page.locator(`.cm-heading-marker[data-level="${level}"]`).hover();
      const measured = await popup.evaluate((element) => {
        const tree = element.querySelector(".extended-breadcrumb-tree");
        const row = element.querySelector(".is-current"), rect = tree.getBoundingClientRect(), current = row.getBoundingClientRect();
        return { count: element.querySelectorAll(".extended-breadcrumb-row").length, scrollTop: tree.scrollTop,
          width: tree.clientWidth, scrollWidth: tree.scrollWidth, height: tree.clientHeight, scrollHeight: tree.scrollHeight,
          currentTop: current.top - rect.top, currentBottom: current.bottom - rect.top };
      });
      assert.equal(measured.count, level);
      assert.ok(measured.scrollWidth <= measured.width + 1, JSON.stringify({ level, measured }));
      assert.ok(measured.currentTop >= -1 && measured.currentBottom <= measured.height + 1, JSON.stringify({ level, measured }));
      if (width === 1200) {
        assert.equal(measured.scrollTop, 0, `H${level} should fit without cutting off ancestors`);
        assert.ok(measured.scrollHeight <= measured.height + 1);
      }
      checks += width === 1200 ? 5 : 3;
    }
    if (width === 1200) {
      for (const mode of ["source", "livePreview"]) {
        await page.evaluate(({ text, mode }) => window.setupBreadcrumb({}, { text, mode }), { text, mode });
        await page.locator('.cm-heading-marker[data-level="3"]').hover();
        await page.keyboard.press("Escape");
        // Reproduce a transparent editor layer over the painted Hn marker.
        const bounds = await page.locator('.cm-heading-marker[data-level="3"]').evaluate((marker) => {
          const rect = marker.getBoundingClientRect(), cell = marker.parentElement.getBoundingClientRect();
          const scroller = marker.closest(".cm-scroller").getBoundingClientRect();
          const overlay = document.createElement("div"); overlay.className = "breadcrumb-test-overlap";
          overlay.style.cssText = `position:fixed;z-index:10;left:${scroller.left}px;top:${rect.top}px;width:${rect.right - scroller.left}px;height:${rect.height}px`;
          marker.closest(".markdown-source-view").append(overlay);
          return { left: scroller.left, glyphLeft: rect.left, right: rect.right, cellRight: cell.right, y: rect.top + rect.height / 2 };
        });
        for (const x of [bounds.left + 1, bounds.glyphLeft + 2, bounds.right - 1]) {
          await page.keyboard.press("Escape"); await page.mouse.move(x, bounds.y);
          assert.equal(await popup.count(), 1, `${mode} marker hit at x=${x}`); checks++;
        }
        await page.keyboard.press("Escape");
        await page.mouse.move(Math.max(bounds.right, bounds.cellRight) + 5, bounds.y);
        assert.equal(await popup.count(), 0, "marker scope must not include heading hashes"); checks++;
      }
      for (const pane of ["editor", "outline"]) {
        await page.evaluate((text) => window.setupBreadcrumb({}, { text, outline: true }), text);
        await page.addStyleTag({ content: "body { --extended-breadcrumb-max-height: 180px; }" });
        const marker = page.locator(pane === "editor" ? '.cm-heading-marker[data-level="12"]' : '.extended-heading-outline-level-marker[data-level="12"]');
        await marker.hover(); await popup.waitFor();
        const original = await popup.evaluate((element) => { element.dataset.testIdentity = "original"; return element.dataset.testIdentity; });
        await popup.hover();
        await page.mouse.wheel(0, -600);
        await page.waitForTimeout(100);
        const tree = popup.locator(".extended-breadcrumb-tree");
        await tree.evaluate((element) => { element.scrollTop = 0; });
        // Preview scrolling, recycled anchors, and file-open/layout notifications
        // must not remove a popup that the user is interacting with.
        await popup.locator(".extended-breadcrumb-row").first().hover();
        await page.evaluate(() => {
          const { cm, handlers } = window.breadcrumbTest;
          cm.scrollDOM.dispatchEvent(new Event("scroll"));
          handlers.get("layout-change")(); handlers.get("file-open")();
        });
        await page.waitForTimeout(100);
        assert.equal(await popup.getAttribute("data-test-identity"), original); checks++;
        await popup.locator(".extended-breadcrumb-row").first().click();
        assert.equal(await page.evaluate(() => window.breadcrumbTest.cm.state.selection.main.head), 0); checks++;
        // The 10ms default is a leave delay, not a lifetime while interacting.
        await page.waitForTimeout(100);
        assert.equal(await popup.count(), 1); checks++;
        await page.evaluate(() => { window.breadcrumbTest.settings.globalBreadcrumbTimeoutSeconds = 1; });
        await page.mouse.move(1195, 845);
        await page.waitForTimeout(150);
        assert.equal(await popup.count(), 1); checks++;
        await popup.waitFor({ state: "detached", timeout: 2000 }); checks++;
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  process.stdout.write(`Passed ${checks} browser assertions in Chromium ${browser.version()} at 1200px and 360px viewport widths.\n`);
} finally { await browser.close(); }
