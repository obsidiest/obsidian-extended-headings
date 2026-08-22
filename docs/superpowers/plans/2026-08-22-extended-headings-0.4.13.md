# Extended Headings 0.4.13 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release Extended Headings 0.4.13 with configurable marker typography, safe inline-SVG rendering in Obsidian's core Outline, and the requested maintenance fixes.

**Architecture:** CSS custom properties preserve the existing inherited marker typography while Style Settings exposes four global overrides. A focused `CoreOutlineSvgRenderer` watches core Outline leaves, maps their native labels to raw H1-H12 headings, and appends only SVG nodes produced by Obsidian's sanitizer. Release metadata and regression tests keep the version and build banner synchronized.

**Tech Stack:** TypeScript, Obsidian 1.13 API, CodeMirror 6, CSS Style Settings metadata, Node.js test runner, ESLint, esbuild.

**Spec:** `docs/superpowers/specs/2026-08-22-extended-headings-0.4.13-design.md`

## Global Constraints

- Release version is exactly `0.4.13`; tags are created only after merge.
- Minimum supported Obsidian version remains `1.13.0`.
- Existing default marker appearance must not change.
- Inline SVG markup must pass through `sanitizeHTMLToDom`; raw `innerHTML` is forbidden.
- The core Outline renderer setting is enabled by default and must restore the native DOM when disabled or unloaded.
- All non-documentation changes receive tests that are observed failing before implementation.

---

### Task 1: Marker typography controls and setting copy

**Files:**
- Modify: `tests/styles.test.mjs`
- Modify: `tests/settings.test.mjs`
- Modify: `styles.css`
- Modify: `src/settings.ts`

**Interfaces:**
- Consumes: Existing `.extended-heading-marker` and `.cm-heading-marker` selectors.
- Produces: `--extended-heading-level-marker-size`, `--extended-heading-level-marker-weight`, `--extended-hash-marker-size`, and `--extended-hash-marker-weight`.

- [ ] **Step 1: Write failing Style Settings tests**

```js
test("exposes global marker typography controls with inheritance-preserving defaults", () => {
  assert.match(styles, /id: extended-heading-level-marker-size[\s\S]*?default: 1/);
  assert.match(styles, /id: extended-heading-level-marker-weight[\s\S]*?default: inherit/);
  assert.match(styles, /id: extended-hash-marker-size[\s\S]*?default: 1/);
  assert.match(styles, /id: extended-hash-marker-weight[\s\S]*?default: inherit/);
});
```

- [ ] **Step 2: Run `npm test -- tests/styles.test.mjs tests/settings.test.mjs` and verify the new assertions fail because the variables and exact description do not exist.**

- [ ] **Step 3: Add the four metadata controls and wire the CSS variables**

```css
body {
  --extended-heading-level-marker-size: 1em;
  --extended-heading-level-marker-weight: inherit;
  --extended-hash-marker-size: 1em;
  --extended-hash-marker-weight: inherit;
}

.extended-heading-marker {
  font-size: var(--extended-hash-marker-size);
  font-weight: var(--extended-hash-marker-weight);
}

.cm-heading-marker {
  font-size: var(--extended-heading-level-marker-size);
  font-weight: var(--extended-heading-level-marker-weight);
}
```

- [ ] **Step 4: Change the setting description to exactly `Show H1–H12 heading markers in the editor gutter.` and rerun the focused tests until green.**

- [ ] **Step 5: Commit the independently passing marker-control change.**

### Task 2: Safe core Outline SVG renderer

**Files:**
- Create: `src/core-outline-svg.ts`
- Create: `tests/core-outline-svg.test.mjs`
- Modify: `src/main.ts`
- Modify: `src/settings.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `scanHeadings(text, 1, maximumLevel)`, core Outline leaf containers, `sanitizeHTMLToDom(markup)`.
- Produces: `extractInlineSvgFragments(rawBody)` and `CoreOutlineSvgRenderer` with `start()`, `setEnabled(enabled)`, `refreshAll()`, and `destroy()`.

- [ ] **Step 1: Write failing parser tests using the approved heading example**

```js
test("extracts trailing inline SVG without changing the native label", () => {
  const parsed = extractInlineSvgFragments(
    'book-open-text <svg viewBox="0 0 24 24"><path d="M12 5v16"/></svg>',
  );
  assert.equal(parsed?.label, "book-open-text");
  assert.equal(parsed?.svgMarkup.length, 1);
});
```

- [ ] **Step 2: Run `npm test -- tests/core-outline-svg.test.mjs` and verify it fails because the module does not exist.**

- [ ] **Step 3: Implement the minimal pure extraction and label-matching helpers, then rerun the focused test until green.**

```ts
export interface InlineSvgFragments {
  label: string;
  svgMarkup: string[];
}

