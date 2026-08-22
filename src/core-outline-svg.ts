import {
  MarkdownView,
  TFile,
  sanitizeHTMLToDom,
  type HeadingCache,
  type WorkspaceLeaf,
} from "obsidian";
import { scanHeadings } from "./headings";
import type ExtendedHeadingsPlugin from "./main";

const OUTLINE_ITEM_SELECTOR = ".tree-item-inner";
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

interface OutlineAttachment {
  leaf: WorkspaceLeaf;
  container: HTMLElement;
  observer: MutationObserver;
  animationFrame: number;
  muted: boolean;
  revision: number;
}

function inlineSvgPattern(): RegExp {
  return /<svg\b[^>]*\/\s*>|<svg\b[\s\S]*?<\/svg\s*>/giu;
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

export class CoreOutlineSvgRenderer {
  private readonly attachments = new Map<WorkspaceLeaf, OutlineAttachment>();
  private enabled = false;
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
    this.plugin.app.workspace.onLayoutReady(() => this.refreshAll());
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) this.refreshAll();
    else this.detachAll();
  }

  refreshAll(): void {
    if (!this.started || !this.enabled) return;
    this.attachAll();
    for (const attachment of this.attachments.values()) this.schedulePass(attachment);
  }

  destroy(): void {
    this.started = false;
    this.enabled = false;
    this.detachAll();
  }

  private attachAll(): void {
    for (const [leaf, attachment] of this.attachments) {
      if (!attachment.container.isConnected) this.detach(leaf, attachment);
    }

    for (const leaf of this.plugin.app.workspace.getLeavesOfType("outline")) {
      if (this.attachments.has(leaf)) continue;
      const container = leaf.view.containerEl;
      const attachment: OutlineAttachment = {
        leaf,
        container,
        observer: new MutationObserver(() => {
          if (!attachment.muted) this.schedulePass(attachment);
        }),
        animationFrame: 0,
        muted: false,
        revision: 0,
      };
      attachment.observer.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      this.attachments.set(leaf, attachment);
    }
  }

  private detachAll(): void {
    for (const [leaf, attachment] of this.attachments) this.detach(leaf, attachment);
  }

  private detach(leaf: WorkspaceLeaf, attachment: OutlineAttachment): void {
    attachment.revision += 1;
    attachment.observer.disconnect();
    if (attachment.animationFrame !== 0) {
      const win = attachment.container.ownerDocument.defaultView ?? window;
      win.cancelAnimationFrame(attachment.animationFrame);
    }
    this.removeDecorations(attachment.container);
    this.attachments.delete(leaf);
  }

  private schedulePass(attachment: OutlineAttachment): void {
    if (attachment.animationFrame !== 0) return;
    const win = attachment.container.ownerDocument.defaultView ?? window;
    attachment.animationFrame = win.requestAnimationFrame(() => {
      attachment.animationFrame = 0;
      void this.runPass(attachment);
    });
  }

  private async runPass(attachment: OutlineAttachment): Promise<void> {
    const revision = ++attachment.revision;
    const file = this.getOutlineFile(attachment.leaf);
    if (!file) {
      this.mutateWithoutObserving(attachment, () => this.removeDecorations(attachment.container));
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
      !this.enabled ||
      !attachment.container.isConnected
    ) return;

    const specs = this.buildSpecs(text, file);
    this.mutateWithoutObserving(attachment, () => {
      this.removeDecorations(attachment.container);
      const items = Array.from(
        attachment.container.querySelectorAll<HTMLElement>(OUTLINE_ITEM_SELECTOR),
      );
      const labels = items.map((item) => item.textContent ?? "");
      for (const match of matchOutlineSvgSpecs(labels, specs)) {
        const item = items[match.itemIndex];
        if (item) this.appendSanitizedSvgs(item, match.svgMarkup, match.placement);
      }
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

  private buildSpecs(text: string, file: TFile): OutlineSvgSpec[] {
    const labelsByLine = new Map<number, string>();
    const cachedHeadings: HeadingCache[] =
      this.plugin.app.metadataCache.getFileCache(file)?.headings ?? [];
    for (const heading of cachedHeadings) {
      labelsByLine.set(
        heading.position.start.line,
        outlineLabelFromHeadingBody(heading.heading),
      );
    }

    const specs: OutlineSvgSpec[] = [];
    for (const heading of scanHeadings(text, 1, this.plugin.settings.maximumLevel)) {
      const extracted = extractInlineSvgFragments(heading.rawBody);
      if (!extracted) continue;
      specs.push({
        label: labelsByLine.get(heading.line) ?? extracted.label,
        svgMarkup: extracted.svgMarkup,
        ...(extracted.placement ? { placement: extracted.placement } : {}),
      });
    }
    return specs;
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

  private removeDecorations(container: HTMLElement): void {
    for (const decoration of Array.from(
      container.querySelectorAll<HTMLElement>(`.${OUTLINE_SVG_CLASS}`),
    )) {
      const parent = decoration.parentNode;
      decoration.remove();
      parent?.normalize();
    }
  }

  private mutateWithoutObserving(attachment: OutlineAttachment, mutation: () => void): void {
    attachment.muted = true;
    try {
      mutation();
    } finally {
      attachment.observer.takeRecords();
      attachment.muted = false;
    }
  }
}
