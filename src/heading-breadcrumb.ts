import { EditorView } from "@codemirror/view";
import { MarkdownRenderChild, MarkdownView, type MarkdownPostProcessorContext } from "obsidian";
import type ExtendedHeadingsPlugin from "./main";
import {
  breadcrumbActivation, breadcrumbEnabled, breadcrumbFeature, breadcrumbThreadOptions, breadcrumbTimeout,
  type BreadcrumbMode, type BreadcrumbPane,
} from "./breadcrumb-settings";
import {
  breadcrumbEntries, breadcrumbHeadings, breadcrumbKeyboardTarget, breadcrumbThreadPlan, type BreadcrumbHeading,
} from "./breadcrumb-tree";
import { breadcrumbHighlight } from "./breadcrumb-editor";
import { scanHeadings, parseHeadingLine, type ParsedHeading } from "./headings";
import {
  buildOutlineGuidePath, buildOutlineRootThreadPath, buildRoundedOutlineThreadPath, outlineLabelFromHeadingBody,
} from "./core-outline-svg";

type ObsidianWindow = Window & { createEl: typeof createEl; createSpan: typeof createSpan; createFragment: typeof createFragment };

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6, .extended-heading-reading";
const SVG_NS = "http://www.w3.org/2000/svg";
interface HeadingLocation { file: string; line: number }
interface HoverTarget extends HeadingLocation {
  pane: BreadcrumbPane;
  mode: BreadcrumbMode;
  element: HTMLElement;
  view: MarkdownView;
}
interface Popup {
  target: HoverTarget;
  headings: BreadcrumbHeading[];
  current: number;
  selected: number;
  active: number;
  element: HTMLElement;
  tree: HTMLElement;
  content: HTMLElement;
  svg: SVGSVGElement;
  rows: Map<number, HTMLButtonElement>;
  anchorRect: DOMRect;
  resize: ResizeObserver;
  frame: number | null;
}
interface DocumentState {
  document: Document;
  abort: AbortController;
  popup: Popup | null;
  timer: number | null;
  highlightView: MarkdownView | null;
  highlighted: Set<HTMLElement>;
}
class ReadingHeadingRegistration extends MarkdownRenderChild {
  constructor(element: HTMLElement, private readonly cleanup: () => void) { super(element); }
  onunload(): void { this.cleanup(); }
}
function editorView(view: MarkdownView): EditorView | null {
  return (view.editor as unknown as { cm?: EditorView }).cm ?? null;
}
function modeOf(view: MarkdownView): BreadcrumbMode {
  if (view.getMode() === "preview") return "reading";
  return view.containerEl.querySelector(".markdown-source-view.is-live-preview") ? "livePreview" : "source";
}
function elementAt(event: Event): HTMLElement | null {
  const target = event.target as HTMLElement | null;
  return target?.nodeType === 1 && typeof target.closest === "function" ? target : null;
}
function within(x: number, y: number, rect: DOMRect, gap = 0): boolean {
  return x >= rect.left - gap && x <= rect.right + gap && y >= rect.top - gap && y <= rect.bottom + gap;
}

/** One delegated listener per window. Source parsing is demand-driven and cached
 * by the CodeMirror document, with no vault scan, polling, or scroll-time rebuild.
 */
export class HeadingBreadcrumb {
  private readonly documents = new Map<Document, DocumentState>();
  private readonly readingSourceCache = new WeakMap<HTMLElement, { text: string; maximum: number; headings: ParsedHeading[] }>();
  private readonly readingLocations = new WeakMap<HTMLElement, HeadingLocation>();
  private readonly readingElements = new Set<HTMLElement>();
  private readonly views = new WeakMap<HTMLElement, MarkdownView>();
  private readonly sourceCache = new WeakMap<MarkdownView, { document: unknown; text: string; maximum: number; headings: BreadcrumbHeading[] }>();
  private stopped = false;

  constructor(private readonly plugin: ExtendedHeadingsPlugin) {}

