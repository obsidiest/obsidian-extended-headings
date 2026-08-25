import {
  MarkdownView,
  TFile,
  sanitizeHTMLToDom,
  type HeadingCache,
  type WorkspaceLeaf,
} from "obsidian";
import { scanHeadings } from "./headings";
import type ExtendedHeadingsPlugin from "./main";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const OUTLINE_ITEM_SELECTOR = ".tree-item-inner";
const OUTLINE_ROW_SELECTOR = ".tree-item-self";
const OUTLINE_HOST_CLASS = "extended-heading-outline-decoration-host";
const OUTLINE_ROW_CLASS = "extended-heading-outline-row";
const OUTLINE_LEVEL_MARKER_CLASS = "extended-heading-outline-level-marker";
const OUTLINE_OVERLAY_CLASS = "extended-heading-outline-overlay";
const OUTLINE_GUIDE_PATH_CLASS = "extended-heading-outline-guide-path";
const OUTLINE_THREAD_PATH_CLASS = "extended-heading-outline-thread-path";
const OUTLINE_SVG_CLASS = "extended-heading-outline-svg";
const OUTLINE_SVG_PARENTHESIZED_CLASS = "extended-heading-outline-svg-parenthesized";

export interface InlineSvgFragments {
  label: string;
  svgMarkup: string[];
  placement?: "inside-trailing-parentheses";
}

export type OutlineSvgSpec = InlineSvgFragments;

export interface OutlineSvgMatch {
  itemIndex: number;
  svgMarkup: string[];
  placement?: "inside-trailing-parentheses";
}

export interface OutlineHeadingSpec {
  label: string;
  level: number;
  placement?: "inside-trailing-parentheses";
  svgMarkup?: string[];
}

export interface OutlineHeadingMatch {
  itemIndex: number;
  specIndex: number;
}

export interface OutlineTreeModelItem {
  depth: number;
  level: number;
  orphan: boolean;
  parentIndex: number | null;
  rootIndex: number;
}

export interface OutlineConnectorPoint {
  endX: number;
  y: number;
}

export interface OutlineGuidePathGeometry {
  connectors: OutlineConnectorPoint[];
  endY: number;
  spineX: number;
  startY: number;
}

export interface OutlineThreadPathGeometry {
  endX: number;
  endY: number;
  radius: number;
  startX: number;
  startY: number;
}

export interface OutlineRootThreadPathGeometry {
  connectors: OutlineConnectorPoint[];
  radius: number;
  spineX: number;
  startY: number;
}

interface DecoratedOutlineRow {
  item: HTMLElement;
  model: OutlineTreeModelItem;
  row: HTMLElement;
  specIndex: number;
}

interface MeasuredOutlineRow extends DecoratedOutlineRow {
  endX: number;
  y: number;
}

interface OutlineAttachment {
  animationFrame: number;
  container: HTMLElement;
  guideLayer: SVGGElement | null;
  hoveredSpecIndex: number | null;
  leaf: WorkspaceLeaf;
  model: OutlineTreeModelItem[];
  observer: MutationObserver;
  overlay: SVGSVGElement | null;
  pointerLeave: () => void;
  pointerMove: (event: PointerEvent) => void;
  resizeObserver: ResizeObserver;
  revision: number;
  rowsBySpecIndex: Map<number, DecoratedOutlineRow>;
  scroll: () => void;
  styleObserver: MutationObserver;
  threadLayer: SVGGElement | null;
  visualAnimationFrame: number;
}

function inlineSvgPattern(): RegExp {
  return /<svg\b[^>]*\/\s*>|<svg\b[\s\S]*?<\/svg\s*>/giu;
}

function finiteNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatPoint(value: number): string {
  return String(finiteNumber(Math.round(value * 1000) / 1000));
}

export function normalizeOutlineLabel(value: string): string {
  return value.replace(/\s+/gu, " ").replace(/\(\s+\)/gu, "()").trim();
}

export function outlineLabelFromHeadingBody(rawBody: string): string {
  return normalizeOutlineLabel(
    rawBody
      .replace(inlineSvgPattern(), " ")
      .replace(/<\/?[A-Za-z][^>]*>/gu, " "),
  );
}

export function extractInlineSvgFragments(rawBody: string): InlineSvgFragments | null {
  const svgMarkup = Array.from(rawBody.matchAll(inlineSvgPattern()), (match) => match[0]);
  if (svgMarkup.length === 0) return null;
  const result: InlineSvgFragments = {
    label: outlineLabelFromHeadingBody(rawBody),
    svgMarkup,
  };
  const placeholder = "\uFFFC";
  const withoutSvgMarkup = rawBody.replace(inlineSvgPattern(), placeholder);
  const trailingParenthesizedSvgs = new RegExp(
    `\\(\\s*(?:${placeholder}\\s*)+\\)\\s*$`,
    "u",
  );
  if (trailingParenthesizedSvgs.test(withoutSvgMarkup)) {
    result.placement = "inside-trailing-parentheses";
  }
  return result;
}

