# 2.1.2 validation

This change starts from `main` at `463449a1ba6143a0e4def2ca33145f8a0885b24c`, after PR #12 was merged. The two supplied screenshots show `Testing1` in a Heading Hover Breadcrumb and the Outline, while the editor renders the footnote as a superscript. The affected Outline row also lacks its heading-level marker. The requested compatibility target is Obsidian 1.14.4.

## Cause and approach

The unmodified Markdown parser extracted from the official Obsidian 1.14.4 `app.js` reproduces the missing document context: `Testing[^1]` alone renders as `<p>Testing1</p>`. Supplying a definition produces `sup.footnote-ref` and its anchor. Both plugin surfaces previously rendered the heading body in isolation, without that definition. Outline's rich-Markdown detector also omitted footnote-only titles, and filtered Outline matching did not associate the flattened label with its source heading.

The follow-up screenshots for commit `724482f` exposed a separate mistake: explicit identifiers `1, 6, 4, 3, 5` in the editor became `1, 2, 3, 4, 5` in breadcrumbs and Outline. The first candidate deliberately allocated ordinals from reference order, and its tests incorrectly treated native Reading HTML numbering as the expected editor labels. A synthetic note with the reported sequence reproduced that exact result before this correction; six breadcrumb/Outline regressions failed against `724482f`.

The shared `HeadingFootnotes` helper uses the owning note's public `footnotes` and `footnoteRefs` metadata, checked against the current source offsets. It supplies placeholder definitions for referenced IDs to the native renderer and removes the generated definition section. Explicit references now display their written identifier directly, preserving case, leading zeroes, and the same label on repeated references, without adding occurrence suffixes. Reference order is used only for inline notes, which have no written identifier and retain their existing native ordinal. Definition bodies and embeds are not rendered inside a label. Without usable reference metadata, a known definition's numeric identifier still cannot become a fragment-local ordinal; dead fragment links are removed. Escaped syntax, inline code, and undefined references retain native behavior.

Outline now includes footnote-only headings in Markdown rendering and accepts native flattened labels, including inline-note text, when matching filtered rows. Rendered templates remain reusable; the source identifier is applied separately to each occurrence. Original Outline text returns when decorations are cleared. Outline row navigation remains unchanged.

Open breadcrumbs refresh when matching file metadata changes, preserving their existing rows, selection, and navigation state. Each render owns a separate child container so late output from an unloaded renderer cannot overwrite refreshed content. Popover resize/leave events also check whether the pointer remains on the source heading before starting dismissal. Superscript reference tokens do not split across wrapped lines.

## Automated checks

```sh
npm ci
npm run check
npm run lint
npm test
npm run build
npm run test:browser
```

Local results:

- Type checking, zero-warning lint, and the production build pass.
- **254 unit/DOM tests** pass. Footnote coverage includes the reported `1, 6, 4, 3, 5` sequence, named/repeated identifiers, mixed-case spelling, leading zeroes, H1–H12, preceding references elsewhere in the note, inline notes, undefined/escaped/code references, stale metadata, filtered and complete Outlines, marker/source identity, template reuse, restoration, refresh/navigation state, and late rendering cleanup.
- The existing **808 Chromium assertions** and **10 rich-content/color scenarios** pass.
- **12 footnote browser scenarios** pass at 1200 px and 360 px across Source, Live Preview, and Outline entry points, including **228 superscript geometry checks**, metadata delivery after opening, definition removal, and breadcrumb link dispatch. Both the original H1–H12 fixture and the reported identifier sequence are checked. Reading-mode integration is covered by unit/DOM tests; its footnote appearance still requires application testing.

Browser checks use Chromium **134.0.6998.35** with host adapters and the plugin stylesheet. The footnote suite also passed using the official 1.14.4 application CSS and live output from its extracted parser. The narrower checks distinguish wrapped text-line rectangles from the whole text node's bounding box, verify small/raised references and clipping, and prohibit splitting a reference across lines.

The checked-in JSON fixtures contain native parser/metadata output for [H1–H12 test Markdown](../tests/fixtures/footnote-headings.md) and [the reported identifier sequence](../tests/fixtures/footnote-identifiers.md), plus separate expected labels from the written identifiers. Native Reading labels are recorded separately as `nativeRefs`; they are not used as expected explicit-reference labels. Tests also hard-code the reported sequence and repeated/named/leading-zero cases independently of the fixture generator. CI uses the captured output. For local comparison against the extracted parser and application CSS:

```sh
OBSIDIAN_APP_JS=/path/to/obsidian-1.14.4/app.js npm test

PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
BROWSER_EXECUTABLE=/path/to/chromium \
OBSIDIAN_APP_JS=/path/to/obsidian-1.14.4/app.js \
OBSIDIAN_APP_CSS=/path/to/obsidian-1.14.4/app.css \
node tests/browser/heading-footnotes.mjs
```

The extraction helper checks the `app.js` SHA-256, `958ce57fe22f87fdf121546e46dfccd9c8ee971ce3fd8f801d60d4ece39a2df9`. No Obsidian application source is committed. This executes its parser and metadata functions, **not** the complete application, sanitizer, postprocessors, native Outline, or user's Minimal theme. The browser host adapts storage/workspace APIs and link opening; an asserted link dispatch is not proof of navigation inside Obsidian.

## Pending Obsidian application checks

No actual Windows Obsidian 1.14.4 or mobile runtime verification was performed. Before release, test the original note and the synthetic fixture with the user's Minimal and Style Settings setup:

1. Compare the original `Testing[^1]` heading in the editor, Heading Hover Breadcrumb, and Outline. Expect a real superscript and the Outline heading-level marker. Confirm the Outline Markdown-rendering option is enabled.
2. Repeat in Source, Live Preview, and Reading mode, opening breadcrumbs from the editor and Outline. In the identifier fixture, the first five Outline labels must show `[1], [6], [4], [3], [5]`; the H12 breadcrumb chain must show `[6], [4], [3]`. Repeated references keep `[6]`, named references retain `[MixedCase]` or `[mixedcase]` as written, and `006` stays `[006]`. In the H1–H12 fixture, H1 is `[h1]` and the H11 `Testing` heading is `[1]`, regardless of earlier references.
3. Filter, collapse, and reopen the Outline. Verify labels, markers, source navigation, and guides remain aligned, including duplicate heading text.
4. Open a breadcrumb while metadata is updating; edit an identifier, then add or move an unrelated earlier footnote reference and reopen it. Check that explicit identifiers match the source and are not renumbered by unrelated references. Check selection/navigation behavior during refresh, wrapped labels, narrow panes, and popout windows.
5. Click a breadcrumb footnote link and confirm navigation to its definition. Check Escape, hover dismissal, normal heading navigation, and disabling/re-enabling the plugin.

Build and automated success are not treated as application runtime verification. Version metadata is 2.1.2; the minimum remains 1.13.0 because this change needs no newer runtime API.
