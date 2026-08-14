export interface ParsedHeading {
  level: number;
  line: number;
  from: number;
  to: number;
  markerFrom: number;
  bodyFrom: number;
  bodyTo: number;
  rawBody: string;
}

interface Fence {
  character: "`" | "~";
  length: number;
}

export function parseHeadingLine(
  lineText: string,
  lineNumber: number,
  lineOffset: number,
  minimumLevel: number,
  maximumLevel: number,
): ParsedHeading | null {
  const match = /^( {0,3})(#+)(?:[\t ]+|$)/.exec(lineText);
  if (!match) return null;

  const level = match[2].length;
  if (level < minimumLevel || level > maximumLevel) return null;

  const markerFromInLine = match[1].length;
  const bodyFromInLine = match[0].length;
  let bodyToInLine = lineText.length;
  const closing = /[\t ]+#+[\t ]*$/.exec(lineText.slice(bodyFromInLine));
  if (closing?.index !== undefined) {
    bodyToInLine = bodyFromInLine + closing.index;
  } else {
    while (bodyToInLine > bodyFromInLine && /[\t ]/.test(lineText[bodyToInLine - 1])) {
      bodyToInLine -= 1;
    }
  }

  return {
    level,
    line: lineNumber,
    from: lineOffset,
    to: lineOffset + lineText.length,
    markerFrom: lineOffset + markerFromInLine,
    bodyFrom: lineOffset + bodyFromInLine,
    bodyTo: lineOffset + bodyToInLine,
    rawBody: lineText.slice(bodyFromInLine, bodyToInLine),
  };
}

export function scanHeadings(
  text: string,
  minimumLevel = 1,
  maximumLevel = 12,
): ParsedHeading[] {
  const headings: ParsedHeading[] = [];
  const lines = text.split("\n");
  let offset = 0;
  let fence: Fence | null = null;
  let frontmatter = lines.length > 0 && lines[0].replace(/^\uFEFF/, "").trimEnd() === "---";

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const rawLine = lines[lineNumber];
    const lineText = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

    if (frontmatter) {
      if (lineNumber > 0 && /^(?:---|\.\.\.)[\t ]*$/.test(lineText)) {
        frontmatter = false;
      }
      offset += rawLine.length + (lineNumber < lines.length - 1 ? 1 : 0);
      continue;
    }

    if (fence) {
      const closing = new RegExp(`^ {0,3}\\${fence.character}{${fence.length},}[\\t ]*$`);
      if (closing.test(lineText)) fence = null;
      offset += rawLine.length + (lineNumber < lines.length - 1 ? 1 : 0);
      continue;
    }

    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(lineText);
    if (opening) {
      const marker = opening[1];
      fence = { character: marker[0] as "`" | "~", length: marker.length };
      offset += rawLine.length + (lineNumber < lines.length - 1 ? 1 : 0);
      continue;
    }

    const heading = parseHeadingLine(lineText, lineNumber, offset, minimumLevel, maximumLevel);
    if (heading) headings.push(heading);
    offset += rawLine.length + (lineNumber < lines.length - 1 ? 1 : 0);
  }

  return headings;
}
