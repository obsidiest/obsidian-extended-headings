// Browser interaction/layout checks. Markdown output and Obsidian storage are
// explicit adapters; this suite does not claim to run Obsidian or MathJax.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import process from "node:process";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const bundle = await build({ entryPoints: [root + "tests/browser/rich-content-harness.mjs"], bundle: true, write: false, format: "iife",
  alias: { obsidian: root + "tests/browser/obsidian-stub.mjs" } });
const css = await readFile(root + "styles.css", "utf8");
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ["--no-sandbox"] });
const cases = [];
const test = (name, run, width = 1200) => cases.push({ name, run, width });
const frames = page => page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
async function openBreadcrumb(page) {
  await frames(page);
  await page.locator(".cm-gutterElement").last().hover();
  await page.waitForSelector(".extended-breadcrumb-popover");
}
for (const mode of ["source", "livePreview", "outline"]) test(`${mode}: intact rich source, rendered content, links and keyboard navigation`, async page => {
  await page.evaluate(mode => {
    window.calls = []; window.cleaned = 0; window.links = [];
    window.extendedRenderMarkdown = async (_app, source, label, path, component) => {
      window.calls.push({ source, path, loaded: component.loaded });
      component.register(() => window.cleaned++);
      const markup = source.includes("approx") ? '<p><strong>Math:</strong> <span class="math"><mjx-container>≈</mjx-container></span></p>'
        : source.includes("<svg") ? source : '<p><a class="internal-link" data-href="Testing Document" href="Testing Document">Testing Document</a> <em>italic</em> <code>code</code></p>';
      label.replaceChildren(...new DOMParser().parseFromString(markup, 'text/html').body.childNodes);
    };
    window.setupBreadcrumb({ breadcrumbNavigateBeforeTimeout: false }, { mode, outline: mode === "outline", text: '######### **Math:** $\\approx$\n########## <svg viewBox="0 0 24 24"><path d="M12 5v16"/></svg>\n########### [[Testing Document]] *italic* `code`' });
    window.breadcrumbTest.view.file.path = "Folder/Test.md";
    window.breadcrumbTest.manager.plugin.app.workspace.openLinkText = (...args) => window.links.push(args);
    if (mode === "outline") document.querySelectorAll(".tree-item-self").forEach(row => row.dataset.extendedBreadcrumbFile = "Folder/Test.md");
  }, mode);
  if (mode === "outline") { await frames(page); await page.locator(".extended-heading-outline-level-marker").last().hover(); }
  else await openBreadcrumb(page);
  await page.waitForFunction(() => window.calls.length === 3);
  const calls = await page.evaluate(() => window.calls);
  assert.equal(calls[0].source, "**Math:** $\\approx$");
  assert(calls[1].source.startsWith("<svg"));
  assert.equal(calls[2].source, "[[Testing Document]] *italic* `code`");
  assert(calls.every(call => call.loaded && call.path === "Folder/Test.md"));
  const label = page.locator(".extended-breadcrumb-label");
  assert.equal(await label.locator("mjx-container").count(), 1);
  assert.equal(await label.locator("svg").count(), 1);
  assert.equal(await label.locator("strong").innerText(), "Math:");
  assert.equal(await label.locator("em").innerText(), "italic");
  await label.locator("a").click({ modifiers: ["Control"] });
  assert.deepEqual(await page.evaluate(() => window.links), [["Testing Document", "Folder/Test.md", true]]);
  assert.equal(await page.evaluate(() => window.breadcrumbTest.cm.state.selection.main.head), 0);
  const rows = page.locator(".extended-breadcrumb-row");
  await rows.first().focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => window.breadcrumbTest.cm.state.selection.main.head), calls[0].source.length + 11);
  await rows.first().focus(); await page.keyboard.press("Space");
  assert.equal(await page.evaluate(() => window.breadcrumbTest.cm.state.selection.main.head), 0);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".extended-breadcrumb-popover").count(), 0);
  assert.equal(await page.evaluate(() => window.cleaned), 3);
});

test("late Markdown completion releases callbacks and children after dismissal", async page => {
  await page.evaluate(() => {
    window.pending = []; window.cleaned = 0;
    window.extendedRenderMarkdown = async (_app, source, label, _path, component) => {
      component.register(() => window.cleaned++);
      await new Promise(resolve => window.pending.push(resolve));
      label.textContent = source;
      component.register(() => window.cleaned++);
      const child = new component.constructor();
      child.register(() => window.cleaned++);
      component.addChild(child);
    };
    window.setupBreadcrumb({}, { text: "# Parent\n## Child" });
  });
  await openBreadcrumb(page); await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => window.cleaned), 2);
  await page.evaluate(() => window.pending.forEach(resolve => resolve())); await frames(page);
  assert.equal(await page.evaluate(() => window.cleaned), 6);
  assert.equal(await page.locator(".extended-breadcrumb-popover").count(), 0);
});