export function matchOutlineSvgSpecs(
  outlineLabels: string[],
  specs: OutlineSvgSpec[],
): OutlineSvgMatch[] {
  const itemIndexesByLabel = new Map<string, number[]>();
  const specsByLabel = new Map<string, OutlineSvgSpec[]>();

  outlineLabels.forEach((label, itemIndex) => {
    const normalized = normalizeOutlineLabel(label);
    const indexes = itemIndexesByLabel.get(normalized) ?? [];
    indexes.push(itemIndex);
    itemIndexesByLabel.set(normalized, indexes);
  });
  for (const spec of specs) {
    const normalized = normalizeOutlineLabel(spec.label);
    const matchingSpecs = specsByLabel.get(normalized) ?? [];
    matchingSpecs.push(spec);
    specsByLabel.set(normalized, matchingSpecs);
  }

  const matches: OutlineSvgMatch[] = [];
  for (const [label, matchingSpecs] of specsByLabel) {
    const itemIndexes = itemIndexesByLabel.get(label) ?? [];
    if (itemIndexes.length === matchingSpecs.length) {
      itemIndexes.forEach((itemIndex, index) => {
        const spec = matchingSpecs[index];
        matches.push({
          itemIndex,
          svgMarkup: spec.svgMarkup,
          ...(spec.placement ? { placement: spec.placement } : {}),
        });
      });
      continue;
    }

    const first = matchingSpecs[0];
    const firstSignature = first
      ? JSON.stringify([first.svgMarkup, first.placement ?? null])
      : "";
    if (
      first &&
      matchingSpecs.every(
        (spec) => JSON.stringify([spec.svgMarkup, spec.placement ?? null]) === firstSignature,
      )
    ) {
      for (const itemIndex of itemIndexes) {
        matches.push({
          itemIndex,
          svgMarkup: first.svgMarkup,
          ...(first.placement ? { placement: first.placement } : {}),
        });
      }
    }
  }

  return matches.sort((left, right) => left.itemIndex - right.itemIndex);
}

export function matchOutlineHeadingSpecs(
  outlineLabels: string[],
  specs: OutlineHeadingSpec[],
): OutlineHeadingMatch[] {
  const normalizedItems = outlineLabels.map(normalizeOutlineLabel);
  const normalizedSpecs = specs.map((spec) => normalizeOutlineLabel(spec.label));

  if (
    normalizedItems.length === normalizedSpecs.length &&
    normalizedItems.every((label, index) => label === normalizedSpecs[index])
  ) {
    return normalizedItems.map((_label, index) => ({
      itemIndex: index,
      specIndex: index,
    }));
  }

  const itemIndexesByLabel = new Map<string, number[]>();
  const specIndexesByLabel = new Map<string, number[]>();
  normalizedItems.forEach((label, itemIndex) => {
    const indexes = itemIndexesByLabel.get(label) ?? [];
    indexes.push(itemIndex);
    itemIndexesByLabel.set(label, indexes);
  });
  normalizedSpecs.forEach((label, specIndex) => {
    const indexes = specIndexesByLabel.get(label) ?? [];
    indexes.push(specIndex);
    specIndexesByLabel.set(label, indexes);
  });

  const matches: OutlineHeadingMatch[] = [];
  for (const [label, specIndexes] of specIndexesByLabel) {
    const itemIndexes = itemIndexesByLabel.get(label) ?? [];
    if (itemIndexes.length !== specIndexes.length) continue;
    itemIndexes.forEach((itemIndex, index) => {
      const specIndex = specIndexes[index];
      matches.push({ itemIndex, specIndex });
    });
  }
  return matches.sort((left, right) => left.itemIndex - right.itemIndex);
}

export function buildOutlineTreeModel(levels: number[]): OutlineTreeModelItem[] {
  const model: OutlineTreeModelItem[] = [];
  const lastIndexAtLevel = new Map<number, number>();

  levels.forEach((level, index) => {
    for (const existingLevel of Array.from(lastIndexAtLevel.keys())) {
      if (existingLevel >= level) lastIndexAtLevel.delete(existingLevel);
    }

    let parentIndex: number | null = null;
    for (let candidateLevel = level - 1; candidateLevel >= 1; candidateLevel -= 1) {
      const candidate = lastIndexAtLevel.get(candidateLevel);
      if (candidate !== undefined) {
        parentIndex = candidate;
        break;
      }
    }

    const parent = parentIndex === null ? null : model[parentIndex];
    const item: OutlineTreeModelItem = {
      depth: parent ? parent.depth + 1 : 0,
      level,
      orphan: parent ? parent.orphan : level > 1,
      parentIndex,
      rootIndex: parent ? parent.rootIndex : index,
    };
    model.push(item);
    lastIndexAtLevel.set(level, index);
  });

  return model;
}

export function buildOutlineGuidePath(geometry: OutlineGuidePathGeometry): string {
  const parts = [
    `M ${formatPoint(geometry.spineX)} ${formatPoint(geometry.startY)}`,
    `V ${formatPoint(geometry.endY)}`,
  ];
  for (const connector of geometry.connectors) {
    parts.push(
      `M ${formatPoint(geometry.spineX)} ${formatPoint(connector.y)}`,
      `H ${formatPoint(connector.endX)}`,
    );
  }
  return parts.join(" ");
}

