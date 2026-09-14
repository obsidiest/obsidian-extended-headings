# 2.1.0 validation

Based on the released 2.0.0 tree at `e04de845d4866c749abf1f7ec45b01edf1de11e0`.

## Behavior and implementation

The released breadcrumb scrolled on hover without restoring the previous view. The two new navigation toggles separate temporary preview from retaining/applying navigation on timed dismissal. Before-timeout preview defaults on; after-timeout navigation defaults off. Both belong to the new Heading Hover Breadcrumb Navigation subsection and are disabled under the feature master toggle. Existing settings are preserved when the new defaults are loaded.

Preview restoration uses CodeMirror's scroll snapshot for Source/Live Preview and Obsidian's Reading scroll API for Reading mode. Outline ancestor scroll positions are recorded only when previewing an Outline breadcrumb. No additional timers, polling, document scans, or background indexing were added. The existing mode-aware dismissal timer applies deferred navigation only when it actually expires; Escape and lifecycle cleanup cannot trigger it. A source document, file, mode, or hidden-view change invalidates restoration.

Clicks always commit their heading. Subsequent hover previews return to that clicked heading instead of undoing the click. A Chromium regression reproduced a click/hover in the same frame: CodeMirror's pending click scroll had not yet reached the DOM, so a fresh snapshot still captured the preceding preview. Restoration now uses the committed source line after a click. Clicking outside the popover cancels queued hover work so it cannot override the user's next main-UI interaction. Hover highlighting, threading, keyboard navigation, and independent popover scrolling remain available with both navigation toggles disabled.

The embed renderer previously created an extended heading and folding button without a dedicated heading-level marker. It now creates an H7–H12 label whose visibility is restricted to internal embeds and controlled by the existing editor-marker setting. The marker, folding control, and title occupy independent grid columns. Processing detached fragments before mounting the embed is supported. Marker text does not enter the heading's `data-heading` identity, and link/inline markup is preserved. Embeds do not activate breadcrumbs against the containing note's source lines.

## Automated checks

Run `npm run check`, `npm run lint`, `npm test`, and `npm run build`.

During preparation, type checking, lint with zero warnings, **187 automated tests**, **280 Chromium assertions**, the production build, and whitespace checks passed. The browser ran Chromium **138.0.7204.0** with locally available Obsidian/Minimal styles. These results cover the fixtures below, not a live Obsidian installation.

The focused regressions cover:

- All four navigation combinations in both panes across Source, Live Preview, and Reading mode, with unchanged caret positions.
- Exact settings names/defaults, parent dependencies, persistence, fractional per-mode timeout overrides, zero timeout, cancellation/re-entry, and no navigation on merely opening a popover.
- Click precedence, preview after clicking, and cancellation on Escape, blur, settings changes, unload, note/mode/document changes, or a hidden owner view.
- Embedded H7–H12 labels with and without folding, the configured maximum heading level, retained link markup, stable heading identity, and repeated postprocessing without duplicate markers.

`npm run test:browser` uses Chromium and real CodeMirror with the development-only Obsidian workspace mock. It checks actual preview/restore scroll positions after the original heading leaves CodeMirror's viewport, click/hover timing, and the H7–H12 embed marker/fold/title geometry at 1200 px and 360 px viewport widths. Existing 2.0.0 clipping, marker activation, popover timeout, and scroll tests are retained. See [the browser setup instructions](testing-2.0.0.md#automated-coverage) for optional local dependency paths.

## Remaining application checks

This environment does not run the user's Windows Obsidian workspace or Obsidian Mobile. Before release, verify:

1. Both navigation toggles in each pane and viewing mode, including keyboard focus, click followed by hover, Escape, and different dismissal delays.
2. Heading and full-note embeds containing H7–H12, especially H10–H12, with folding and marker visibility on/off. Check the supplied overlap case and a detached/pop-out pane.
3. Switching notes/modes/windows during a preview, editing the source, and independently switching an Outline pane's note. Confirm no delayed jump into unrelated content.

The existing README performance warning remains in place; these changes make no large-workspace performance claim.
