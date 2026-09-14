import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../src/", import.meta.url));
export function sourceLoader(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(name) {
    const filename = path.resolve(root, name.endsWith(".ts") ? name : `${name}.ts`);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports,
      console, setTimeout, clearTimeout, ...globals,
      require: (id) => Object.hasOwn(mocks, id) ? mocks[id]
        : id.startsWith(".") ? load(path.resolve(path.dirname(filename), id)) : require(id),
    }, { filename });
    return module.exports;
  }
  return load;
}
