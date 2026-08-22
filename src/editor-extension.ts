import { foldService } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  gutter,
} from "@codemirror/view";
import {
  type App,
  Component,
  MarkdownRenderer,
  editorInfoField,
  editorLivePreviewField,
} from "obsidian";
import { scanHeadings } from "./headings";
import type { ExtendedHeadingsSettings } from "./settings";
import { scanHeadingSubpathLinks } from "./wiki-links";

const renderedLinkComponents = new WeakMap<HTMLElement, Component>();

class ExtendedHeadingLinkWidget extends WidgetType {
  constructor(
    private readonly raw: string,
    private readonly sourcePath: string,
    private readonly componentApp: App,
  ) {
    super();
  }

  eq(other: ExtendedHeadingLinkWidget): boolean {
    return other.raw === this.raw && other.sourcePath === this.sourcePath;
  }

  toDOM(): HTMLElement {
    const container = createSpan({ cls: "extended-heading-link-widget" });
    const component = new Component();
    component.load();
    renderedLinkComponents.set(container, component);

    void MarkdownRenderer.render(
      this.componentApp,
      this.raw,
      container,
      this.sourcePath,
      component,
    )
      .then(() => {
        if (renderedLinkComponents.get(container) !== component) return;
        const paragraph = container.querySelector(":scope > p");
        if (paragraph && container.children.length === 1) {
          paragraph.replaceWith(...Array.from(paragraph.childNodes));
        }
      })
      .catch(() => {
        if (renderedLinkComponents.get(container) === component) {
          container.textContent = this.raw;
        }
      });
    return container;
  }

  destroy(dom: HTMLElement): void {
    renderedLinkComponents.get(dom)?.unload();
    renderedLinkComponents.delete(dom);
  }
}

function selectionTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

class HeadingLevelMarker extends GutterMarker {
  constructor(readonly level: number, readonly spacer = false) {
    super();
  }

  eq(other: GutterMarker): boolean {
    return other instanceof HeadingLevelMarker && other.level === this.level && other.spacer === this.spacer;
  }

  toDOM(): HTMLElement {
    const marker = createSpan({
      cls: `cm-heading-marker${this.spacer ? " cm-heading-marker-spacer" : ""}`,
    });
    marker.setText(`H${this.level}`);
    marker.dataset.level = String(this.level);
    if (!this.spacer) marker.setAttribute("aria-label", `Heading level ${this.level}`);
    return marker;
  }
}

function buildHeadingMarkers(view: EditorView, maximumLevel: number) {
  const builder = new RangeSetBuilder<GutterMarker>();
  for (const heading of scanHeadings(view.state.doc.toString(), 1, maximumLevel)) {
    const line = view.state.doc.line(heading.line + 1);
    builder.add(line.from, line.from, new HeadingLevelMarker(heading.level));
  }
  return builder.finish();
}

function buildDecorations(view: EditorView, getSettings: () => ExtendedHeadingsSettings): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const settings = getSettings();
  const headings = scanHeadings(view.state.doc.toString(), 7, settings.maximumLevel);
  const livePreview = view.state.field(editorLivePreviewField, false) ?? false;
  const editorInfo = view.state.field(editorInfoField, false);
  const sourcePath = editorInfo?.file?.path ?? "";

  for (const heading of headings) {
    const line = view.state.doc.line(heading.line + 1);
    builder.add(
      line.from,
      line.from,
      Decoration.line({
        attributes: {
          class: `extended-heading-line extended-heading-${heading.level}`,
          "data-extended-heading-level": String(heading.level),
        },
      }),
    );

    if (heading.bodyFrom > heading.markerFrom) {
      builder.add(
        heading.markerFrom,
        heading.bodyFrom,
        Decoration.mark({
          class: settings.hideMarkersInLivePreview
            ? "extended-heading-marker extended-heading-marker-hideable"
            : "extended-heading-marker",
        }),
      );
    }
    if (livePreview && editorInfo) {
      for (const link of scanHeadingSubpathLinks(heading.rawBody, heading.bodyFrom)) {
        if (selectionTouches(view.state, link.from, link.to)) continue;
        builder.add(
          link.from,
          link.to,
          Decoration.replace({
            widget: new ExtendedHeadingLinkWidget(link.raw, sourcePath, editorInfo.app),
          }),
        );
      }
    }
    if (heading.to > heading.bodyTo) {
      builder.add(
        heading.bodyTo,
        heading.to,
        Decoration.mark({ class: "extended-heading-marker extended-heading-closing-marker" }),
      );
    }
  }

  return builder.finish();
}

function foldingRange(state: EditorState, lineStart: number, lineEnd: number, maximumLevel: number) {
  const headings = scanHeadings(state.doc.toString(), 1, maximumLevel);
  const currentIndex = headings.findIndex(
    (heading) => heading.level >= 7 && heading.from >= lineStart && heading.from <= lineEnd,
  );
  if (currentIndex < 0) return null;

  const current = headings[currentIndex];
  const next = headings.slice(currentIndex + 1).find((heading) => heading.level <= current.level);
  const to = next ? state.doc.line(next.line + 1).from - 1 : state.doc.length;
  if (to <= lineEnd) return null;
  return { from: lineEnd, to };
}

export function createEditorExtension(getSettings: () => ExtendedHeadingsSettings): Extension {
  const decorationPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, getSettings);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.selectionSet || update.geometryChanged) {
          this.decorations = buildDecorations(update.view, getSettings);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );

  return [
    decorationPlugin,
    gutter({
      class: "cm-lapel cm-extended-heading-gutter",
      markers: (view) => buildHeadingMarkers(view, getSettings().maximumLevel),
      initialSpacer: () => new HeadingLevelMarker(12, true),
    }),
    foldService.of((state, lineStart, lineEnd) =>
      foldingRange(state, lineStart, lineEnd, getSettings().maximumLevel),
    ),
    EditorView.contentAttributes.of({ "data-extended-headings": "enabled" }),
  ];
}
