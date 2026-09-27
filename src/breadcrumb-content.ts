import { Component, MarkdownRenderer, type App } from "obsidian";
import { escapeOutlineMarkdownBlockStart, outlineLabelFromHeadingBody } from "./core-outline-svg";

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

  async render(app: App, rawBody: string, label: HTMLElement, sourcePath: string): Promise<void> {
    // Preserve math, SVG and inline Markdown. Keep note embeds as compact links
    // rather than transcluding a second document into an ancestor label.
    const markdown = escapeOutlineMarkdownBlockStart(rawBody.replace(/!\[\[/gu, "[["));
    const child = this.addChild(new RenderScope());
    label.replaceChildren();
    try {
      await MarkdownRenderer.render(app, markdown, label, sourcePath, child);
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
