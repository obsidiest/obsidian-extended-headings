import {
  type App,
  type Editor,
  type EditorPosition,
  type ListItemCache,
  type MarkdownFileInfo,
  type MarkdownView,
  Notice,
  type SectionCache,
  stripHeading,
  type TFile,
} from "obsidian";
import { headingPathAtLine, parseHeadingLine } from "./headings";
import { normalizeHeadingAnchor } from "./reference-utils";

type BlockTarget = SectionCache | ListItemCache;
export type ReferenceTargetKind = "heading" | "block";

const INSERT_ID_AFTER = new Set([
  "blockquote",
  "callout",
  "code",
  "table",
  "comment",
  "footnoteDefinition",
]);

function containsLine(block: BlockTarget, line: number): boolean {
  return block.position.start.line <= line && block.position.end.line >= line;
}

function createBlockId(documentText: string): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
    const pattern = new RegExp(`(?:^|\\s)\\^${id}(?=\\s|$)`, "m");
    if (!pattern.test(documentText)) return id;
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export class ReferenceCommandService {
  constructor(
    private readonly app: App,
    private readonly maximumLevel: () => number,
  ) {}

  targetKind(editor: Editor, view: MarkdownFileInfo): ReferenceTargetKind | null {
    if (!view.file) return null;
    if (this.headingAtCursor(editor)) return "heading";
    return this.blockAtCursor(editor, view.file) ? "block" : null;
  }

  canCopy(editor: Editor, view: MarkdownView): boolean {
    return this.targetKind(editor, view) !== null;
  }

  async copyCurrent(editor: Editor, view: MarkdownFileInfo, embed: boolean): Promise<void> {
    const file = view.file;
    if (!file) return;

    const heading = this.headingAtCursor(editor);
    if (heading) {
      const anchor = normalizeHeadingAnchor(stripHeading(heading.rawBody));
      if (!anchor) {
        new Notice("This heading has no linkable text");
        return;
      }

      const hierarchy = headingPathAtLine(
        editor.getValue(),
        heading.line,
        this.maximumLevel(),
      );
      const ancestors = hierarchy.length > 0
        && hierarchy[hierarchy.length - 1].line === heading.line
        ? hierarchy.slice(0, -1)
        : [];
      const anchors = ancestors
        .map((ancestor) => normalizeHeadingAnchor(stripHeading(ancestor.rawBody)))
        .filter((ancestorAnchor) => ancestorAnchor.length > 0);
      anchors.push(anchor);

      await this.copyLink(file, `#${anchors.join("#")}`, embed);
      return;
    }

    const block = this.blockAtCursor(editor, file);
    if (!block) return;
    let blockId = block.id;
    if (!blockId) {
      blockId = createBlockId(editor.getValue());
      const end: EditorPosition = {
        line: block.position.end.line,
        ch: block.position.end.col,
      };
      const blockType = "type" in block ? block.type : "list";
      const spacer = INSERT_ID_AFTER.has(blockType) ? "\n\n" : " ";
      editor.replaceRange(`${spacer}^${blockId}`, end);
    }
    await this.copyLink(file, `#^${blockId}`, embed);
  }

  private headingAtCursor(editor: Editor) {
    const cursor = editor.getCursor("to");
    return parseHeadingLine(
      editor.getLine(cursor.line),
      cursor.line,
      0,
      1,
      this.maximumLevel(),
    );
  }

  private blockAtCursor(editor: Editor, file: TFile): BlockTarget | null {
    const line = editor.getCursor("to").line;
    const cache = this.app.metadataCache.getFileCache(file);
    const section = cache?.sections?.find((candidate) => containsLine(candidate, line));
    if (!section) return null;
    if (section.type !== "list") return section;

    const candidates = (cache?.listItems ?? []).filter((candidate) => containsLine(candidate, line));
    return candidates.sort((left, right) =>
      right.position.start.line - left.position.start.line
      || left.position.end.line - right.position.end.line,
    )[0] ?? section;
  }

  private async copyLink(file: TFile, subpath: string, embed: boolean): Promise<void> {
    const link = this.app.fileManager.generateMarkdownLink(file, "", subpath);
    try {
      await navigator.clipboard.writeText(`${embed ? "!" : ""}${link}`);
    } catch {
      new Notice("Could not write the link to the clipboard");
    }
  }
}
