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
      .breadcrumb-test-editor .markdown-source-view { height: 100%; }` });
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
    assert.ok(layout.top >= 7 && layout.bottom <= 843 && layout.height <= 361, JSON.stringify(layout));
    assert.ok(layout.scroll > layout.client, JSON.stringify(layout));
    assert.ok(layout.scrollWidth <= layout.clientWidth + 1, JSON.stringify(layout));
    checks += 6;
    // Browser focus/selection, scrolling, and decoration transactions are real CodeMirror here.
    const last = popup.locator(".extended-breadcrumb-row").last();
    await last.click();
    const caret = await page.evaluate(() => window.breadcrumbTest.cm.state.selection.main.head);
    assert.equal(caret, await page.evaluate(() => window.breadcrumbTest.cm.state.doc.line(12).from)); checks++;
    if (await popup.count()) {
      await popup.locator(".extended-breadcrumb-row").first().hover();
      assert.equal(await page.evaluate(() => window.breadcrumbTest.cm.state.selection.main.head), caret); checks++;
    }
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
    await page.close();
  }
  process.stdout.write(`Passed ${checks} browser assertions in Chromium ${browser.version()} at 1200px and 360px viewport widths.\n`);
} finally { await browser.close(); }
