import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers";
import { JSDOM } from "jsdom";
import { EditorState, StateEffect } from "@codemirror/state";
import { sourceLoader } from "./helpers/load-source.mjs";

class MarkdownView {
  getMode() { return this.mode; }
}
class MarkdownRenderChild { constructor(element) { this.containerEl = element; } }
function fixture(mode = "source", text = "# Root\n## Child\n############ Deep") {
  const dom = new JSDOM('<body><div class="workspace-leaf-content" data-type="markdown"><div class="markdown-source-view mod-cm6"><div class="cm-scroller"><div class="cm-content"></div><div class="cm-extended-heading-gutter"></div></div></div><div class="markdown-preview-view"></div></div><div data-type="outline"></div></body>', { pretendToBeVisual: true });
  const win = dom.window, document = win.document;
  document.win = win;
  win.createEl = (tag) => document.createElement(tag);
  win.createSpan = () => document.createElement("span");
  win.createFragment = () => document.createDocumentFragment();
  win.ResizeObserver = class { observe() {} disconnect() {} };
  win.HTMLElement.prototype.scrollIntoView = function () {};
  const load = sourceLoader({ obsidian: { MarkdownView, MarkdownRenderChild } }, { document, window: win });
  const { HeadingBreadcrumb } = load("heading-breadcrumb");
  const { DEFAULT_BREADCRUMB_SETTINGS } = load("breadcrumb-settings");
  const settings = { ...DEFAULT_BREADCRUMB_SETTINGS, maximumLevel: 12 };
  const root = document.querySelector('[data-type="markdown"]');
  if (mode === "livePreview") root.querySelector(".markdown-source-view").classList.add("is-live-preview");
  const state = EditorState.create({ doc: text });
  let caret = 0, focused = 0;
  const effects = [], navigation = [];
  const restoreScroll = StateEffect.define();
  const lines = text.split("\n").map((text, i) => {
    const el = document.createElement("div"); el.className = "cm-line"; el.textContent = text;
    el.dataset.line = String(i); root.querySelector(".cm-content").append(el); return el;
  });
  for (const line of lines) {
    const gutter = document.createElement("div"); gutter.className = "cm-gutterElement"; gutter.dataset.line = line.dataset.line;
    const marker = document.createElement("span"); marker.className = "cm-heading-marker";
    marker.textContent = `H${/^#+/.exec(line.textContent)?.[0].length ?? 1}`;
    gutter.append(marker); root.querySelector(".cm-extended-heading-gutter").append(gutter);
  }
  const cm = { state, dom: root, scrollDOM: root.querySelector(".cm-scroller"), documentTop: 100,
    lineBlockAtHeight: (height) => {
      const i = Math.max(0, Math.min(state.doc.lines - 1, Math.floor(height / 30)));
      return { from: state.doc.line(i + 1).from, top: i * 30, bottom: (i + 1) * 30 };
    },
    domAtPos: (pos) => ({ node: lines[state.doc.lineAt(pos).number - 1] }),
    scrollSnapshot: () => restoreScroll.of({ left: cm.scrollDOM.scrollLeft, top: cm.scrollDOM.scrollTop }),
    dispatch: (transaction) => {
      if (transaction.selection) caret = transaction.selection.anchor;
      const effect = transaction.effects;
      effects.push(effect);
      if (effect?.is(restoreScroll)) {
        cm.scrollDOM.scrollLeft = effect.value.left; cm.scrollDOM.scrollTop = effect.value.top;
      } else if (effect?.value?.range) {
        navigation.push(state.doc.lineAt(effect.value.range.head).number - 1);
        cm.scrollDOM.scrollTop = navigation.at(-1) * 30;
      }
    },
  };
  const reading = root.querySelector(".markdown-preview-view");
  const view = Object.assign(new MarkdownView(), { containerEl: root, mode: mode === "reading" ? "preview" : "source",
    file: { path: "Test.md" }, editor: { cm, getValue: () => text, focus: () => focused++ },
    previewMode: { containerEl: reading, getScroll: () => reading.scrollTop / 30, applyScroll: (line) => { reading.scrollTop = line * 30; } },
    leaf: { setEphemeralState: (estate) => { effects.push(estate); navigation.push(estate.line); reading.scrollTop = estate.line * 30; } },
  });
  const handlers = new Map();
  const plugin = { settings,
    registerEvent() {},
    app: { workspace: { getLeavesOfType: (type) => type === "markdown" ? [{ view }] : [],
      onLayoutReady: (fn) => fn(), on: (name, fn) => { handlers.set(name, fn); return {}; },
    } },
  };
  win.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === root) return new win.DOMRect(0, 0, 800, 600);
    if (this.classList.contains("cm-scroller")) return new win.DOMRect(0, 90, 800, 500);
    if (this.classList.contains("cm-gutterElement")) return new win.DOMRect(20, 100 + Number(this.dataset.line) * 30, 25, 30);
    if (this.classList.contains("cm-heading-marker")) return new win.DOMRect(25, 100 + Number(this.parentElement.dataset.line) * 30, 30, 30);
    const popup = this.closest(".extended-breadcrumb-popover");
    if (this.classList.contains("extended-breadcrumb-popover")) return new win.DOMRect(20, 250, 420, 220);
    if (popup) {
      const row = this.closest(".extended-breadcrumb-row");
      const i = row ? Number(row.dataset.index) : 0;
      const anchor = this.matches(".extended-breadcrumb-label, .extended-breadcrumb-level-marker");
      return new win.DOMRect(20 + (anchor ? 40 + i * 18 : 0), 275 + i * 30, anchor ? 20 : 400, 30);
    }
    return new win.DOMRect(20, 100 + Number(this.dataset.line ?? 0) * 30, 600, 30);
  };
  const manager = new HeadingBreadcrumb(plugin); manager.start();
  const move = (element, line = 1, x = 25) => element.dispatchEvent(new win.MouseEvent("pointermove", { bubbles: true, clientY: 115 + line * 30, clientX: x }));
  return { manager, view, settings, document, win, handlers, lines, effects, navigation, move, load,
    caret: () => caret, focused: () => focused,
    close: () => { manager.destroy(); win.close(); },
  };
}

