import { type Editor, type EditorChange, type EditorPosition, Notice } from "obsidian";
import {
  applyHeadingToLine,
  childListIndentationChanges,
  type HeadingApplicationOptions,
} from "./heading-commands";
import { scanHeadings } from "./headings";
import type { ExtendedHeadingsSettings } from "./settings";

interface LineBlock {
  start: number;
  end: number;
}

function comparePositions(left: EditorPosition, right: EditorPosition): number {
  return left.line - right.line || left.ch - right.ch;
}

export function selectedLineBlocks(editor: Editor): LineBlock[] {
  const blocks = editor.listSelections().map(({ anchor, head }) => {
    const from = comparePositions(anchor, head) <= 0 ? anchor : head;
    const to = comparePositions(anchor, head) <= 0 ? head : anchor;
    const end = to.line > from.line && to.ch === 0 ? to.line - 1 : to.line;
    return { start: from.line, end: Math.max(from.line, end) };
  });

  blocks.sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: LineBlock[] = [];
  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    if (previous && block.start <= previous.end + 1) previous.end = Math.max(previous.end, block.end);
    else merged.push({ ...block });
  }
  return merged;
}

function selectedLines(editor: Editor): number[] {
  const lines = new Set<number>();
  for (const block of selectedLineBlocks(editor)) {
    for (let line = block.start; line <= block.end; line += 1) lines.add(line);
  }
  return [...lines].sort((left, right) => left - right);
}

function splitPatterns(value: string): string[] {
  return value.split("\n").map((pattern) => pattern.trim()).filter(Boolean);
}

function applicationOptions(settings: ExtendedHeadingsSettings): HeadingApplicationOptions {
  return {
    removeUnorderedListMarker: settings.removeUnorderedListMarker,
    removeOrderedListMarker: settings.removeOrderedListMarker,
    customBeginningPatterns: splitPatterns(settings.customBeginningPatterns),
    removeBold: settings.removeBold,
    removeItalic: settings.removeItalic,
    customSurroundingPatterns: splitPatterns(settings.customSurroundingPatterns),
  };
}

function wholeLineChanges(editor: Editor, replacements: Map<number, string>): EditorChange[] {
  return [...replacements.entries()]
    .sort(([left], [right]) => left - right)
    .map(([line, text]) => ({
      from: { line, ch: 0 },
      to: { line, ch: editor.getLine(line).length },
      text,
    }));
}

function headingLevels(editor: Editor, maximumLevel: number): Map<number, number> {
  return new Map(
    scanHeadings(editor.getValue(), 1, maximumLevel).map((heading) => [heading.line, heading.level]),
  );
}

export function selectionContainsHeading(editor: Editor, maximumLevel: number): boolean {
  const levels = headingLevels(editor, maximumLevel);
  return selectedLines(editor).some((line) => levels.has(line));
}

export function shiftHeadings(
  editor: Editor,
  direction: 1 | -1,
  settings: ExtendedHeadingsSettings,
  forcePlainLines = false,
): boolean {
  const lines = selectedLines(editor);
  const levels = headingLevels(editor, settings.maximumLevel);
  const targets = lines
    .map((line) => ({ line, level: levels.get(line) }))
    .filter((target) => forcePlainLines || target.level !== undefined);

  if (targets.length === 0) return false;
  if (direction === 1 && targets.some(({ level }) => (level ?? 0) >= settings.maximumLevel)) {
    new Notice(`Cannot increase: the selection contains H${settings.maximumLevel}`);
    return true;
  }
  if (
    direction === -1 &&
    targets.some(({ level }) => level !== undefined && level <= settings.lowerHeadingLimit)
  ) {
    new Notice(`Cannot decrease below heading level ${settings.lowerHeadingLimit}`);
    return true;
  }

  const options = applicationOptions(settings);
  const replacements = new Map<number, string>();
  for (const { line, level } of targets) {
    const targetLevel = (level ?? 0) + direction;
    replacements.set(
      line,
      applyHeadingToLine(editor.getLine(line), targetLevel, options, settings.maximumLevel),
    );
  }
  editor.transaction({ changes: wholeLineChanges(editor, replacements) });
  return true;
}

function addChildListChanges(
  sourceLines: readonly string[],
  selected: Set<number>,
  replacements: Map<number, string>,
  parentLine: number,
  targetLevel: number,
  settings: ExtendedHeadingsSettings,
): void {
  for (const change of childListIndentationChanges(
    sourceLines,
    parentLine,
    targetLevel,
    settings.childListBehavior,
    settings.tabSize,
  )) {
    if (!selected.has(change.line)) replacements.set(change.line, change.text);
  }
}

function applyBlocks(
  editor: Editor,
  blockTargets: Array<{ block: LineBlock; level: number }>,
  settings: ExtendedHeadingsSettings,
): boolean {
  const sourceLines = Array.from({ length: editor.lineCount() }, (_, line) => editor.getLine(line));
  const options = applicationOptions(settings);
  const selected = new Set<number>();
  const replacements = new Map<number, string>();

  for (const { block, level } of blockTargets) {
    for (let line = block.start; line <= block.end; line += 1) {
      selected.add(line);
      replacements.set(
        line,
        applyHeadingToLine(sourceLines[line], level, options, settings.maximumLevel),
      );
    }
  }
  for (const { block, level } of blockTargets) {
    addChildListChanges(sourceLines, selected, replacements, block.end, level, settings);
  }

  editor.transaction({ changes: wholeLineChanges(editor, replacements) });
  return replacements.size > 0;
}

export function setHeadingAtSelections(
  editor: Editor,
  targetLevel: number,
  settings: ExtendedHeadingsSettings,
): boolean {
  if (targetLevel < 0 || targetLevel > settings.maximumLevel) return false;
  const blocks = selectedLineBlocks(editor).map((block) => ({ block, level: targetLevel }));
  return applyBlocks(editor, blocks, settings);
}

export type ContextualHeadingDirection = "current" | "deeper" | "higher";

export function insertHeadingAtContext(
  editor: Editor,
  direction: ContextualHeadingDirection,
  settings: ExtendedHeadingsSettings,
): boolean {
  const headings = scanHeadings(editor.getValue(), 1, settings.maximumLevel);
  const delta = direction === "deeper" ? 1 : direction === "higher" ? -1 : 0;
  const blockTargets = selectedLineBlocks(editor).map((block) => {
    const preceding = headings.filter((heading) => heading.line < block.start);
    const previous = preceding.length > 0 ? preceding[preceding.length - 1].level : 0;
    return { block, level: Math.max(1, previous + delta) };
  });

  if (blockTargets.some(({ level }) => level > settings.maximumLevel)) {
    new Notice(`Cannot insert a heading beyond H${settings.maximumLevel}`);
    return true;
  }
  return applyBlocks(editor, blockTargets, settings);
}
