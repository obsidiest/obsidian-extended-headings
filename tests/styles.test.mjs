import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("exposes complete Style Settings controls for H7 through H12", () => {
  for (let level = 7; level <= 12; level += 1) {
    assert.match(styles, new RegExp(`id: extended-h${level}-weight\\n`));
    assert.match(styles, new RegExp(`id: extended-h${level}-color\\n`));
    assert.match(styles, new RegExp(`id: extended-h${level}-variant\\n`));
    assert.match(styles, new RegExp(`id: extended-h${level}-style\\n`));
    assert.match(styles, new RegExp(`id: extended-h${level}-l\\n`));
  }
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

test("keeps the H7+ heading-link fallback inline", () => {
  assert.match(styles, /\.extended-heading-link-widget/);
  assert.match(styles, /display: inline/);
});
