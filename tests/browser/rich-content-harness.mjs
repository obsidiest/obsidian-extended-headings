import "./breadcrumb-harness.mjs";
import { installHostDOM } from "./host-dom.mjs";
import { StyleSettingsColors, THEMED_COLOR_DEFAULTS } from "../../src/style-settings-colors.ts";
import { StyleSettingsPrecisionControls } from "../../src/style-settings-precision.ts";

Object.assign(window, { StyleSettingsColors, StyleSettingsPrecisionControls, THEMED_COLOR_DEFAULTS, installHostDOM });
window.mountColorRows = (doc = document) => {
  doc.getElementById("settings")?.remove();
  const settings = doc.body.createDiv({ attr: { id: "settings" } });
  for (const id of [...THEMED_COLOR_DEFAULTS.keys(), "other-plugin-color"]) {
    const row = settings.createDiv({ cls: "setting-item", attr: { "data-id": id } });
    row.createDiv({ cls: "setting-item-name", text: id });
    row.createDiv({ cls: "setting-item-control" }).createDiv({ cls: "themed-color-wrapper", text: "Original picker" });
  }
  window.colors.enhance(doc);
};
window.setupColors = () => {
  // Like Style Settings, place generated overrides after the plugin CSS.
  document.head.append(document.getElementById("saved-colors"));
  const store = { settings: {}, disk: {}, calls: 0,
    getSetting(section, id) { return this.settings[`${section}@@${id}`]; },
    async setSettings(updates) {
      this.calls++;
      Object.assign(this.settings, updates);
      await new Promise(resolve => { if (this.delayed) this.resolve = resolve; else resolve(); });
      if (this.fail) throw new Error("Storage unavailable");
      this.disk = JSON.parse(JSON.stringify(this.settings));
      document.getElementById("saved-colors").textContent = Object.entries(this.settings).map(([key, value]) => {
        const [, id, theme] = key.split("@@");
        return `body.theme-${theme}{--${id}:${value};}`;
      }).join("\n");
    },
  };
  window.colorStore = store;
  window.colors = new StyleSettingsColors(() => window.colorStore);
  window.mountColorRows();
};
