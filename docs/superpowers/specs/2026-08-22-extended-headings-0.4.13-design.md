# Extended Headings 0.4.13 Design

## Scope

Release 0.4.13 adds four global Style Settings controls, a default-on core
Outline SVG renderer, and the requested maintenance fixes without changing the
plugin's current marker appearance by default.

## Marker typography

- Add one size and one weight control for H1-H12 gutter level markers.
- Add one size and one weight control for H7-H12 ATX hash markers.
- Size controls are relative `em` sliders with a default of `1`, so existing
  parent typography remains authoritative.
- Weight controls default to `inherit` and offer numeric values from 100 to
  900, so current inherited weights remain unchanged until overridden.

## Core Outline inline SVG rendering

- Add **Render inline SVGs in default Outline**, enabled by default.
- Scan raw H1-H12 headings for inline `<svg>...</svg>` fragments.
- Match those headings to the corresponding native Outline labels and append
  the SVGs after the label, preserving the Outline's own label text.
- Convert markup with Obsidian's public `sanitizeHTMLToDom` function and never
  assign raw markup through `innerHTML`.
- Observe each core Outline leaf because Obsidian exposes no public rendering
  hook for this pane. Coalesce mutations, handle leaf creation and note edits,
  and remove all decorations when disabled or unloaded.
- H7-H12 entries remain dependent on the existing default-on core Outline and
  heading-link bridge.

## Maintenance and release

- Use the exact setting description `Show H1–H12 heading markers in the editor gutter.`
- Derive the esbuild banner version from `manifest.json`.
- Replace the unsafe `lines[0]` call chain with a typed first-line fallback.
- Synchronize manifest, package, lockfile, versions map, changelog, README,
  compatibility statements, credits, and release tests at 0.4.13.

## Compatibility boundary

Inline SVG sanitization uses a public Obsidian API. Decorating the core Outline
uses its internal DOM structure and is therefore compatibility-sensitive; the
default-on toggle provides an immediate fallback if Obsidian changes that DOM.
