import type { App } from "obsidian";

const SECTION = "extended-headings-style";
// Adapted from List Tree Indentation Guides 2.0.2 (MIT, obsidiest).
export const THEMED_COLOR_DEFAULTS = new Map<string, readonly [string, string]>([
  ["extended-heading-color", ["#3b3b3b", "#dcddde"]],
  ["extended-outline-heading-color", ["#", "#"]],
  ["extended-outline-level-marker-color", ["#", "#"]],
  ["extended-outline-guide-color", ["#777777", "#888888"]],
  ["extended-outline-thread-color-1", ["#d94f00", "#ff5a00"]],
  ["extended-outline-thread-color-2", ["#c99a00", "#ffc400"]],
  ["extended-outline-thread-color-3", ["#79b800", "#a8e600"]],
  ["extended-outline-thread-color-4", ["#008ea3", "#00c8df"]],
  ["extended-outline-thread-color-5", ["#316fd1", "#5794ff"]],
  ["extended-outline-thread-color-6", ["#7547c7", "#a66cff"]],
  ["extended-outline-thread-color-7", ["#b83782", "#e64fa3"]],
  ["extended-outline-thread-color-8", ["#b83782", "#e64fa3"]],
  ["extended-h7-color", ["#", "#"]],
  ["extended-h8-color", ["#", "#"]],
  ["extended-h9-color", ["#", "#"]],
  ["extended-h10-color", ["#", "#"]],
  ["extended-h11-color", ["#", "#"]],
  ["extended-h12-color", ["#", "#"]],
  ["extended-breadcrumb-background", ["#ffffff", "#202225"]],
  ["extended-breadcrumb-border-color", ["#d7d7d7", "#46484d"]],
  ["extended-breadcrumb-text-color", ["#252525", "#dcddde"]],
  ["extended-breadcrumb-title-color", ["#666666", "#a7a9ad"]],
  ["extended-breadcrumb-current-color", ["#4c78cc", "#7aa2f7"]],
  ["extended-breadcrumb-hover-color", ["#e7edf8", "#343b4a"]],
  ["extended-breadcrumb-main-color", ["#4c78cc", "#7aa2f7"]],
  ["extended-breadcrumb-level-marker-color", ["#", "#"]],
  ["extended-breadcrumb-guide-color", ["#777777", "#888888"]],
  ["extended-breadcrumb-thread-color-1", ["#d94f00", "#ff5a00"]],
  ["extended-breadcrumb-thread-color-2", ["#c99a00", "#ffc400"]],
  ["extended-breadcrumb-thread-color-3", ["#79b800", "#a8e600"]],
  ["extended-breadcrumb-thread-color-4", ["#008ea3", "#00c8df"]],
  ["extended-breadcrumb-thread-color-5", ["#316fd1", "#5794ff"]],
  ["extended-breadcrumb-thread-color-6", ["#7547c7", "#a66cff"]],
  ["extended-breadcrumb-thread-color-7", ["#b83782", "#e64fa3"]],
  ["extended-breadcrumb-thread-color-8", ["#b83782", "#e64fa3"]],
  ["extended-editor-breadcrumb-level-marker-color", ["#", "#"]],
  ["extended-editor-breadcrumb-guide-color", ["#777777", "#888888"]],
  ["extended-editor-breadcrumb-thread-color-1", ["#d94f00", "#ff5a00"]],
  ["extended-editor-breadcrumb-thread-color-2", ["#c99a00", "#ffc400"]],
  ["extended-editor-breadcrumb-thread-color-3", ["#79b800", "#a8e600"]],
  ["extended-editor-breadcrumb-thread-color-4", ["#008ea3", "#00c8df"]],
  ["extended-editor-breadcrumb-thread-color-5", ["#316fd1", "#5794ff"]],
  ["extended-editor-breadcrumb-thread-color-6", ["#7547c7", "#a66cff"]],
  ["extended-editor-breadcrumb-thread-color-7", ["#b83782", "#e64fa3"]],
  ["extended-editor-breadcrumb-thread-color-8", ["#b83782", "#e64fa3"]],
  ["extended-outline-breadcrumb-level-marker-color", ["#", "#"]],
  ["extended-outline-breadcrumb-guide-color", ["#777777", "#888888"]],
  ["extended-outline-breadcrumb-thread-color-1", ["#d94f00", "#ff5a00"]],
  ["extended-outline-breadcrumb-thread-color-2", ["#c99a00", "#ffc400"]],
  ["extended-outline-breadcrumb-thread-color-3", ["#79b800", "#a8e600"]],
  ["extended-outline-breadcrumb-thread-color-4", ["#008ea3", "#00c8df"]],
  ["extended-outline-breadcrumb-thread-color-5", ["#316fd1", "#5794ff"]],
  ["extended-outline-breadcrumb-thread-color-6", ["#7547c7", "#a66cff"]],
  ["extended-outline-breadcrumb-thread-color-7", ["#b83782", "#e64fa3"]],
  ["extended-outline-breadcrumb-thread-color-8", ["#b83782", "#e64fa3"]],
]);

