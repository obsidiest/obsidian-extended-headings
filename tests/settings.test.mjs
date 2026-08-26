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

test("distinguishes editor-gutter and default Outline heading markers", () => {
  assert.match(settings, /showEditorGutterHeadingLevelMarkers:\s*true/);
  assert.match(settings, /showOutlinePaneHeadingLevelMarkers:\s*true/);
  assert.match(settings, /showMarkersBeforeLineNumbers:\s*true/);
  assert.match(settings, /showMarkersInSourceMode:\s*true/);
  assert.match(settings, /name: "Show Editor Gutter heading level markers"/);
  assert.match(settings, /name: "Show Outline pane heading level markers"/);
  assert.match(settings, /showHeadingMarkers\?: boolean/);
});

test("enables Outline pane Markdown rendering by default", () => {
  assert.match(settings, /renderMarkdownInDefaultOutline:\s*true/);
  assert.match(settings, /name: "Outline Pane Markdown Rendering"/);
  assert.match(settings, /key: "renderMarkdownInDefaultOutline"/);
});

test("describes heading markers without Lapel compatibility wording", () => {
  assert.match(
    settings,
    /desc: "Show H1–H12 heading level markers in the editor gutter\."/,
  );
  assert.doesNotMatch(settings, /desc: "[^"]*Lapel-compatible[^"]*"/);
});

test("enables Outline static guides and path threading with requested defaults", () => {
  assert.match(settings, /enableOutlinePaneHeadingStaticTreeIndentationGuides:\s*true/);
  assert.match(settings, /enableOutlinePaneHeadingThreading:\s*true/);
  assert.match(settings, /activeSelectedOutlinePaneHeadingThreading:\s*false/);
  assert.match(settings, /activeOutlinePaneHeadingThreading:\s*true/);
  assert.match(settings, /allBranchesOfActiveOutlinePaneHeadingTreeThreading:\s*false/);
  assert.match(settings, /activeRootLevelOutlinePaneHeadingTreeThreading:\s*true/);
  assert.match(settings, /activeRootLevelOutlinePaneHeadingThreading:\s*true/);
  assert.match(
    settings,
    /allBranchesOfActiveRootLevelOutlinePaneHeadingTreeThreading:\s*false/,
  );
  assert.match(settings, /activeOrphanOutlinePaneHeadingTreeThreading:\s*true/);
  assert.match(settings, /activeOrphanOutlinePaneHeadingThreading:\s*true/);
  assert.match(
    settings,
    /allBranchesOfActiveOrphanOutlinePaneHeadingTreeThreading:\s*false/,
  );
  assert.match(
    settings,
    /activeRootLevelOrphanOutlinePaneHeadingTreeThreading:\s*true/,
  );
  assert.match(
    settings,
    /activeRootLevelOrphanOutlinePaneHeadingThreading:\s*true/,
  );
  assert.match(
    settings,
    /allBranchesOfActiveRootLevelOrphanOutlinePaneHeadingTreeThreading:\s*false/,
  );
  assert.match(settings, /heading: "Outline Pane Heading Static Tree Indentation Guides"/);
  assert.match(settings, /heading: "Outline Pane Heading Threading"/);
  assert.match(settings, /name: "Active Selected Heading Threading"/);
  assert.match(settings, /name: "Active Heading Threading"/);
  assert.match(settings, /name: "All Branches of an Active Heading Tree Threading"/);
  assert.match(settings, /name: "Active Root-Level Heading Tree Threading"/);
  assert.match(settings, /name: "Active Root-Level Heading Threading"/);
  assert.match(
    settings,
    /name: "All Branches of an Active Root-Level Tree Threading"/,
  );
  assert.match(settings, /name: "Active Orphan Heading Tree Threading"/);
  assert.match(settings, /name: "Active Orphan Heading Threading"/);
  assert.match(
    settings,
    /name: "All Branches of an Active Orphan Heading Tree Threading"/,
  );
  assert.match(
    settings,
    /name: "Active Root-Level ⟺ Orphan Heading Tree Threading"/,
  );
  assert.match(
    settings,
    /name: "Active Root-Level ⟺ Orphan Heading Threading"/,
  );
  assert.match(
    settings,
    /name: "All Branches of an Active Root-Level ⟺ Orphan Heading Tree Threading"/,
  );
});

test("manifest describes the plugin's overall purpose", () => {
  assert.equal(manifest.version, "1.0.0");
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
  assert.match(readme, /Editor Gutter/);
  assert.match(readme, /heading.level.marker.*size, weight, and font variant/is);
  assert.match(readme, /hash.marker.*size, weight, and font variant/is);
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

test("documents default Outline markers, guides, and all threading scopes", () => {
  assert.match(readme, /Show Outline pane heading level markers/);
  assert.match(readme, /Outline Pane Heading Static Tree Indentation Guides/);
  assert.match(readme, /Active Root-Level Heading Tree Threading/);
  assert.match(readme, /All Branches of an Active Root-Level Tree Threading/);
  assert.match(readme, /Active Orphan Heading Tree Threading/);
  assert.match(readme, /Active Root-Level ⟺ Orphan Heading Tree Threading/);
  assert.match(readme, /Active Selected Heading Threading/);
  assert.match(readme, /internal-link-only/);
  assert.match(readme, /embedded internal links/i);
  assert.match(readme, /Outline Pane Markdown Rendering/);
  assert.match(readme, /individual H1 trees, the virtual root-level H1 tree, orphan H2–H12 trees, and the combined root-level ⟺ orphan tree/);
  assert.match(readme, /List Tree Indentation Guides/);
});
