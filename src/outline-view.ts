import { ItemView, MarkdownView, type TFile, type WorkspaceLeaf } from "obsidian";
import { scanHeadings, type ParsedHeading } from "./headings";
import type ExtendedHeadingsPlugin from "./main";

export const EXTENDED_OUTLINE_VIEW = "extended-headings-outline";

export class ExtendedOutlineView extends ItemView {
  private renderTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: ExtendedHeadingsPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return EXTENDED_OUTLINE_VIEW;
  }

  getDisplayText(): string {
    return "Extended Outline";
  }

  getIcon(): string {
    return "list-tree";
  }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleRender()));
    this.registerEvent(this.app.workspace.on("editor-change", () => this.scheduleRender()));
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file === this.app.workspace.getActiveFile()) this.scheduleRender();
      }),
    );
    await this.render();
  }

  async onClose(): Promise<void> {
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
  }

  requestUpdate(): void {
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      void this.render();
    }, 100);
  }

  private async render(): Promise<void> {
    const content = this.contentEl;
    content.empty();
    content.addClass("extended-outline");
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      content.createDiv({ cls: "extended-outline-empty", text: "No active note" });
      return;
    }

    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const text = markdownView?.file === file ? markdownView.editor.getValue() : await this.app.vault.cachedRead(file);
    const headings = scanHeadings(text, 1, this.plugin.settings.maximumLevel);
    if (headings.length === 0) {
      content.createDiv({ cls: "extended-outline-empty", text: "No headings" });
      return;
    }

    const list = content.createDiv({ cls: "extended-outline-list", attr: { role: "tree" } });
    for (const heading of headings) {
      const row = list.createEl("button", {
        cls: `extended-outline-item extended-outline-level-${heading.level}`,
        text: heading.rawBody || "Untitled heading",
        attr: {
          type: "button",
          role: "treeitem",
          "aria-level": String(heading.level),
          title: `H${heading.level} · line ${heading.line + 1}`,
        },
      });
      row.style.setProperty("--extended-outline-level", String(heading.level));
      row.style.paddingInlineStart = `${0.4 + (heading.level - 1) * 0.75}rem`;
      row.addEventListener("click", () => void this.navigate(file, heading));
    }
  }

  private async navigate(file: TFile, heading: ParsedHeading): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    if (!(leaf.view instanceof MarkdownView) || leaf.view.file !== file) {
      await leaf.openFile(file);
    }
    if (leaf.view instanceof MarkdownView) {
      const position = { line: heading.line, ch: Math.max(0, heading.bodyFrom - heading.from) };
      leaf.view.editor.setCursor(position);
      leaf.view.editor.scrollIntoView({ from: position, to: position }, true);
      leaf.view.editor.focus();
    }
  }
}