  start(): void {
    this.refreshViews();
    this.plugin.app.workspace.onLayoutReady(() => this.refreshViews());
    this.plugin.registerEvent(this.plugin.app.workspace.on("layout-change", () => this.refreshViews()));
    this.plugin.registerEvent(this.plugin.app.workspace.on("window-open", (_leaf, win) => this.observeDocument(win.document)));
    this.plugin.registerEvent(this.plugin.app.workspace.on("window-close", (_leaf, win) => this.removeDocument(win.document)));
    this.plugin.registerEvent(this.plugin.app.workspace.on("file-open", () => {
      for (const state of this.documents.values()) this.dismiss(state);
    }));
    this.plugin.registerEvent(this.plugin.app.workspace.on("editor-change", (_editor, view) => {
      if (!(view instanceof MarkdownView)) return;
      for (const state of this.documents.values()) {
        if (state.popup?.target.view === view) this.dismiss(state);
      }
    }));
    this.plugin.registerEvent(this.plugin.app.workspace.on("css-change", () => {
      for (const state of this.documents.values()) if (state.popup) this.scheduleDraw(state);
    }));
  }

  refresh(): void {
    for (const state of this.documents.values()) this.dismiss(state);
    this.refreshViews();
    for (const element of this.readingElements) {
      if (!element.isConnected) this.readingElements.delete(element);
      else this.updateReadingMarker(element);
    }
  }

  destroy(): void {
    this.stopped = true;
    for (const document of this.documents.keys()) this.removeDocument(document);
    for (const element of this.readingElements) {
      element.querySelector(":scope > .extended-breadcrumb-reading-marker")?.remove();
      element.classList.remove("extended-breadcrumb-reading-host");
    }
    this.readingElements.clear();
  }

