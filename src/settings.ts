import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { ChildListBehavior } from "./heading-commands";
import type ExtendedHeadingsPlugin from "./main";

export interface ExtendedHeadingsSettings {
  maximumLevel: number;
  hideMarkersInLivePreview: boolean;
  coreIntegration: boolean;
  readingModeFolding: boolean;
  lowerHeadingLimit: number;
  overrideTabBehavior: boolean;
  showHeadingMarkers: boolean;
  showMarkersBeforeLineNumbers: boolean;
  showMarkersInSourceMode: boolean;
  removeUnorderedListMarker: boolean;
  removeOrderedListMarker: boolean;
  customBeginningPatterns: string;
  removeBold: boolean;
  removeItalic: boolean;
  customSurroundingPatterns: string;
  childListBehavior: ChildListBehavior;
  tabSize: number;
}

export const DEFAULT_SETTINGS: ExtendedHeadingsSettings = {
  maximumLevel: 12,
  hideMarkersInLivePreview: true,
  coreIntegration: true,
  readingModeFolding: true,
  lowerHeadingLimit: 1,
  overrideTabBehavior: false,
  showHeadingMarkers: true,
  showMarkersBeforeLineNumbers: true,
  showMarkersInSourceMode: true,
  removeUnorderedListMarker: true,
  removeOrderedListMarker: true,
  customBeginningPatterns: "",
  removeBold: false,
  removeItalic: false,
  customSurroundingPatterns: "",
  childListBehavior: "outdent to zero",
  tabSize: 4,
};

