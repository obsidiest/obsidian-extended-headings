export class MarkdownView {
}
export class MarkdownRenderChild {
}
export class Component {
}
export class TFile {
}
export const MarkdownRenderer = {};
export const sanitizeHTMLToDom = () => document.createDocumentFragment();

function modalElement(tag, options = {}) {
  const element = document.createElement(tag);
  if (options.cls) element.className = options.cls;
  if (options.text) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attr ?? {})) element.setAttribute(name, value);
  return Object.assign(element, {
    empty() { this.replaceChildren(); },
    addClass(name) { this.classList.add(name); },
    addClasses(names) { this.classList.add(...names); },
    createEl(childTag, childOptions) {
      const child = modalElement(childTag, childOptions);
      this.append(child);
      return child;
    },
    createDiv(childOptions) { return this.createEl("div", childOptions); },
  });
}

// Only the Obsidian shell is mocked. The production rename service creates
// the form, sizes its field, and handles all input and submission events.
export class Modal {
  constructor(app) {
    app.renameModal = this;
    this.modalEl = modalElement("div", { cls: "modal rename-test-modal" });
    this.titleEl = this.modalEl.createEl("h2");
    this.contentEl = this.modalEl.createDiv({ cls: "modal-content" });
  }
  setTitle(title) { this.titleEl.textContent = title; }
  open() { document.body.append(this.modalEl); this.onOpen(); }
  close() { this.onClose(); this.modalEl.remove(); }
}
export class Notice {}
export const stripHeading = (text) => text;
export const parseLinktext = (text) => ({ path: text, subpath: "" });
