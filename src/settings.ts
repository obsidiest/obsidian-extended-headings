import {
  App,
  Notice,
  PluginSettingTab,
  type SettingDefinitionItem,
} from "obsidian";
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

type SettingsKey = keyof ExtendedHeadingsSettings;

const SETTINGS_KEYS = new Set<string>(Object.keys(DEFAULT_SETTINGS));

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

export class ExtendedHeadingsSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ExtendedHeadingsPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem<SettingsKey>[] {
    const lowerLimitOptions: Record<string, string> = {};
    for (let level = 0; level <= this.plugin.settings.maximumLevel; level += 1) {
      lowerLimitOptions[String(level)] = level === 0 ? "0 (paragraph)" : String(level);
    }

    return [
      {
        name: "Maximum heading level",
        desc: "Recognize additional ATX headings from H7 through this level.",
        aliases: ["H7", "H12", "extended heading limit"],
        control: {
          type: "slider",
          key: "maximumLevel",
          defaultValue: DEFAULT_SETTINGS.maximumLevel,
          min: 7,
          max: 12,
          step: 1,
        },
      },
      {
        name: "Hide hashes on inactive Live Preview lines",
        desc: "Conceal H7+ hash markers when the heading line is not active. Hashes are hidden by default.",
        aliases: ["hash markers", "Live Preview"],
        control: {
          type: "toggle",
          key: "hideMarkersInLivePreview",
          defaultValue: DEFAULT_SETTINGS.hideMarkersInLivePreview,
        },
      },
      {
        name: "Reading View folding",
        desc: "Show a folding control beside extended headings in Reading View.",
        aliases: ["fold", "collapse"],
        control: {
          type: "toggle",
          key: "readingModeFolding",
          defaultValue: DEFAULT_SETTINGS.readingModeFolding,
        },
      },
      {
        name: "Core Outline and heading-link bridge",
        desc: "Experimental: adds H7+ entries to Obsidian's in-memory heading cache so the core Outline, [[Note#Heading]] links, and navigation can recognize them. Obsidian officially defines cached heading levels as 1–6, so this bridge may require updates after an Obsidian release.",
        aliases: ["core Outline", "heading links", "navigation", "metadata cache"],
        control: {
          type: "toggle",
          key: "coreIntegration",
          defaultValue: DEFAULT_SETTINGS.coreIntegration,
        },
      },
      {
        type: "group",
        heading: "Heading shifting",
        items: [
          {
            name: "Lower limit of heading",
            desc: "The shallowest level that the Decrease headings command may reach. Choose 0 to allow H1 to become a paragraph.",
            aliases: ["minimum heading level", "paragraph"],
            control: {
              type: "dropdown",
              key: "lowerHeadingLimit",
              defaultValue: String(DEFAULT_SETTINGS.lowerHeadingLimit),
              options: lowerLimitOptions,
            },
          },
          {
            name: "Enable override Tab behavior",
            desc: "When the selection contains a heading, Tab runs Increase headings and Shift+Tab runs Decrease headings. This can conflict with other editor behaviors.",
            aliases: ["Tab", "Shift+Tab"],
            control: {
              type: "toggle",
              key: "overrideTabBehavior",
              defaultValue: DEFAULT_SETTINGS.overrideTabBehavior,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Heading markers",
        items: [
          {
            name: "Show heading level markers",
            desc: "Show Lapel-compatible H1–H12 markers in the editor gutter.",
            aliases: ["Lapel", "gutter"],
            control: {
              type: "toggle",
              key: "showHeadingMarkers",
              defaultValue: DEFAULT_SETTINGS.showHeadingMarkers,
            },
          },
          {
            name: "Show before line numbers",
            desc: "Show heading markers before rather than after the line-number gutter.",
            control: {
              type: "toggle",
              key: "showMarkersBeforeLineNumbers",
              defaultValue: DEFAULT_SETTINGS.showMarkersBeforeLineNumbers,
            },
          },
          {
            name: "Show in Source mode",
            desc: "Show heading level markers in Source mode as well as Live Preview.",
            aliases: ["Live Preview"],
            control: {
              type: "toggle",
              key: "showMarkersInSourceMode",
              defaultValue: DEFAULT_SETTINGS.showMarkersInSourceMode,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Style removal: beginning",
        items: [
          {
            name: "Unordered list",
            desc: "Remove -, +, or * list markers when setting a heading.",
            control: {
              type: "toggle",
              key: "removeUnorderedListMarker",
              defaultValue: DEFAULT_SETTINGS.removeUnorderedListMarker,
            },
          },
          {
            name: "Ordered list",
            desc: "Remove numbered list markers such as 1. or 1) when setting a heading.",
            control: {
              type: "toggle",
              key: "removeOrderedListMarker",
              defaultValue: DEFAULT_SETTINGS.removeOrderedListMarker,
            },
          },
          {
            name: "User-defined beginning patterns",
            desc: "Regular expressions to remove from the beginning of a non-heading line, one per line.",
            control: {
              type: "textarea",
              key: "customBeginningPatterns",
              defaultValue: DEFAULT_SETTINGS.customBeginningPatterns,
              placeholder: "^Example\\s+",
              rows: 3,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Style removal: surrounding",
        items: [
          {
            name: "Bold",
            desc: "Remove matching ** or __ markers that surround the entire line.",
            control: {
              type: "toggle",
              key: "removeBold",
              defaultValue: DEFAULT_SETTINGS.removeBold,
            },
          },
          {
            name: "Italic",
            desc: "Remove matching * or _ markers that surround the entire line.",
            control: {
              type: "toggle",
              key: "removeItalic",
              defaultValue: DEFAULT_SETTINGS.removeItalic,
            },
          },
          {
            name: "User-defined surrounding patterns",
            desc: "Regular expressions to remove when the same pattern surrounds the entire line, one per line.",
            control: {
              type: "textarea",
              key: "customSurroundingPatterns",
              defaultValue: DEFAULT_SETTINGS.customSurroundingPatterns,
              placeholder: "🤔",
              rows: 3,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Child lists",
        items: [
          {
            name: "Children behavior",
            desc: "Choose how the contiguous list below a line is re-indented when that line becomes a heading.",
            control: {
              type: "dropdown",
              key: "childListBehavior",
              defaultValue: DEFAULT_SETTINGS.childListBehavior,
              options: {
                "outdent to zero": "Outdent to 0",
                "sync with headings": "Sync with headings",
                noting: "Nothing",
              },
            },
          },
          {
            name: "Tab size",
            desc: "Number of spaces represented by one indentation level for child-list operations.",
            control: {
              type: "slider",
              key: "tabSize",
              defaultValue: DEFAULT_SETTINGS.tabSize,
              min: 2,
              max: 8,
              step: 2,
            },
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    if (key === "lowerHeadingLimit") {
      return String(this.plugin.settings.lowerHeadingLimit);
    }
    if (!SETTINGS_KEYS.has(key)) return undefined;
    return this.plugin.settings[key as SettingsKey];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    let reindex = false;

    switch (key) {
      case "maximumLevel": {
        if (typeof value !== "number") return;
        this.plugin.settings.maximumLevel = clampInteger(value, 7, 12);
        this.plugin.settings.lowerHeadingLimit = Math.min(
          this.plugin.settings.lowerHeadingLimit,
          this.plugin.settings.maximumLevel,
        );
        reindex = true;
        break;
      }
      case "lowerHeadingLimit": {
        if (typeof value !== "string") return;
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return;
        this.plugin.settings.lowerHeadingLimit = clampInteger(
          parsed,
          0,
          this.plugin.settings.maximumLevel,
        );
        break;
      }
      case "tabSize":
        if (typeof value !== "number") return;
        this.plugin.settings.tabSize = clampInteger(value, 2, 8);
        break;
      case "customBeginningPatterns":
      case "customSurroundingPatterns":
        if (typeof value !== "string") return;
        this.plugin.settings[key] = value;
        break;
      case "childListBehavior":
        if (
          value !== "outdent to zero" &&
          value !== "sync with headings" &&
          value !== "noting"
        ) return;
        this.plugin.settings.childListBehavior = value;
        break;
      case "hideMarkersInLivePreview":
      case "coreIntegration":
      case "readingModeFolding":
      case "overrideTabBehavior":
      case "showHeadingMarkers":
      case "showMarkersBeforeLineNumbers":
      case "showMarkersInSourceMode":
      case "removeUnorderedListMarker":
      case "removeOrderedListMarker":
      case "removeBold":
      case "removeItalic":
        if (typeof value !== "boolean") return;
        this.plugin.settings[key] = value;
        reindex = key === "coreIntegration";
        break;
      default:
        return;
    }

    await this.plugin.settingsChanged(reindex);

    if (key === "maximumLevel") this.update();
    if (key === "coreIntegration") {
      new Notice(
        value ? "Extended heading bridge enabled" : "Extended heading bridge disabled",
      );
    }
  }
}
