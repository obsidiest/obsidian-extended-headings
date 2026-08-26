# Changelog

## 0.4.17

- Renamed the editor setting to **Show Editor Gutter heading level markers**, preserved existing preferences through migration, and added the default-on **Show Outline pane heading level markers** toggle for H1–H12 labels.
- Added default-on measured static tree indentation guides to Obsidian's default Outline, with root, nested, and orphan connectors.
- Added default-on Outline heading threading with independent active-path and all-branches behavior for individual H1 trees, the virtual root-level H1 tree, orphan H2–H12 trees, and a combined root-level ⟺ orphan tree. Active paths default on; all-branches modes default off.
- Added the default-off **Active Selected Heading Threading** override, which activates every enabled threading submode from Obsidian's selected Outline heading instead of pointer hover.
- Expanded each Outline heading's threading hover target across the full pane width by adapting the measured vertical-row hit testing proven in List Tree Indentation Guides 1.0.6.
- Fixed missing Outline heading-level markers and related decorations for headings made entirely from internal links by normalizing rendered link labels and retaining a source-order mapping fallback for complete Outlines.
- Added an **Editor Gutter** Style Settings section with independently configurable heading-level-marker and hash-marker font variants, both preserving their inherited appearance by default.
- Added default Outline heading and marker typography/appearance controls plus complete static-guide and thread appearance, geometry, pattern, depth-color, fallback, and override controls to Style Settings. Outline heading-level markers default to **All small caps**.
- Extended precise numerical input support to all 38 Style Settings sliders and all four inherited numerical weight selectors.
- Consolidated core Outline SVGs, markers, guides, and threads into one sanitized, reversible, animation-frame-coalesced renderer.
- Retained Obsidian 1.13.7 as the latest audited compatibility target.

## 0.4.16

- Restored the exact 0.4.14 shared gutter layout for active and inactive H1–H9 markers, correcting the clipping and indentation regression introduced in 0.4.15.
- Fixed active and inactive H10–H12 markers being clipped to `H1` by neutralizing Minimal's additional marker padding only for those three-character labels.
- Added regression coverage that locks H1–H9 to the established four-character gutter and confines the compatibility adjustment to H10–H12.
- Retained Obsidian 1.13.7 as the latest audited compatibility target.

## 0.4.15

- Fixed active and inactive H10–H12 editor-gutter markers still appearing as `H1` by replacing Lapel's two-character fixed gutter width with intrinsic sizing for the complete label.
- Allowed arbitrary in-range numerical values in every precise Style Settings input, including values between a slider's predefined ticks.
- Allowed arbitrary in-range values in both global marker-weight boxes while retaining the existing **Inherit** dropdown option and restoring custom persisted weights when settings are reopened.
- Preserved incomplete decimal text such as `1.` and the caret position while typing instead of immediately rewriting the input.
- Retained Obsidian 1.13.7 as the latest audited compatibility target.

## 0.4.14

- Fixed H10–H12 editor-gutter markers being clipped to `H1` by rendering their complete level labels as measured DOM text.
- Extended the global hash marker size and weight controls to native H1–H6 headings, so all four global marker typography controls now apply across H1–H12.
- Fixed default Outline rendering for inline SVGs enclosed in trailing parentheses and preserved each SVG's parenthesized placement.
- Added synchronized precise number inputs for every numerical Style Settings control: all fourteen sliders and both inherited global weight selectors.
- Preserved transient incomplete, out-of-range, and off-step typing until editing ends, matching the corrected Quick Switcher Advanced 0.5.2 interaction.
- Retained Obsidian 1.13.7 as the latest audited compatibility target.

## 0.4.13

- Added global Style Settings controls for heading level marker size and weight and H7–H12 hash marker size and weight, while preserving the current inherited appearance by default.
- Added the default-on **Render inline SVGs in default Outline** setting for sanitized inline SVGs in H1–H12 headings; H7–H12 headings require the core integration bridge.
- Changed the **Show heading markers** description to remove the obsolete Lapel-compatibility wording.
- Made the production-build banner derive its version from `manifest.json`.
- Resolved the Community-directory scorecard's unsafe-call warning with a typed first-line fallback in the heading scanner.
- Retained Obsidian 1.13.7 as the latest audited compatibility target.

## 0.4.12

- Changed copied heading links and embeds to include the complete ancestor-heading path, allowing repeated heading names in separate sections to resolve to the heading at the cursor.
- Added the default-on **Copy fully nested heading paths** setting so users can restore the previous shorter, target-heading-only references for both commands and context-menu actions.
- Retained Obsidian 1.13.7 as the latest audited compatibility target.

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
