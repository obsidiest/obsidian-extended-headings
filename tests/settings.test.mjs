import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const settings = readFileSync(new URL("../src/settings.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const versions = JSON.parse(readFileSync(new URL("../versions.json", import.meta.url), "utf8"));

test("defaults to the full H12 range and native-style inactive-line concealment", () => {
  assert.match(settings, /maximumLevel:\s*12/);
  assert.match(settings, /hideMarkersInLivePreview:\s*true/);
  assert.match(settings, /Hashes are hidden by default\./);
});

test("defaults copied heading references to complete ancestor paths", () => {
  assert.match(settings, /copyFullyNestedHeadingPaths:\s*true/);
  assert.match(settings, /name: "Copy fully nested heading paths"/);
  assert.match(settings, /key: "copyFullyNestedHeadingPaths"/);
});

test("retains configurable inactive-line hash concealment behavior", () => {
  assert.match(styles, /body\.extended-headings-hide-markers/);
  assert.match(styles, /\.cm-line:not\(\.cm-active\)/);
});

test("includes Heading Shifter-compatible command settings", () => {
  assert.match(settings, /lowerHeadingLimit:\s*1/);
  assert.match(settings, /overrideTabBehavior:\s*false/);
  assert.match(settings, /removeUnorderedListMarker:\s*true/);
  assert.match(settings, /removeOrderedListMarker:\s*true/);
  assert.match(settings, /removeBold:\s*false/);
  assert.match(settings, /removeItalic:\s*false/);
  assert.match(settings, /childListBehavior:\s*"outdent to zero"/);
  assert.match(settings, /tabSize:\s*4/);
});

test("uses the user's current Lapel marker preferences as defaults", () => {
  assert.match(settings, /showHeadingMarkers:\s*true/);
  assert.match(settings, /showMarkersBeforeLineNumbers:\s*true/);
  assert.match(settings, /showMarkersInSourceMode:\s*true/);
});

test("describes heading markers without Lapel compatibility wording", () => {
  assert.match(
    settings,
    /desc: "Show H1–H12 heading markers in the editor gutter\."/,
  );
  assert.doesNotMatch(settings, /desc: "[^"]*Lapel-compatible[^"]*"/);
});

test("manifest describes the plugin's overall purpose", () => {
  assert.equal(manifest.version, "0.4.16");
  assert.equal(
    manifest.description,
    "Extends ATX heading support through H12 with consistent editing, styling, folding, outlines, links, navigation, and heading-level markers.",
  );
  assert.doesNotMatch(manifest.description, /\bobsidian\b/i);
});

test("declares the latest audited Obsidian version and declarative-settings minimum", () => {
  assert.match(readme, /Latest compatibility target:\*\* Obsidian 1\.13\.7/);
  assert.match(readme, /Minimum supported Obsidian version:\*\* 1\.13\.0/);
  assert.equal(manifest.minAppVersion, "1.13.0");
  assert.equal(versions[manifest.version], "1.13.0");
});

test("uses searchable declarative settings without a legacy display renderer", () => {
  assert.match(settings, /getSettingDefinitions\(\)/);
  assert.match(settings, /SettingDefinitionItem<SettingsKey>/);
  assert.match(settings, /setControlValue\(key: string, value: unknown\)/);
  assert.doesNotMatch(settings, /\bdisplay\(\): void/);
  assert.doesNotMatch(settings, /setDynamicTooltip/);
});

test("documents marker typography and default Outline SVG rendering", () => {
  assert.match(readme, /heading level marker size and weight/i);
  assert.match(readme, /hash marker size and weight/i);
  assert.match(readme, /all H1.H12 heading levels/i);
  assert.match(readme, /precise number input/i);
  assert.match(readme, /arbitrary in-range values/i);
  assert.match(readme, /preserv(?:e|es).*decimal.*caret/i);
  assert.match(readme, /Render inline SVGs in default Outline/);
  assert.match(readme, /inside trailing parentheses/i);
  assert.match(readme, /sanitizeHTMLToDom/);
  assert.match(readme, /non-public DOM structure/);
  assert.doesNotMatch(
    readme,
    /Shows Lapel-compatible H1–H12 markers in the editor gutter\./,
  );
});
