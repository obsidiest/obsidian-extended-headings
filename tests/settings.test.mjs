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

test("manifest describes the plugin's overall purpose", () => {
  assert.equal(manifest.version, "0.4.11");
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
