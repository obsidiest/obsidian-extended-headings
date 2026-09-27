// Optional integration using unmodified Style Settings 1.0.9 manager source.
// Its disk storage and Obsidian workspace event are replaced with adapters.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import process from "node:process";
import { build } from "esbuild";
import { themedColorSchema } from "../helpers/style-schema.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const upstream = process.env.EXTENDED_STYLE_SETTINGS_SOURCE, chroma = process.env.EXTENDED_CHROMA_JS;
if (!upstream || !chroma) throw new Error("Set EXTENDED_STYLE_SETTINGS_SOURCE and EXTENDED_CHROMA_JS; see docs/validation-2.1.1.md.");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const css = await readFile(root + "styles.css", "utf8");
const config = { name: "Extended Headings", id: "extended-headings-style", settings: themedColorSchema(css) };
const bundle = await build({ stdin: { contents: `import ${JSON.stringify(root + "tests/browser/rich-content-harness.mjs")}; import { CSSSettingsManager } from ${JSON.stringify(resolve(upstream, "src/SettingsManager.ts"))}; window.CSSSettingsManager = CSSSettingsManager;`, resolveDir: root },
  bundle: true, write: false, format: "iife", alias: { "chroma-js": resolve(chroma), obsidian: root + "tests/browser/obsidian-stub.mjs" },
  plugins: [{ name: "unused-import-export-dialogs", setup(builder) {
    builder.onResolve({ filter: /^\.\/(ExportModal|ImportModal)$/ }, args => ({ path: args.path, namespace: "stub" }));
    builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export class ExportModal {}; export class ImportModal {};" }));
  } }],
});
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("http://extended.test/**", route => route.fulfill({ body: '<html><body class="theme-dark css-settings-manager"></body></html>', contentType: "text/html" }));
  await page.goto("http://extended.test"); await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(config => {
    const plugin = { saveData: async values => window.localStorage.setItem("settings", JSON.stringify(values)),
      loadData: async () => JSON.parse(window.localStorage.getItem("settings") || "{}"), app: { workspace: { trigger() {} } } };
    window.manager = new window.CSSSettingsManager(plugin); window.manager.setConfig([config]);
    window.colors = new window.StyleSettingsColors(() => window.manager);
    window.mountColorRows();
  }, config);
  const baseline = await page.evaluate(async () => {
    window.manager.settings["extended-headings-style@@extended-h7-color@@dark"] = "#NaNNaNNaN";
    window.manager.settings["extended-headings-style@@extended-outline-heading-color@@light"] = "#";
    try { await window.manager.setSettings({ "extended-headings-style@@extended-breadcrumb-main-color@@dark": "#13163c" }); return "unexpected success"; }
    catch (error) { return error.message; }
  });
  assert.match(baseline, /unknown format/);
  process.stdout.write(`Unmodified manager malformed-color baseline: ${baseline}\n`);
  let saves = 0;
  for (const theme of ["dark", "light"]) {
    await page.evaluate(theme => document.body.className = `theme-${theme} css-settings-manager`, theme);
    for (const setting of config.settings) {
      const hex = theme === "dark" ? "#13163c" : "#ab44ee";
      await page.getByLabel(`${setting.id} (${theme}) picker`, { exact: true }).click();
      await page.getByLabel("Hex color", { exact: true }).fill(hex);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector("dialog"));
      assert.deepEqual(await page.evaluate(({ id, theme }) => ({ stored: JSON.parse(window.localStorage.getItem("settings"))[`extended-headings-style@@${id}@@${theme}`], css: getComputedStyle(document.body).getPropertyValue(`--${id}`).trim() }), { id: setting.id, theme }), { stored: hex, css: hex });
      saves++;
    }
  }
  // Reset one of the fields whose schema default means inherit. The real
  // manager must remove its CSS variable and persist absence, never '#' or ''.
  await page.getByLabel("extended-h7-color (light) picker", { exact: true }).click();
  await page.getByRole("button", { name: "Default", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog"));
  assert.equal(await page.evaluate(() => Object.hasOwn(JSON.parse(window.localStorage.getItem("settings")), "extended-headings-style@@extended-h7-color@@light")), false);
  assert.equal(await page.evaluate(() => window.manager.styleTag.textContent.includes("--extended-h7-color: #ab44ee")), false);
  await page.evaluate(async () => { window.manager.settings = {}; await window.manager.load(); window.manager.setCSSVariables(); window.mountColorRows(); });
  await page.getByLabel("extended-breadcrumb-main-color (dark) picker", { exact: true }).click();
  assert.equal(await page.getByLabel("Hex color", { exact: true }).inputValue(), "#13163c");
  assert.deepEqual(errors, []);
  process.stdout.write(`Passed ${saves} themed saves with the actual Style Settings manager, inherited reset, and storage reload in Chromium ${browser.version()}.\n`);
} finally { await browser.close(); }
