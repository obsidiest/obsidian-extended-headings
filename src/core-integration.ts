import type { CachedMetadata, HeadingCache, TFile } from "obsidian";
import { MarkdownView } from "obsidian";
import { scanHeadings } from "./headings";
import type ExtendedHeadingsPlugin from "./main";

interface BridgedHeading extends HeadingCache {
  __extendedHeadings: true;
}

function isBridgedHeading(heading: HeadingCache): heading is BridgedHeading {
  return (heading as Partial<BridgedHeading>).__extendedHeadings === true;
}

function sameBridge(a: BridgedHeading[], b: BridgedHeading[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (heading, index) =>
        heading.heading === b[index].heading &&
        heading.level === b[index].level &&
        heading.position.start.offset === b[index].position.start.offset,
    )
  );
}

export class CoreIntegration {
  private readonly syntheticEvents = new Set<string>();
  private generation = 0;
  private layoutReady = false;
  private metadataResolved = false;
  private startupReindexComplete = false;
  private startupReindexRunning = false;
  private startupReindexQueued = false;
  private stopped = false;

  constructor(private readonly plugin: ExtendedHeadingsPlugin) {}

  start(): void {
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on("changed", (file, data, cache) => {
        if (this.syntheticEvents.has(file.path)) return;
        if (this.plugin.settings.coreIntegration) this.inject(file, data, cache, true);
      }),
    );

    // Community plugins can load before the initial metadata cache and saved
    // workspace layout have both finished initializing. Reindexing immediately
    // can therefore either skip uncached files or notify the core Outline
    // before its view exists. Wait for the layout, then repeat the pass after
    // MetadataCache reports that its initial resolution cycle is complete.
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on("resolved", () => {
        if (this.startupReindexComplete || this.stopped) return;
        this.metadataResolved = true;
        void this.runStartupReindex();
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("file-open", (file) => {
        if (!file || this.stopped) return;
        void this.reindexFile(file, true, true);
      }),
    );
    this.plugin.app.workspace.onLayoutReady(() => {
      if (this.stopped) return;
      this.layoutReady = true;

      // Populate the visible note before scanning the rest of the vault. The
      // editor already owns the current text, so this path normally injects
      // and notifies the core Outline synchronously, without waiting for a
      // cachedRead or for the background reconciliation pass.
      if (this.metadataResolved) {
        void this.runStartupReindex();
      } else {
        void this.reindexActiveFile(true);
      }
    });
  }

  stop(): void {
    this.stopped = true;
    this.generation += 1;
  }

