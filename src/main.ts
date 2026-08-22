import { MarkdownView, Notice, Plugin } from "obsidian";
import { CoreIntegration } from "./core-integration";
import { CoreOutlineSvgRenderer } from "./core-outline-svg";
import {
  insertHeadingAtContext,
  selectionContainsHeading,
  setHeadingAtSelections,
  shiftHeadings,
} from "./editor-commands";
import { createEditorExtension } from "./editor-extension";
import { EXTENDED_OUTLINE_VIEW, ExtendedOutlineView } from "./outline-view";
import { ReferenceCommandService } from "./reference-commands";
import { HeadingRenameService } from "./rename-heading";
import { renderExtendedHeadings, toggleReadingFold } from "./reading";
import {
  DEFAULT_SETTINGS,
  ExtendedHeadingsSettingTab,
  type ExtendedHeadingsSettings,
} from "./settings";

export default class ExtendedHeadingsPlugin extends Plugin {
  settings: ExtendedHeadingsSettings = DEFAULT_SETTINGS;
  private coreIntegration: CoreIntegration | null = null;
  private coreOutlineSvgRenderer: CoreOutlineSvgRenderer | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Style Settings scans plugin CSS separately from Obsidian's plugin loader.
    // Notify it after this stylesheet has been registered so controls appear
    // immediately when either plugin is enabled or updated.
    this.app.workspace.trigger("parse-style-settings");

    this.registerEditorExtension(createEditorExtension(() => this.settings));
    this.registerMarkdownPostProcessor((element) =>
      renderExtendedHeadings(element, () => this.settings),
    );
    this.registerView(
      EXTENDED_OUTLINE_VIEW,
      (leaf) => new ExtendedOutlineView(leaf, this),
    );
    this.addSettingTab(new ExtendedHeadingsSettingTab(this.app, this));

