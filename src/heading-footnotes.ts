import type { CachedMetadata } from "obsidian";

interface FootnoteOccurrence {
  id: string;
  line: number;
  offset: number;
  inline: boolean;
  label: string;
}

export function hasHeadingFootnotes(markdown: string): boolean {
  return markdown.includes("[^") || markdown.includes("^[");
}

// Core Outline parses each heading in isolation too: unresolved references
// become their lower-case identifier. Add that match candidate, without
// flattening escaped brackets, inline code or HTML attributes.
export function outlineFootnoteReferenceLabel(markdown: string): string {
  return markdown.replace(/\\[\s\S]|(`+)[\s\S]*?\1(?!`)|<[^>]*>|\[\^([^\]\s]+)\]/gu,
    (token, _code: string | undefined, id: string | undefined) => id === undefined ? token : id.toLowerCase());
}

/** Footnote context from Obsidian's public metadata, not another Markdown
 * parser. Only definition identifiers enter the label render; note bodies,
 * embeds and their postprocessors must not run inside a heading label.
 */
export class HeadingFootnotes {
  private readonly definitions = new Set<string>();
  private readonly occurrences: FootnoteOccurrence[] = [];

  constructor(text = "", cache?: CachedMetadata | null) {
    for (const footnote of cache?.footnotes ?? []) {
      const { start, end } = footnote.position;
      const definition = /^[\t ]*\[\^([^\]\s]+)\]:/u.exec(text.slice(start.offset, end.offset));
      if (definition && definition[1].toLowerCase() === footnote.id.toLowerCase()) {
        this.definitions.add(footnote.id.toLowerCase());
      } else if (text.slice(start.offset - 2, start.offset) === "^[" && text[end.offset] === "]") {
        this.occurrences.push({ id: footnote.id, line: start.line, offset: start.offset, inline: true, label: "" });
      }
    }
    for (const ref of cache?.footnoteRefs ?? []) {
      const { start, end } = ref.position;
      const id = ref.id.toLowerCase();
      // Metadata may lag an editor transaction. Do not apply stale offsets
      // to a different token; the next metadata update supplies fresh context.
      if (this.definitions.has(id) && text.slice(start.offset, end.offset).toLowerCase() === `[^${id}]`) {
        this.occurrences.push({ id, line: start.line, offset: start.offset, inline: false, label: "" });
      }
    }
    this.occurrences.sort((a, b) => a.offset - b.offset);
    const counts = new Map<string, { number: number; count: number }>();
    for (const occurrence of this.occurrences) {
      let count = counts.get(occurrence.id);
      if (!count) { count = { number: counts.size + 1, count: 0 }; counts.set(occurrence.id, count); }
      occurrence.label = `[${count.number}${count.count ? `-${count.count}` : ""}]`;
      count.count++;
    }
  }

  get signature(): string { return JSON.stringify([...this.definitions]); }

  withDefinitions(markdown: string): string {
    if (!markdown.includes("[^")) return markdown;
    const lower = markdown.toLowerCase();
    const definitions = [...this.definitions].filter(id => lower.includes(`[^${id}]`));
    return definitions.length ? `${markdown}\n\n${definitions.map(id => `[^${id}]: footnote`).join("\n")}` : markdown;
  }

  static removeDefinitions(label: HTMLElement): void {
    for (const section of Array.from(label.querySelectorAll(":scope > .footnotes"))) section.remove();
  }

  outlineLabel(label: HTMLElement): string | null {
    if (!label.querySelector("sup.footnote-ref")) return null;
    // Core's plain-text Outline formatter includes an inline footnote's body
    // at the end of the label. Derive this alternate match from native DOM,
    // before discarding the definition list, rather than parsing inline-note
    // brackets or Markdown a second time.
    const copy = label.cloneNode(true) as HTMLElement;
    const bodies: string[] = [];
    for (const link of Array.from(copy.querySelectorAll<HTMLAnchorElement>("sup.footnote-ref > a.footnote-link"))) {
      const id = link.dataset.footref ?? "";
      if (this.definitions.has(id.toLowerCase())) link.parentElement?.replaceWith(id);
      else {
        const target = link.getAttribute("href")?.slice(1);
        const body = Array.from(copy.querySelectorAll<HTMLElement>(".footnotes [data-footnote-id]"))
          .find(element => element.dataset.footnoteId === target);
        body?.querySelectorAll(".footnote-backref").forEach(backref => backref.remove());
        if (body) bodies.push(body.textContent ?? "");
        link.parentElement?.remove();
      }
    }
    HeadingFootnotes.removeDefinitions(copy);
    return `${copy.textContent ?? ""}${bodies.length ? `\n1. ${bodies.join("\n")}` : ""}`;
  }

  finish(label: HTMLElement, line: number): void {
    HeadingFootnotes.removeDefinitions(label);
    const candidates = this.occurrences.filter(occurrence => occurrence.line === line);
    const used = new Set<FootnoteOccurrence>();
    for (const link of Array.from(label.querySelectorAll<HTMLAnchorElement>("sup.footnote-ref > a.footnote-link"))) {
      const id = link.dataset.footref ?? "";
      const inline = !this.definitions.has(id.toLowerCase());
      const occurrence = candidates.find(candidate => !used.has(candidate) && candidate.inline === inline
        && (inline || candidate.id === id.toLowerCase()));
      // Render templates are cloned for repeated headings. Fragment-local IDs
      // and links cannot target definitions that live in the owning note.
      link.parentElement?.removeAttribute("id");
      link.parentElement?.removeAttribute("data-footnote-id");
      if (!occurrence) {
        // Inline notes still render without a metadata cache. Keep their
        // native superscript, but do not leave a dead fragment link behind.
        link.replaceWith(...Array.from(link.childNodes));
        continue;
      }
      used.add(occurrence);
      link.textContent = occurrence.label;
      link.dataset.footref = occurrence.id;
      link.dataset.href = `#[^${occurrence.id}]`;
      link.setAttribute("href", link.dataset.href);
      link.classList.add("internal-link");
    }
  }
}
