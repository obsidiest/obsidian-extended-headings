// Lifecycle adapter only; this does not run Obsidian's Markdown renderer.
export class Component {
  constructor() { this.children = new Set(); this.callbacks = []; this.loaded = false; }
  load() {
    if (this.loaded) return;
    this.loaded = true; this.onload?.();
    for (const child of this.children) child.load();
  }
  register(callback) { this.callbacks.push(callback); }
  addChild(child) { this.children.add(child); if (this.loaded) child.load(); return child; }
  removeChild(child) { this.children.delete(child); child.unload(); return child; }
  unload() {
    if (!this.loaded) return;
    this.loaded = false;
    this.onunload?.();
    for (const child of this.children) child.unload();
    this.children.clear();
    for (const callback of this.callbacks.splice(0)) callback();
  }
}
