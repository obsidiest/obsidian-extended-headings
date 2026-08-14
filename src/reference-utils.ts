const ILLEGAL_HEADING_CHARACTERS = /[!"#$%&()*+,.:;<=>?@^`{|}~\x2f\x5b\]\\]/g;

export function normalizeHeadingAnchor(heading: string): string {
  return heading
    .replace(ILLEGAL_HEADING_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safelyDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function headingSubpathMatches(subpath: string, headingAnchor: string): boolean {
  if (!subpath.startsWith("#") || subpath.startsWith("#^")) return false;
  const decoded = safelyDecodeURIComponent(subpath.slice(1).replace(/\\ /g, " "));
  return normalizeHeadingAnchor(decoded).toLocaleLowerCase()
    === normalizeHeadingAnchor(headingAnchor).toLocaleLowerCase();
}

function firstUnescaped(value: string, character: string): number {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== character) continue;
    let slashes = 0;
    for (let prior = index - 1; prior >= 0 && value[prior] === "\\"; prior -= 1) slashes += 1;
    if (slashes % 2 === 0) return index;
  }
  return -1;
}

function replaceWikiSubpath(original: string, newHeadingAnchor: string): string | null {
  const open = original.indexOf("[[");
  const close = original.lastIndexOf("]]");
  if (open < 0 || close < open + 2) return null;

  const inner = original.slice(open + 2, close);
  const aliasIndex = firstUnescaped(inner, "|");
  const destination = aliasIndex < 0 ? inner : inner.slice(0, aliasIndex);
  const hashIndex = firstUnescaped(destination, "#");
  if (hashIndex < 0) return null;

  const updatedDestination = `${destination.slice(0, hashIndex)}#${newHeadingAnchor}`;
  const updatedInner = aliasIndex < 0
    ? updatedDestination
    : `${updatedDestination}${inner.slice(aliasIndex)}`;
  return `${original.slice(0, open + 2)}${updatedInner}${original.slice(close)}`;
}

function encodeMarkdownHeading(heading: string, previous: string, angleWrapped: boolean): string {
  if (angleWrapped && !/%[0-9a-f]{2}/i.test(previous)) return heading;
  if (/\\ /.test(previous) && !/%[0-9a-f]{2}/i.test(previous)) {
    return heading.replace(/ /g, "\\ ");
  }
  return encodeURIComponent(heading);
}

function replaceMarkdownSubpath(original: string, newHeadingAnchor: string): string | null {
  const open = original.indexOf("](");
  const close = original.lastIndexOf(")");
  if (open < 0 || close < open + 2) return null;

  const insideStart = open + 2;
  let destinationStart = insideStart;
  while (destinationStart < close && /\s/.test(original[destinationStart])) destinationStart += 1;

  const angleWrapped = original[destinationStart] === "<";
  if (angleWrapped) destinationStart += 1;

  let destinationEnd = destinationStart;
  if (angleWrapped) {
    destinationEnd = original.indexOf(">", destinationStart);
    if (destinationEnd < 0 || destinationEnd > close) return null;
  } else {
    while (destinationEnd < close) {
      const character = original[destinationEnd];
      if (/\s/.test(character) && original[destinationEnd - 1] !== "\\") break;
      destinationEnd += 1;
    }
  }

  const destination = original.slice(destinationStart, destinationEnd);
  const hashIndex = firstUnescaped(destination, "#");
  if (hashIndex < 0) return null;
  const previousHeading = destination.slice(hashIndex + 1);
  const updatedDestination = `${destination.slice(0, hashIndex)}#${encodeMarkdownHeading(
    newHeadingAnchor,
    previousHeading,
    angleWrapped,
  )}`;

  return `${original.slice(0, destinationStart)}${updatedDestination}${original.slice(destinationEnd)}`;
}

export function replaceReferenceHeadingSubpath(
  original: string,
  newHeadingAnchor: string,
): string | null {
  return original.includes("[[")
    ? replaceWikiSubpath(original, newHeadingAnchor)
    : replaceMarkdownSubpath(original, newHeadingAnchor);
}
