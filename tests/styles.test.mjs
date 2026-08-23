import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const extension = readFileSync(new URL("../src/editor-extension.ts", import.meta.url), "utf8");

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

test("exposes global marker typography controls with inheritance-preserving defaults", () => {
  assert.match(
    styles,
    /id: extended-heading-level-marker-size\n[\s\S]*?type: variable-number-slider\n[\s\S]*?default: 1\n/,
  );
  assert.match(
    styles,
    /id: extended-heading-level-marker-weight\n[\s\S]*?type: variable-select\n[\s\S]*?default: inherit\n/,
  );
  assert.match(
    styles,
    /id: extended-hash-marker-size\n[\s\S]*?type: variable-number-slider\n[\s\S]*?default: 1\n/,
  );
  assert.match(
    styles,
    /id: extended-hash-marker-weight\n[\s\S]*?type: variable-select\n[\s\S]*?default: inherit\n/,
  );
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
  assert.match(extension, /marker\.setText\(`H\$\{this\.level\}`\);/);
  assert.doesNotMatch(styles, /\.cm-heading-marker::before/);
  assert.match(extension, /marker\.dataset\.level = String\(this\.level\);/);
});

test("preserves the 0.4.14 H1-H9 gutter layout and adjusts only H10-H12", () => {
  const gutterRule = styles.match(
    /\.cm-extended-heading-gutter\.cm-lapel\s*\{([^}]*)\}/s,
  );
  assert.ok(gutterRule);
  assert.match(gutterRule[1], /width:\s*4ch;/);
  assert.doesNotMatch(gutterRule[1], /min-width:/);
  assert.doesNotMatch(gutterRule[1], /width:\s*(?:auto|max-content);/);

  const markerRule = styles.match(/\.cm-heading-marker\s*\{([^}]*)\}/s);
  assert.ok(markerRule);
  assert.doesNotMatch(markerRule[1], /min-width:/);
  assert.doesNotMatch(markerRule[1], /padding(?:-inline-start|-left)?:/);

  const multiDigitRule = styles.match(
    /\.cm-extended-heading-gutter\s+\.cm-heading-marker:is\(\s*\[data-level="10"\],\s*\[data-level="11"\],\s*\[data-level="12"\]\s*\)\s*\{([^}]*)\}/s,
  );
  assert.ok(multiDigitRule);
  assert.match(multiDigitRule[1], /padding-left:\s*0;/);
  assert.match(multiDigitRule[1], /padding-inline-start:\s*0;/);
  assert.doesNotMatch(multiDigitRule[0], /data-level="[1-9]"/);
  assert.match(
    extension,
    /initialSpacer:\s*\(\)\s*=>\s*new HeadingLevelMarker\(12, true\)/,
  );
});

test("supports marker placement and Source Mode visibility settings", () => {
  assert.match(styles, /extended-headings-markers-before/);
  assert.match(styles, /extended-headings-markers-in-source/);
  assert.match(styles, /markdown-source-view\.mod-cm6:not\(\.is-live-preview\)/);
});

test("keeps H7+ ATX markers aligned with their heading typography", () => {
  const markerRule = styles.match(/\.extended-heading-marker\s*\{([^}]*)\}/s);
  assert.ok(markerRule);
  assert.match(markerRule[1], /font-size:\s*var\(--extended-hash-marker-size\);/);
  assert.match(markerRule[1], /font-style:\s*inherit;/);
  assert.match(markerRule[1], /font-variant:\s*inherit;/);
  assert.match(markerRule[1], /font-weight:\s*var\(--extended-hash-marker-weight\);/);
  assert.match(styles, /--extended-hash-marker-size:\s*1em;/);
  assert.match(styles, /--extended-hash-marker-weight:\s*inherit;/);
  assert.doesNotMatch(markerRule[1], /font-size:\s*0\.8em;/);
  assert.doesNotMatch(markerRule[1], /font-weight:\s*400;/);
});

test("applies global hash typography controls to native H1-H6 markers", () => {
  const nativeMarkerRule = styles.match(
    /:is\(\s*\.HyperMD-header-1,[\s\S]*?\.HyperMD-header-6\s*\)\s+\.cm-formatting-header\s*\{([^}]*)\}/s,
  );
  assert.ok(nativeMarkerRule);
  assert.match(nativeMarkerRule[1], /font-size:\s*var\(--extended-hash-marker-size\);/);
  assert.match(nativeMarkerRule[1], /font-weight:\s*var\(--extended-hash-marker-weight\);/);
});

test("applies global typography controls to H1-H12 gutter markers", () => {
  const markerRule = styles.match(/\.cm-heading-marker\s*\{([^}]*)\}/s);
  assert.ok(markerRule);
  assert.match(
    markerRule[1],
    /font-size:\s*var\(--extended-heading-level-marker-size\);/,
  );
  assert.match(
    markerRule[1],
    /font-weight:\s*var\(--extended-heading-level-marker-weight\);/,
  );
  assert.match(styles, /--extended-heading-level-marker-size:\s*1em;/);
  assert.match(styles, /--extended-heading-level-marker-weight:\s*inherit;/);
});

test("keeps the H7+ heading-link fallback inline", () => {
  assert.match(styles, /\.extended-heading-link-widget/);
  assert.match(styles, /display: inline/);
});
