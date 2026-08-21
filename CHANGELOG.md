# Changelog

## Unreleased

- Changed copied heading links and embeds to include the complete ancestor-heading path, allowing repeated heading names in separate sections to resolve to the heading at the cursor.

## 0.4.11

- Made H7–H12 ATX hash markers inherit their heading's configured font weight, matching the native H1–H6 relationship.
- Extended marker inheritance to font style and font variant so all per-level typography remains synchronized.
- Replaced the reused README image with a purpose-built 1200×800 preview showing every extended level from H7 through H12, including an active heading with visible hashes and inactive headings with concealed hashes.
- Added regression coverage preventing fixed marker typography from being reintroduced.
- Retained Obsidian 1.13.7 as the latest audited compatibility target.

## 0.4.10

- Made Live Preview and Source Mode H7–H12 ATX hash markers inherit the configured heading font size instead of applying an additional `0.8em` reduction.
- Changed the default H7–H12 font size to `0.9em` and font weight to `500` for every extended level.
- Retained `normal` as the default H7 font variant and font style.
- Added regression coverage for the marker-size inheritance and Style Settings defaults.
- Retained Obsidian 1.13.7 as the latest audited compatibility target.

## 0.4.9

- Raised the minimum supported Obsidian version to 1.13.0 and replaced the legacy settings renderer with searchable declarative settings.
- Removed `Obsidian` from the manifest description to satisfy Community-directory requirements.
- Replaced native DOM element construction with Obsidian DOM helpers and simplified Reading View insertion.
- Renamed the reindex command ID from `reindex-extended-headings` to `reindex` and its name to `Reindex headings`.
- Removed deprecated slider-tooltip calls and the folding rule's `!important` declaration.
- Expanded README disclosures for vault-wide Markdown enumeration and clipboard writes.
- Added signed GitHub artifact attestations for release assets.
- Made ESLint warnings fail validation so review warnings cannot silently pass CI.
- Retained Obsidian 1.13.7 as the latest audited compatibility target.

## 0.4.8

- Removed all default hotkey assignments in accordance with Obsidian's community-plugin guidelines.
- Retained every command in the command palette and documented the previous bindings as optional user-assigned hotkeys.
- Added regression coverage preventing default hotkeys from being reintroduced unintentionally.
- Retained Obsidian 1.13.7 as the latest audited compatibility target.

## 0.4.7

- Changed public attribution from a personal name to `obsidiest` in the manifest, package metadata, README, and MIT copyright notice.
- Added release-specific model and reasoning-mode provenance.
- Expanded the README with settings, commands, compatibility, privacy, security, file-change, build, and release documentation.
- Audited compatibility with Obsidian 1.13.7, the latest public desktop release when 0.4.7 was prepared.
- Added a complete changelog and repository validation/release workflows.
- Moved production build output to `dist/main.js` and enabled production minification so compiled output is distributed as a release asset rather than committed at the repository root.
- Corrected the minimum supported Obsidian version from 1.5.0 to 1.7.2 to match the `Workspace.revealLeaf` API used by the Extended Outline.
- Moved the rename-modal input width from an inline JavaScript style to plugin CSS without changing its appearance.
- Added no runtime behavior changes.

## 0.4.6

- Prioritized active-document H7–H12 indexing before the background vault scan.
- Preserved parentheses, colons, and other punctuation in default Outline labels.

## 0.4.5

- Reindexed extended headings after both workspace-layout readiness and metadata-cache resolution so the default Outline populates on startup.

## 0.4.4

- Restored true H7–H12 hierarchy in Obsidian's default Outline.
- Added an independent Live Preview fallback for heading-subpath links on H7–H12 lines.

## 0.4.3

- Temporarily clamped extended cache levels to the native H1–H6 range while investigating heading-subpath links; superseded by 0.4.4.

## 0.4.2

- Audited compatibility with Obsidian 1.13.6 and documented the latest compatibility target separately from the minimum supported version.

## 0.4.1

- Added heading- and block-specific link/embed actions to the editor context menu.

## 0.4.0

- Added H1–H12-aware heading rename, copy-link, and copy-embed commands with requested default hotkeys.
- Added ordinary-block support with automatic block-ID reuse or creation.

## 0.3.1

- Made H12 the default maximum.
- Enabled inactive-line Live Preview hash concealment by default.
- Replaced the release-note-like manifest description with a durable plugin summary.

## 0.3.0

- Added H1–H12 heading shifting, set-heading and contextual insertion commands, configurable lower limits, optional Tab behavior, formatting cleanup, and child-list handling.
- Added Lapel-compatible H1–H12 editor-gutter markers.

## 0.2.1

- Kept H7–H12 hash markers visible by default while retaining concealment as an option; this default was later changed in 0.3.1.

## 0.2.0

- Added per-level H7–H12 Style Settings controls for size, weight, color, variant, style, and divider lines.
- Added automatic Style Settings rescanning.

## 0.1.0

- Added initial H7–H9 parsing, editor styling, Reading View rendering, folding, an Extended Outline, and experimental core Outline/heading-link integration.
