// Optional reference integration: run the unmodified Markdown parser and
// metadata functions extracted from an official Obsidian 1.14.4 app.js.
// This does not start Obsidian, its sanitizer or its Markdown postprocessors.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { TextEncoder, TextDecoder } from "node:util";
import { URL, URLSearchParams } from "node:url";
import vm from "node:vm";

export function loadObsidianNativeParser(path) {
  const source = readFileSync(path, "utf8");
  assert.equal(createHash("sha256").update(source).digest("hex"),
    "958ce57fe22f87fdf121546e46dfccd9c8ee971ce3fd8f801d60d4ece39a2df9",
    "This extraction is pinned to the official Obsidian 1.14.4 app.js");
  const start = source.indexOf("Wp=n(9650)");
  const bootstrap = source.slice(0, source.indexOf('(()=>{"use strict";var e={};n.r(e)')).replace(/,$/, ";");
  const parser = "var " + source.slice(start, source.indexOf("var vm=", start));
  const metadata = source.slice(source.indexOf("function Cm("), source.indexOf("function Lm("));
  const context = { console, URL, URLSearchParams, TextEncoder, TextDecoder, Buffer };
  vm.runInNewContext(bootstrap + parser + metadata
    + ";globalThis.referenceParser={parse:cm,render:text=>fm(cm(text)),metadata:Im,text:text=>Em(cm(text))};})();", context);
  return context.referenceParser;
}
