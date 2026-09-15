import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { sourceLoader } from "./helpers/load-source.mjs";

// The real modal/service run here; Obsidian's DOM helpers and layout metrics
// are mocked. These tests establish lifecycle/keyboard behavior, not pixels.
function harness(options = {}) {
  const dom = new JSDOM("<!doctype html><html><head><style>.extended-heading-rename-input { border-top: 2px solid; border-bottom: 3px solid; box-sizing: border-box; }</style></head><body></body></html>", { pretendToBeVisual: true });
  const win = dom.window, document = win.document;
  const metrics = { width: 400, height: 108, reads: 0 };
  const frames = new Map(), observers = [], submissions = [], notices = [];
  let frameId = 0;
  const modals = [];
  win.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  win.cancelAnimationFrame = (id) => frames.delete(id);
  win.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
    notify() { if (!this.disconnected) this.callback([]); }
  };
  Object.defineProperty(win.HTMLTextAreaElement.prototype, "scrollHeight", {
    get() { metrics.reads++; return metrics.height; },
  });
  win.HTMLTextAreaElement.prototype.getBoundingClientRect = () => ({ width: metrics.width });
  Object.assign(win.HTMLElement.prototype, {
    empty() { this.replaceChildren(); },
    addClass(name) { this.classList.add(name); },
    addClasses(names) { this.classList.add(...names); },
    createEl(tag, options = {}) {
      const element = document.createElement(tag);
      if (options.cls) element.className = options.cls;
      if (options.text) element.textContent = options.text;
      for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, value);
      this.append(element);
      return element;
    },
    createDiv(options) { return this.createEl("div", options); },
  });
  class MarkdownView {}
  class Modal {
    constructor() {
      modals.push(this);
      this.contentEl = document.createElement("div");
      this.closed = false;
    }
    setTitle(title) { this.title = title; }
    open() {
      if (!options.attachAfterOpen) document.body.append(this.contentEl);
      this.onOpen();
      if (options.attachAfterOpen) document.body.append(this.contentEl);
    }
    close() {
      this.closed = true;
      this.onClose();
      this.contentEl.remove();
    }
  }
  class PluginSettingTab { update() {} }
  const load = sourceLoader({ obsidian: {
    MarkdownView, Modal, PluginSettingTab,
    Notice: class { constructor(message) { notices.push(message); } },
    stripHeading: (text) => text,
    parseLinktext: (text) => ({ path: text, subpath: "" }),
  } }, { window: win, document });
  const { HeadingRenameService } = load("rename-heading");
  const preference = { value: options.expand ?? true };
  const service = options.omitPreference
    ? new HeadingRenameService({}, () => 12)
    : new HeadingRenameService({}, () => 12, () => preference.value);
  service.renameExtendedHeading = async (_editor, _view, _heading, value) => {
    submissions.push(value);
    return false;
  };
  return {
    win, document, metrics, frames, observers, submissions, notices, service, preference, load,
    get modal() { return modals.at(-1); },
    open(level = 12, title = "Long title with Markdown [[Links]] and repeated words ".repeat(4)) {
      const editor = { getCursor: () => ({ line: 0, ch: 0 }), getLine: () => "#".repeat(level) + " " + title };
      const view = Object.assign(new MarkdownView(), { file: { path: "Test.md" } });
      service.renameAtCursor(editor, view);
      return modals.at(-1).contentEl.querySelector(".extended-heading-rename-input");
    },
    flush() {
      const pending = [...frames.values()]; frames.clear();
      for (const callback of pending) callback(0);
    },
    dispose() { for (const modal of modals) if (!modal.closed) modal.close(); dom.window.close(); },
  };
}

for (let level = 1; level <= 12; level++) {
  test("H" + level + " rename wraps and sizes on opening without a click", (t) => {
    const h = harness({ omitPreference: true }); t.after(() => h.dispose());
    const title = "Test Heading 2 - Filler Text for this Example (More Filler Text) (Filler Text) (Filler Text) (Filler Text)";
    const input = h.open(level, title);
    assert.equal(input.tagName, "TEXTAREA");
    assert.equal(input.rows, 1);
    assert.equal(input.wrap, "soft");
    assert.equal(input.value, title);
    assert.equal(input.style.height, "113px", "includes the measured content and both borders before focus");
    h.flush();
    assert.equal(h.document.activeElement, input);
    assert.equal(input.selectionStart, 0);
    assert.equal(input.selectionEnd, title.length);
    assert.equal(input.style.height, "113px");
    assert.equal(input.value.includes("\n"), false, "soft wrapping does not alter the Markdown heading");
  });
}

test("delayed attachment is measured in the opening frame", (t) => {
  const h = harness({ attachAfterOpen: true }); t.after(() => h.dispose());
  const input = h.open();
  assert.equal(input.style.height, "");
  h.flush();
  assert.equal(input.style.height, "113px");
  assert.equal(h.document.activeElement, input);
});