  processReading(root: HTMLElement, context: MarkdownPostProcessorContext): void {
    // Postprocessors also run for Outline labels and other small Markdown
    // fragments. Do not obtain or parse a note's source for heading-free
    // fragments or for headings inside transcluded notes.
    const elements = [ ...(root.matches(HEADING_SELECTOR) ? [root] : []), ...Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)) ]
      .filter((element) => !element.closest(".internal-embed"));
    if (!elements.length) return;
    const info = context.getSectionInfo(root);
    if (!info) return;
    const owner = root.closest<HTMLElement>(".markdown-preview-view") ?? root.parentElement ?? root;
    let cached = this.readingSourceCache.get(owner);
    if (!cached || cached.text !== info.text || cached.maximum !== this.plugin.settings.maximumLevel) {
      cached = { text: info.text, maximum: this.plugin.settings.maximumLevel,
        headings: scanHeadings(info.text, 1, this.plugin.settings.maximumLevel) };
      this.readingSourceCache.set(owner, cached);
    }
    let low = 0, high = cached.headings.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (cached.headings[middle].line < info.lineStart) low = middle + 1;
      else high = middle;
    }
    const headings: ParsedHeading[] = [];
    while (low < cached.headings.length && cached.headings[low].line <= info.lineEnd) headings.push(cached.headings[low++]);
    const registered: HTMLElement[] = [];
    let index = 0;
    for (const element of elements) {
      const level = Number(element.getAttribute("aria-level") ?? element.tagName.slice(1));
      while (index < headings.length && headings[index].level !== level) index += 1;
      const heading = headings[index++];
      if (!heading) continue;
      this.readingLocations.set(element, { file: context.sourcePath, line: heading.line });
      this.readingElements.add(element);
      registered.push(element);
      this.updateReadingMarker(element);
      const state = this.documents.get(element.ownerDocument);
      const popup = state?.popup;
      if (state && popup?.target.mode === "reading" && popup.target.file === context.sourcePath
        && popup.headings[popup.active]?.line === heading.line && popup.target.view.containerEl.contains(element)) {
        element.classList.add("extended-breadcrumb-main-highlight"); state.highlighted.add(element);
      }
    }
    if (registered.length) context.addChild(new ReadingHeadingRegistration(root, () => {
      for (const element of registered) {
        this.readingElements.delete(element);
        this.readingLocations.delete(element);
        element.querySelector(":scope > .extended-breadcrumb-reading-marker")?.remove();
        element.classList.remove("extended-breadcrumb-reading-host", "extended-breadcrumb-main-highlight");
      }
    }));
  }

  private updateReadingMarker(element: HTMLElement): void {
    const settings = this.plugin.settings;
    const visible = breadcrumbEnabled(settings, "editor", "reading") && breadcrumbActivation(settings, "editor") === "marker";
    let marker = element.querySelector<HTMLElement>(":scope > .extended-breadcrumb-reading-marker");
    element.classList.toggle("extended-breadcrumb-reading-host", visible);
    if (!visible) { marker?.remove(); return; }
    if (!marker) {
      marker = (element.ownerDocument.win as ObsidianWindow).createSpan();
      marker.className = "extended-breadcrumb-reading-marker";
      marker.textContent = `H${element.getAttribute("aria-level") ?? element.tagName.slice(1)}`;
      marker.setAttribute("aria-hidden", "true");
      element.prepend(marker);
    }
  }

  private refreshViews(): void {
    if (this.stopped) return;
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      if (!(leaf.view instanceof MarkdownView)) continue;
      this.views.set(leaf.view.containerEl, leaf.view);
      this.observeDocument(leaf.view.containerEl.ownerDocument);
    }
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("outline")) this.observeDocument(leaf.view.containerEl.ownerDocument);
    for (const state of this.documents.values()) {
      if (state.document.defaultView?.closed) this.removeDocument(state.document);
      else if (state.popup && (!state.popup.target.element.isConnected || modeOf(state.popup.target.view) !== state.popup.target.mode)) this.dismiss(state);
    }
  }

  private observeDocument(document: Document): void {
    if (this.stopped || this.documents.has(document) || !document.defaultView) return;
    const abort = new document.defaultView.AbortController();
    const state: DocumentState = { document, abort, popup: null, timer: null, highlightView: null, highlighted: new Set() };
    this.documents.set(document, state);
    document.addEventListener("pointermove", (event) => this.pointerMove(state, event), { passive: true, signal: abort.signal });
    document.addEventListener("pointerleave", () => this.scheduleDismiss(state), { signal: abort.signal });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !state.popup) return;
      const popup = state.popup;
      const hasFocus = popup.element.contains(document.activeElement);
      this.dismiss(state);
      if (hasFocus) popup.target.view.editor.focus();
    }, { signal: abort.signal });
    document.addEventListener("scroll", (event) => {
      const popup = state.popup;
      if (!popup || popup.element.contains(event.target as Node)) return;
      // Previewing an ancestor can scroll the main pane while the pointer is
      // inside the popup. Keep it open at its original viewport anchor.
      if (!popup.element.matches(":hover") && !popup.element.contains(document.activeElement)) this.dismiss(state);
    }, { capture: true, passive: true, signal: abort.signal });
    document.defaultView.addEventListener("blur", () => this.dismiss(state), { signal: abort.signal });
    document.defaultView.addEventListener("resize", () => this.scheduleDraw(state), { signal: abort.signal });
  }

  private removeDocument(document: Document): void {
    const state = this.documents.get(document);
    if (!state) return;
    this.dismiss(state);
    state.abort.abort();
    this.documents.delete(document);
  }

  private viewFor(element: HTMLElement): MarkdownView | null {
    let current: HTMLElement | null = element;
    while (current) {
      const view = this.views.get(current);
      if (view) return view;
      current = current.parentElement;
    }
    return null;
  }

  private targetAt(element: HTMLElement, event: PointerEvent): HoverTarget | null {
    const settings = this.plugin.settings;
    if (!settings.headingHoverBreadcrumb) return null;
    const rowSelector = ".tree-item-self[data-extended-breadcrumb-line]";
    let row = element.closest<HTMLElement>(rowSelector);
    const outline = element.closest<HTMLElement>('[data-type="outline"]');
    if (!row && outline && settings.outlineHeadingHoverBreadcrumb && breadcrumbActivation(settings, "outline") === "field") {
      // Native tree indentation can put the pointer outside the row element
      // even though it is inside the row's full-width highlighted field.
      const bounds = outline.getBoundingClientRect();
      if (event.clientX >= bounds.left && event.clientX <= bounds.right) {
        row = Array.from(outline.querySelectorAll<HTMLElement>(rowSelector)).find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.height > 0 && event.clientY >= rect.top && event.clientY < rect.bottom;
        }) ?? null;
      }
    }
    if (row && row.dataset.extendedBreadcrumbFile) {
      const file = row.dataset.extendedBreadcrumbFile;
      const view = this.plugin.app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view)
        .find((candidate): candidate is MarkdownView => candidate instanceof MarkdownView
          && candidate.file?.path === file && candidate.containerEl.ownerDocument === row.ownerDocument
          && candidate.containerEl.getBoundingClientRect().width > 0);
      if (!view) return null;
      const mode = modeOf(view);
      const scope = breadcrumbActivation(settings, "outline");
      if (!breadcrumbEnabled(settings, "outline", mode) || !scope) return null;
      if (scope === "marker" && !element.closest(".extended-heading-outline-level-marker")) return null;
      return { file, line: Number(row.dataset.extendedBreadcrumbLine), pane: "outline", mode, view, element: row };
    }
    if (!element.closest(".cm-scroller, .markdown-preview-view")) return null;
    const view = this.viewFor(element);
    if (!view?.file) return null;
    const mode = modeOf(view);
    const scope = breadcrumbActivation(settings, "editor");
    if (!breadcrumbEnabled(settings, "editor", mode) || !scope) return null;
    if (mode === "reading") {
      const heading = element.closest<HTMLElement>(HEADING_SELECTOR);
      if (!heading || scope === "marker" && !element.closest(".extended-breadcrumb-reading-marker")) return null;
      const location = this.readingLocations.get(heading);
      return location && location.file === view.file.path ? { ...location, pane: "editor", mode, view, element: heading } : null;
    }
    const gutter = element.closest<HTMLElement>(".cm-extended-heading-gutter .cm-gutterElement");
    if (scope === "marker" && !gutter?.querySelector(".cm-heading-marker:not(.cm-heading-marker-spacer)")) return null;
    const cm = editorView(view);
    if (!cm) return null;
    const block = cm.lineBlockAtHeight(event.clientY - cm.documentTop);
    if (event.clientY < cm.documentTop + block.top || event.clientY > cm.documentTop + block.bottom) return null;
    const sourceLine = cm.state.doc.lineAt(block.from);
    const line = sourceLine.number - 1;
    if (!parseHeadingLine(sourceLine.text, line, 0, 1, settings.maximumLevel)) return null;
    const dom = cm.domAtPos(block.from).node;
    const lineElement = (dom.nodeType === 1 ? dom as HTMLElement : dom.parentElement)?.closest<HTMLElement>(".cm-line");
    const anchor = element.closest<HTMLElement>(".cm-line, .cm-gutterElement") ?? lineElement;
    if (!anchor) return null;
    return { file: view.file.path, line, pane: "editor", mode, view, element: anchor };
  }

  private headingsFor(view: MarkdownView): BreadcrumbHeading[] {
    const document = editorView(view)?.state.doc;
    const cached = this.sourceCache.get(view);
    if (cached && document && cached.document === document && cached.maximum === this.plugin.settings.maximumLevel) return cached.headings;
    const text = view.editor.getValue();
    if (cached && cached.text === text && cached.maximum === this.plugin.settings.maximumLevel) return cached.headings;
    const headings = breadcrumbHeadings(scanHeadings(text, 1, this.plugin.settings.maximumLevel));
    this.sourceCache.set(view, { document, text, maximum: this.plugin.settings.maximumLevel, headings });
    return headings;
  }

  private pointerMove(state: DocumentState, event: PointerEvent): void {
    const element = elementAt(event);
    if (!element) return;
    const popup = state.popup;
    if (popup?.element.contains(element)) { this.cancelDismiss(state); return; }
    if (popup && (element === popup.target.element || popup.target.element.contains(element))) {
      // Recheck scope, so moving from the marker onto text dismisses a
      // marker-only breadcrumb, while full-field scope stays active.
      const target = this.targetAt(element, event);
      if (target?.line === popup?.target.line) { this.cancelDismiss(state); return; }
    }
    const target = this.targetAt(element, event);
    if (target) {
      this.cancelDismiss(state);
      if (popup && popup.target.view === target.view && popup.target.line === target.line && popup.target.pane === target.pane) return;
      this.show(state, target);
      return;
    }
    if (popup) {
      const rect = popup.element.getBoundingClientRect();
      const anchor = popup.anchorRect;
      const left = Math.min(rect.left, anchor.left);
      const right = Math.max(rect.right, anchor.right);
      const gapTop = Math.min(rect.bottom, anchor.bottom);
      const gapBottom = Math.max(rect.top, anchor.top);
      if (within(event.clientX, event.clientY, rect) || event.clientX >= left && event.clientX <= right
        && event.clientY >= gapTop && event.clientY <= gapBottom) { this.cancelDismiss(state); return; }
    }
    this.scheduleDismiss(state);
  }

  private show(state: DocumentState, target: HoverTarget): void {
    this.dismiss(state);
    const headings = this.headingsFor(target.view);
    const current = headings.findIndex((heading) => heading.line === target.line);
    const win = state.document.defaultView;
    if (current < 0 || !win) return;
    const create = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
      const element = (state.document.win as ObsidianWindow).createEl(tag);
      element.className = className;
      return element;
    };
    const element = create("div", "extended-breadcrumb-popover");
    element.dataset.pane = target.pane;
    element.classList.toggle("extended-breadcrumb-expand", this.plugin.settings.breadcrumbExpandTitles);
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-label", "Heading hierarchy");
    const title = create("div", "extended-breadcrumb-title"); title.textContent = "Heading hierarchy";
    const tree = create("div", "extended-breadcrumb-tree"); tree.setAttribute("role", "tree");
    const content = create("div", "extended-breadcrumb-content");
    const svg = state.document.createElementNS(SVG_NS, "svg");
    svg.classList.add("extended-breadcrumb-guides"); svg.setAttribute("aria-hidden", "true");
    content.append(svg); tree.append(content); element.append(title, tree);
    const rows = new Map<number, HTMLButtonElement>();
    const settings = this.plugin.settings;
    const options = breadcrumbFeature(settings, target.pane, "Threading") ? breadcrumbThreadOptions(settings, target.pane) : null;
    const indexes = breadcrumbEntries(headings, current, options);
    for (const index of indexes) {
      const heading = headings[index];
      const row = create("button", "extended-breadcrumb-row");
      row.type = "button"; row.tabIndex = index === current ? 0 : -1;
      row.dataset.index = String(index);
      row.style.setProperty("--extended-breadcrumb-depth", String(heading.depth));
      row.classList.toggle("is-current", index === current);
      row.setAttribute("role", "treeitem"); row.setAttribute("aria-level", String(heading.depth + 1));
      row.setAttribute("aria-current", String(index === current));
      row.setAttribute("aria-selected", String(index === current));
      if (breadcrumbFeature(settings, target.pane, "Markers")) {
        const marker = create("span", "extended-breadcrumb-level-marker");
        marker.textContent = `H${heading.level}`; marker.setAttribute("aria-hidden", "true"); row.append(marker);
      }
      const label = create("span", "extended-breadcrumb-label");
      label.textContent = outlineLabelFromHeadingBody(heading.rawBody) || "(Untitled heading)";
      row.setAttribute("aria-label", `H${heading.level} ${label.textContent}`);
      row.append(label); content.append(row); rows.set(index, row);
      row.addEventListener("pointerenter", () => this.activate(state, index));
      row.addEventListener("focus", () => { this.cancelDismiss(state); this.activate(state, index); });
      row.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation();
        if (!state.popup) return;
        state.popup.selected = index;
        this.activate(state, index);
        this.navigate(target, heading.line, true);
      });
    }
    const resize = new win.ResizeObserver(() => this.scheduleDraw(state));
    const popup: Popup = { target, headings, current, active: current, selected: current,
      element, tree, content, svg, rows, anchorRect: target.element.getBoundingClientRect(), resize, frame: null };
    state.popup = popup;
    element.addEventListener("pointerenter", () => this.cancelDismiss(state));
    element.addEventListener("pointerleave", () => this.scheduleDismiss(state));
    element.addEventListener("focusout", () => this.scheduleDismiss(state));
    tree.addEventListener("keydown", (event) => {
      const activePosition = indexes.findIndex((index) => rows.get(index) === state.document.activeElement);
      const position = breadcrumbKeyboardTarget(event.key, activePosition, indexes.length);
      if (position === null) return;
      event.preventDefault(); rows.get(indexes[position])?.focus();
    });
    state.document.body.append(element);
    resize.observe(content);
    this.draw(state);
    const currentRow = rows.get(current);
    if (currentRow) tree.scrollTop = Math.max(0, currentRow.offsetTop - tree.clientHeight / 2);
  }

  private activate(state: DocumentState, index: number): void {
    const popup = state.popup;
    if (!popup) return;
    popup.active = index;
    for (const [rowIndex, row] of popup.rows) {
      row.classList.toggle("is-active", rowIndex === index);
      row.setAttribute("aria-selected", String(rowIndex === popup.selected));
      row.tabIndex = rowIndex === index ? 0 : -1;
    }
    this.highlight(state, popup.target, popup.headings[index].line);
    this.scheduleDraw(state);
  }

  private highlight(state: DocumentState, target: HoverTarget, line: number): void {
    this.clearHighlight(state);
    const cm = editorView(target.view);
    if (modeOf(target.view) !== "reading" && cm) {
      cm.dispatch({ effects: breadcrumbHighlight.of(line) });
      state.highlightView = target.view;
      this.navigate(target, line, false);
    } else {
      this.navigate(target, line, false);
      for (const element of this.readingElements) {
        const location = this.readingLocations.get(element);
        if (location?.file === target.file && location.line === line && target.view.containerEl.contains(element)) {
          element.classList.add("extended-breadcrumb-main-highlight"); state.highlighted.add(element);
        }
      }
    }
    for (const row of Array.from(state.document.querySelectorAll<HTMLElement>(".tree-item-self[data-extended-breadcrumb-line]"))) {
      if (row.dataset.extendedBreadcrumbFile === target.file && Number(row.dataset.extendedBreadcrumbLine) === line) {
        row.dataset.extendedBreadcrumbHighlight = "true"; state.highlighted.add(row);
        if (target.pane === "outline") row.scrollIntoView({ block: "nearest" });
      }
    }
  }

  private navigate(target: HoverTarget, line: number, select: boolean): void {
    if (target.view.file?.path !== target.file) return;
    if (target.mode === "reading") {
      target.view.leaf.setEphemeralState({ line, focus: select });
      return;
    }
    const cm = editorView(target.view);
    if (!cm || line >= cm.state.doc.lines) return;
    const position = cm.state.doc.line(line + 1).from;
    cm.dispatch({ effects: EditorView.scrollIntoView(position, { y: "center" }),
      ...(select ? { selection: { anchor: position } } : {}) });
    if (select) target.view.editor.focus();
  }

  private scheduleDraw(state: DocumentState): void {
    const popup = state.popup;
    if (!popup || popup.frame !== null) return;
    popup.frame = state.document.defaultView?.requestAnimationFrame(() => {
      popup.frame = null;
      if (state.popup === popup) this.draw(state);
    }) ?? null;
  }

  private draw(state: DocumentState): void {
    const popup = state.popup;
    const win = state.document.defaultView;
    if (!popup || !win) return;
    const { content, svg, rows, headings, target } = popup;
    const style = win.getComputedStyle(popup.element);
    const number = (name: string, fallback: number) => {
      const parsed = Number.parseFloat(style.getPropertyValue(`--extended-breadcrumb-${name}`));
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const rect = content.getBoundingClientRect();
    const points = new Map<number, { endX: number; y: number }>();
    for (const [index, row] of rows) {
      const anchor = row.querySelector(".extended-breadcrumb-level-marker, .extended-breadcrumb-label");
      if (!anchor) continue;
      const anchorRect = anchor.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      points.set(index, { endX: anchorRect.left - rect.left, y: rowRect.top - rect.top + rowRect.height / 2 });
    }
    const fragment = (state.document.win as ObsidianWindow).createFragment();
    const append = (pathData: string, className: string) => {
      if (!pathData) return;
      const path = state.document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", pathData); path.setAttribute("class", className); fragment.append(path);
    };
    if (breadcrumbFeature(this.plugin.settings, target.pane, "Guides")) {
      const groups = new Map<string, number[]>();
      for (const index of rows.keys()) {
        const heading = headings[index];
        const key = heading.parentIndex === null ? `root-${heading.orphan}` : String(heading.parentIndex);
        const group = groups.get(key) ?? []; group.push(index); groups.set(key, group);
      }
      for (const group of groups.values()) {
        const connectors = group.map((index) => {
          const point = points.get(index)!;
          return { endX: point.endX - number("guide-marker-gap", 4), y: point.y + number("guide-connector-offset", 0) };
        });
        const parent = headings[group[0]].parentIndex;
        const parentY = parent === null ? undefined : points.get(parent)?.y;
        append(buildOutlineGuidePath({ connectors,
          spineX: Math.max(0, Math.min(...connectors.map((point) => point.endX)) - number("guide-connector-length", 18)),
          startY: Math.max(0, parentY === undefined ? connectors[0].y - number("guide-first-branch-rise", 10) : parentY + number("guide-first-branch-rise", 10)),
          endY: connectors[connectors.length - 1].y,
        }), "extended-breadcrumb-guide-path");
      }
    }
    if (breadcrumbFeature(this.plugin.settings, target.pane, "Threading")) {
      const options = breadcrumbThreadOptions(this.plugin.settings, target.pane);
      const active = options.Selected ? popup.selected : popup.active;
      const plan = breadcrumbThreadPlan(headings, active, options);
      const gap = number("thread-marker-gap", 4), length = number("thread-connector-length", 28);
      const offset = number("thread-vertical-offset", 0), radius = number("thread-corner-radius", 8);
      const roots = plan.roots.filter((index) => points.has(index));
      if (roots.length) {
        const connectors = roots.map((index) => ({ endX: points.get(index)!.endX - gap, y: points.get(index)!.y + offset }));
        append(buildOutlineRootThreadPath({ connectors, radius,
          spineX: Math.max(0, Math.min(...connectors.map((point) => point.endX)) - length),
          startY: Math.max(0, connectors[0].y - length / 2),
        }), "extended-breadcrumb-thread-path extended-breadcrumb-thread-depth-1");
      }
      for (const index of plan.edges) {
        const point = points.get(index);
        if (!point) continue;
        const parent = headings[index].parentIndex;
        append(buildRoundedOutlineThreadPath({ endX: point.endX - gap, endY: point.y + offset,
          startX: Math.max(0, point.endX - gap - length), radius,
          startY: (parent === null ? 0 : points.get(parent)?.y ?? 0) + offset,
        }), `extended-breadcrumb-thread-path extended-breadcrumb-thread-depth-${Math.max(1, Math.min(8, headings[index].depth + (roots.length ? 1 : 0)))}`);
      }
    }
    svg.setAttribute("width", String(content.scrollWidth)); svg.setAttribute("height", String(content.scrollHeight));
    svg.replaceChildren(fragment);
    this.position(popup, number("anchor-gap", 8), number("viewport-gap", 8));
  }

  private position(popup: Popup, anchorGap: number, viewportGap: number): void {
    const win = popup.element.ownerDocument.defaultView;
    if (!win) return;
    const rect = popup.anchorRect;
    const left = Math.max(viewportGap, Math.min(rect.left, win.innerWidth - popup.element.offsetWidth - viewportGap));
    const below = rect.bottom + anchorGap;
    const top = below + popup.element.offsetHeight <= win.innerHeight - viewportGap ? below
      : Math.max(viewportGap, rect.top - popup.element.offsetHeight - anchorGap);
    popup.element.style.left = `${left}px`; popup.element.style.top = `${top}px`;
  }

  private clearHighlight(state: DocumentState): void {
    const cm = state.highlightView && editorView(state.highlightView);
    if (cm?.dom.isConnected) cm.dispatch({ effects: breadcrumbHighlight.of(null) });
    state.highlightView = null;
    for (const element of state.highlighted) {
      element.classList.remove("extended-breadcrumb-main-highlight");
      delete element.dataset.extendedBreadcrumbHighlight;
    }
    state.highlighted.clear();
  }

  private cancelDismiss(state: DocumentState): void {
    if (state.timer !== null) state.document.defaultView?.clearTimeout(state.timer);
    state.timer = null;
  }

  private scheduleDismiss(state: DocumentState): void {
    if (!state.popup || state.timer !== null || state.popup.element.matches(":hover")
      || state.popup.element.contains(state.document.activeElement)) return;
    const timeout = breadcrumbTimeout(this.plugin.settings, state.popup.target.mode);
    if (timeout === 0) { this.dismiss(state); return; }
    state.timer = state.document.defaultView?.setTimeout(() => this.dismiss(state), timeout) ?? null;
  }

  private dismiss(state: DocumentState): void {
    this.cancelDismiss(state);
    const popup = state.popup;
    state.popup = null;
    popup?.resize.disconnect();
    if (popup?.frame !== null && popup?.frame !== undefined) state.document.defaultView?.cancelAnimationFrame(popup.frame);
    popup?.element.remove();
    this.clearHighlight(state);
  }
}
