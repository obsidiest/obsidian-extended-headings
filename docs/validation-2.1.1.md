# 2.1.1 validation

Based on the actual `main` at `88197ab619a8c2cb82873f5cb1026ee5ebed7e58`. PR #11 and the 2.1.0 embed fixes were already merged; no open PR existed when this work resumed. The four new screenshots were inspected before source edits. This change targets the new rich-label, Outline-guide, and Style Settings color reports.

## Causes located before editing

- **Breadcrumb content:** the label was assigned `textContent` after a normalizer stripped formatting and SVG. No Markdown rendering call existed. A regression asserting intact math, SVG, and Markdown delegation failed against that code.
- **Outline content and guides:** math-only formatting was omitted by the Markdown detection whitelist. In partial Outlines, SVG-only headings normalized to an empty match key, and core labels without math delimiters could fail to match their source heading. The static-guide fallback treated every unmeasured parent as scrolled above the viewport. Focused regressions failed for math/SVG matching and for unmatched, hidden, and below-viewport parents; the known above-viewport control passed. An SVG-only label also needed its literal source hidden before appending the sanitized icon.
- **Color dialog:** Extended Headings still used the original Style Settings Pickr controls, with no awaited save integration. The unmodified Style Settings 1.0.9 manager reproduced `unknown format` errors for saved `#NaNNaNNaN`, `#`, and empty colors; it parses every stored themed color during CSS generation. These are demonstrated failure modes, not a claim that those exact values were present in the user's vault. The user's exact Obsidian picker session was not available to reproduce.

## Implementation

Breadcrumbs now delegate intact label source to Obsidian's `MarkdownRenderer.render` with the owning file path and loaded render components. Note embeds stay compact links. The popup uses focusable tree rows that can contain real links; heading clicks, Enter/Space, arrow keys, hover behavior, and Escape remain separate from link activation. Dismissal unloads children and releases callbacks registered by late rendering. Failed rendering leaves a text fallback. Layout checks exposed the button-to-div change losing the browser's border-box sizing; the row now declares it explicitly.

Outline matching accepts core math labels without dollar delimiters and preserves SVG-only identity. SVG source is reversibly hidden whether or not Markdown rendering is enabled. Static guides only extend from the viewport boundary if the corresponding parent DOM row has a nonzero height and is actually above that boundary. Unknown/hidden parents use the short local branch start. This replaces the earlier assumption that every missing measurement meant clipping.

The color dialog is adapted from **List Tree Indentation Guides 2.0.2**, commit `1c335fa00390666e58cc8ee86c514411eb3917c1`, including separate themed buttons, native dialog, hex/RGBA entry, Default/Cancel/Save, awaited manager saving, failure feedback, malformed-color repair, and document/unload cleanup. All 55 Extended Headings color controls retain their existing `extended-headings-style@@…@@light/dark` keys. Its 11 inherited-default controls require an additional adaptation: clearing an override deletes the saved key, since the schema placeholder `#` cannot be persisted as a color. Failed storage calls restore previous in-memory values and keep the dialog open. The original picker presentation is restored on unload or when the manager is unavailable.

Only this plugin's known malformed saved color values are repaired. Valid imported RGB/HSL/named colors and other plugins' settings are preserved. The adapter feature-detects the Style Settings manager; it does not patch Pickr or replace the other plugin's settings file.

## Automated checks

Run:

```sh
npm ci
npm run check
npm run lint
npm test
npm run build
npm run test:browser
```

For browser checks, install Playwright separately and set `PLAYWRIGHT_MODULE` to that installation if it is outside the repository. `BROWSER_EXECUTABLE` can point to an available Chromium executable. CI installs its own Playwright/browser in a temporary directory; the plugin dependency lockfile is unchanged apart from the version.

Local checks use Chromium **134.0.6998.35**, the plugin stylesheet, and fixture styles. They do **not** load the user's Minimal theme or an Obsidian installation. The existing suite covers **808 browser assertions** at 1200 px and 360 px widths. The new suite covers **10 browser scenarios**, including rich source delegation in Source/Live Preview/Outline, rendered DOM from a host adapter, links, keyboard navigation, asynchronous cleanup/failure, all 55 colors in both themes, inherited reset, invalid values, awaited storage/error recovery, narrow layout, and an additional owner document. Unit/DOM checks also cover Reading-mode delegation, actual partial-Outline decoration and restoration, and all four parent-geometry cases.

Final local results: type checking, zero-warning lint, all **237 unit/DOM tests**, the production build, all 808 existing browser assertions, and all 10 new browser scenarios passed.

The Markdown adapter injects representative math/SVG/link output; it does **not** run MathJax or Obsidian's renderer. JSDOM guide tests supply explicit rectangles. Passing these tests establishes the integration and geometry decisions, not actual rendering in Obsidian.

### Actual Style Settings manager integration

The optional integration test bundles the **unmodified** `CSSSettingsManager` from Style Settings 1.0.9, commit `4ebec6ae0131a9d5e8307bb5e26d59db5ba2e81c`, with its real `chroma-js` 2.4.2 dependency. It uses the themed schema from this plugin's actual stylesheet. Only Obsidian storage/workspace events and unused import/export dialogs are adapted.

```sh
EXTENDED_STYLE_SETTINGS_SOURCE=/path/to/obsidian-style-settings \
EXTENDED_CHROMA_JS=/path/to/node_modules/chroma-js \
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
BROWSER_EXECUTABLE=/path/to/chromium \
npm run test:style-settings
```

This test first reproduces the malformed-color failure, then verifies **110 saves** (55 controls × two themes), the resulting computed CSS values, dialog closure, an inherited reset, and reloading persisted settings. Its persistence adapter uses browser local storage, not an Obsidian vault or disk `saveData` implementation. These integration checks passed locally.

## Still requires Obsidian application validation

No actual Obsidian Desktop/Mobile runtime verification was performed for 2.1.1. Before releasing, repeat the supplied screenshots' cases in the user's Obsidian setup, including Minimal, using [the rich-heading fixture](../tests/fixtures/rich-headings.md):

1. Open breadcrumbs from the editor and Outline in Source, Live Preview, and Reading. Compare LaTeX, the SVG-only heading, formatting, and internal links with the note; check wrapping, link clicks, keyboard navigation, and reopening after dismissal.
2. Filter/collapse and scroll the Outline around math, SVG-only, and repeated headings. Confirm markers and labels render and static guides do not extend above an unmatched/hidden parent. A genuinely scrolled-off parent should retain its clipped continuation.
3. In Style Settings, save light and dark colors for a heading, a marker, a guide, and a thread; confirm the relevant UI updates and the dialog closes. Close/reopen Settings and restart Obsidian to confirm persistence. Test Default on inherited and concrete fields, Cancel/Escape, exported/imported colors, and a popout window.
4. Recheck the 2.1.0 embed/rename/navigation cases and disable/re-enable the plugin. Confirm original Style Settings controls return after disabling it.

Build success and the automated results above are not described as runtime fixes verified in Obsidian.
