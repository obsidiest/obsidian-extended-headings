import { Component, MarkdownRenderer, type App } from "obsidian";
import { escapeOutlineMarkdownBlockStart, outlineLabelFromHeadingBody } from "./core-outline-svg";
import { HeadingFootnotes } from "./heading-footnotes";

// Adapted from List Tree Indentation Guides 2.0.2. Late Markdown render children
// must be released even if Obsidian finishes typesetting after popup dismissal.
class RenderScope extends Component {
  private closed = false;
  override onunload(): void { this.closed = true; }
  override register(callback: () => unknown): void {
    if (this.closed) callback();
    else super.register(callback);
  }
  override addChild<T extends Component>(child: T): T {
    if (!this.closed) return super.addChild(child);
    child.load();
    child.unload();
    return child;
  }
}

export class BreadcrumbContent extends RenderScope {
  private disposed = false;
  dispose(): void { this.disposed = true; this.unload(); }

  async render(app: App, rawBody: string, label: HTMLElement, sourcePath: string,
    footnotes = new HeadingFootnotes(), line = 0): Promise<void> {
    // Preserve math, SVG and inline Markdown. Keep note embeds as compact links
    // rather than transcluding a second document into an ancestor label.
    const markdown = escapeOutlineMarkdownBlockStart(rawBody.replace(/!\[\[/gu, "[["));
    const child = this.addChild(new RenderScope());
    // Each render owns its attached container. A late postprocessor from a
    // disposed render can then only write into its detached old container.
    const content = label.createDiv();
    label.replaceChildren(content);
    try {
      await MarkdownRenderer.render(app, footnotes.withDefinitions(markdown), content, sourcePath, child);
      footnotes.finish(content, line);
    } catch (error) {
      if (!this.disposed) {
        label.textContent = outlineLabelFromHeadingBody(rawBody) || "(Heading content unavailable)";
        console.error("Extended Headings: breadcrumb rendering failed", error);
      }
    } finally {
      if (this.disposed) { child.unload(); this.removeChild(child); }
    }
  }
}