test("rename grows and shrinks on input, width changes, and window resizing", (t) => {
  const h = harness(); t.after(() => h.dispose());
  const input = h.open(); h.flush();
  h.metrics.height = 212; input.dispatchEvent(new h.win.Event("input"));
  assert.equal(input.style.height, "217px");
  input.value = "Short"; h.metrics.height = 28;
  input.dispatchEvent(new h.win.Event("input"));
  assert.equal(input.style.height, "33px");
  h.metrics.width = 200; h.metrics.height = 64; h.observers[0].notify();
  assert.equal(input.style.height, "69px");
  const reads = h.metrics.reads; h.observers[0].notify();
  assert.equal(h.metrics.reads, reads, "height-only observer callbacks do not remeasure");
  h.metrics.width = 800; h.metrics.height = 28;
  h.win.dispatchEvent(new h.win.Event("resize"));
  assert.equal(input.style.height, "33px");
});

test("the saved toggle is read for each dialog and off retains the single-line field", (t) => {
  const h = harness({ expand: false }); t.after(() => h.dispose());
  const input = h.open();
  assert.equal(input.tagName, "INPUT");
  assert.equal(input.type, "text");
  assert.equal(h.observers.length, 0);
  h.flush();
  assert.equal(h.document.activeElement, input);
  assert.equal(input.style.height, "");
  h.modal.close();
  h.preference.value = true;
  assert.equal(h.open().tagName, "TEXTAREA", "no plugin reload is needed");
});

test("Enter submits once, prevents a newline, and permits retry after rejection", async (t) => {
  const h = harness(); t.after(() => h.dispose());
  const input = h.open(); input.value = "Renamed [[Heading]]";
  const enter = () => new h.win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  const event = enter();
  input.dispatchEvent(event);
  input.dispatchEvent(enter());
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(h.submissions, ["Renamed [[Heading]]"], "in-flight submissions are not duplicated");
  await nextTurn();
  input.dispatchEvent(enter());
  assert.equal(h.submissions.length, 2);
  assert.equal(input.value, "Renamed [[Heading]]");
  assert.equal(h.modal.closed, false);
});

test("IME confirmation and a held Enter do not submit the rename", (t) => {
  const h = harness(); t.after(() => h.dispose());
  const input = h.open();
  for (const extra of [{ isComposing: true }]) {
    const event = new h.win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...extra });
    input.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  const repeated = new h.win.KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true, cancelable: true });
  input.dispatchEvent(repeated);
  assert.equal(repeated.defaultPrevented, true, "repeated Enter must not insert a newline");
  assert.deepEqual(h.submissions, []);
});

test("accepted submission closes the dialog and releases its layout observer", async (t) => {
  const h = harness(); t.after(() => h.dispose());
  h.service.renameExtendedHeading = async () => true;
  const input = h.open();
  input.dispatchEvent(new h.win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await nextTurn();
  assert.equal(h.modal.closed, true);
  assert.equal(h.frames.size, 0);
  assert.equal(h.observers[0].disconnected, true);
});

test("closing before focus cancels pending work and cannot steal focus later", (t) => {
  const h = harness(); t.after(() => h.dispose());
  const input = h.open();
  const reads = h.metrics.reads;
  h.modal.contentEl.querySelector('button[type="button"]').click();
  const other = h.document.createElement("input"); h.document.body.append(other); other.focus();
  h.flush();
  input.dispatchEvent(new h.win.Event("input"));
  h.win.dispatchEvent(new h.win.Event("resize"));
  h.observers[0].notify();
  assert.equal(h.document.activeElement, other);
  assert.equal(h.metrics.reads, reads);
  assert.equal(h.frames.size, 0);
  assert.equal(h.observers[0].disconnected, true);
  assert.deepEqual(h.submissions, []);
});

test("the searchable default-on rename setting persists both Boolean choices", async (t) => {
  const h = harness(); t.after(() => h.dispose());
  const { DEFAULT_SETTINGS, ExtendedHeadingsSettingTab } = h.load("settings");
  const saved = [];
  const plugin = { settings: { ...DEFAULT_SETTINGS }, settingsChanged: async () => saved.push({ ...plugin.settings }) };
  const tab = new ExtendedHeadingsSettingTab({}, plugin);
  const item = tab.getSettingDefinitions().find((item) => item.control?.key === "expandLongRenameHeadingTitles");
  assert.equal(item.name, "Expand long heading titles in rename dialog");
  assert.ok(item.aliases.includes("rename this heading"));
  assert.equal(item.control.defaultValue, true);
  assert.equal(tab.getControlValue("expandLongRenameHeadingTitles"), true);
  await tab.setControlValue("expandLongRenameHeadingTitles", false);
  assert.equal(saved.at(-1).expandLongRenameHeadingTitles, false);
  await tab.setControlValue("expandLongRenameHeadingTitles", true);
  assert.equal(saved.at(-1).expandLongRenameHeadingTitles, true);
  await tab.setControlValue("expandLongRenameHeadingTitles", "false");
  assert.equal(saved.length, 2, "non-Boolean input does not overwrite the saved preference");
});
