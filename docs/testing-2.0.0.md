# Extended Headings 2.0.0 validation

## What was reproduced and corrected

The 1.0.1 rename code compared an entire heading fragment against a single heading title. A link such as `[[Target#Parent#Child]]` therefore did not match `Child`. Inspecting Obsidian 1.13.7's native rename implementation showed the same single-fragment comparison. The new handler resolves the path against source headings, identifies the renamed source line, and replaces only the corresponding segment. This also covers that segment in links to descendants. The native command ID/hotkey and localized editor context-menu item use the same handler, with reversible command installation.

The browser checks also reproduced a breadcrumb dismissal after clicking an entry: transferring focus to CodeMirror started the timeout even while the pointer remained in the popover. The dismissal handler now keeps it open under the pointer.

### PR #10 follow-up to `93d842f`

The supplied 120-second screencast was inspected for short/deep ancestor clipping, marker hover activation, and popup access in both panes. A Chromium reproduction using short H1–H12 titles located these causes before the runtime changes:

- A newly created SVG has a default 300×150 viewport. Measuring `content.scrollWidth/scrollHeight` included that SVG and retained its oversized dimensions. An H3 tree with an 85 px layout height consequently reported 150 px of scrollable height, and 283 px of usable width reported 300 px. The initial centering scroll then cut off ancestors. SVG dimensions now start at zero and follow the actual content rectangle; short lists are no longer centered unnecessarily.
- Twelve default one-line rows exceeded the former 360 px maximum. The default is now 400 px; existing custom limits are preserved. A flex layout allocates the title and scrolling region without a hard-coded title-height subtraction.
- Editor activation depended on the event target being a descendant of the gutter. A transparent editor/theme layer over a visible marker bypassed that check. Activation now tests the marker/cell geometry from the left scroller margin through the visible marker edge.
- The document scroll listener dismissed immediately, bypassing the numerical delay. Layout refresh could also dismiss an open popup when ancestor preview recycled its original editor line. The handler now uses the configured delay outside the popup, retains it during popup/gap interaction, and validates the owner note/view rather than the lifetime of a virtualized line element. The gap is checked before another underlying heading can replace the popup.

The focused Node regressions use controlled time to verify 1 and 2.75 second delays, cancellation/re-entry, scrollbar hit coordinates, recycled anchors, true note changes, setting persistence, and marker geometry. Browser checks cover all twelve short hierarchies, a transparent editor overlap in Source and Live Preview, and scrolling/clicking both Editor and Outline popovers at the 0.01-second default plus delayed dismissal at 1 second. These reproduce browser/DOM behavior with an Obsidian workspace mock; the corrected runtime behavior still needs confirmation in Windows Obsidian.

## Automated coverage

Run the standard repository gates:

```sh
npm ci
npm run check
npm run lint
npm test
npm run build
```

The Node tests include service-level rename tests through H1–H12, nested wiki links and embeds, descendant paths, repeated names in separate branches, URL-encoded Markdown destinations, aliases, punctuation, same-note links, open-editor changes, stale cache ranges, native command restoration, and native menu dispatch. Breadcrumb tests cover all setting defaults and dependencies, timeout precedence and fractional values, skipped levels and orphan/root/mixed trees, pointer activation, navigation, Reading registration cleanup, keyboard behavior, mode gates, and window cleanup. The browser fixtures and Obsidian mocks are development-only and do not enter the release bundle.

Optional browser checks use real Chromium layout, pointer/focus events, scrolling, and CodeMirror state/decorations, with a mocked Obsidian workspace:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

`BROWSER_EXECUTABLE` may point to an existing Chromium binary. `PLAYWRIGHT_MODULE` may point to an existing Playwright installation. Optional `OBSIDIAN_CSS` and `THEME_CSS` paths load local Obsidian and theme styles. `BREADCRUMB_SCREENSHOT` saves a diagnostic screenshot.

During preparation, the browser checks passed at viewport widths of **1200 px** and **360 px**, using Chromium **138.0.7204.0**, real CodeMirror, and locally available Obsidian/Minimal styles. They cover the complete H1–H12 ancestor path, wrapped and truncated titles, vertical scrolling, viewport boundaries, inherited and independent marker appearance, click navigation, hover preserving the caret, and dismissal. These fixtures do not run the Obsidian application.

## Checks to perform inside Obsidian

Windows Obsidian 1.13.7 and mobile device behavior have **not** been verified in this development environment. Before promoting the draft:

1. In a test note, create H1 `Parent`, H2 `Child`, and a deeper H7–H12 descendant. Copy links and embeds to each with **Copy fully nested heading paths** enabled. Rename the child from both the plugin and native command/context menu; confirm every affected reference still navigates to the intended heading. Repeat with two branches that contain identically named children and with an aliased link.
2. Hover the complete Hn marker area in Source, Live Preview, and Reading. Check the default Outline too. Enable full-field scope globally and for one pane, and check both label text and the unused part of the row. Confirm hashes alone do not trigger marker scope.
3. Hover ancestor entries, click one, then hover another and dismiss the popover. Check the main heading preview, selected caret position, keyboard navigation, scrolling, long titles, and H10–H12 marker widths. For the follow-up bugs, use short H1–H12 titles and check H3, H5, and H12; move from the left margin across the entire visible marker; scroll and click both pane popovers at 0.01 seconds, then compare leaving them at 1 and 2.75 seconds. Check the renamed timeout subsection, the last-position settings group, and the new mixed-active default in a fresh settings profile (existing saved toggles are retained).
4. Exercise independent Editor/Outline marker and guide toggles. For threading, enable both the global and desired pane's master toggle, then try regular, root-level, orphan, bidirectional, all-branches, and selected-heading modes. Confirm disabled parent settings make their child controls inaccessible.
5. Change shared decoration styles, then enable an independent Editor or Outline Style Settings override. Check light/dark palettes, disabled depth colors, fallback/override colors, line patterns, and precise decimal values.
6. Move a note into a pop-out window; switch notes/windows and modes, resize, close the window, and disable/re-enable the plugin. Check that no popover/highlight/Reading marker remains after cleanup, and that native rename is restored on unload.
7. Compare startup, window activation, scrolling, and typing with 1.0.1 in the large restored workspace. The new breadcrumb has no polling or background vault scan; this is a design constraint, not a measured Windows performance claim. The existing README warning about Outline guide rendering remains applicable.

## Compatibility surfaces

The breadcrumb uses public CodeMirror and Obsidian lifecycle APIs, plus existing editor/Outline DOM conventions. Default Outline source identity comes from the plugin's existing row mapping. Editor marker activation follows existing gutter visibility settings. Reading headings are mapped from their postprocessor source sections and exclude transcluded note contents. Native context-menu adaptation uses a guarded, localized title-element lookup because Obsidian does not expose menu enumeration publicly. These DOM/command compatibility surfaces need application-level checks after Obsidian updates.
