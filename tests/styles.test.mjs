import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("exposes complete Style Settings controls for H7 through H12", () => {
  for (let level = 7; level <= 12; level += 1) {
    assert.match(styles, new RegExp(`id: extended-h${level}-size\\n`));
    assert.match(styles, new RegExp(`id: extended-h${level}-weight\\n`));
    assert.match(styles, new RegExp(`id: extended-h${level}-color\\n`));
    assert.match(styles, new RegExp(`id: extended-h${level}-variant\\n`));
    assert.match(styles, new RegExp(`id: extended-h${level}-style\\n`));
    assert.match(styles, new RegExp(`id: extended-h${level}-l\\n`));
  }
});

test("uses the requested typography defaults for every extended level", () => {
  for (let level = 7; level <= 12; level += 1) {
    const settingDefaults = new RegExp(
      `id: extended-h${level}-size\\n[\\s\\S]*?default: 0\\.9\\n[\\s\\S]*?id: extended-h${level}-weight\\n[\\s\\S]*?default: 500\\n`
    );
    assert.match(styles, settingDefaults);
    assert.match(styles, new RegExp(`--extended-h${level}-size: 0\\.9em;`));
    assert.match(styles, new RegExp(`--extended-h${level}-weight: 500;`));
  }

  assert.match(styles, /id: extended-h7-variant\n[\s\S]*?default: normal\n/);
  assert.match(styles, /id: extended-h7-style\n[\s\S]*?default: normal\n/);
});

test("applies each level's typography variables and divider class", () => {
  for (let level = 7; level <= 12; level += 1) {
    assert.match(styles, new RegExp(`color: var\\(--extended-h${level}-color\\)`));
    assert.match(styles, new RegExp(`font-style: var\\(--extended-h${level}-style\\)`));
    assert.match(styles, new RegExp(`font-variant: var\\(--extended-h${level}-variant\\)`));
    assert.match(styles, new RegExp(`font-weight: var\\(--extended-h${level}-weight\\)`));
    assert.match(styles, new RegExp(`\\.extended-h${level}-l \\.extended-heading-${level}`));
  }
});

test("defines Lapel-compatible gutter markers through H12", () => {
  assert.match(styles, /\.cm-extended-heading-gutter\.cm-lapel/);
  assert.match(styles, /\.cm-heading-marker::before/);
  for (let level = 1; level <= 12; level += 1) {
    assert.match(styles, new RegExp(`\\.cm-heading-marker\\[data-level="${level}"\\]`));
  }
});

test("supports marker placement and Source Mode visibility settings", () => {
  assert.match(styles, /extended-headings-markers-before/);
  assert.match(styles, /extended-headings-markers-in-source/);
  assert.match(styles, /markdown-source-view\.mod-cm6:not\(\.is-live-preview\)/);
});

test("keeps H7+ ATX markers aligned with their heading typography", () => {
  const markerRule = styles.match(/\.extended-heading-marker\s*\{([^}]*)\}/s);
  assert.ok(markerRule);
  assert.match(markerRule[1], /font-size:\s*inherit;/);
  assert.match(markerRule[1], /font-style:\s*inherit;/);
  assert.match(markerRule[1], /font-variant:\s*inherit;/);
  assert.match(markerRule[1], /font-weight:\s*inherit;/);
  assert.doesNotMatch(markerRule[1], /font-size:\s*0\.8em;/);
  assert.doesNotMatch(markerRule[1], /font-weight:\s*400;/);
});

test("keeps the H7+ heading-link fallback inline", () => {
  assert.match(styles, /\.extended-heading-link-widget/);
  assert.match(styles, /display: inline/);
});
