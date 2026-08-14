export type ChildListBehavior = "outdent to zero" | "sync with headings" | "noting";

export interface HeadingApplicationOptions {
  removeUnorderedListMarker: boolean;
  removeOrderedListMarker: boolean;
  customBeginningPatterns: string[];
  removeBold: boolean;
  removeItalic: boolean;
  customSurroundingPatterns: string[];
}

export interface HeadingLineMatch {
  indent: string;
  level: number;
  markerLength: number;
}

const ATX_HEADING = /^( {0,3})(#+)(?:[\t ]+|$)/;
const LIST_ITEM = /^([\t ]*)(?:[-+*]|\d+[.)])[\t ]+/;

export function matchHeadingLine(line: string, maximumLevel = 12): HeadingLineMatch | null {
  const match = ATX_HEADING.exec(line);
  if (!match) return null;
  const level = match[2].length;
  if (level > maximumLevel) return null;
  return { indent: match[1], level, markerLength: match[0].length };
}

export function headingLevelFromLine(line: string, maximumLevel = 12): number | null {
  return matchHeadingLine(line, maximumLevel)?.level ?? null;
}

function safeBeginningRemoval(value: string, pattern: string): string {
  if (!pattern.trim()) return value;
  try {
    return value.replace(new RegExp(`^(?:${pattern})`), "");
  } catch {
    return value;
  }
}

function safeSurroundingRemoval(value: string, pattern: string): string {
  if (!pattern.trim()) return value;
  try {
    const match = new RegExp(`^(?:${pattern})([\\s\\S]*)(?:${pattern})$`).exec(value);
    return match?.[1] ?? value;
  } catch {
    return value;
  }
}

function stripPairedMarker(value: string, markers: string[]): string {
  for (const marker of markers) {
    if (value.length >= marker.length * 2 && value.startsWith(marker) && value.endsWith(marker)) {
      return value.slice(marker.length, -marker.length);
    }
  }
  return value;
}

export function removeConfiguredStyles(
  value: string,
  options: HeadingApplicationOptions,
): string {
  let body = value;

  if (options.removeUnorderedListMarker) {
    body = body.replace(/^[\t ]*[-+*][\t ]+/, "");
  }
  if (options.removeOrderedListMarker) {
    body = body.replace(/^[\t ]*\d+[.)][\t ]+/, "");
  }
  for (const pattern of options.customBeginningPatterns) {
    body = safeBeginningRemoval(body, pattern);
  }

  // A heading can follow a removed list marker (for example, "- ## Title").
  body = body.replace(/^#{1,12}(?:[\t ]+|$)/, "");

  const leading = body.match(/^[\t ]*/)?.[0] ?? "";
  const trailing = body.match(/[\t ]*$/)?.[0] ?? "";
  let core = body.slice(leading.length, body.length - trailing.length || undefined);

  if (options.removeBold) core = stripPairedMarker(core, ["**", "__"]);
  if (options.removeItalic) core = stripPairedMarker(core, ["*", "_"]);
  for (const pattern of options.customSurroundingPatterns) {
    core = safeSurroundingRemoval(core, pattern);
  }

  return `${leading}${core}${trailing}`;
}

export function applyHeadingToLine(
  line: string,
  targetLevel: number,
  options: HeadingApplicationOptions,
  maximumLevel = 12,
): string {
  const level = Math.max(0, Math.min(maximumLevel, Math.trunc(targetLevel)));
  const existing = matchHeadingLine(line, maximumLevel);
  const indent = existing?.indent ?? line.match(/^( {0,3})/)?.[1] ?? "";
  let body = existing ? line.slice(existing.markerLength) : line.slice(indent.length);

  // Heading Shifter removes configured presentation markers only when the
  // original line is not already a heading. Preserve that behavior.
  if (!existing) body = removeConfiguredStyles(body, options);

  if (level === 0) return `${indent}${body}`;
  return `${indent}${"#".repeat(level)} ${body}`;
}

function indentationColumns(whitespace: string, tabSize: number): number {
  let columns = 0;
  for (const character of whitespace) {
    columns += character === "\t" ? tabSize : 1;
  }
  return columns;
}

function indentationForColumns(columns: number, tabSize: number, preferTabs: boolean): string {
  if (!preferTabs) return " ".repeat(columns);
  return `${"\t".repeat(Math.floor(columns / tabSize))}${" ".repeat(columns % tabSize)}`;
}

function replaceIndentation(line: string, columns: number, tabSize: number): string {
  const whitespace = line.match(/^[\t ]*/)?.[0] ?? "";
  return `${indentationForColumns(columns, tabSize, whitespace.includes("\t"))}${line.slice(whitespace.length)}`;
}

/**
 * Return changes for the contiguous list subtree immediately following a
 * heading line. Relative indentation inside the subtree is preserved.
 */
export function childListIndentationChanges(
  lines: readonly string[],
  parentLine: number,
  targetHeadingLevel: number,
  behavior: ChildListBehavior,
  tabSize: number,
): Array<{ line: number; text: string }> {
  if (behavior === "noting" || parentLine + 1 >= lines.length) return [];

  const firstChild = lines[parentLine + 1];
  const firstMatch = LIST_ITEM.exec(firstChild);
  if (!firstMatch) return [];

  const safeTabSize = Math.max(2, tabSize);
  const currentRoot = indentationColumns(firstMatch[1], safeTabSize);
  const desiredRoot = behavior === "sync with headings"
    ? Math.max(0, targetHeadingLevel - 1) * safeTabSize
    : 0;
  const delta = desiredRoot - currentRoot;
  if (delta === 0) return [];

  const changes: Array<{ line: number; text: string }> = [];
  for (let lineNumber = parentLine + 1; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber];
    if (!line.trim()) break;
    const whitespace = line.match(/^[\t ]*/)?.[0] ?? "";
    const current = indentationColumns(whitespace, safeTabSize);
    if (lineNumber > parentLine + 1 && current < currentRoot) break;
    changes.push({
      line: lineNumber,
      text: replaceIndentation(line, Math.max(0, current + delta), safeTabSize),
    });
  }
  return changes;
}