/** Narrow, feature-detected integration with Style Settings 1.0.9's manager.
 * Keep its schema and @@light/@@dark keys so existing values/export/import work.
 * setSettings returns save()'s promise; setSetting's Pickr callback does not. */
export interface StyleSettingsColorStore {
  settings: Record<string, unknown>;
  getSetting(section: string, id: string): unknown;
  setSettings(values: Record<string, string>): Promise<void>;
}
export function styleSettingsColorStore(app: App): StyleSettingsColorStore | null {
  const plugins = (app as App & { plugins?: { getPlugin?: (id: string) => unknown } }).plugins;
  const plugin = plugins?.getPlugin?.("obsidian-style-settings") as { settingsManager?: Partial<StyleSettingsColorStore> } | undefined;
  const manager = plugin?.settingsManager;
  return typeof manager?.getSetting === "function" && typeof manager.setSettings === "function"
    && !!manager.settings && typeof manager.settings === "object"
    ? manager as StyleSettingsColorStore : null;
}

export function pickerHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().toLowerCase();
  if (/^#[\da-f]{3,4}$/.test(hex)) return "#" + [...hex.slice(1)].map(x => x + x).join("");
  return /^#(?:[\da-f]{6}|[\da-f]{8})$/.test(hex) ? hex : null;
}

function savedColorHex(value: unknown, doc: Document): string | null {
  const hex = pickerHex(value);
  if (hex || typeof value !== "string") return hex;
  // Style Settings imports can contain RGB/HSL or named colors. Convert their
  // display value without rewriting the saved setting until the user saves.
  if (!/^(?:rgba?|hsla?)\(|^[a-z]+$/i.test(value.trim()) || !CSS.supports("color", value)) return null;
  const context = (doc.win as Window & { createEl: typeof createEl }).createEl("canvas").getContext("2d");
  if (!context) return null;
  context.fillStyle = value;
  const normalized = context.fillStyle;
  const direct = pickerHex(normalized);
  if (direct) return direct;
  const channels = normalized.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) return null;
  return "#" + channels.map((channel, index) => Math.round(index === 3 ? channel * 255 : channel).toString(16).padStart(2, "0")).join("");
}