test("failed rendering leaves a navigable text fallback", async page => {
  await page.evaluate(() => {
    window.extendedRenderMarkdown = async () => { throw new Error("Postprocessor failed"); };
    window.setupBreadcrumb({}, { text: "# **Parent**\n## Child" });
  });
  await openBreadcrumb(page);
  assert.deepEqual(await page.locator(".extended-breadcrumb-label").allTextContents(), ["Parent", "Child"]);
  await page.locator(".extended-breadcrumb-row").last().click();
  assert.equal(await page.evaluate(() => window.breadcrumbTest.cm.state.selection.main.head), 13);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".extended-breadcrumb-popover").count(), 0);
});

const dialog = ".extended-headings-color-dialog";
const openColor = (page, id = "extended-breadcrumb-main-color", theme = "dark") => page.getByLabel(`${id} (${theme}) picker`, { exact: true }).click();
const save = async page => { await page.getByRole("button", { name: "Save", exact: true }).click(); await page.waitForFunction(() => !document.querySelector(".extended-headings-color-dialog")); };
test("all 55 controls persist both themes, apply CSS, close and reopen", async page => {
  await page.evaluate(() => window.setupColors());
  const ids = await page.evaluate(() => [...window.THEMED_COLOR_DEFAULTS.keys()]);
  assert.equal(ids.length, 55);
  for (const [index, theme] of ["light", "dark"].entries()) {
    await page.evaluate(theme => document.body.className = `theme-${theme}`, theme);
    for (const id of ids) {
      await openColor(page, id, theme);
      const hex = index ? "#13163c" : "#a344ee";
      await page.getByLabel("Hex color", { exact: true }).fill(hex); await save(page);
      const result = await page.evaluate(({ id, theme }) => ({ stored: window.colorStore.disk[`extended-headings-style@@${id}@@${theme}`], css: getComputedStyle(document.body).getPropertyValue(`--${id}`).trim() }), { id, theme });
      assert.deepEqual(result, { stored: hex, css: hex });
      await openColor(page, id, theme);
      assert.equal(await page.getByLabel("Hex color", { exact: true }).inputValue(), hex);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
  }
  assert.equal(await page.locator('[data-id="other-plugin-color"] .extended-headings-style-color-controls').count(), 0);
  await page.evaluate(() => window.mountColorRows()); await openColor(page);
  assert.equal(await page.getByLabel("Hex color", { exact: true }).inputValue(), "#13163c");
});

test("inherited defaults remove overrides; invalid saved colors are repaired within this plugin", async page => {
  await page.evaluate(() => {
    window.setupColors(); Object.assign(window.colorStore.settings, {
      "extended-headings-style@@extended-h7-color@@dark": "#NaNNaNNaN",
      "extended-headings-style@@extended-outline-guide-color@@light": "",
      "extended-headings-style@@extended-breadcrumb-main-color@@light": "rgba(12, 34, 56, 0.5)",
      "other-plugin@@color@@dark": "#abcdef",
    });
  });
  await openColor(page); await page.getByLabel("Hex color", { exact: true }).fill("#abcd"); await save(page);
  const stored = await page.evaluate(() => window.colorStore.disk);
  assert.equal(stored["extended-headings-style@@extended-h7-color@@dark"], undefined);
  assert.equal(stored["extended-headings-style@@extended-outline-guide-color@@light"], "#777777");
  assert.equal(stored["extended-headings-style@@extended-breadcrumb-main-color@@dark"], "#aabbccdd");
  assert.equal(stored["other-plugin@@color@@dark"], "#abcdef");
  await openColor(page, "extended-breadcrumb-main-color", "light");
  assert.equal(await page.getByLabel("Hex color", { exact: true }).inputValue(), "#0c223880");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await openColor(page, "extended-h7-color");
  assert.equal(await page.getByLabel("Hex color", { exact: true }).inputValue(), "");
  await page.getByLabel("Hex color", { exact: true }).fill("#123456"); await save(page);
  await openColor(page, "extended-h7-color"); await page.getByRole("button", { name: "Default", exact: true }).click(); await save(page);
  assert.equal(await page.evaluate(() => Object.hasOwn(window.colorStore.disk, "extended-headings-style@@extended-h7-color@@dark")), false);
});

test("Save awaits persistence; failure restores the prior setting and allows retry", async page => {
  await page.evaluate(() => { window.setupColors(); window.colorStore.delayed = true; window.colorStore.fail = true; window.colorStore.settings["extended-headings-style@@extended-breadcrumb-main-color@@dark"] = "#112233"; });
  await openColor(page); await page.getByLabel("Hex color", { exact: true }).fill("#abcdef");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Save", exact: true }).isDisabled(), true);
  await page.keyboard.press("Escape"); assert.equal(await page.locator(dialog + "[open]").count(), 1);
  assert.deepEqual(await page.evaluate(() => window.colorStore.disk), {});
  await page.evaluate(() => window.colorStore.resolve());
  await page.getByRole("status").filter({ hasText: "Could not save" }).waitFor();
  assert.equal(await page.evaluate(() => window.colorStore.settings["extended-headings-style@@extended-breadcrumb-main-color@@dark"]), "#112233");
  assert.equal(await page.getByRole("button", { name: "Save", exact: true }).isEnabled(), true);
  await page.evaluate(() => { window.colorStore.fail = false; window.colorStore.delayed = false; }); await save(page);
  assert.equal(await page.evaluate(() => window.colorStore.calls), 2);
});

test("invalid input, Cancel, Escape, disable and unload do not save edits", async page => {
  await page.evaluate(() => window.setupColors()); await openColor(page);
  await page.getByLabel("Hex color", { exact: true }).fill("#NaNNaNNaN");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert.equal(await page.getByLabel("Hex color", { exact: true }).getAttribute("aria-invalid"), "true");
  await page.getByRole("button", { name: "Default", exact: true }).click();
  assert.equal(await page.getByLabel("Hex color", { exact: true }).inputValue(), "#7aa2f7");
  await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector("dialog"));
  assert.equal(await page.evaluate(() => window.colorStore.calls), 0);
  await openColor(page); await page.evaluate(() => window.colors.stop()); await frames(page);
  assert.equal(await page.locator(dialog).count(), 0);
  assert.equal(await page.locator(".extended-headings-style-color-original").count(), 0);
  await page.evaluate(() => { window.colors.enhance(document); window.colorStore = null; window.colors.enhance(document); });
  assert.equal(await page.locator(".extended-headings-style-color-controls").count(), 0);
});

