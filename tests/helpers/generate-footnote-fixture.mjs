// Run with OBSIDIAN_APP_JS=/path/to/1.14.4/app.js. No application source is
// committed: only parser output for the synthetic Markdown fixture is saved.
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { loadObsidianNativeParser } from "./obsidian-native-parser.mjs";
import { sourceLoader } from "./load-source.mjs";
const parser = loadObsidianNativeParser(process.env.OBSIDIAN_APP_JS);
for (const [input, output] of [["footnote-headings", "footnote-renderer"], ["footnote-identifiers", "footnote-identifiers"]]) {
  const source = readFileSync(new URL(`../fixtures/${input}.md`, import.meta.url), "utf8");
  const cache = parser.metadata(source);
  const refsByLine = new Map();
  function visit(node) {
    if (node.type === "fnRef") {
      const line = node.position.start.line - 1;
      if (!refsByLine.has(line)) refsByLine.set(line, []);
      const nativeLabel = node.children[0].data.hChildren[0].value;
      // The user's editor comparison is authoritative for explicit references.
      // Native Reading HTML renumbers them and is not the expected label oracle.
      const token = source.slice(node.position.start.offset, node.position.end.offset);
      const explicit = /^\[\^([^\]]+)\]$/u.exec(token);
      refsByLine.get(line).push({ id: node.identifier, label: explicit ? `[${explicit[1]}]` : nativeLabel, nativeLabel });
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(parser.parse(source));
  const { scanHeadings } = sourceLoader()("headings");
  const definitions = (cache.footnotes ?? []).filter(note => source.slice(note.position.start.offset).startsWith(`[^`));
  const renders = {};
  const headings = scanHeadings(source).map(({ rawBody, level, line }) => {
    const context = definitions.filter(note => rawBody.toLowerCase().includes(`[^${note.id}]`)).map(note => `[^${note.id}]: footnote`);
    const markdown = context.length ? `${rawBody}\n\n${context.join("\n")}` : rawBody;
    renders[rawBody] = parser.render(rawBody);
    renders[markdown] = parser.render(markdown);
    const refs = refsByLine.get(line) ?? [];
    return { rawBody, level, line, coreLabel: parser.text(rawBody),
      nativeRefs: refs.map(({ id, nativeLabel }) => ({ id, label: nativeLabel })),
      expectedRefs: refs.map(({ id, label }) => ({ id, label })) };
  });
  writeFileSync(new URL(`../fixtures/${output}-1.14.4.json`, import.meta.url), JSON.stringify({ source, cache, headings, renders }, null, 2) + "\n");
}