async function saveColor(store: StyleSettingsColorStore, key: string, hex: string | null): Promise<void> {
  const updates: Record<string, string> = {};
  const removals = new Set<string>();
  // Pickr can leave a malformed hex/non-finite color behind. Style Settings
  // 1.0.9 parses every themed color when saving, so one such value blocks CSS
  // generation even when editing a different field. Repair only known-bad
  // values in our own controls; preserve valid colors and other plugins' data.
  for (const [id, defaults] of THEMED_COLOR_DEFAULTS) {
    for (const [index, theme] of ["light", "dark"].entries()) {
      const storedKey = `${id}@@${theme}`, value = store.getSetting(SECTION, storedKey);
      if (typeof value === "string" && (!value.trim() || (value.trim().startsWith("#") && !pickerHex(value)) || /NaN|Infinity/i.test(value))) {
        const fullKey = `${SECTION}@@${storedKey}`;
        if (defaults[index] === "#") removals.add(fullKey);
        else updates[fullKey] = defaults[index];
      }
    }
  }
  const fullKey = `${SECTION}@@${key}`;
  if (hex === null) removals.add(fullKey);
  else { removals.delete(fullKey); updates[fullKey] = hex; }
  // Style Settings accepts '#' as an unset schema default but cannot generate
  // CSS from it as a saved value. Removing the override preserves inheritance.
  // Its clearSetting() does not return the save promise, so use its public
  // settings map plus one awaited setSettings() for persistence and CSS generation.
  const before = new Map([...removals, ...Object.keys(updates)].map(id => [id,
    { present: Object.prototype.hasOwnProperty.call(store.settings, id) === true, value: store.settings[id] }]));
  for (const id of removals) delete store.settings[id];
  try { await store.setSettings(updates); }
  catch (error) {
    for (const [id, old] of before) {
      if (old.present) store.settings[id] = old.value;
      else delete store.settings[id];
    }
    throw error;
  }
}

interface ColorRow {
  row: HTMLElement;
  original: HTMLElement;
  controls: HTMLElement;
  sync: () => void;
}

export class StyleSettingsColors {
  private rows = new Map<HTMLElement, ColorRow>();
  private dialogs = new Map<Document, HTMLDialogElement>();
  constructor(private readonly getStore: () => StyleSettingsColorStore | null) {}

  enhance(doc: Document): void {
    const store = this.getStore();
    for (const [row, record] of this.rows) {
      if (!row.isConnected || !store) { this.restore(record); this.rows.delete(row); }
      else if (row.ownerDocument === doc) record.sync();
    }
    if (!store) { this.dialogs.get(doc)?.close(); return; }
    for (const row of Array.from(doc.querySelectorAll<HTMLElement>('.setting-item[data-id]'))) {
      if (this.rows.has(row)) continue;
      const id = (row.dataset.id ?? "").replace(`${SECTION}@@`, "");
      const defaults = THEMED_COLOR_DEFAULTS.get(id);
      const original = row.querySelector<HTMLElement>(".themed-color-wrapper");
      const control = row.querySelector<HTMLElement>(".setting-item-control");
      if (!defaults || !original || !control) continue;
      const name = row.querySelector(".setting-item-name")?.textContent ?? "Color";
      const controls = control.createDiv({ cls: "extended-headings-style-color-controls" });
      const updates: (() => void)[] = [];
      for (const [index, theme] of ["light", "dark"].entries()) {
        const key = `${id}@@${theme}`, fallback = defaults[index];
        const title = `${name} (${theme})`;
        const button = controls.createEl("button", { text: theme === "light" ? "Light" : "Dark",
          cls: "extended-headings-style-color-swatch", attr: { type: "button", "aria-label": `${title} picker` } });
        const value = () => savedColorHex(this.getStore()?.getSetting(SECTION, key), doc) ?? fallback;
        const sync = () => {
          const color = value();
          button.style.setProperty("--extended-headings-chosen-color", color === "#" ? "transparent" : color);
          button.title = `${title}: ${color === "#" ? "Inherit" : color}`;
        };
        button.addEventListener("click", () => this.open(doc, title, key, value(), fallback, sync));
        updates.push(sync);
      }
      // Leave the upstream component owned by Style Settings; only replace its
      // presentation. Unload restores it, without monkey-patching Pickr itself.
      original.classList.add("extended-headings-style-color-original");
      const sync = () => updates.forEach(update => update());
      this.rows.set(row, { row, original, controls, sync });
      sync();
    }
  }