test("dialog fits a narrow viewport and uses its owning popout document", async page => {
  await page.evaluate(() => {
    window.setupColors();
    const frame = document.body.createEl("iframe", { attr: { id: "popout" } });
    window.installHostDOM(frame.contentWindow);
    window.mountColorRows(frame.contentDocument);
    frame.contentDocument.querySelector('[aria-label="extended-h7-color (dark) picker"]').click();
  });
  assert.equal(await page.frameLocator("#popout").locator(dialog + "[open]").count(), 1);
  assert.equal(await page.locator(dialog).count(), 0);
  await page.evaluate(() => window.colors.removeDocument(document.querySelector("iframe").contentDocument)); await frames(page);
  assert.equal(await page.frameLocator("#popout").locator(dialog).count(), 0);
  await openColor(page);
  const box = await page.locator(dialog).boundingBox();
  assert(box.x >= 0 && box.x + box.width <= 360);
  await page.getByLabel("Hex color", { exact: true }).fill("#aabbcc"); await save(page);
}, 360);

try {
  for (const { name, run, width } of cases) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    try {
      await page.setContent('<html><head><style id="saved-colors"></style></head><body class="theme-dark"></body></html>');
      await page.addStyleTag({ content: css + '\nbody{font:14px Arial;--text-muted:#999;--text-faint:#888;--font-smallest:12px;} .breadcrumb-test-editor{width:700px;} .cm-line{padding-block:10px;} .cm-heading-marker{display:inline-block;min-width:30px;} .setting-item{display:flex;padding:4px;} .setting-item-control{margin-left:auto;} .breadcrumb-test-outline{width:400px;} .tree-item-self{padding:8px;} .extended-breadcrumb-label svg{height:24px;}' });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await run(page); assert.deepEqual(errors, []); process.stdout.write(`PASS ${name}\n`);
    } finally { await page.close(); }
  }
  process.stdout.write(`Passed ${cases.length} rich-content/color browser scenarios in Chromium ${browser.version()}.\n`);
} finally { await browser.close(); }
