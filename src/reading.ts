import type { ParsedHeading } from "./headings";
import { parseHeadingLine } from "./headings";
import type { ExtendedHeadingsSettings } from "./settings";

interface DomPoint {
  node: Node;
  offset: number;
}

let foldId = 0;

function locateTextOffset(root: HTMLElement, target: number): DomPoint {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let last: Text | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    last = node;
    const next = consumed + node.data.length;
    if (target <= next) return { node, offset: target - consumed };
    consumed = next;
  }
  return last ? { node: last, offset: last.data.length } : { node: root, offset: 0 };
}

function cloneTextRange(root: HTMLElement, from: number, to: number): DocumentFragment {
  const range = document.createRange();
  const start = locateTextOffset(root, from);
  const end = locateTextOffset(root, to);
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range.cloneContents();
}

function lineRanges(text: string): Array<{ from: number; to: number; heading: ParsedHeading }> {
  const ranges: Array<{ from: number; to: number; heading: ParsedHeading }> = [];
  let from = 0;
  let line = 0;
  while (from <= text.length) {
    const newline = text.indexOf("\n", from);
    const to = newline < 0 ? text.length : newline;
    const heading = parseHeadingLine(text.slice(from, to), line, from, 7, 12);
    if (heading) ranges.push({ from, to, heading });
    if (newline < 0) break;
    from = newline + 1;
    line += 1;
  }
  return ranges;
}

function appendParagraph(source: HTMLParagraphElement, fragment: DocumentFragment, before: Node): void {
  if (!fragment.textContent?.trim()) return;
  const paragraph = source.cloneNode(false) as HTMLParagraphElement;
  paragraph.removeAttribute("id");
  paragraph.dataset.extendedHeadingsProcessed = "true";
  paragraph.append(fragment);
  before.parentNode?.insertBefore(paragraph, before);
}

function appendHeading(
  source: HTMLParagraphElement,
  heading: ParsedHeading,
  fragment: DocumentFragment,
  before: Node,
  settings: ExtendedHeadingsSettings,
): void {
  const element = document.createElement("div");
  element.className = `extended-heading-reading extended-heading-${heading.level}`;
  element.setAttribute("role", "heading");
  element.setAttribute("aria-level", String(heading.level));
  element.dataset.heading = fragment.textContent?.trim() ?? heading.rawBody;
  element.tabIndex = -1;

  if (settings.readingModeFolding) {
    const fold = document.createElement("button");
    fold.className = "extended-heading-fold";
    fold.type = "button";
    fold.setAttribute("aria-label", "Fold heading");
    fold.setAttribute("aria-expanded", "true");
    fold.textContent = "⌄";
    element.append(fold);
  }
  element.append(fragment);
  source.parentNode?.insertBefore(element, before);
}

export function renderExtendedHeadings(root: HTMLElement, getSettings: () => ExtendedHeadingsSettings): void {
  const settings = getSettings();
  for (const paragraph of Array.from(root.querySelectorAll("p"))) {
    if (paragraph.dataset.extendedHeadingsProcessed === "true") continue;
    const text = paragraph.textContent ?? "";
    const matches = lineRanges(text).filter((match) => match.heading.level <= settings.maximumLevel);
    if (matches.length === 0) {
      paragraph.dataset.extendedHeadingsProcessed = "true";
      continue;
    }

    let cursor = 0;
    for (const match of matches) {
      const regularEnd = match.from > cursor && text[match.from - 1] === "\n" ? match.from - 1 : match.from;
      appendParagraph(paragraph, cloneTextRange(paragraph, cursor, regularEnd), paragraph);
      appendHeading(
        paragraph,
        match.heading,
        cloneTextRange(paragraph, match.heading.bodyFrom, match.heading.bodyTo),
        paragraph,
        settings,
      );
      cursor = match.to < text.length && text[match.to] === "\n" ? match.to + 1 : match.to;
    }
    appendParagraph(paragraph, cloneTextRange(paragraph, cursor, text.length), paragraph);
    paragraph.remove();
  }
}

function headingLevel(element: Element): number | null {
  if (/^H[1-6]$/.test(element.tagName)) return Number(element.tagName.slice(1));
  if (element.classList.contains("extended-heading-reading")) {
    return Number(element.getAttribute("aria-level"));
  }
  return null;
}

function containingBlock(element: HTMLElement, preview: HTMLElement): HTMLElement {
  let block = element;
  while (block.parentElement && block.parentElement !== preview) {
    if (block.parentElement.classList.contains("markdown-preview-section")) return block;
    block = block.parentElement;
  }
  return block;
}

export function toggleReadingFold(button: HTMLButtonElement): void {
  const heading = button.closest<HTMLElement>(".extended-heading-reading");
  const preview = button.closest<HTMLElement>(".markdown-preview-view");
  if (!heading || !preview) return;
  const level = headingLevel(heading);
  if (!level) return;

  const owner = heading.dataset.extendedFoldOwner ?? `extended-fold-${++foldId}`;
  heading.dataset.extendedFoldOwner = owner;
  const folding = heading.dataset.extendedFolded !== "true";
  heading.dataset.extendedFolded = String(folding);
  button.setAttribute("aria-expanded", String(!folding));
  button.setAttribute("aria-label", folding ? "Unfold heading" : "Fold heading");
  button.textContent = folding ? "›" : "⌄";

  const blocks = Array.from(
    preview.querySelectorAll<HTMLElement>(".markdown-preview-section > *"),
  );
  const currentBlock = containingBlock(heading, preview);
  const start = blocks.indexOf(currentBlock);
  if (start < 0) return;

  for (const block of blocks.slice(start + 1)) {
    const candidate = block.querySelector<HTMLElement>(
      "h1, h2, h3, h4, h5, h6, .extended-heading-reading",
    );
    const candidateLevel = candidate ? headingLevel(candidate) : null;
    if (candidateLevel !== null && candidateLevel <= level) break;

    const owners = new Set((block.dataset.extendedHiddenBy ?? "").split(" ").filter(Boolean));
    if (folding) owners.add(owner);
    else owners.delete(owner);
    if (owners.size > 0) block.dataset.extendedHiddenBy = [...owners].join(" ");
    else delete block.dataset.extendedHiddenBy;
  }
}