  removeDocument(doc: Document): void {
    this.dialogs.get(doc)?.close();
    for (const [row, record] of this.rows) if (row.ownerDocument === doc) {
      this.restore(record); this.rows.delete(row);
    }
  }
  stop(): void {
    for (const dialog of this.dialogs.values()) dialog.close();
    for (const record of this.rows.values()) this.restore(record);
    this.rows.clear();
  }
  private restore(record: ColorRow): void {
    record.controls.remove();
    record.original.classList.remove("extended-headings-style-color-original");
  }
  private open(doc: Document, title: string, key: string, initial: string, fallback: string,
    sync: () => void): void {
    this.dialogs.get(doc)?.close();
    const dialog = doc.body.createEl("dialog", { cls: "extended-headings-color-dialog", attr: { "aria-label": title } });
    this.dialogs.set(doc, dialog);
    dialog.createEl("h3", { text: title });
    const form = dialog.createEl("form");
    const fields = form.createDiv({ cls: "extended-headings-color-dialog-fields" });
    const picker = fields.createEl("input", { type: "color", attr: { "aria-label": "Choose color" } });
    const text = fields.createEl("input", { type: "text", attr: { "aria-label": "Hex color", spellcheck: "false" } });
    const status = form.createDiv({ cls: "extended-headings-color-dialog-status", attr: { role: "status" } });
    const actions = form.createDiv({ cls: "extended-headings-color-dialog-actions" });
    const reset = actions.createEl("button", { text: "Default", attr: { type: "button" } });
    const cancel = actions.createEl("button", { text: "Cancel", attr: { type: "button" } });
    const save = actions.createEl("button", { text: "Save", cls: "mod-cta", attr: { type: "submit" } });
    const inherit = fallback === "#";
    if (inherit) text.placeholder = "Leave blank to inherit";
    const set = (value: string) => {
      text.value = value === "#" ? "" : value;
      picker.value = value === "#" ? "#000000" : value.slice(0, 7);
      text.removeAttribute("aria-invalid");
      status.textContent = "";
    };
    set(initial);
    text.addEventListener("input", () => {
      const hex = pickerHex(text.value);
      if (hex) picker.value = hex.slice(0, 7);
      text.removeAttribute("aria-invalid");
      status.textContent = "";
    });
    picker.addEventListener("input", () => set(picker.value + (pickerHex(text.value)?.slice(7) ?? "")));
    reset.addEventListener("click", () => set(fallback));
    cancel.addEventListener("click", () => dialog.close());
    let saving = false;
    dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
    dialog.addEventListener("close", () => {
      if (this.dialogs.get(doc) === dialog) this.dialogs.delete(doc);
      dialog.remove();
    });
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (saving) return;
      const hex = pickerHex(text.value), store = this.getStore();
      const clear = inherit && (text.value.trim() === "" || text.value.trim() === "#");
      if ((!hex && !clear) || !store) {
        status.textContent = !store ? "Enable Style Settings to save this color." : "Enter a hex color, such as #7aa2f7.";
        text.setAttribute("aria-invalid", "true");
        return;
      }
      saving = true;
      for (const control of [picker, text, reset, cancel, save]) control.disabled = true;
      status.textContent = "Saving…";
      // Preserve the original Style Settings storage keys and await both disk
      // persistence and CSS regeneration before reporting success/closing.
      void saveColor(store, key, clear ? null : hex).then(() => {
        sync();
        dialog.close();
      }).catch((error: unknown) => {
        saving = false;
        for (const control of [picker, text, reset, cancel, save]) control.disabled = false;
        status.textContent = "Could not save the color. Please try again.";
        console.error("Extended Headings: color save failed", error);
      });
    });
    dialog.showModal();
    text.focus();
    text.select();
  }
}
