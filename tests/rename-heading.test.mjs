import assert from "node:assert/strict";
import test from "node:test";
import { sourceLoader } from "./helpers/load-source.mjs";

class MarkdownView { requestSave() {} }
class Modal {}
class Notice { constructor(message) { this.message = message; } }
const obsidian = {
  MarkdownView, Modal, Notice,
  stripHeading: (s) => s.replace(/[!"#$%&()*+,.:;<=>?@^`{|}~\x2f\x5b\]\\]/g, " ").replace(/\s+/g, " ").trim(),
  parseLinktext: (s) => { const i = s.indexOf("#"); return { path: i < 0 ? s : s.slice(0, i), subpath: i < 0 ? "" : s.slice(i) }; },
};
const load = sourceLoader({ obsidian });
const { headingRenameSegment, replaceReferenceHeadingSubpath, renamedHeadingAnchor } = load("reference-utils");
const { HeadingRenameService } = load("rename-heading");
const { scanHeadings } = load("headings");

function editorFor(initial, cursorLine = 0) {
  let text = initial;
  const offset = (pos) => text.split("\n").slice(0, pos.line).reduce((n, line) => n + line.length + 1, 0) + pos.ch;
  return {
    getValue: () => text,
    getCursor: () => ({ line: cursorLine, ch: 0 }),
    getLine: (line) => text.split("\n")[line],
    getRange: (from, to) => text.slice(offset(from), offset(to)),
    transaction: ({ changes }) => {
      for (const change of changes.map((c) => ({ ...c, a: offset(c.from), b: offset(c.to) })).sort((a, b) => b.a - a.a)) {
        text = text.slice(0, change.a) + change.text + text.slice(change.b);
      }
    },
  };
}
function reference(original, line = 0) {
  const inside = original.match(/\[\[(.*?)\]\]/)[1].split("|")[0];
  return { link: inside, original, position: { start: { line, col: 0, offset: 0 }, end: { line, col: original.length, offset: original.length } } };
}

for (let level = 1; level <= 12; level++) {
  test(`H${level} rename updates links, embeds, and descendants via the real service`, async () => {
    const ancestor = Array.from({ length: level - 1 }, (_, i) => `${"#".repeat(i + 1)} Parent ${i + 1}`);
    const targetText = [...ancestor, `${"#".repeat(level)} Old`, ...(level < 12 ? [`${"#".repeat(level + 1)} Child`] : [])].join("\n");
    const path = [...ancestor.map((_, i) => `Parent ${i + 1}`), "Old"].join("#");
    const target = { path: "Target.md" };
    const linkFile = { path: "Link.md" };
    const embedFile = { path: "Embed.md" };
    const childFile = { path: "Child.md" };
    const wiki = `[[Target#${path}|Keep alias]]`;
    const embed = `![[Target#${path}]]`;
    const child = `[[Target#${path}${level < 12 ? "#Child" : ""}]]`;
    const data = new Map([[linkFile.path, wiki], [embedFile.path, embed], [childFile.path, child]]);
    const view = Object.assign(new MarkdownView(), { file: target, editor: editorFor(targetText, level - 1) });
    const app = {
      vault: { getMarkdownFiles: () => [target, linkFile, embedFile, childFile],
        process: async (file, callback) => data.set(file.path, callback(data.get(file.path))) },
      metadataCache: { getFileCache: (file) => file === target ? {} : file === embedFile ? { embeds: [reference(embed)] } : { links: [reference(data.get(file.path))] },
        getFirstLinkpathDest: (name) => name === "Target" ? target : null },
      workspace: { getLeavesOfType: () => [{ view }] },
    };
    const service = new HeadingRenameService(app, () => 12);
    assert.equal(await service.renameExtendedHeading(view.editor, view, scanHeadings(targetText, 1, 12)[level - 1], "New"), true);
    assert.equal(view.editor.getLine(level - 1), `${"#".repeat(level)} New`);
    assert.equal(data.get(linkFile.path), wiki.replace("#Old", "#New"));
    assert.equal(data.get(embedFile.path), embed.replace("#Old", "#New"));
    assert.equal(data.get(childFile.path), child.replace("#Old", "#New"));
  });
}

test("duplicate titles resolve by their path and source line", () => {
  const headings = [{ level: 1, line: 0, anchor: "First" }, { level: 2, line: 1, anchor: "Repeated" },
    { level: 1, line: 2, anchor: "Second" }, { level: 2, line: 3, anchor: "Repeated" }, { level: 12, line: 4, anchor: "Deep" }];
  assert.equal(headingRenameSegment("#First#Repeated", headings, 3), null);
  assert.equal(headingRenameSegment("#Second#Repeated", headings, 3), 1);
  assert.equal(headingRenameSegment("#Repeated", headings, 3), null);
  assert.equal(headingRenameSegment("#Second#Repeated#Deep", headings, 3), 1);
  assert.equal(headingRenameSegment("#Second#Missing", headings, 2), null);
  assert.equal(headingRenameSegment("#^Second", headings, 2), null);
  assert.equal(headingRenameSegment("#Second%23Repeated", headings, 3), 1);
});

test("nested Markdown link destinations retain encoding, titles, and aliases", () => {
  assert.equal(replaceReferenceHeadingSubpath('[Read](Target.md#Parent#Old%20Name#Child "tooltip")', "New Name", 1),
    '[Read](Target.md#Parent#New%20Name#Child "tooltip")');
  assert.equal(replaceReferenceHeadingSubpath('![Image](<Target.md#Parent#Old Name#Child>)', "New Name", 1),
    '![Image](<Target.md#Parent#New Name#Child>)');
  assert.equal(replaceReferenceHeadingSubpath("![[#Parent#Old#Child|Old alias]]", "New", 1), "![[#Parent#New#Child|Old alias]]");
});

test("the native command dispatches to the same rename handler and restores on unload", () => {
  let calls = 0, nativeCalls = 0;
  const original = () => { nativeCalls++; return false; };
  const command = { name: "Rename this heading…", editorCheckCallback: original };
  const app = { commands: { commands: { "editor:rename-heading": command } } };
  const service = new HeadingRenameService(app, () => 12);
  service.renameAtCursor = () => { calls++; };
  const uninstall = service.installNativeCommand();
  const view = new MarkdownView();
  for (let level = 1; level <= 12; level++) {
    const editor = editorFor(`${"#".repeat(level)} Name`);
    assert.equal(command.editorCheckCallback(true, editor, view), true);
    assert.equal(command.editorCheckCallback(false, editor, view), true);
  }
  assert.equal(calls, 12);
  assert.equal(command.editorCheckCallback(false, editorFor("not a heading"), view), false);
  assert.equal(nativeCalls, 1);
  uninstall();
  assert.equal(command.editorCheckCallback, original);
});

test("the native context-menu item uses the localized title element and the same handler", () => {
  let calls = 0, unrelated = 0;
  const command = { name: "Rename this heading…" };
  const service = new HeadingRenameService({ commands: { commands: { "editor:rename-heading": command } } }, () => 12);
  service.renameAtCursor = () => { calls++; };
  const item = { titleEl: { textContent: command.name }, onClick(callback) { this.callback = callback; } };
  const other = { titleEl: { textContent: "Other action" }, onClick() { unrelated++; } };
  service.adaptNativeMenu({ items: [other, item] }, editorFor("## Child"), new MarkdownView());
  item.callback();
  assert.equal(calls, 1);
  assert.equal(unrelated, 0);
  assert.doesNotThrow(() => service.adaptNativeMenu({}, editorFor("## Child"), new MarkdownView()));
});

test("renamed fragments retain native punctuation while protecting Markdown destinations", () => {
  const anchor = renamedHeadingAnchor("New (section): *emphasis* | # reserved ^ text");
  assert.equal(anchor, "New (section) *emphasis* reserved text");
  assert.equal(replaceReferenceHeadingSubpath("[[Note#Parent#Old]]", anchor, 1), `[[Note#Parent#${anchor}]]`);
  assert.equal(replaceReferenceHeadingSubpath("[Read](Note#Parent#Old)", "New (section)", 1), "[Read](Note#Parent#New%20%28section%29)");
  assert.equal(replaceReferenceHeadingSubpath("[Read](<Note#Parent#Old>)", "New > section", 1), "[Read](<Note#Parent#New %3E section>)");
});

test("same-note and open-editor links update; unrelated destinations and stale cache ranges remain untouched", async () => {
  const target = { path: "Target.md" }, linked = { path: "Open.md" }, stale = { path: "Stale.md" }, other = { path: "Other.md" };
  const self = "![[#Parent#Old|Keep alias]]";
  const text = `# Parent\n## Old\n${self}`;
  const offset = text.indexOf(self);
  const selfRef = reference(self, 2);
  selfRef.position.start.offset = offset; selfRef.position.end.offset += offset;
  const targetView = Object.assign(new MarkdownView(), { file: target, editor: editorFor(text, 1) });
  const openView = Object.assign(new MarkdownView(), { file: linked, editor: editorFor("[[Target#Parent#Old]]") });
  const disk = new Map([[linked.path, "unsaved editor must win"], [stale.path, "Changed since metadata"], [other.path, "[[Different#Parent#Old]]"]]);
  const app = {
    vault: { getMarkdownFiles: () => [target, linked, stale, other], process: async (file, callback) => disk.set(file.path, callback(disk.get(file.path))) },
    metadataCache: { getFileCache: (file) => file === target ? { embeds: [selfRef] } : { links: [reference(file === other ? disk.get(file.path) : "[[Target#Parent#Old]]")] },
      getFirstLinkpathDest: (name) => name === "Target" ? target : { path: "Different.md" } },
    workspace: { getLeavesOfType: () => [{ view: targetView }, { view: openView }] },
  };
  const service = new HeadingRenameService(app, () => 12);
  assert.equal(await service.renameExtendedHeading(targetView.editor, targetView, scanHeadings(text, 1, 12)[1], "New (name)"), true);
  assert.equal(targetView.editor.getValue(), "# Parent\n## New (name)\n![[#Parent#New (name)|Keep alias]]");
  assert.equal(openView.editor.getValue(), "[[Target#Parent#New (name)]]");
  assert.equal(disk.get(linked.path), "unsaved editor must win");
  assert.equal(disk.get(stale.path), "Changed since metadata");
  assert.equal(disk.get(other.path), "[[Different#Parent#Old]]");
});

test("renaming rejects a stale heading and multiline input without touching documents", async () => {
  const service = new HeadingRenameService({}, () => 12);
  const original = scanHeadings("## Original", 1, 12)[0];
  const view = Object.assign(new MarkdownView(), { file: { path: "Test.md" } });
  const editor = editorFor("## Changed");
  assert.equal(await service.renameExtendedHeading(editor, view, original, "New"), false);
  assert.equal(await service.renameExtendedHeading(editor, view, original, "New\n# Another"), false);
  assert.equal(editor.getValue(), "## Changed");
});
