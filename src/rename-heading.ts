import {
  type App,
  type Editor,
  type EditorChange,
  MarkdownView,
  Modal,
  Notice,
  parseLinktext,
  type ReferenceCache,
  stripHeading,
  type TFile,
} from "obsidian";
import { parseHeadingLine, type ParsedHeading } from "./headings";
import {
  headingSubpathMatches,
  normalizeHeadingAnchor,
  replaceReferenceHeadingSubpath,
} from "./reference-utils";

interface CommandManager {
  executeCommandById(id: string): boolean;
}

interface AppWithCommands extends App {
  commands?: CommandManager;
}

interface ReferenceEdit {
  from: { line: number; ch: number };
  to: { line: number; ch: number };
  startOffset: number;
  endOffset: number;
  original: string;
  replacement: string;
}

class RenameExtendedHeadingModal extends Modal {
  constructor(
    app: App,
    private readonly initialValue: string,
    private readonly submit: (value: string) => Promise<boolean>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("Rename this heading");
    this.contentEl.empty();
    const form = this.contentEl.createEl("form");
    const input = form.createEl("input", {
      attr: { type: "text", "aria-label": "New heading text" },
    });
    input.addClasses(["text-input", "extended-heading-rename-input"]);
    input.value = this.initialValue;

    const buttons = form.createDiv({ cls: "modal-button-container" });
    const cancel = buttons.createEl("button", { text: "Cancel", attr: { type: "button" } });
    const rename = buttons.createEl("button", { text: "Rename", attr: { type: "submit" } });
    rename.addClass("mod-cta");
    cancel.addEventListener("click", () => this.close());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleSubmit(input.value, rename);
    });

    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  private async handleSubmit(value: string, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    const accepted = await this.submit(value);
    if (accepted) this.close();
    else button.disabled = false;
  }
}