  async reindexAll(
    forceNotify = false,
    cooperative = false,
  ): Promise<void> {
    const generation = ++this.generation;
    if (!this.plugin.settings.coreIntegration) {
      await this.removeAll();
      return;
    }

    const files = this.plugin.app.vault.getMarkdownFiles();
    const activeFile = this.getCurrentMarkdownView()?.file
      ?? this.plugin.app.workspace.getActiveFile();
    const activeIndex = activeFile
      ? files.findIndex((file) => file.path === activeFile.path)
      : -1;
    if (activeIndex > 0) [files[0], files[activeIndex]] = [files[activeIndex], files[0]];
    const concurrency = cooperative ? 2 : 6;
    let next = 0;
    const worker = async () => {
      let filesSinceYield = 0;
      while (next < files.length && generation === this.generation) {
        const file = files[next++];
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        if (!cache) continue;
        const data = await this.plugin.app.vault.cachedRead(file);
        if (generation !== this.generation) return;
        this.inject(file, data, cache, true, forceNotify);
        filesSinceYield += 1;
        if (cooperative && filesSinceYield >= 8) {
          filesSinceYield = 0;
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  }

  async removeAll(notify = true): Promise<void> {
    this.generation += 1;
    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      if (!cache?.headings?.some(isBridgedHeading)) continue;
      cache.headings = cache.headings.filter((heading) => !isBridgedHeading(heading));
      if (notify) {
        const data = await this.plugin.app.vault.cachedRead(file);
        this.emitRefresh(file, data, cache);
      }
    }
  }

  private async reindexActiveFile(forceNotify = false): Promise<boolean> {
    const view = this.getCurrentMarkdownView();
    const file = view?.file ?? this.plugin.app.workspace.getActiveFile();
    if (!file) return false;
    return this.reindexFile(file, forceNotify, true);
  }

  private getCurrentMarkdownView(): MarkdownView | null {
    const active = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (active) return active;

    // A restored sidebar (including the core Outline) can briefly own focus at
    // startup even though a Markdown document is visibly open in the main
    // area. Recover that view so startup injection still uses its in-memory
    // document rather than waiting on a disk read or a focus change.
    const activeFile = this.plugin.app.workspace.getActiveFile();
    const markdownViews = this.plugin.app.workspace
      .getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView);
    return markdownViews.find((view) => view.file?.path === activeFile?.path)
      ?? markdownViews[0]
      ?? null;
  }

  private async reindexFile(
    file: TFile,
    forceNotify = false,
    preferActiveEditor = false,
  ): Promise<boolean> {
    if (!this.plugin.settings.coreIntegration || this.stopped) return false;
    const cache = this.plugin.app.metadataCache.getFileCache(file);
    if (!cache) return false;

    const view = preferActiveEditor ? this.getCurrentMarkdownView() : null;
    const data = view?.file?.path === file.path
      ? view.editor.getValue()
      : await this.plugin.app.vault.cachedRead(file);
    if (this.stopped) return false;

    this.inject(file, data, cache, true, forceNotify);
    return true;
  }

  private inject(
    file: TFile,
    data: string,
    cache: CachedMetadata,
    notify: boolean,
    forceNotify = false,
  ): void {
    const previous = (cache.headings ?? []).filter(isBridgedHeading);
    const native = (cache.headings ?? []).filter((heading) => !isBridgedHeading(heading));
    const bridged: BridgedHeading[] = scanHeadings(data, 7, this.plugin.settings.maximumLevel).map(
      (heading) => ({
        // HeadingCache.heading is display text. `stripHeading()` is for anchor
        // matching and removes punctuation such as parentheses and colons,
        // which made the core Outline label differ from native H1-H6 labels.
        heading: heading.rawBody,
        // Preserve the true level for Obsidian's default Outline. This is an
        // intentional compatibility bridge beyond the public H1-H6 contract.
        level: heading.level,
        position: {
          start: { line: heading.line, col: 0, offset: heading.from },
          end: {
            line: heading.line,
            col: heading.to - heading.from,
            offset: heading.to,
          },
        },
        __extendedHeadings: true,
      }),
    );

    cache.headings = [...native, ...bridged].sort(
      (a, b) => a.position.start.offset - b.position.start.offset,
    );
    if (
      notify &&
      (!sameBridge(previous, bridged) || (forceNotify && bridged.length > 0))
    ) this.emitRefresh(file, data, cache);
  }

  private async runStartupReindex(): Promise<void> {
    if (
      !this.layoutReady ||
      !this.metadataResolved ||
      this.startupReindexComplete ||
      this.stopped
    ) return;

    if (this.startupReindexRunning) {
      this.startupReindexQueued = true;
      return;
    }

    this.startupReindexRunning = true;
    try {
      do {
        this.startupReindexQueued = false;
        await this.reindexActiveFile(true);
        await this.reindexAll(false, true);
      } while (this.startupReindexQueued && !this.stopped);

      // If the initial `resolved` signal arrives while the layout pass is in
      // progress, the queued second pass above runs against the final cache.
      this.startupReindexComplete = true;
    } finally {
      this.startupReindexRunning = false;
    }
  }

  private emitRefresh(file: TFile, data: string, cache: CachedMetadata): void {
    this.syntheticEvents.add(file.path);
    try {
      this.plugin.app.metadataCache.trigger("changed", file, data, cache);
    } finally {
      this.syntheticEvents.delete(file.path);
    }
  }
}