export function extractInlineSvgFragments(rawBody: string): InlineSvgFragments | null;
```

- [ ] **Step 4: Add failing integration assertions for a default-on `renderInlineSvgsInDefaultOutline` setting, the core Outline selector, MutationObserver cleanup, `sanitizeHTMLToDom`, and the absence of `.innerHTML`.**

- [ ] **Step 5: Run the focused tests and verify they fail for the missing runtime integration.**

- [ ] **Step 6: Implement `CoreOutlineSvgRenderer` and plugin lifecycle wiring.**

```ts
const fragment = sanitizeHTMLToDom(markup);
const svg = fragment.querySelector("svg");
if (svg) wrapper.append(svg);
```

- [ ] **Step 7: Add `.extended-heading-outline-svg` layout CSS, enable the setting by default, restore decorations on disable/unload, and rerun focused tests plus `npm run check`.**

- [ ] **Step 8: Commit the independently passing Outline SVG change.**

### Task 3: Scorecard warning and dynamic build banner

**Files:**
- Modify: `tests/headings.test.mjs`
- Modify: `tests/release-metadata.test.mjs`
- Modify: `src/headings.ts`
- Modify: `esbuild.config.mjs`

**Interfaces:**
- Consumes: `manifest.json.version` and `scanHeadings` first-line parsing.
- Produces: A typed `firstLine` fallback and a banner generated from the manifest version.

- [ ] **Step 1: Add failing assertions for BOM-prefixed frontmatter, empty input, the typed first-line fallback, and a non-hardcoded manifest-driven banner.**

```js
test("ignores BOM-prefixed YAML frontmatter", () => {
  assert.equal(scanHeadings("\uFEFF---\nkey: value\n---\n####### Real", 7, 12).length, 1);
});
```

- [ ] **Step 2: Run the two focused test files and verify the source/banner assertions fail for the expected reasons.**

- [ ] **Step 3: Introduce `const firstLine = lines[0] ?? "";` before calling string methods and derive the esbuild banner from parsed `manifest.json`.**

- [ ] **Step 4: Run the focused tests, `npm run lint`, `npm run check`, and `npm run build` until green.**

- [ ] **Step 5: Commit the independently passing maintenance fixes.**

### Task 4: Version 0.4.13 documentation and release synchronization

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `versions.json`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `tests/settings.test.mjs`
- Modify: `tests/release-metadata.test.mjs`

**Interfaces:**
- Consumes: The completed runtime and styling behavior from Tasks 1-3.
- Produces: A fully synchronized 0.4.13 release branch ready for a pull request.

- [ ] **Step 1: Change release tests to require 0.4.13 and add README assertions for marker controls and core Outline SVG disclosure.**

- [ ] **Step 2: Run the release tests and verify they fail against the existing 0.4.12 metadata.**

- [ ] **Step 3: Update every release version source, add `"0.4.13": "1.13.0"`, document the changes and compatibility boundary, and add the 0.4.13 attribution line.**

- [ ] **Step 4: Run `npm ci`, `npm run check`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.**

- [ ] **Step 5: Inspect `dist/main.js` to confirm its banner says `v0.4.13`, then commit the release preparation.**

### Task 5: Review and publish the pull request

**Files:**
- Review all changed files.

**Interfaces:**
- Consumes: A clean, fully verified `codex/prepare-0.4.13-release` branch.
- Produces: A pushed branch and draft GitHub pull request targeting `main`; no release tag.

- [ ] **Step 1: Run final verification from a clean dependency install and record the exact results.**

- [ ] **Step 2: Review the complete diff for scope, safety, version synchronization, and accidental generated files.**

- [ ] **Step 3: Push the branch through the connected GitHub account and open a draft pull request titled `Prepare Extended Headings 0.4.13`.**

- [ ] **Step 4: Confirm the remote PR state and report its URL, verification results, compatibility caveat, and post-merge tag command.**
