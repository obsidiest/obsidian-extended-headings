# 2.1.0 validation

Based on the released 2.0.0 tree at `e04de845d4866c749abf1f7ec45b01edf1de11e0`. Continued from draft PR #11 at `a35d13f9062aa5676458bd448ae14212f511a036`; the existing embed-marker and breadcrumb-navigation work is retained.

## Behavior and implementation

The released breadcrumb scrolled on hover without restoring the previous view. The two new navigation toggles separate temporary preview from retaining/applying navigation on timed dismissal. Before-timeout preview defaults on; after-timeout navigation defaults off. Both belong to the new Heading Hover Breadcrumb Navigation subsection and are disabled under the feature master toggle. Existing settings are preserved when the new defaults are loaded.

Preview restoration uses CodeMirror's scroll snapshot for Source/Live Preview and Obsidian's Reading scroll API for Reading mode. Outline ancestor scroll positions are recorded only when previewing an Outline breadcrumb. No additional timers, polling, document scans, or background indexing were added. The existing mode-aware dismissal timer applies deferred navigation only when it actually expires; Escape and lifecycle cleanup cannot trigger it. A source document, file, mode, or hidden-view change invalidates restoration.

Clicks always commit their heading. Subsequent hover previews return to that clicked heading instead of undoing the click. A Chromium regression reproduced a click/hover in the same frame: CodeMirror's pending click scroll had not yet reached the DOM, so a fresh snapshot still captured the preceding preview. Restoration now uses the committed source line after a click. Clicking outside the popover cancels queued hover work so it cannot override the user's next main-UI interaction. Hover highlighting, threading, keyboard navigation, and independent popover scrolling remain available with both navigation toggles disabled.

The embed renderer previously created an extended heading and folding button without a dedicated heading-level marker. It now creates an H7–H12 label whose visibility is restricted to internal embeds and controlled by the existing editor-marker setting. The marker, folding control, and title occupy independent grid columns. Processing detached fragments before mounting the embed is supported. Marker text does not enter the heading's `data-heading` identity, and link/inline markup is preserved. Embeds do not activate breadcrumbs against the containing note's source lines.

### Rename dialog

The supplied screenshots show the plugin's rename field remaining on one line before and after a click, while the native dialog with the plugin disabled expands after clicking. The shared rename modal in `src/rename-heading.ts` created an `input type="text"` with only a width rule. That element cannot wrap. Both the plugin command and the intercepted native command/context menu use that modal, explaining the native-action difference.

The new main setting **Expand long heading titles in rename dialog** defaults on. It creates a one-row, soft-wrapping textarea and measures its content plus borders immediately and again in the opening animation frame, including when Obsidian attaches the modal after `onOpen`. Input events and width/window changes update its height; a width guard avoids ResizeObserver feedback loops. The owning document/window supplies layout, focus, observers, and cleanup. Very tall titles scroll within a viewport-relative height limit so the buttons remain reachable.

Enter submits instead of inserting a newline; IME confirmation and held-key repeats do not submit. The existing rename validation still rejects actual line breaks. The field preserves the original Markdown text, and disabling the toggle retains a single-line input. Each dialog reads the current setting, and closing cancels pending focus work and disconnects layout observers.

## Automated checks

Run `npm run check`, `npm run lint`, `npm test`, and `npm run build`.

The original preparation notes reported 187 local tests and 280 Chromium assertions with Obsidian/Minimal styles. The actual [GitHub Validate run for a35d13f](https://github.com/obsidiest/obsidian-extended-headings/actions/runs/34801827327) passed 186/187 tests: a stale settings-description assertion still expected the text before linked embeds were added. The continuation corrects that exact assertion.

Current results are recorded by the [PR #11 checks](https://github.com/obsidiest/obsidian-extended-headings/pull/11/checks). CI now runs the existing browser suite as well as type checking, zero-warning lint, unit/DOM tests, and the production build. Playwright 1.63.0 is installed in a separate temporary directory, leaving the plugin dependency lockfile unchanged. CI browser checks use the plugin stylesheet and a small fixture stylesheet; they do not include the user's Minimal theme or a live Obsidian installation.

The focused regressions cover:

- Rename dialogs at every level H1–H12, default and saved toggle values, initial sizing before a click, attachment timing, growth/shrinkage, width changes, owner-window focus, Enter/repeat/IME handling, duplicate-submit prevention, and cancellation cleanup. JSDOM injects layout measurements; those tests do not establish pixel geometry.
- Browser measurements of the actual rename textarea before a click, title edits, narrow layouts, long unbroken titles, bounded scrolling, keyboard submission, and the disabled single-line mode.
- All four navigation combinations in both panes across Source, Live Preview, and Reading mode, with unchanged caret positions.
- Exact settings names/defaults, parent dependencies, persistence, fractional per-mode timeout overrides, zero timeout, cancellation/re-entry, and no navigation on merely opening a popover.
- Click precedence, preview after clicking, and cancellation on Escape, blur, settings changes, unload, note/mode/document changes, or a hidden owner view.
- Embedded H7–H12 labels with and without folding, the configured maximum heading level, retained link markup, stable heading identity, and repeated postprocessing without duplicate markers.

`npm run test:browser` uses Chromium and real CodeMirror with development-only Obsidian workspace and modal-shell mocks. It checks actual preview/restore scroll positions after the original heading leaves CodeMirror's viewport, click/hover timing, and the H7–H12 embed marker/fold/title geometry at 1200 px and 360 px viewport widths. Existing 2.0.0 clipping, marker activation, popover timeout, and scroll tests are retained. See [the browser setup instructions](testing-2.0.0.md#automated-coverage) for optional local dependency paths.

## Remaining application checks

This environment does not run the user's Windows Obsidian workspace or Obsidian Mobile. Before release, verify:

1. The supplied long-title rename case at all heading levels, immediately on opening and while editing, with the default-on toggle and with it disabled. Test the plugin command and native hotkey/context-menu routes, Enter, Escape/Cancel, narrow and pop-out windows, and IME text entry.
2. Both navigation toggles in each pane and viewing mode, including keyboard focus, click followed by hover, Escape, and different dismissal delays.
3. Heading and full-note embeds containing H7–H12, especially H10–H12, with folding and marker visibility on/off. Check the supplied overlap case and a detached/pop-out pane.
4. Switching notes/modes/windows during a preview, editing the source, and independently switching an Outline pane's note. Confirm no delayed jump into unrelated content.

The existing README performance warning remains in place; these changes make no large-workspace performance claim.