export class ExtendedHeadingsSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ExtendedHeadingsPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Maximum heading level")
      .setDesc("Recognize additional ATX headings from H7 through this level.")
      .addSlider((slider) =>
        slider
          .setLimits(7, 12, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.maximumLevel)
          .onChange(async (value) => {
            this.plugin.settings.maximumLevel = value;
            this.plugin.settings.lowerHeadingLimit = Math.min(
              this.plugin.settings.lowerHeadingLimit,
              value,
            );
            await this.plugin.settingsChanged(true);
          }),
      );

    new Setting(containerEl)
      .setName("Hide hashes on inactive Live Preview lines")
      .setDesc("Conceal H7+ hash markers when the heading line is not active. Hashes are hidden by default.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.hideMarkersInLivePreview).onChange(async (value) => {
          this.plugin.settings.hideMarkersInLivePreview = value;
          await this.plugin.settingsChanged(false);
        }),
      );

    new Setting(containerEl)
      .setName("Reading View folding")
      .setDesc("Show a folding control beside extended headings in Reading View.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.readingModeFolding).onChange(async (value) => {
          this.plugin.settings.readingModeFolding = value;
          await this.plugin.settingsChanged(false);
        }),
      );

    new Setting(containerEl)
      .setName("Core Outline and heading-link bridge")
      .setDesc(
        "Experimental: adds H7+ entries to Obsidian's in-memory heading cache so the core Outline, [[Note#Heading]] links, and navigation can recognize them. Obsidian officially defines cached heading levels as 1–6, so this bridge may require updates after an Obsidian release.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.coreIntegration).onChange(async (value) => {
          this.plugin.settings.coreIntegration = value;
          await this.plugin.settingsChanged(true);
          new Notice(value ? "Extended heading bridge enabled" : "Extended heading bridge disabled");
        }),
      );

    new Setting(containerEl).setName("Heading shifting").setHeading();

    new Setting(containerEl)
      .setName("Lower limit of heading")
      .setDesc("The shallowest level that the Decrease headings command may reach. Choose 0 to allow H1 to become a paragraph.")
      .addDropdown((dropdown) => {
        for (let level = 0; level <= this.plugin.settings.maximumLevel; level += 1) {
          dropdown.addOption(String(level), level === 0 ? "0 (paragraph)" : String(level));
        }
        dropdown
          .setValue(String(this.plugin.settings.lowerHeadingLimit))
          .onChange(async (value) => {
            this.plugin.settings.lowerHeadingLimit = Number(value);
            await this.plugin.settingsChanged(false);
          });
      });

    new Setting(containerEl)
      .setName("Enable override Tab behavior")
      .setDesc('When the selection contains a heading, Tab runs "Increase headings" and Shift+Tab runs "Decrease headings". This can conflict with other editor behaviors.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.overrideTabBehavior).onChange(async (value) => {
          this.plugin.settings.overrideTabBehavior = value;
          await this.plugin.settingsChanged(false);
        }),
      );

    new Setting(containerEl).setName("Heading markers").setHeading();

    new Setting(containerEl)
      .setName("Show heading level markers")
      .setDesc("Show Lapel-compatible H1–H12 markers in the editor gutter.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showHeadingMarkers).onChange(async (value) => {
          this.plugin.settings.showHeadingMarkers = value;
          await this.plugin.settingsChanged(false);
        }),
      );

    new Setting(containerEl)
      .setName("Show before line numbers")
      .setDesc("Show heading markers before rather than after the line-number gutter.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showMarkersBeforeLineNumbers).onChange(async (value) => {
          this.plugin.settings.showMarkersBeforeLineNumbers = value;
          await this.plugin.settingsChanged(false);
        }),
      );

    new Setting(containerEl)
      .setName("Show in source mode")
      .setDesc("Show heading level markers in Source Mode as well as Live Preview.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showMarkersInSourceMode).onChange(async (value) => {
          this.plugin.settings.showMarkersInSourceMode = value;
          await this.plugin.settingsChanged(false);
        }),
      );

    new Setting(containerEl)
      .setName("Style to remove when setting a heading")
      .setDesc("These options apply when a Set as heading command converts a non-heading line.")
      .setHeading();

    containerEl.createEl("b", { text: "Beginning" });

    new Setting(containerEl)
      .setName("Unordered list")
      .setDesc("Remove -, +, or * list markers.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.removeUnorderedListMarker).onChange(async (value) => {
          this.plugin.settings.removeUnorderedListMarker = value;
          await this.plugin.settingsChanged(false);
        }),
      );

    new Setting(containerEl)
      .setName("Ordered list")
      .setDesc("Remove numbered list markers such as 1. or 1).")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.removeOrderedListMarker).onChange(async (value) => {
          this.plugin.settings.removeOrderedListMarker = value;
          await this.plugin.settingsChanged(false);
        }),
      );

    new Setting(containerEl)
      .setName("User-defined beginning patterns")
      .setDesc("Regular expressions to remove from the beginning of a non-heading line, one per line.")
      .addTextArea((text) => {
        text.inputEl.rows = 3;
        text
          .setPlaceholder("^Example\\s+")
          .setValue(this.plugin.settings.customBeginningPatterns)
          .onChange(async (value) => {
            this.plugin.settings.customBeginningPatterns = value;
            await this.plugin.settingsChanged(false);
          });
      });

    containerEl.createEl("b", { text: "Surrounding" });

    new Setting(containerEl)
      .setName("Bold")
      .setDesc("Remove matching ** or __ markers that surround the entire line.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.removeBold).onChange(async (value) => {
          this.plugin.settings.removeBold = value;
          await this.plugin.settingsChanged(false);
        }),
      );

    new Setting(containerEl)
      .setName("Italic")
      .setDesc("Remove matching * or _ markers that surround the entire line.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.removeItalic).onChange(async (value) => {
          this.plugin.settings.removeItalic = value;
          await this.plugin.settingsChanged(false);
        }),
      );

    new Setting(containerEl)
      .setName("User-defined surrounding patterns")
      .setDesc("Regular expressions to remove when the same pattern surrounds the entire line, one per line.")
      .addTextArea((text) => {
        text.inputEl.rows = 3;
        text
          .setPlaceholder("🤔")
          .setValue(this.plugin.settings.customSurroundingPatterns)
          .onChange(async (value) => {
            this.plugin.settings.customSurroundingPatterns = value;
            await this.plugin.settingsChanged(false);
          });
      });

    new Setting(containerEl).setName("Child lists").setHeading();

    new Setting(containerEl)
      .setName("Children behavior")
      .setDesc("Choose how the contiguous list below a line is re-indented when that line becomes a heading.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("outdent to zero", "Outdent to 0")
          .addOption("sync with headings", "Sync with headings")
          .addOption("noting", "Nothing")
          .setValue(this.plugin.settings.childListBehavior)
          .onChange(async (value) => {
            if (
              value !== "outdent to zero" &&
              value !== "sync with headings" &&
              value !== "noting"
            ) return;
            this.plugin.settings.childListBehavior = value;
            await this.plugin.settingsChanged(false);
          }),
      );

    new Setting(containerEl)
      .setName("Tab size")
      .setDesc("Number of spaces represented by one indentation level for child-list operations.")
      .addSlider((slider) =>
        slider
          .setLimits(2, 8, 2)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.tabSize)
          .onChange(async (value) => {
            this.plugin.settings.tabSize = value;
            await this.plugin.settingsChanged(false);
          }),
      );
  }
}
