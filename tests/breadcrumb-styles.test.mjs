import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("breadcrumb decorations expose the Outline controls for all three appearance scopes", () => {
  const inventory = new Map(Array.from(styles.matchAll(/\n {2}-\n {4}id: ([\w-]+)\n([\s\S]*?)(?=\n {2}-\n|\*\/)/g), (match) => [match[1], match[2]]));
  for (const [id, definition] of inventory) {
    if (!/^extended-outline-(level-marker|guide|thread)-/.test(id)) continue;
    for (const scope of ["extended-breadcrumb", "extended-editor-breadcrumb", "extended-outline-breadcrumb"]) {
      const adapted = inventory.get(id.replace("extended-outline", scope));
      assert.ok(adapted, `${scope}: ${id}`);
      const expected = definition.replaceAll("extended-outline", scope);
      assert.deepEqual(Array.from(adapted.matchAll(/^ {4}(?:type|default(?:-light|-dark)?): (.*)$/gm), (match) => match[0]),
        Array.from(expected.matchAll(/^ {4}(?:type|default(?:-light|-dark)?): (.*)$/gm), (match) => match[0]));
    }
  }
});