export function buildRoundedOutlineThreadPath(
  geometry: OutlineThreadPathGeometry,
): string {
  const horizontalDirection = geometry.endX >= geometry.startX ? 1 : -1;
  const verticalDirection = geometry.endY >= geometry.startY ? 1 : -1;
  const radius = Math.min(
    Math.max(0, geometry.radius),
    Math.abs(geometry.endX - geometry.startX),
    Math.abs(geometry.endY - geometry.startY),
  );
  if (radius === 0) {
    return [
      `M ${formatPoint(geometry.startX)} ${formatPoint(geometry.startY)}`,
      `V ${formatPoint(geometry.endY)}`,
      `H ${formatPoint(geometry.endX)}`,
    ].join(" ");
  }
  const curveStartY = geometry.endY - verticalDirection * radius;
  const curveEndX = geometry.startX + horizontalDirection * radius;
  return [
    `M ${formatPoint(geometry.startX)} ${formatPoint(geometry.startY)}`,
    `V ${formatPoint(curveStartY)}`,
    `Q ${formatPoint(geometry.startX)} ${formatPoint(geometry.endY)}`,
    `${formatPoint(curveEndX)} ${formatPoint(geometry.endY)}`,
    `H ${formatPoint(geometry.endX)}`,
  ].join(" ");
}

export function buildOutlineRootThreadPath(
  geometry: OutlineRootThreadPathGeometry,
): string {
  if (geometry.connectors.length === 0) return "";
  const connectors = [...geometry.connectors].sort((left, right) => left.y - right.y);
  const last = connectors[connectors.length - 1];
  const radius = Math.min(
    Math.max(0, geometry.radius),
    Math.abs(last.endX - geometry.spineX),
    Math.abs(last.y - geometry.startY),
  );
  const parts: string[] = [];
  for (let index = 0; index < connectors.length - 1; index += 1) {
    const connector = connectors[index];
    parts.push(
      `M ${formatPoint(geometry.spineX)} ${formatPoint(connector.y)}`,
      `H ${formatPoint(connector.endX)}`,
    );
  }
  if (radius === 0) {
    parts.push(
      `M ${formatPoint(geometry.spineX)} ${formatPoint(geometry.startY)}`,
      `V ${formatPoint(last.y)}`,
      `H ${formatPoint(last.endX)}`,
    );
  } else {
    const verticalDirection = last.y >= geometry.startY ? 1 : -1;
    const horizontalDirection = last.endX >= geometry.spineX ? 1 : -1;
    parts.push(
      `M ${formatPoint(geometry.spineX)} ${formatPoint(geometry.startY)}`,
      `V ${formatPoint(last.y - verticalDirection * radius)}`,
      `Q ${formatPoint(geometry.spineX)} ${formatPoint(last.y)}`,
      `${formatPoint(geometry.spineX + horizontalDirection * radius)} ${formatPoint(last.y)}`,
      `H ${formatPoint(last.endX)}`,
    );
  }
  return parts.join(" ");
}

export class CoreOutlineRenderer {
  private readonly attachments = new Map<WorkspaceLeaf, OutlineAttachment>();
  private started = false;

  constructor(private readonly plugin: ExtendedHeadingsPlugin) {}

