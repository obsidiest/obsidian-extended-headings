import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const extension = readFileSync(new URL("../src/editor-extension.ts", import.meta.url), "utf8");
const references = readFileSync(new URL("../src/reference-commands.ts", import.meta.url), "utf8");
const coreIntegration = readFileSync(
  new URL("../src/core-integration.ts", import.meta.url),
  "utf8",
);

test("registers H1-H12 increase, decrease, and forced shift commands", () => {
  assert.match(main, /id: "increase-headings"/);
  assert.match(main, /id: "increase-headings-forced"/);
  assert.match(main, /id: "decrease-headings"/);
});

test("registers paragraph and H1-H12 set-heading commands", () => {
  assert.match(main, /for \(let level = 0; level <= 12; level \+= 1\)/);
  assert.match(main, /set-as-heading-\$\{level\}/);
  assert.match(main, /Set as heading H\$\{level\}/);
});

test("registers a heading marker gutter backed by the full parser", () => {
  assert.match(extension, /class: "cm-lapel cm-extended-heading-gutter"/);
  assert.match(extension, /scanHeadings\(view\.state\.doc\.toString\(\), 1, maximumLevel\)/);
});

test("registers the consolidated rename and reference commands", () => {
  assert.match(main, /id: "rename-this-heading"/);
  assert.match(main, /name: "Rename this heading \(H1–H12\)"/);
  assert.match(main, /id: "copy-embed-to-current-block-or-heading"/);
  assert.match(main, /id: "copy-link-to-current-block-or-heading"/);
});

test("uses a plugin-neutral reindex command ID and name", () => {
  assert.match(main, /id: "reindex"/);
  assert.match(main, /name: "Reindex headings"/);
  assert.doesNotMatch(main, /reindex-extended-headings/);
  assert.doesNotMatch(main, /name: "Reindex extended headings"/);
});

test("does not assign default hotkeys", () => {
  assert.doesNotMatch(main, /\bhotkeys\s*:/);
});

test("adds heading- and block-specific editor context-menu items", () => {
  assert.match(main, /workspace\.on\("editor-menu"/);
  assert.match(main, /Copy link to heading/);
  assert.match(main, /Copy link to block/);
  assert.match(main, /Copy heading embed/);
  assert.match(main, /Copy block embed/);
  assert.match(main, /setIcon\("links-coming-in"\)/);
  assert.ok(main.indexOf("Copy link to heading") < main.indexOf("Copy heading embed"));
  assert.match(references, /if \(this\.headingAtCursor\(editor\)\) return "heading"/);
  assert.match(references, /return this\.blockAtCursor\(editor, view\.file\) \? "block" : null/);
});

test("copies heading references with their complete ancestor path", () => {
  assert.match(references, /headingPathAtLine\(/);
  assert.match(references, /hierarchy\.slice\(0, -1\)/);
  assert.match(references, /`#\$\{anchors\.join\("#"\)\}`/);
});

test("preserves true H7-H12 levels in Obsidian's default Outline bridge", () => {
  assert.match(coreIntegration, /level:\s*heading\.level/);
  assert.doesNotMatch(coreIntegration, /toCoreHeadingCacheLevel/);
});

test("reindexes the default Outline after both startup lifecycle signals", () => {
  assert.match(coreIntegration, /metadataCache\.on\("resolved"/);
  assert.match(coreIntegration, /workspace\.onLayoutReady/);
  assert.match(coreIntegration, /runStartupReindex/);
  assert.match(coreIntegration, /await this\.reindexAll\(true\)/);
  assert.match(
    coreIntegration,
    /forceNotify && bridged\.length > 0/,
  );
  assert.doesNotMatch(coreIntegration, /void this\.reindexAll\(\);\s*\n\s*}/);
});

test("prioritizes the active note before the vault-wide startup reindex", () => {
  assert.match(coreIntegration, /workspace\.on\("file-open"/);
  assert.match(coreIntegration, /void this\.reindexActiveFile\(true\)/);
  assert.match(
    coreIntegration,
    /await this\.reindexActiveFile\(true\);\s*\n\s*await this\.reindexAll\(true\)/,
  );
  assert.match(coreIntegration, /view\.editor\.getValue\(\)/);
  assert.match(coreIntegration, /getLeavesOfType\("markdown"\)/);
  assert.match(coreIntegration, /files\.findIndex\(\(file\) => file\.path === activeFile\.path\)/);
});

test("preserves punctuation in default Outline display labels", () => {
  assert.match(coreIntegration, /heading:\s*heading\.rawBody/);
  assert.doesNotMatch(coreIntegration, /heading:\s*stripHeading\(/);
});

test("renders heading-subpath links in H7+ Live Preview through an independent fallback", () => {
  assert.match(extension, /scanHeadingSubpathLinks\(heading\.rawBody, heading\.bodyFrom\)/);
  assert.match(extension, /MarkdownRenderer\.render/);
  assert.match(extension, /Decoration\.replace/);
  assert.doesNotMatch(extension, /Decoration\.mark\(\{ class: "extended-heading-text" \}\)/);
});
