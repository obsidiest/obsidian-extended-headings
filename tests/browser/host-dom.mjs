// Minimal Obsidian DOM extensions; real layout/events come from Chromium.
export function installHostDOM(win) {
  const doc = win.document;
  doc.win = win;
  const create = (tag, options = {}) => {
    if (typeof options === "string") options = { cls: options };
    const el = doc.createElement(tag);
    if (options.type) el.setAttribute("type", options.type);
    if (options.cls) el.className = options.cls;
    if (options.text) el.textContent = options.text;
    for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, value);
    return el;
  };
  Object.assign(win, { createEl: create, createSpan: options => create("span", options), createFragment: () => doc.createDocumentFragment() });
  for (const proto of [win.HTMLElement.prototype, win.DocumentFragment.prototype]) {
    proto.createEl = function (tag, options) { const el = create(tag, options); this.append(el); return el; };
    proto.createDiv = function (options) { return this.createEl("div", options); };
    proto.createSpan = function (options) { return this.createEl("span", options); };
    proto.empty = function () { this.replaceChildren(); };
  }
  win.HTMLElement.prototype.addClass = function (...classes) { this.classList.add(...classes); };
  win.HTMLElement.prototype.removeClass = function (...classes) { this.classList.remove(...classes); };
}
installHostDOM(window);
