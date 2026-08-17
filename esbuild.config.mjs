import esbuild from "esbuild";
import { builtinModules } from "node:module";

const production = globalThis.process.argv[2] === "production";

const context = await esbuild.context({
  banner: { js: "/* Extended Headings v0.4.11 | MIT | obsidiest */" },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands", "@codemirror/language", "@codemirror/lint", "@codemirror/search", "@codemirror/state", "@codemirror/view", "@lezer/common", "@lezer/highlight", "@lezer/lr", ...builtinModules],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  minify: production,
  platform: "browser",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "dist/main.js"
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