function referencesFor(cache: { links?: ReferenceCache[]; embeds?: ReferenceCache[] }): ReferenceCache[] {
  const found = [...(cache.links ?? []), ...(cache.embeds ?? [])];
  const seen = new Set<string>();
  return found.filter((reference) => {
    const key = `${reference.position.start.offset}:${reference.position.end.offset}:${reference.original}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class HeadingRenameService {
  constructor(
    private readonly app: App,
    private readonly maximumLevel: () => number,
  ) {}

  canRename(editor: Editor): boolean {
    return this.headingAtCursor(editor) !== null;
  }

  renameAtCursor(editor: Editor, view: MarkdownView): void {
    const heading = this.headingAtCursor(editor);
    if (!heading || !view.file) return;

    if (heading.level <= 6) {
      const executed = (this.app as AppWithCommands).commands?.executeCommandById(
        "editor:rename-heading",
      );
      if (!executed) new Notice("Obsidian's native heading rename command is unavailable");
      return;
    }

    new RenameExtendedHeadingModal(
      this.app,
      heading.rawBody,
      (value) => this.renameExtendedHeading(editor, view, heading, value),
    ).open();
  }

  private headingAtCursor(editor: Editor): ParsedHeading | null {
    const cursor = editor.getCursor("to");
    return parseHeadingLine(
      editor.getLine(cursor.line),
      cursor.line,
      0,
      1,
      this.maximumLevel(),
    );
  }

  private collectReferenceEdits(
    targetFile: TFile,
    oldAnchor: string,
    newAnchor: string,
  ): Map<string, { file: TFile; edits: ReferenceEdit[] }> {
    const byFile = new Map<string, { file: TFile; edits: ReferenceEdit[] }>();
    for (const sourceFile of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(sourceFile);
      if (!cache) continue;
      const edits: ReferenceEdit[] = [];
      for (const reference of referencesFor(cache)) {
        const link = parseLinktext(reference.link);
        if (!headingSubpathMatches(link.subpath, oldAnchor)) continue;
        const destination = link.path
          ? this.app.metadataCache.getFirstLinkpathDest(link.path, sourceFile.path)
          : sourceFile;
        if (destination?.path !== targetFile.path) continue;
        const replacement = replaceReferenceHeadingSubpath(reference.original, newAnchor);
        if (!replacement || replacement === reference.original) continue;
        edits.push({
          from: {
            line: reference.position.start.line,
            ch: reference.position.start.col,
          },
          to: {
            line: reference.position.end.line,
            ch: reference.position.end.col,
          },
          startOffset: reference.position.start.offset,
          endOffset: reference.position.end.offset,
          original: reference.original,
          replacement,
        });
      }
      if (edits.length > 0) byFile.set(sourceFile.path, { file: sourceFile, edits });
    }
    return byFile;
  }

  private applyEditsToEditor(editor: Editor, edits: ReferenceEdit[]): number {
    const changes: EditorChange[] = [];
    for (const edit of edits) {
      if (editor.getRange(edit.from, edit.to) !== edit.original) continue;
      changes.push({ from: edit.from, to: edit.to, text: edit.replacement });
    }
    if (changes.length > 0) editor.transaction({ changes });
    return changes.length;
  }

  private async renameExtendedHeading(
    editor: Editor,
    view: MarkdownView,
    originalHeading: ParsedHeading,
    requestedValue: string,
  ): Promise<boolean> {
    const newRawBody = requestedValue.trim();
    if (!newRawBody) {
      new Notice("A heading name cannot be empty");
      return false;
    }

    const targetFile = view.file;
    if (!targetFile) return false;
    const current = parseHeadingLine(
      editor.getLine(originalHeading.line),
      originalHeading.line,
      0,
      7,
      this.maximumLevel(),
    );
    if (!current || current.level !== originalHeading.level) {
      new Notice("The heading changed before it could be renamed");
      return false;
    }

    const oldAnchor = normalizeHeadingAnchor(stripHeading(current.rawBody));
    const newAnchor = normalizeHeadingAnchor(stripHeading(newRawBody));
    if (!newAnchor) {
      new Notice("The new heading has no linkable text");
      return false;
    }

    const editsByFile = oldAnchor
      ? this.collectReferenceEdits(targetFile, oldAnchor, newAnchor)
      : new Map<string, { file: TFile; edits: ReferenceEdit[] }>();
    const openViews = new Map<string, MarkdownView>();
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView && leaf.view.file) {
        openViews.set(leaf.view.file.path, leaf.view);
      }
    }

    let updatedLinks = 0;
    const activeReferenceEdits = (editsByFile.get(targetFile.path)?.edits ?? []).filter(
      (edit) => edit.to.line < current.line || edit.from.line > current.line,
    );
    const activeChanges: EditorChange[] = [];
    for (const edit of activeReferenceEdits) {
      if (editor.getRange(edit.from, edit.to) !== edit.original) continue;
      activeChanges.push({ from: edit.from, to: edit.to, text: edit.replacement });
      updatedLinks += 1;
    }
    activeChanges.push({
      from: { line: current.line, ch: current.bodyFrom },
      to: { line: current.line, ch: current.bodyTo },
      text: newRawBody,
    });
    editor.transaction({ changes: activeChanges });
    view.requestSave();
    editsByFile.delete(targetFile.path);

    let failedFiles = 0;
    for (const { file, edits } of editsByFile.values()) {
      const openView = openViews.get(file.path);
      if (openView) {
        updatedLinks += this.applyEditsToEditor(openView.editor, edits);
        openView.requestSave();
        continue;
      }
      try {
        await this.app.vault.process(file, (data) => {
          const valid = edits.filter(
            (edit) => data.slice(edit.startOffset, edit.endOffset) === edit.original,
          );
          updatedLinks += valid.length;
          let result = data;
          for (const edit of valid.sort((left, right) => right.startOffset - left.startOffset)) {
            result = `${result.slice(0, edit.startOffset)}${edit.replacement}${result.slice(edit.endOffset)}`;
          }
          return result;
        });
      } catch {
        failedFiles += 1;
      }
    }

    if (failedFiles > 0) {
      new Notice(
        `Heading renamed; ${updatedLinks} links updated, but ${failedFiles} files could not be updated`,
      );
    } else {
      new Notice(
        updatedLinks === 1
          ? "Heading renamed; 1 link updated"
          : `Heading renamed; ${updatedLinks} links updated`,
      );
    }
    return true;
  }
}