    this.registerDomEvent(document, "click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement) || !target.matches(".extended-heading-fold")) return;
      event.preventDefault();
      event.stopPropagation();
      toggleReadingFold(target);
    });

    this.addRibbonIcon("list-tree", "Open extended outline", () => void this.activateOutline());
    this.addCommand({
      id: "open-extended-outline",
      name: "Open extended outline",
      callback: () => void this.activateOutline(),
    });
    this.addCommand({
      id: "reindex",
      name: "Reindex headings",
      callback: async () => {
        await this.coreIntegration?.reindexAll();
        new Notice("Extended headings reindexed");
      },
    });

    const headingRename = new HeadingRenameService(
      this.app,
      () => this.settings.maximumLevel,
    );
    const references = new ReferenceCommandService(
      this.app,
      () => this.settings.maximumLevel,
      () => this.settings.copyFullyNestedHeadingPaths,
    );
    this.addCommand({
      id: "rename-this-heading",
      name: "Rename this heading (H1–H12)",
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        const available = headingRename.canRename(editor);
        if (available && !checking) headingRename.renameAtCursor(editor, view);
        return available;
      },
    });
    this.addCommand({
      id: "copy-embed-to-current-block-or-heading",
      name: "Copy embed to current block or heading (H1–H12)",
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        const available = references.canCopy(editor, view);
        if (available && !checking) void references.copyCurrent(editor, view, true);
        return available;
      },
    });
    this.addCommand({
      id: "copy-link-to-current-block-or-heading",
      name: "Copy link to current block or heading (H1–H12)",
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        const available = references.canCopy(editor, view);
        if (available && !checking) void references.copyCurrent(editor, view, false);
        return available;
      },
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const target = references.targetKind(editor, view);
        if (!target) return;

        const isHeading = target === "heading";
        menu.addItem((item) => {
          item
            .setTitle(isHeading ? "Copy link to heading" : "Copy link to block")
            .setIcon("links-coming-in")
            .onClick(() => void references.copyCurrent(editor, view, false));
        });
        menu.addItem((item) => {
          item
            .setTitle(isHeading ? "Copy heading embed" : "Copy block embed")
            .setIcon("links-coming-in")
            .onClick(() => void references.copyCurrent(editor, view, true));
        });
      }),
    );

    this.addCommand({
      id: "increase-headings",
      name: "Increase headings (H1–H12)",
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        const available = selectionContainsHeading(editor, this.settings.maximumLevel);
        if (!available) return false;
        if (!checking) shiftHeadings(editor, 1, this.settings);
        return true;
      },
    });
    this.addCommand({
      id: "increase-headings-forced",
      name: "Increase headings (forced, H1–H12)",
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        if (!checking) shiftHeadings(editor, 1, this.settings, true);
        return true;
      },
    });
    this.addCommand({
      id: "decrease-headings",
      name: "Decrease headings (H1–H12)",
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        const available = selectionContainsHeading(editor, this.settings.maximumLevel);
        if (!available) return false;
        if (!checking) shiftHeadings(editor, -1, this.settings);
        return true;
      },
    });

    for (let level = 0; level <= 12; level += 1) {
      this.addCommand({
        id: level === 0 ? "set-as-paragraph" : `set-as-heading-${level}`,
        name: level === 0 ? "Set as paragraph (heading 0)" : `Set as heading H${level}`,
        editorCheckCallback: (checking, editor, view) => {
          if (!(view instanceof MarkdownView) || level > this.settings.maximumLevel) return false;
          if (!checking) setHeadingAtSelections(editor, level, this.settings);
          return true;
        },
      });
    }

    for (const direction of ["current", "deeper", "higher"] as const) {
      const label = direction === "current"
        ? "current level"
        : direction === "deeper"
          ? "one level deeper"
          : "one level higher";
      this.addCommand({
        id: `insert-heading-${direction}`,
        name: `Insert heading at ${label}`,
        editorCheckCallback: (checking, editor, view) => {
          if (!(view instanceof MarkdownView)) return false;
          if (!checking) insertHeadingAtContext(editor, direction, this.settings);
          return true;
        },
      });
    }

    this.addCommand({
      id: "insert-next-extended-heading",
      name: "Insert extended heading one level deeper",
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const marker = /^( {0,3})(#+)[\t ]+/.exec(line);
        if (!marker || marker[2].length < 6 || marker[2].length >= this.settings.maximumLevel) return false;
        if (!checking) {
          const level = marker[2].length + 1;
          editor.replaceRange(`\n${"#".repeat(level)} `, { line: cursor.line, ch: line.length });
          editor.setCursor({ line: cursor.line + 1, ch: level + 1 });
        }
        return true;
      },
    });

    this.registerDomEvent(
      document,
      "keydown",
      (event) => {
        if (
          !this.settings.overrideTabBehavior ||
          event.defaultPrevented ||
          event.key !== "Tab" ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        ) return;

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const target = event.target;
        if (!view || !(target instanceof Node) || !view.containerEl.contains(target)) return;
        if (!selectionContainsHeading(view.editor, this.settings.maximumLevel)) return;

        const handled = shiftHeadings(view.editor, event.shiftKey ? -1 : 1, this.settings);
        if (!handled) return;
        event.preventDefault();
        event.stopPropagation();
      },
      { capture: true },
    );

    this.coreIntegration = new CoreIntegration(this);
    this.coreIntegration.start();
    this.coreOutlineSvgRenderer = new CoreOutlineSvgRenderer(this);
    this.coreOutlineSvgRenderer.start();
    this.coreOutlineSvgRenderer.setEnabled(this.settings.renderInlineSvgsInDefaultOutline);
  }

  onunload(): void {
    this.coreOutlineSvgRenderer?.destroy();
    this.coreIntegration?.stop();
    void this.coreIntegration?.removeAll(false);
    for (const className of [
      "extended-headings-hide-markers",
      "extended-headings-show-level-markers",
      "extended-headings-markers-before",
      "extended-headings-markers-in-source",
    ]) document.body.removeClass(className);
  }

  async settingsChanged(reindex: boolean): Promise<void> {
    await this.saveData(this.settings);
    this.app.workspace.updateOptions();
    this.syncBodyClasses();
    if (reindex) await this.coreIntegration?.reindexAll();
    this.coreOutlineSvgRenderer?.setEnabled(this.settings.renderInlineSvgsInDefaultOutline);
    for (const leaf of this.app.workspace.getLeavesOfType(EXTENDED_OUTLINE_VIEW)) {
      if (leaf.view instanceof ExtendedOutlineView) leaf.view.requestUpdate();
    }
  }

  private async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<ExtendedHeadingsSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
    this.settings.maximumLevel = Math.max(7, Math.min(12, this.settings.maximumLevel));
    this.settings.lowerHeadingLimit = Math.max(
      0,
      Math.min(this.settings.maximumLevel, this.settings.lowerHeadingLimit),
    );
    this.settings.tabSize = Math.max(2, Math.min(8, this.settings.tabSize));
    if (
      this.settings.childListBehavior !== "outdent to zero" &&
      this.settings.childListBehavior !== "sync with headings" &&
      this.settings.childListBehavior !== "noting"
    ) this.settings.childListBehavior = DEFAULT_SETTINGS.childListBehavior;
    this.syncBodyClasses();
  }

  private syncBodyClasses(): void {
    document.body.toggleClass(
      "extended-headings-hide-markers",
      this.settings.hideMarkersInLivePreview,
    );
    document.body.toggleClass(
      "extended-headings-show-level-markers",
      this.settings.showHeadingMarkers,
    );
    document.body.toggleClass(
      "extended-headings-markers-before",
      this.settings.showMarkersBeforeLineNumbers,
    );
    document.body.toggleClass(
      "extended-headings-markers-in-source",
      this.settings.showMarkersInSourceMode,
    );
  }

  private async activateOutline(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(EXTENDED_OUTLINE_VIEW)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("Could not open extended outline");
      return;
    }
    if (!existing) await leaf.setViewState({ type: EXTENDED_OUTLINE_VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}