for (const mode of ["livePreview", "source"]) {
  test(`${mode}: full gutter cell activates, hashes do not, and preview preserves the caret`, () => {
    const f = fixture(mode);
    try {
      f.move(f.lines[1], 1, 70);
      assert.equal(f.document.querySelector(".extended-breadcrumb-popover"), null);
      // The full cell is wider than the H2 glyphs: the old narrow-hit-area bug.
      const gutter = f.document.querySelectorAll(".cm-gutterElement")[1];
      f.move(gutter);
      const popup = f.document.querySelector(".extended-breadcrumb-popover");
      assert.ok(popup);
      const rows = popup.querySelectorAll(".extended-breadcrumb-row");
      assert.equal(rows.length, 2);
      assert.equal(rows[1].getAttribute("aria-current"), "true");
      assert.equal(popup.querySelectorAll(".extended-breadcrumb-level-marker").length, 2);
      assert.ok(popup.querySelectorAll(".extended-breadcrumb-guide-path").length > 0);
      assert.equal(popup.querySelectorAll(".extended-breadcrumb-thread-path").length, 0);
      rows[0].dispatchEvent(new f.win.MouseEvent("pointerenter"));
      assert.equal(rows[0].classList.contains("is-active"), true);
      assert.equal(f.caret(), 0);
      assert.equal(f.focused(), 0);
      rows[1].click();
      assert.equal(f.caret(), "# Root\n".length);
      assert.equal(f.focused(), 1);
      f.document.dispatchEvent(new f.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      assert.equal(f.document.querySelector(".extended-breadcrumb-popover"), null);
    } finally { f.close(); }
  });
}

test("full-field activation reaches the scroller margin and independent feature gates apply", () => {
  const f = fixture();
  try {
    f.settings.breadcrumbFieldActivation = true; f.settings.editorBreadcrumbFieldActivation = true;
    f.settings.breadcrumbMarkers = false; f.settings.breadcrumbGuides = false;
    f.settings.breadcrumbThreading = true; f.settings.editorBreadcrumbThreading = true;
    f.move(f.document.querySelector(".cm-scroller"), 2, 700);
    const popup = f.document.querySelector(".extended-breadcrumb-popover");
    assert.ok(popup);
    assert.equal(popup.querySelectorAll(".extended-breadcrumb-level-marker, .extended-breadcrumb-guide-path").length, 0);
    assert.ok(popup.querySelectorAll(".extended-breadcrumb-thread-path").length > 0);
    assert.equal(popup.querySelectorAll(".extended-breadcrumb-row").length, 3);
    f.settings.editorHeadingHoverBreadcrumb = false; f.manager.refresh();
    f.move(f.document.querySelector(".cm-scroller"), 2, 700);
    assert.equal(f.document.querySelector(".extended-breadcrumb-popover"), null);
  } finally { f.close(); }
});

for (const mode of ["livePreview", "source"]) {
  test(`${mode}: marker activation covers the left margin and overhanging glyphs behind editor content`, () => {
    const f = fixture(mode);
    try {
      // A theme/editor layer receives these events. The marker paints from
      // x=25 to 55, overhanging its gutter cell, which ends at x=45.
      for (const x of [2, 24, 35, 54]) {
        f.move(f.lines[1], 1, x);
        assert.ok(f.document.querySelector(".extended-breadcrumb-popover"), `x=${x}`);
        f.manager.refresh();
      }
      f.move(f.lines[1], 1, 60);
      assert.equal(f.document.querySelector(".extended-breadcrumb-popover"), null, "hashes/text remain excluded");
      f.settings.editorBreadcrumbMarkerActivation = false;
      f.move(f.lines[1], 1, 35);
      assert.equal(f.document.querySelector(".extended-breadcrumb-popover"), null);
    } finally { f.close(); }
  });
}

function clock(win) {
  let time = 0, id = 0;
  const tasks = new Map();
  win.setTimeout = (callback, delay) => { tasks.set(++id, { callback, at: time + delay }); return id; };
  win.clearTimeout = (key) => tasks.delete(key);
  return (milliseconds) => {
    time += milliseconds;
    for (const [key, task] of tasks) if (task.at <= time) { tasks.delete(key); task.callback(); }
  };
}

function navigationFixture(mode = "source", pane = "editor") {
  const f = fixture(mode);
  const { document, view, manager, win } = f;
  const reading = document.querySelector(".markdown-preview-view");
  if (mode === "reading") {
    for (const [index, level] of [1, 2, 12].entries()) {
      const heading = document.createElement(level > 6 ? "div" : `h${level}`);
      if (level > 6) { heading.className = "extended-heading-reading"; heading.setAttribute("aria-level", String(level)); }
      heading.dataset.line = String(index); heading.textContent = ["Root", "Child", "Deep"][index]; reading.append(heading);
    }
    manager.processReading(reading, { sourcePath: "Test.md", addChild() {},
      getSectionInfo: () => ({ text: view.editor.getValue(), lineStart: 0, lineEnd: 2 }) });
  }
  const outline = document.querySelector('[data-type="outline"]');
  for (let index = 0; index < 3; index++) {
    const row = document.createElement("div"); row.className = "tree-item-self";
    row.dataset.extendedBreadcrumbFile = "Test.md"; row.dataset.extendedBreadcrumbLine = String(index); row.dataset.line = String(index);
    const marker = document.createElement("span"); marker.className = "extended-heading-outline-level-marker";
    marker.textContent = `H${[1, 2, 12][index]}`; marker.dataset.line = String(index); row.append(marker); outline.append(row);
    row.scrollIntoView = () => { outline.scrollTop = index * 30; outline.scrollLeft = 0; };
  }
  const scroller = mode === "reading" ? reading : view.editor.cm.scrollDOM;
  scroller.scrollTop = 390; scroller.scrollLeft = 17;
  outline.scrollTop = 280; outline.scrollLeft = 13;
  const advance = clock(win);
  const open = () => {
    const marker = pane === "outline" ? outline.querySelectorAll(".extended-heading-outline-level-marker")[2]
      : mode === "reading" ? reading.querySelectorAll(".extended-breadcrumb-reading-marker")[2]
        : document.querySelectorAll(".cm-heading-marker")[2];
    f.move(marker, 2);
    return document.querySelector(".extended-breadcrumb-popover");
  };
  const hover = (index) => document.querySelectorAll(".extended-breadcrumb-row")[index].dispatchEvent(new win.MouseEvent("pointerenter"));
  const leave = () => f.move(document.body, 0, 750);
  return { ...f, scroller, outline, advance, open, hover, leave };
}

for (const mode of ["livePreview", "source", "reading"]) {
  for (const pane of ["editor", "outline"]) {
    for (const before of [true, false]) for (const after of [false, true]) {
      test(`${mode}/${pane}: navigation before=${before}, after=${after} respects timeout and preserves the caret`, () => {
        const f = navigationFixture(mode, pane);
        try {
          Object.assign(f.settings, { breadcrumbNavigateBeforeTimeout: before, breadcrumbNavigateAfterTimeout: after,
            globalBreadcrumbTimeoutSeconds: 1 });
          const popup = f.open(); assert.ok(popup);
          f.hover(0); f.hover(1);
          assert.ok(popup.querySelectorAll(".extended-breadcrumb-row")[1].classList.contains("is-active"));
          assert.equal(f.scroller.scrollTop, before ? 30 : 390);
          assert.equal(f.outline.scrollTop, before && pane === "outline" ? 30 : 280);
          f.leave(); f.advance(999);
          assert.ok(popup.isConnected);
          assert.equal(f.scroller.scrollTop, before ? 30 : 390);
          f.advance(1);
          assert.equal(popup.isConnected, false);
          assert.equal(f.scroller.scrollTop, after ? 30 : 390);
          assert.equal(f.scroller.scrollLeft, 17);
          assert.equal(f.outline.scrollTop, after && pane === "outline" ? 30 : 280);
          assert.equal(f.outline.scrollLeft, after && pane === "outline" ? 0 : 13);
          assert.equal(f.caret(), 0); assert.equal(f.focused(), 0);
        } finally { f.close(); }
      });
    }
  }
}

test("deferred navigation waits for the effective per-mode timeout and is cancelled on re-entry", () => {
  const f = navigationFixture();
  try {
    Object.assign(f.settings, { breadcrumbNavigateBeforeTimeout: false, breadcrumbNavigateAfterTimeout: true,
      sourceBreadcrumbTimeoutEnabled: true, sourceBreadcrumbTimeoutSeconds: 0.35 });
    f.open(); f.hover(0); f.leave(); f.advance(349);
    assert.equal(f.navigation.length, 0);
    f.move(f.document.body, 5, 100); // Inside the popover: cancel the old timer.
    f.advance(1000); assert.equal(f.navigation.length, 0);
    f.hover(1); f.leave(); f.advance(349); assert.equal(f.navigation.length, 0);
    f.advance(1); assert.deepEqual(f.navigation, [1]);
    f.settings.sourceBreadcrumbTimeoutSeconds = 0;
    f.open(); f.hover(0); f.leave(); assert.deepEqual(f.navigation, [1, 0]);
  } finally { f.close(); }
});

test("opening without hovering a breadcrumb entry never navigates on timeout", () => {
  const f = navigationFixture();
  try {
    f.settings.breadcrumbNavigateAfterTimeout = true;
    f.open(); f.leave(); f.advance(10);
    assert.equal(f.scroller.scrollTop, 390); assert.deepEqual(f.navigation, []);
  } finally { f.close(); }
});

for (const before of [true, false]) for (const after of [true, false]) {
  test(`explicit click commits navigation with before=${before}, after=${after}`, () => {
    const f = navigationFixture();
    try {
      Object.assign(f.settings, { breadcrumbNavigateBeforeTimeout: before, breadcrumbNavigateAfterTimeout: after });
      const popup = f.open(); f.hover(0);
      popup.querySelectorAll(".extended-breadcrumb-row")[1].click();
      assert.equal(f.scroller.scrollTop, 30); assert.equal(f.caret(), "# Root\n".length);
      f.leave(); f.advance(10);
      assert.equal(f.scroller.scrollTop, 30); assert.equal(f.focused(), 1);
    } finally { f.close(); }
  });
}

test("hovering after a click restores the clicked position, not the original position", () => {
  const f = navigationFixture();
  try {
    const popup = f.open(); popup.querySelectorAll(".extended-breadcrumb-row")[1].click();
    f.hover(0); assert.equal(f.scroller.scrollTop, 0);
    f.leave(); f.advance(10);
    assert.equal(f.scroller.scrollTop, 30); assert.equal(f.caret(), "# Root\n".length);
  } finally { f.close(); }
});

test("clicking outside cancels queued hover navigation without undoing the user's main-UI interaction", () => {
  const f = navigationFixture();
  try {
    f.settings.breadcrumbNavigateAfterTimeout = true;
    const popup = f.open(); f.hover(1); f.leave();
    const count = f.navigation.length;
    f.lines[2].dispatchEvent(new f.win.MouseEvent("pointerdown", { bubbles: true }));
    f.scroller.scrollTop = 200; // The outside click navigated elsewhere.
    f.advance(1000);
    assert.equal(popup.isConnected, false); assert.equal(f.navigation.length, count);
    assert.equal(f.scroller.scrollTop, 200);
  } finally { f.close(); }
});

test("embedded headings never activate breadcrumbs against the containing note's source", () => {
  const f = navigationFixture("reading");
  try {
    const reading = f.document.querySelector(".markdown-preview-view");
    const embed = f.document.createElement("div"); embed.className = "internal-embed";
    reading.before(embed); embed.append(reading);
    // Simulate a fragment registered before it was attached to a same-note
    // embed; source-file equality alone would not protect against this case.
    f.settings.breadcrumbFieldActivation = true; f.settings.editorBreadcrumbFieldActivation = true;
    assert.equal(f.open(), null);
    f.settings.breadcrumbFieldActivation = false;
    assert.equal(f.open(), null);
    f.manager.refresh();
    assert.equal(reading.querySelectorAll(".extended-breadcrumb-reading-marker").length, 0);
  } finally { f.close(); }
});

for (const reason of ["escape", "blur", "settings", "destroy", "file", "mode", "edit", "hidden"]) {
  test(`${reason} cancels deferred navigation and never restores into a changed note or mode`, () => {
    const f = navigationFixture();
    try {
      f.settings.breadcrumbNavigateAfterTimeout = true;
      const popup = f.open(); f.hover(1); f.leave();
      const count = f.navigation.length;
      if (reason === "escape") f.document.dispatchEvent(new f.win.KeyboardEvent("keydown", { key: "Escape" }));
      if (reason === "blur") f.win.dispatchEvent(new f.win.Event("blur"));
      if (reason === "settings") f.manager.refresh();
      if (reason === "destroy") f.manager.destroy();
      if (reason === "file") { f.view.file = { path: "Other.md" }; f.handlers.get("file-open")(); }
      if (reason === "mode") { f.view.mode = "preview"; f.handlers.get("layout-change")(); }
      if (reason === "edit") { f.view.editor.cm.state = EditorState.create({ doc: "# Another" }); f.handlers.get("editor-change")(f.view.editor, f.view); }
      if (reason === "hidden") { f.view.containerEl.getBoundingClientRect = () => new f.win.DOMRect(); f.handlers.get("layout-change")(); }
      f.advance(1000); assert.equal(popup.isConnected, false);
      assert.equal(f.navigation.length, count, "cancellation never commits deferred navigation");
      assert.equal(f.scroller.scrollTop, ["file", "mode", "edit", "hidden"].includes(reason) ? 30 : 390);
    } finally { f.close(); }
  });
}

test("configured dismissal delay applies to scrolling and changes with the numeric setting", () => {
  const f = fixture();
  try {
    const advance = clock(f.win);
    for (const seconds of [1, 2.75]) {
      f.settings.globalBreadcrumbTimeoutSeconds = seconds;
      f.move(f.lines[1], 1, 35);
      f.document.querySelector(".cm-scroller").dispatchEvent(new f.win.Event("scroll"));
      advance(seconds * 1000 - 1);
      assert.ok(f.document.querySelector(".extended-breadcrumb-popover"));
      advance(1);
      assert.equal(f.document.querySelector(".extended-breadcrumb-popover"), null);
    }
  } finally { f.close(); }
});

test("entering the gap or popup cancels dismissal, including scrollbar and preview layout changes", () => {
  const f = fixture();
  try {
    const advance = clock(f.win);
    f.move(f.lines[1], 1, 35);
    const popup = f.document.querySelector(".extended-breadcrumb-popover");
    f.move(f.lines[1], 1, 750); // Start the default 10ms timer.
    f.move(f.lines[2], 2, 35); // Another heading lies in the gap to this popup.
    advance(100);
    assert.equal(f.document.querySelector(".extended-breadcrumb-popover"), popup);
    assert.equal(popup.querySelectorAll(".extended-breadcrumb-row").length, 2);
    // Simulate a scrollbar event whose target is outside the popup DOM.
    f.move(f.document.body, 5, 435);
    f.document.querySelector(".cm-scroller").dispatchEvent(new f.win.Event("scroll"));
    // Ancestor preview can recycle the original CodeMirror line/gutter.
    f.lines[1].remove(); f.handlers.get("layout-change")(); f.handlers.get("file-open")();
    advance(10000);
    assert.equal(f.document.querySelector(".extended-breadcrumb-popover"), popup);
    f.move(f.document.body, 0, 750);
    advance(9); assert.ok(popup.isConnected);
    advance(1); assert.equal(popup.isConnected, false);
  } finally { f.close(); }
});

test("changing the owner note closes the breadcrumb even while it is hovered", () => {
  const f = fixture();
  try {
    f.move(f.lines[1], 1, 35);
    f.move(f.document.body, 5, 100);
    f.view.file = { path: "Another.md" };
    f.handlers.get("file-open")();
    assert.equal(f.document.querySelector(".extended-breadcrumb-popover"), null);
  } finally { f.close(); }
});

test("Outline activation uses heading source identity, not rendered label text", () => {
  const f = fixture("source", "# Root\n#### ![[Other#Repeated|Alias]]");
  try {
    const row = f.document.createElement("div"); row.className = "tree-item-self";
    row.dataset.extendedBreadcrumbLine = "1"; row.dataset.extendedBreadcrumbFile = "Test.md";
    const marker = f.document.createElement("span"); marker.className = "extended-heading-outline-level-marker";
    marker.textContent = "H4"; row.append(marker); f.document.querySelector('[data-type="outline"]').append(row);
    f.move(marker);
    const popup = f.document.querySelector(".extended-breadcrumb-popover");
    assert.equal(popup?.dataset.pane, "outline");
    assert.equal(popup.querySelectorAll(".extended-breadcrumb-row").length, 2);
    assert.match(popup.textContent, /Alias/);
    f.settings.breadcrumbFieldActivation = true; f.settings.outlineBreadcrumbFieldActivation = true;
    f.manager.refresh();
    row.dataset.line = "1";
    const outline = row.parentElement;
    outline.getBoundingClientRect = () => new f.win.DOMRect(800, 0, 400, 600);
    f.move(outline, 1, 820);
    assert.equal(f.document.querySelector(".extended-breadcrumb-popover")?.dataset.pane, "outline");
    f.settings.outlineHeadingHoverBreadcrumb = false; f.manager.refresh(); f.move(marker);
    assert.equal(f.document.querySelector(".extended-breadcrumb-popover"), null);
  } finally { f.close(); }
});

test("Reading mode supplies H1–H12 hover markers and navigates by source line", () => {
  const f = fixture("reading", "# Root\n####### Extended");
  try {
    const reading = f.document.querySelector(".markdown-preview-view");
    const h1 = f.document.createElement("h1"); h1.textContent = "Root";
    const h7 = f.document.createElement("div"); h7.className = "extended-heading-reading"; h7.setAttribute("aria-level", "7"); h7.textContent = "Extended";
    reading.append(h1, h7);
    let registration;
    f.manager.processReading(reading, { sourcePath: "Test.md", addChild: (child) => { registration = child; }, getSectionInfo: () => ({ text: "# Root\n####### Extended", lineStart: 0, lineEnd: 1 }) });
    assert.equal(reading.querySelectorAll(".extended-breadcrumb-reading-marker").length, 2);
    f.move(h7.querySelector(".extended-breadcrumb-reading-marker"));
    const rows = f.document.querySelectorAll(".extended-breadcrumb-row");
    assert.equal(rows.length, 2); rows[1].click();
    assert.equal(f.effects.at(-1).line, 1);
    assert.equal(f.effects.at(-1).focus, true);
    f.settings.breadcrumbReading = false; f.manager.refresh();
    assert.equal(reading.querySelectorAll(".extended-breadcrumb-reading-marker").length, 0);
    registration.onunload();
    assert.equal(f.manager.readingElements.size, 0);
  } finally { f.close(); }
});

test("popover keyboard navigation, wrapping toggle, settings refresh, and window cleanup", () => {
  const f = fixture();
  try {
    f.move(f.document.querySelectorAll(".cm-gutterElement")[2], 2);
    const popup = f.document.querySelector(".extended-breadcrumb-popover");
    assert.equal(popup.classList.contains("extended-breadcrumb-expand"), true);
    const rows = popup.querySelectorAll(".extended-breadcrumb-row");
    rows[2].focus();
    rows[2].dispatchEvent(new f.win.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    assert.equal(f.document.activeElement, rows[0]);
    f.settings.breadcrumbExpandTitles = false; f.manager.refresh();
    f.move(f.document.querySelectorAll(".cm-gutterElement")[2], 2);
    assert.equal(f.document.querySelector(".extended-breadcrumb-popover").classList.contains("extended-breadcrumb-expand"), false);
    f.win.dispatchEvent(new f.win.Event("blur"));
    assert.equal(f.document.querySelector(".extended-breadcrumb-popover"), null);
    f.manager.destroy(); f.move(f.document.querySelectorAll(".cm-gutterElement")[2], 2);
    assert.equal(f.document.querySelector(".extended-breadcrumb-popover"), null);
  } finally { f.close(); }
});

test("breadcrumb SVG mutations do not trigger document-wide Style Settings scans", async () => {
  const f = fixture();
  const { StyleSettingsPrecisionControls } = f.load("style-settings-precision");
  const precision = new StyleSettingsPrecisionControls();
  try {
    precision.start([f.document]);
    const query = f.document.querySelectorAll.bind(f.document);
    let scans = 0;
    f.document.querySelectorAll = (selector) => { scans++; return query(selector); };
    const popup = f.document.createElement("div"); popup.className = "extended-breadcrumb-popover";
    const svg = f.document.createElementNS("http://www.w3.org/2000/svg", "svg"); popup.append(svg); f.document.body.append(popup);
    await new Promise(setImmediate);
    svg.append(f.document.createElementNS("http://www.w3.org/2000/svg", "path"));
    await new Promise(setImmediate);
    assert.equal(scans, 0);
    f.document.body.append(f.document.createElement("div"));
    await new Promise(setImmediate);
    assert.ok(scans > 0, "other DOM changes still discover newly opened settings");
  } finally { precision.stop(); f.close(); }
});
