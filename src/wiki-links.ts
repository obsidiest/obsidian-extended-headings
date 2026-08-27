export interface ExtendedHeadingWikiLink {
  from: number;
  to: number;
  raw: string;
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function firstUnescaped(text: string, character: string): number {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === character && !isEscaped(text, index)) return index;
  }
  return -1;
}

/**
 * Finds non-embed wiki links that need an isolated MarkdownRenderer fallback
 * inside an extended-heading body. Obsidian's Live Preview parser does not
 * consistently render a wiki link at the beginning of an H7+ body, and it
 * does not currently render heading-subpath links anywhere on such a line.
 * Links that Obsidian already renders reliably are intentionally left alone so
 * the fallback never overlaps the editor's native replacement decorations.
 */
export function scanHeadingLivePreviewLinks(
  body: string,
  bodyFrom = 0,
): ExtendedHeadingWikiLink[] {
  const links: ExtendedHeadingWikiLink[] = [];
  let codeFenceLength = 0;

  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === "`" && !isEscaped(body, index)) {
      let runLength = 1;
      while (body[index + runLength] === "`") runLength += 1;
      if (codeFenceLength === 0) codeFenceLength = runLength;
      else if (codeFenceLength === runLength) codeFenceLength = 0;
      index += runLength - 1;
      continue;
    }
    if (codeFenceLength > 0) continue;

    if (
      body[index] !== "[" ||
      body[index + 1] !== "[" ||
      isEscaped(body, index) ||
      (index > 0 && body[index - 1] === "!")
    ) continue;

    let closing = index + 2;
    while (closing < body.length - 1) {
      if (
        body[closing] === "]" &&
        body[closing + 1] === "]" &&
        !isEscaped(body, closing)
      ) break;
      closing += 1;
    }
    if (closing >= body.length - 1) continue;

    const raw = body.slice(index, closing + 2);
    const inner = body.slice(index + 2, closing);
    const aliasAt = firstUnescaped(inner, "|");
    const target = (aliasAt >= 0 ? inner.slice(0, aliasAt) : inner).trim();
    const subpathAt = firstUnescaped(target, "#");
    const subpath = subpathAt >= 0 ? target.slice(subpathAt + 1).trim() : "";

    const beginsHeadingBody = index === 0;
    const targetsHeading =
      subpathAt >= 0 && subpath.length > 0 && !subpath.startsWith("^");

    if (beginsHeadingBody || targetsHeading) {
      links.push({
        from: bodyFrom + index,
        to: bodyFrom + closing + 2,
        raw,
      });
    }
    index = closing + 1;
  }

  return links;
}