  start(): void {
    if (this.started) return;
    this.started = true;

    this.plugin.registerEvent(
      this.plugin.app.workspace.on("layout-change", () => this.refreshAll()),
    );
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("editor-change", () => this.refreshAll()),
    );
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on("changed", () => this.refreshAll()),
    );
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("css-change", () => {
        for (const attachment of this.attachments.values()) {
          this.scheduleVisualPass(attachment);
        }
      }),
    );
    this.plugin.app.workspace.onLayoutReady(() => this.refreshAll());
    this.refreshAll();
  }

  refreshAll(): void {
    if (!this.started) return;
    if (!this.hasEnabledFeature()) {
      this.detachAll();
      return;
    }
    this.attachAll();
    for (const attachment of this.attachments.values()) this.schedulePass(attachment);
  }

  destroy(): void {
    this.started = false;
    this.detachAll();
  }

  private hasEnabledFeature(): boolean {
    const settings = this.plugin.settings;
    return (
      settings.renderInlineSvgsInDefaultOutline ||
      settings.showOutlinePaneHeadingLevelMarkers ||
      settings.enableOutlinePaneHeadingStaticTreeIndentationGuides ||
      settings.enableOutlinePaneHeadingThreading
    );
  }

  private attachAll(): void {
    for (const [leaf, attachment] of this.attachments) {
      if (!attachment.container.isConnected) this.detach(leaf, attachment);
    }

    for (const leaf of this.plugin.app.workspace.getLeavesOfType("outline")) {
      if (this.attachments.has(leaf)) continue;
      const container = leaf.view.containerEl;
      let attachment!: OutlineAttachment;
      const observer = new MutationObserver((mutations) => {
        if (mutations.every((mutation) => mutation.type === "attributes")) {
          this.scheduleVisualPass(attachment);
        } else {
          this.schedulePass(attachment);
        }
      });
      const styleObserver = new MutationObserver(() => {
        this.scheduleVisualPass(attachment);
      });
      const ResizeObserverConstructor =
        container.ownerDocument.defaultView?.ResizeObserver ?? ResizeObserver;
      const resizeObserver = new ResizeObserverConstructor(() => {
        this.scheduleVisualPass(attachment);
      });
      const pointerMove = (event: PointerEvent): void => {
        this.handlePointerMove(attachment, event);
      };
      const pointerLeave = (): void => {
        if (attachment.hoveredSpecIndex === null) return;
        attachment.hoveredSpecIndex = null;
        this.scheduleVisualPass(attachment);
      };
      const scroll = (): void => this.scheduleVisualPass(attachment);

      attachment = {
        animationFrame: 0,
        container,
        guideLayer: null,
        hoveredSpecIndex: null,
        leaf,
        model: [],
        observer,
        overlay: null,
        pointerLeave,
        pointerMove,
        resizeObserver,
        revision: 0,
        rowsBySpecIndex: new Map(),
        scroll,
        styleObserver,
        threadLayer: null,
        visualAnimationFrame: 0,
      };
      this.observeMutations(attachment);
      resizeObserver.observe(container);
      styleObserver.observe(container.ownerDocument.body, {
        attributeFilter: ["class", "style"],
        attributes: true,
      });
      container.addEventListener("pointermove", pointerMove);
      container.addEventListener("pointerleave", pointerLeave);
      container.addEventListener("scroll", scroll, true);
      this.attachments.set(leaf, attachment);
    }
  }

  private detachAll(): void {
    for (const [leaf, attachment] of this.attachments) this.detach(leaf, attachment);
  }

  private detach(leaf: WorkspaceLeaf, attachment: OutlineAttachment): void {
    attachment.revision += 1;
    attachment.observer.disconnect();
    attachment.resizeObserver.disconnect();
    attachment.styleObserver.disconnect();
    attachment.container.removeEventListener("pointermove", attachment.pointerMove);
    attachment.container.removeEventListener("pointerleave", attachment.pointerLeave);
    attachment.container.removeEventListener("scroll", attachment.scroll, true);
    const win = attachment.container.ownerDocument.defaultView ?? window;
    if (attachment.animationFrame !== 0) {
      win.cancelAnimationFrame(attachment.animationFrame);
    }
    if (attachment.visualAnimationFrame !== 0) {
      win.cancelAnimationFrame(attachment.visualAnimationFrame);
    }
    this.clearDecorations(attachment);
    this.attachments.delete(leaf);
  }

  private schedulePass(attachment: OutlineAttachment): void {
    if (attachment.animationFrame !== 0 || !attachment.container.isConnected) return;
    const win = attachment.container.ownerDocument.defaultView ?? window;
    attachment.animationFrame = win.requestAnimationFrame(() => {
      attachment.animationFrame = 0;
      void this.runPass(attachment);
    });
  }

  private scheduleVisualPass(attachment: OutlineAttachment): void {
    if (
      attachment.visualAnimationFrame !== 0 ||
      !attachment.container.isConnected
    ) return;
    const win = attachment.container.ownerDocument.defaultView ?? window;
    attachment.visualAnimationFrame = win.requestAnimationFrame(() => {
      attachment.visualAnimationFrame = 0;
      this.mutateWithoutObserving(attachment, () => this.renderVisuals(attachment));
    });
  }

  private async runPass(attachment: OutlineAttachment): Promise<void> {
    const revision = ++attachment.revision;
    const file = this.getOutlineFile(attachment.leaf);
    if (!file) {
      this.mutateWithoutObserving(attachment, () => this.clearDecorations(attachment));
      return;
    }

    let text: string;
    try {
      text = await this.getSourceText(file);
    } catch {
      return;
    }
    if (
      revision !== attachment.revision ||
      !this.started ||
      !this.hasEnabledFeature() ||
      !attachment.container.isConnected ||
      this.attachments.get(attachment.leaf) !== attachment
    ) return;

    const specs = this.buildSpecs(text, file);
    const model = buildOutlineTreeModel(specs.map((spec) => spec.level));
    this.mutateWithoutObserving(attachment, () => {
      this.clearDecorations(attachment);
      const items = Array.from(
        attachment.container.querySelectorAll<HTMLElement>(OUTLINE_ITEM_SELECTOR),
      );
      const labels = items.map((item) => item.textContent ?? "");
      attachment.model = model;

      for (const match of matchOutlineHeadingSpecs(labels, specs)) {
        const item = items[match.itemIndex];
        const spec = specs[match.specIndex];
        const modelItem = model[match.specIndex];
        const row = item?.closest<HTMLElement>(OUTLINE_ROW_SELECTOR);
        if (!item || !spec || !modelItem || !row || !attachment.container.contains(row)) {
          continue;
        }

        row.classList.add(OUTLINE_ROW_CLASS);
        row.dataset.extendedHeadingLevel = String(spec.level);
        row.dataset.extendedHeadingRoot = String(modelItem.rootIndex);
        row.dataset.extendedHeadingOrphan = String(modelItem.orphan);
        row.dataset.extendedHeadingSpecIndex = String(match.specIndex);
        const decorated: DecoratedOutlineRow = {
          item,
          model: modelItem,
          row,
          specIndex: match.specIndex,
        };
        attachment.rowsBySpecIndex.set(match.specIndex, decorated);

        if (this.plugin.settings.showOutlinePaneHeadingLevelMarkers) {
          const marker = item.createSpan({
            cls: OUTLINE_LEVEL_MARKER_CLASS,
            text: `H${spec.level}`,
            attr: { "aria-hidden": "true" },
          });
          marker.dataset.level = String(spec.level);
          item.insertBefore(marker, item.firstChild);
        }

        if (
          this.plugin.settings.renderInlineSvgsInDefaultOutline &&
          spec.svgMarkup?.length
        ) {
          this.appendSanitizedSvgs(item, spec.svgMarkup, spec.placement);
        }
      }

      if (
        attachment.rowsBySpecIndex.size > 0 &&
        (this.plugin.settings.enableOutlinePaneHeadingStaticTreeIndentationGuides ||
          this.plugin.settings.enableOutlinePaneHeadingThreading)
      ) {
        this.ensureOverlay(attachment);
      }
      if (attachment.rowsBySpecIndex.size > 0) {
        attachment.container.classList.add(OUTLINE_HOST_CLASS);
      }
      this.renderVisuals(attachment);
    });
  }

  private getOutlineFile(leaf: WorkspaceLeaf): TFile | null {
    const file = (leaf.view as { file?: unknown }).file;
    return file instanceof TFile ? file : this.plugin.app.workspace.getActiveFile();
  }

  private async getSourceText(file: TFile): Promise<string> {
    const view = this.plugin.app.workspace
      .getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find(
        (candidate): candidate is MarkdownView =>
          candidate instanceof MarkdownView && candidate.file?.path === file.path,
      );
    return view ? view.editor.getValue() : this.plugin.app.vault.cachedRead(file);
  }

  private buildSpecs(text: string, file: TFile): OutlineHeadingSpec[] {
    const labelsByLine = new Map<number, string>();
    const cachedHeadings: HeadingCache[] =
      this.plugin.app.metadataCache.getFileCache(file)?.headings ?? [];
    for (const heading of cachedHeadings) {
      labelsByLine.set(
        heading.position.start.line,
        outlineLabelFromHeadingBody(heading.heading),
      );
    }

    return scanHeadings(text, 1, this.plugin.settings.maximumLevel).map((heading) => {
      const extracted = extractInlineSvgFragments(heading.rawBody);
      return {
        label:
          labelsByLine.get(heading.line) ??
          extracted?.label ??
          outlineLabelFromHeadingBody(heading.rawBody),
        level: heading.level,
        ...(extracted?.placement ? { placement: extracted.placement } : {}),
        ...(extracted ? { svgMarkup: extracted.svgMarkup } : {}),
      };
    });
  }

  private appendSanitizedSvgs(
    item: HTMLElement,
    markupItems: string[],
    placement?: "inside-trailing-parentheses",
  ): void {
    const wrapper = item.createSpan({
      cls: placement === "inside-trailing-parentheses"
        ? `${OUTLINE_SVG_CLASS} ${OUTLINE_SVG_PARENTHESIZED_CLASS}`
        : OUTLINE_SVG_CLASS,
      attr: { "aria-hidden": "true" },
    });

    for (const markup of markupItems) {
      const fragment = sanitizeHTMLToDom(markup);
      for (const svg of Array.from(fragment.querySelectorAll("svg"))) wrapper.append(svg);
    }
    if (wrapper.childElementCount === 0) {
      wrapper.remove();
      return;
    }

    wrapper.remove();
    if (
      placement === "inside-trailing-parentheses" &&
      this.insertBeforeTrailingParenthesis(item, wrapper)
    ) return;
    item.append(wrapper);
  }

  private insertBeforeTrailingParenthesis(item: HTMLElement, wrapper: HTMLElement): boolean {
    const walker = item.ownerDocument.createTreeWalker(item, 4);
    let candidate: Text | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === 3 && (node.textContent ?? "").includes(")")) {
        candidate = node as Text;
      }
    }
    if (!candidate) return false;

    const index = candidate.data.lastIndexOf(")");
    if (index < 0) return false;
    const suffix = candidate.splitText(index);
    suffix.parentNode?.insertBefore(wrapper, suffix);
    return wrapper.parentNode !== null;
  }

  private ensureOverlay(attachment: OutlineAttachment): void {
    if (attachment.overlay?.isConnected) return;
    const ownerDocument = attachment.container.ownerDocument;
    const overlay = ownerDocument.createElementNS(SVG_NAMESPACE, "svg");
    overlay.classList.add(OUTLINE_OVERLAY_CLASS);
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("focusable", "false");
    const guideLayer = ownerDocument.createElementNS(SVG_NAMESPACE, "g");
    const threadLayer = ownerDocument.createElementNS(SVG_NAMESPACE, "g");
    overlay.append(guideLayer, threadLayer);
    attachment.container.append(overlay);
    attachment.overlay = overlay;
    attachment.guideLayer = guideLayer;
    attachment.threadLayer = threadLayer;
  }

  private renderVisuals(attachment: OutlineAttachment): void {
    const { overlay, guideLayer, threadLayer } = attachment;
    if (!overlay || !guideLayer || !threadLayer) return;
    guideLayer.replaceChildren();
    threadLayer.replaceChildren();

    const width = attachment.container.clientWidth;
    const height = attachment.container.clientHeight;
    if (width <= 0 || height <= 0) return;
    overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
    overlay.setAttribute("width", String(width));
    overlay.setAttribute("height", String(height));

    const measured = this.measureRows(attachment, width, height);
    if (this.plugin.settings.enableOutlinePaneHeadingStaticTreeIndentationGuides) {
      this.renderStaticGuides(attachment, measured, guideLayer, width, height);
    }
    if (this.plugin.settings.enableOutlinePaneHeadingThreading) {
      this.renderThreads(attachment, measured, threadLayer, width, height);
    }
  }

  private measureRows(
    attachment: OutlineAttachment,
    width: number,
    height: number,
  ): Map<number, MeasuredOutlineRow> {
    const measured = new Map<number, MeasuredOutlineRow>();
    const hostRect = attachment.container.getBoundingClientRect();
    for (const [specIndex, decorated] of attachment.rowsBySpecIndex) {
      const rowRect = decorated.row.getBoundingClientRect();
      const itemRect = decorated.item.getBoundingClientRect();
      if (rowRect.height <= 0 || itemRect.width <= 0) continue;
      const y = clamp(rowRect.top + rowRect.height / 2 - hostRect.top, 0, height);
      const endX = clamp(itemRect.left - hostRect.left, 0, width);
      measured.set(specIndex, { ...decorated, endX, y });
    }
    return measured;
  }

  private renderStaticGuides(
    attachment: OutlineAttachment,
    measured: Map<number, MeasuredOutlineRow>,
    layer: SVGGElement,
    width: number,
    height: number,
  ): void {
    const connectorLength = this.readStyleNumber(
      attachment.container,
      "--extended-outline-guide-connector-length",
      18,
    );
    const firstBranchRise = this.readStyleNumber(
      attachment.container,
      "--extended-outline-guide-first-branch-rise",
      10,
    );
    const connectorOffset = this.readStyleNumber(
      attachment.container,
      "--extended-outline-guide-connector-offset",
      0,
    );
    const markerGap = this.readStyleNumber(
      attachment.container,
      "--extended-outline-guide-marker-gap",
      4,
    );

    const rootRows: MeasuredOutlineRow[] = [];
    const childrenByParent = new Map<number, MeasuredOutlineRow[]>();
    for (const entry of measured.values()) {
      const parentIndex = entry.model.parentIndex;
      if (parentIndex === null) {
        rootRows.push(entry);
        continue;
      }
      const children = childrenByParent.get(parentIndex) ?? [];
      children.push(entry);
      childrenByParent.set(parentIndex, children);
    }
    this.appendStaticGuideForRows(
      layer,
      rootRows.filter((entry) => !entry.model.orphan),
      connectorLength,
      firstBranchRise,
      connectorOffset,
      markerGap,
      width,
      height,
      true,
    );
    this.appendStaticGuideForRows(
      layer,
      rootRows.filter((entry) => entry.model.orphan),
      connectorLength,
      firstBranchRise,
      connectorOffset,
      markerGap,
      width,
      height,
      true,
    );

    for (const [parentIndex, children] of childrenByParent) {
      const parent = measured.get(parentIndex);
      if (!parent) continue;
      this.appendStaticGuideForRows(
        layer,
        children,
        connectorLength,
        firstBranchRise,
        connectorOffset,
        markerGap,
        width,
        height,
        false,
        parent,
      );
    }
  }

  private appendStaticGuideForRows(
    layer: SVGGElement,
    rows: MeasuredOutlineRow[],
    connectorLength: number,
    firstBranchRise: number,
    connectorOffset: number,
    markerGap: number,
    width: number,
    height: number,
    virtualRoot: boolean,
    parent?: MeasuredOutlineRow,
  ): void {
    if (rows.length === 0) return;
    const sortedRows = [...rows].sort((left, right) => left.y - right.y);
    const connectors = sortedRows.map((entry) => ({
      endX: clamp(entry.endX - markerGap, 0, width),
      y: clamp(entry.y + connectorOffset, 0, height),
    }));
    const first = connectors[0];
    const last = connectors[connectors.length - 1];
    const spineX = clamp(
      Math.min(...connectors.map((connector) => connector.endX)) - connectorLength,
      0,
      width,
    );
    const parentY = parent?.y ?? first.y;
    const startY = virtualRoot
      ? clamp(first.y - firstBranchRise, 0, height)
      : clamp(parentY + firstBranchRise, 0, height);
    const path = buildOutlineGuidePath({
      connectors,
      endY: last.y,
      spineX,
      startY,
    });
    this.appendPath(layer, path, OUTLINE_GUIDE_PATH_CLASS);
  }

  private renderThreads(
    attachment: OutlineAttachment,
    measured: Map<number, MeasuredOutlineRow>,
    layer: SVGGElement,
    width: number,
    height: number,
  ): void {
    const hoveredIndex = attachment.hoveredSpecIndex;
    if (hoveredIndex === null || !measured.has(hoveredIndex)) return;
    const hovered = attachment.model[hoveredIndex];
    if (!hovered) return;

    const connectorLength = this.readStyleNumber(
      attachment.container,
      "--extended-outline-thread-connector-length",
      28,
    );
    const markerGap = this.readStyleNumber(
      attachment.container,
      "--extended-outline-thread-marker-gap",
      4,
    );
    const verticalOffset = this.readStyleNumber(
      attachment.container,
      "--extended-outline-thread-vertical-offset",
      0,
    );
    const radius = this.readStyleNumber(
      attachment.container,
      "--extended-outline-thread-corner-radius",
      8,
    );
    const drawnEdges = new Set<number>();

    const appendEdge = (childIndex: number, depth: number): void => {
      if (drawnEdges.has(childIndex)) return;
      const child = measured.get(childIndex);
      const parentIndex = attachment.model[childIndex]?.parentIndex;
      const parent = parentIndex === null || parentIndex === undefined
        ? null
        : measured.get(parentIndex);
      if (!child || !parent) return;
      const endX = clamp(child.endX - markerGap, 0, width);
      const startX = clamp(endX - connectorLength, 0, width);
      const startY = clamp(parent.y + verticalOffset, 0, height);
      const endY = clamp(child.y + verticalOffset, 0, height);
      const path = buildRoundedOutlineThreadPath({
        endX,
        endY,
        radius,
        startX,
        startY,
      });
      this.appendPath(
        layer,
        path,
        `${OUTLINE_THREAD_PATH_CLASS} extended-heading-outline-thread-depth-${clamp(depth, 1, 8)}`,
      );
      drawnEdges.add(childIndex);
    };

    const appendAncestorEdges = (depthOffset: number): void => {
      const indexes: number[] = [];
      let currentIndex: number | null = hoveredIndex;
      while (currentIndex !== null) {
        const current: OutlineTreeModelItem | undefined =
          attachment.model[currentIndex];
        if (!current || current.parentIndex === null) break;
        indexes.push(currentIndex);
        currentIndex = current.parentIndex;
      }
      indexes.reverse();
      for (const childIndex of indexes) {
        const child = attachment.model[childIndex];
        if (child) appendEdge(childIndex, child.depth + depthOffset);
      }
    };

    const appendBranchEdges = (
      predicate: (entry: OutlineTreeModelItem) => boolean,
      depthOffset: number,
    ): void => {
      attachment.model.forEach((entry, index) => {
        if (entry.parentIndex !== null && predicate(entry)) {
          appendEdge(index, entry.depth + depthOffset);
        }
      });
    };

    if (hovered.orphan) {
      if (!this.plugin.settings.activeOrphanOutlinePaneHeadingTreeThreading) return;
      const showAll =
        this.plugin.settings.allBranchesOfActiveOrphanOutlinePaneHeadingTreeThreading;
      const showActive = this.plugin.settings.activeOrphanOutlinePaneHeadingThreading;
      if (!showAll && !showActive) return;
      const orphanRoots = Array.from(measured.values()).filter(
        (entry) => entry.model.orphan && entry.model.parentIndex === null,
      );
      const activeRootIndex = hovered.rootIndex;
      this.appendRootThread(
        layer,
        orphanRoots,
        showAll ? null : activeRootIndex,
        connectorLength,
        markerGap,
        verticalOffset,
        radius,
        width,
        height,
      );
      if (showAll) {
        appendBranchEdges((entry) => entry.orphan, 1);
      } else {
        appendAncestorEdges(1);
      }
      return;
    }

    const rootLevelEnabled =
      this.plugin.settings.activeRootLevelOutlinePaneHeadingTreeThreading;
    const rootLevelAll =
      rootLevelEnabled &&
      this.plugin.settings.allBranchesOfActiveRootLevelOutlinePaneHeadingTreeThreading;
    const rootLevelActive =
      rootLevelEnabled &&
      this.plugin.settings.activeRootLevelOutlinePaneHeadingThreading;
    if (rootLevelAll || rootLevelActive) {
      const roots = Array.from(measured.values()).filter(
        (entry) => !entry.model.orphan && entry.model.parentIndex === null,
      );
      this.appendRootThread(
        layer,
        roots,
        rootLevelAll ? null : hovered.rootIndex,
        connectorLength,
        markerGap,
        verticalOffset,
        radius,
        width,
        height,
      );
      if (rootLevelAll) {
        appendBranchEdges((entry) => !entry.orphan, 1);
      } else {
        appendAncestorEdges(1);
      }
    }

    const individualDepthOffset = rootLevelAll || rootLevelActive ? 1 : 0;
    if (this.plugin.settings.allBranchesOfActiveOutlinePaneHeadingTreeThreading) {
      appendBranchEdges(
        (entry) => !entry.orphan && entry.rootIndex === hovered.rootIndex,
        individualDepthOffset,
      );
    } else if (this.plugin.settings.activeOutlinePaneHeadingThreading) {
      appendAncestorEdges(individualDepthOffset);
    }
  }

  private appendRootThread(
    layer: SVGGElement,
    roots: MeasuredOutlineRow[],
    activeRootIndex: number | null,
    connectorLength: number,
    markerGap: number,
    verticalOffset: number,
    radius: number,
    width: number,
    height: number,
  ): void {
    const sortedRoots = [...roots].sort((left, right) => left.specIndex - right.specIndex);
    const activePosition = activeRootIndex === null
      ? sortedRoots.length - 1
      : sortedRoots.findIndex((entry) => entry.specIndex === activeRootIndex);
    if (activePosition < 0) return;
    const visibleRoots = sortedRoots.slice(0, activePosition + 1);
    const connectors = visibleRoots.map((entry) => ({
      endX: clamp(entry.endX - markerGap, 0, width),
      y: clamp(entry.y + verticalOffset, 0, height),
    }));
    if (connectors.length === 0) return;
    const spineX = clamp(
      Math.min(...connectors.map((connector) => connector.endX)) - connectorLength,
      0,
      width,
    );
    const startY = clamp(connectors[0].y - connectorLength / 2, 0, height);
    const path = buildOutlineRootThreadPath({ connectors, radius, spineX, startY });
    this.appendPath(
      layer,
      path,
      `${OUTLINE_THREAD_PATH_CLASS} extended-heading-outline-thread-depth-1`,
    );
  }

  private appendPath(layer: SVGGElement, pathData: string, className: string): void {
    if (!pathData) return;
    const path = layer.ownerDocument.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("class", className);
    path.setAttribute("d", pathData);
    layer.append(path);
  }

  private readStyleNumber(element: HTMLElement, property: string, fallback: number): number {
    const view = element.ownerDocument.defaultView;
    const value = view?.getComputedStyle(element).getPropertyValue(property) ?? "";
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private handlePointerMove(attachment: OutlineAttachment, event: PointerEvent): void {
    const ElementConstructor = attachment.container.ownerDocument.defaultView?.Element;
    const target = event.target;
    const row = ElementConstructor && target instanceof ElementConstructor
      ? target.closest<HTMLElement>(`.${OUTLINE_ROW_CLASS}`)
      : null;
    const indexText = row?.dataset.extendedHeadingSpecIndex;
    let specIndex = indexText === undefined ? null : Number(indexText);
    if (specIndex !== null && !Number.isInteger(specIndex)) specIndex = null;
    if (specIndex === attachment.hoveredSpecIndex) return;
    attachment.hoveredSpecIndex = specIndex;
    this.scheduleVisualPass(attachment);
  }

  private clearDecorations(attachment: OutlineAttachment): void {
    for (const decoration of Array.from(
      attachment.container.querySelectorAll<HTMLElement>(
        `.${OUTLINE_LEVEL_MARKER_CLASS}, .${OUTLINE_SVG_CLASS}`,
      ),
    )) {
      const parent = decoration.parentNode;
      decoration.remove();
      parent?.normalize();
    }
    for (const row of Array.from(
      attachment.container.querySelectorAll<HTMLElement>(`.${OUTLINE_ROW_CLASS}`),
    )) {
      row.classList.remove(OUTLINE_ROW_CLASS);
      delete row.dataset.extendedHeadingLevel;
      delete row.dataset.extendedHeadingRoot;
      delete row.dataset.extendedHeadingOrphan;
      delete row.dataset.extendedHeadingSpecIndex;
    }
    attachment.overlay?.remove();
    attachment.container.classList.remove(OUTLINE_HOST_CLASS);
    attachment.overlay = null;
    attachment.guideLayer = null;
    attachment.threadLayer = null;
    attachment.hoveredSpecIndex = null;
    attachment.rowsBySpecIndex.clear();
    attachment.model = [];
  }

  private observeMutations(attachment: OutlineAttachment): void {
    attachment.observer.observe(attachment.container, {
      attributeFilter: ["aria-expanded", "class", "style"],
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  private mutateWithoutObserving(attachment: OutlineAttachment, mutation: () => void): void {
    attachment.observer.disconnect();
    try {
      mutation();
    } finally {
      attachment.observer.takeRecords();
      if (
        this.started &&
        attachment.container.isConnected &&
        this.attachments.get(attachment.leaf) === attachment
      ) {
        this.observeMutations(attachment);
      }
    }
  }
}
