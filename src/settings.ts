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
  renderInlineSvgsInDefaultOutline: boolean;
  readingModeFolding: boolean;
  copyFullyNestedHeadingPaths: boolean;
  lowerHeadingLimit: number;
  overrideTabBehavior: boolean;
  showEditorGutterHeadingLevelMarkers: boolean;
  showOutlinePaneHeadingLevelMarkers: boolean;
  enableOutlinePaneHeadingStaticTreeIndentationGuides: boolean;
  enableOutlinePaneHeadingThreading: boolean;
  activeSelectedOutlinePaneHeadingThreading: boolean;
  activeOutlinePaneHeadingThreading: boolean;
  allBranchesOfActiveOutlinePaneHeadingTreeThreading: boolean;
  activeRootLevelOutlinePaneHeadingTreeThreading: boolean;
  activeRootLevelOutlinePaneHeadingThreading: boolean;
  allBranchesOfActiveRootLevelOutlinePaneHeadingTreeThreading: boolean;
  activeOrphanOutlinePaneHeadingTreeThreading: boolean;
  activeOrphanOutlinePaneHeadingThreading: boolean;
  allBranchesOfActiveOrphanOutlinePaneHeadingTreeThreading: boolean;
  activeRootLevelOrphanOutlinePaneHeadingTreeThreading: boolean;
  activeRootLevelOrphanOutlinePaneHeadingThreading: boolean;
  allBranchesOfActiveRootLevelOrphanOutlinePaneHeadingTreeThreading: boolean;
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
  renderInlineSvgsInDefaultOutline: true,
  readingModeFolding: true,
  copyFullyNestedHeadingPaths: true,
  lowerHeadingLimit: 1,
  overrideTabBehavior: false,
  showEditorGutterHeadingLevelMarkers: true,
  showOutlinePaneHeadingLevelMarkers: true,
  enableOutlinePaneHeadingStaticTreeIndentationGuides: true,
  enableOutlinePaneHeadingThreading: true,
  activeSelectedOutlinePaneHeadingThreading: false,
  activeOutlinePaneHeadingThreading: true,
  allBranchesOfActiveOutlinePaneHeadingTreeThreading: false,
  activeRootLevelOutlinePaneHeadingTreeThreading: true,
  activeRootLevelOutlinePaneHeadingThreading: true,
  allBranchesOfActiveRootLevelOutlinePaneHeadingTreeThreading: false,
  activeOrphanOutlinePaneHeadingTreeThreading: true,
  activeOrphanOutlinePaneHeadingThreading: true,
  allBranchesOfActiveOrphanOutlinePaneHeadingTreeThreading: false,
  activeRootLevelOrphanOutlinePaneHeadingTreeThreading: true,
  activeRootLevelOrphanOutlinePaneHeadingThreading: true,
  allBranchesOfActiveRootLevelOrphanOutlinePaneHeadingTreeThreading: false,
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

export type PersistedExtendedHeadingsSettings = Partial<ExtendedHeadingsSettings> & {
  showHeadingMarkers?: boolean;
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
        name: "Render inline SVGs in default Outline",
        desc: "Render sanitized inline SVG elements from H1–H12 headings in Obsidian's default Outline pane. H7–H12 entries require the Core Outline and heading-link bridge.",
        aliases: ["SVG", "icon", "core Outline"],
        control: {
          type: "toggle",
          key: "renderInlineSvgsInDefaultOutline",
          defaultValue: DEFAULT_SETTINGS.renderInlineSvgsInDefaultOutline,
        },
      },
      {
        name: "Copy fully nested heading paths",
        desc: "Include every ancestor heading when copying a heading link or embed so repeated heading titles resolve precisely. Disable this to copy only the shorter target-heading link.",
        aliases: ["copy link", "copy embed", "ancestor headings", "duplicate headings"],
        control: {
          type: "toggle",
          key: "copyFullyNestedHeadingPaths",
          defaultValue: DEFAULT_SETTINGS.copyFullyNestedHeadingPaths,
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
        heading: "Heading level markers",
        items: [
          {
            name: "Show Editor Gutter heading level markers",
            desc: "Show H1–H12 heading level markers in the editor gutter.",
            aliases: ["Lapel", "gutter"],
            control: {
              type: "toggle",
              key: "showEditorGutterHeadingLevelMarkers",
              defaultValue:
                DEFAULT_SETTINGS.showEditorGutterHeadingLevelMarkers,
            },
          },
          {
            name: "Show Outline pane heading level markers",
            desc: "Show H1–H12 heading level markers to the left of headings in Obsidian's default Outline pane.",
            aliases: ["Outline markers", "heading levels", "core Outline"],
            control: {
              type: "toggle",
              key: "showOutlinePaneHeadingLevelMarkers",
              defaultValue: DEFAULT_SETTINGS.showOutlinePaneHeadingLevelMarkers,
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
        heading: "Outline Pane Heading Static Tree Indentation Guides",
        items: [
          {
            name: "Enable Outline Pane Heading Static Tree Indentation Guides",
            desc: "Show always-visible vertical spines and horizontal connectors for every H1–H12 hierarchy in Obsidian's default Outline pane.",
            aliases: [
              "Outline guides",
              "static tree guides",
              "heading hierarchy connectors",
            ],
            control: {
              type: "toggle",
              key: "enableOutlinePaneHeadingStaticTreeIndentationGuides",
              defaultValue:
                DEFAULT_SETTINGS.enableOutlinePaneHeadingStaticTreeIndentationGuides,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Outline Pane Heading Threading",
        items: [
          {
            name: "Enable Outline Pane Heading Threading",
            desc: "Enable Logseq-style active-path highlighting for H1–H12 heading-tree branches in Obsidian's default Outline pane.",
            aliases: ["Outline hover path", "heading tree highlight"],
            control: {
              type: "toggle",
              key: "enableOutlinePaneHeadingThreading",
              defaultValue: DEFAULT_SETTINGS.enableOutlinePaneHeadingThreading,
            },
          },
          {
            name: "Active Selected Heading Threading",
            desc: "Use the selected Outline heading instead of the heading under the pointer to activate every enabled regular, root-level, orphan, and combined threading mode.",
            aliases: [
              "selected heading path",
              "selection threading",
              "click heading threading",
            ],
            control: {
              type: "toggle",
              key: "activeSelectedOutlinePaneHeadingThreading",
              defaultValue:
                DEFAULT_SETTINGS.activeSelectedOutlinePaneHeadingThreading,
              disabled: () => !this.plugin.settings.enableOutlinePaneHeadingThreading,
            },
          },
          {
            name: "Active Heading Threading",
            desc: "Highlight the complete nested path from an H1 tree root to the currently active heading.",
            aliases: ["active heading path", "hovered heading ancestors"],
            control: {
              type: "toggle",
              key: "activeOutlinePaneHeadingThreading",
              defaultValue: DEFAULT_SETTINGS.activeOutlinePaneHeadingThreading,
              disabled: () => !this.plugin.settings.enableOutlinePaneHeadingThreading,
            },
          },
          {
            name: "All Branches of an Active Heading Tree Threading",
            desc: "Highlight every branch in the H1-rooted heading tree containing the currently active heading.",
            aliases: ["whole heading tree", "all active Outline branches"],
            control: {
              type: "toggle",
              key: "allBranchesOfActiveOutlinePaneHeadingTreeThreading",
              defaultValue:
                DEFAULT_SETTINGS.allBranchesOfActiveOutlinePaneHeadingTreeThreading,
              disabled: () => !this.plugin.settings.enableOutlinePaneHeadingThreading,
            },
          },
          {
            name: "Active Root-Level Heading Tree Threading",
            desc: "Allow threading across the note's sibling H1 roots and their H2–H12 descendant branches.",
            aliases: ["root headings", "H1 sibling tree", "virtual root"],
            control: {
              type: "toggle",
              key: "activeRootLevelOutlinePaneHeadingTreeThreading",
              defaultValue:
                DEFAULT_SETTINGS.activeRootLevelOutlinePaneHeadingTreeThreading,
              disabled: () => !this.plugin.settings.enableOutlinePaneHeadingThreading,
            },
          },
          {
            name: "Active Root-Level Heading Threading",
            desc: "Highlight the root-level H1 path and nested ancestor path to the currently active heading.",
            aliases: ["active root heading path", "hovered H1 branch"],
            control: {
              type: "toggle",
              key: "activeRootLevelOutlinePaneHeadingThreading",
              defaultValue:
                DEFAULT_SETTINGS.activeRootLevelOutlinePaneHeadingThreading,
              disabled: () =>
                !this.plugin.settings.enableOutlinePaneHeadingThreading ||
                !this.plugin.settings.activeRootLevelOutlinePaneHeadingTreeThreading,
            },
          },
          {
            name: "All Branches of an Active Root-Level Tree Threading",
            desc: "Highlight all sibling H1 roots and every descendant branch when a heading in the root-level tree is active.",
            aliases: ["all root heading branches", "whole note heading tree"],
            control: {
              type: "toggle",
              key: "allBranchesOfActiveRootLevelOutlinePaneHeadingTreeThreading",
              defaultValue:
                DEFAULT_SETTINGS.allBranchesOfActiveRootLevelOutlinePaneHeadingTreeThreading,
              disabled: () =>
                !this.plugin.settings.enableOutlinePaneHeadingThreading ||
                !this.plugin.settings.activeRootLevelOutlinePaneHeadingTreeThreading,
            },
          },
          {
            name: "Active Orphan Heading Tree Threading",
            desc: "Allow threading for top-level Outline branches that begin at H2–H12 without an H1 ancestor.",
            aliases: ["orphan headings", "heading tree without H1"],
            control: {
              type: "toggle",
              key: "activeOrphanOutlinePaneHeadingTreeThreading",
              defaultValue:
                DEFAULT_SETTINGS.activeOrphanOutlinePaneHeadingTreeThreading,
              disabled: () => !this.plugin.settings.enableOutlinePaneHeadingThreading,
            },
          },
          {
            name: "Active Orphan Heading Threading",
            desc: "Highlight the nested path to the active heading in an orphan H2–H12 heading tree.",
            aliases: ["active orphan heading path"],
            control: {
              type: "toggle",
              key: "activeOrphanOutlinePaneHeadingThreading",
              defaultValue:
                DEFAULT_SETTINGS.activeOrphanOutlinePaneHeadingThreading,
              disabled: () =>
                !this.plugin.settings.enableOutlinePaneHeadingThreading ||
                !this.plugin.settings.activeOrphanOutlinePaneHeadingTreeThreading,
            },
          },
          {
            name: "All Branches of an Active Orphan Heading Tree Threading",
            desc: "Highlight every branch in the orphan H2–H12 heading tree containing the currently active heading.",
            aliases: ["all orphan heading branches"],
            control: {
              type: "toggle",
              key: "allBranchesOfActiveOrphanOutlinePaneHeadingTreeThreading",
              defaultValue:
                DEFAULT_SETTINGS.allBranchesOfActiveOrphanOutlinePaneHeadingTreeThreading,
              disabled: () =>
                !this.plugin.settings.enableOutlinePaneHeadingThreading ||
                !this.plugin.settings.activeOrphanOutlinePaneHeadingTreeThreading,
            },
          },
          {
            name: "Active Root-Level ⟺ Orphan Heading Tree Threading",
            desc: "Allow threading across the combined top-level sequence of orphan H2–H12 roots, sibling H1 roots, and all of their descendant branches.",
            aliases: [
              "root orphan heading bridge",
              "bidirectional heading tree",
              "combined top level headings",
            ],
            control: {
              type: "toggle",
              key: "activeRootLevelOrphanOutlinePaneHeadingTreeThreading",
              defaultValue:
                DEFAULT_SETTINGS.activeRootLevelOrphanOutlinePaneHeadingTreeThreading,
              disabled: () => !this.plugin.settings.enableOutlinePaneHeadingThreading,
            },
          },
          {
            name: "Active Root-Level ⟺ Orphan Heading Threading",
            desc: "Highlight the combined top-level root/orphan spine and the nested ancestor path to the currently active heading.",
            aliases: ["active root orphan heading path", "bidirectional active path"],
            control: {
              type: "toggle",
              key: "activeRootLevelOrphanOutlinePaneHeadingThreading",
              defaultValue:
                DEFAULT_SETTINGS.activeRootLevelOrphanOutlinePaneHeadingThreading,
              disabled: () =>
                !this.plugin.settings.enableOutlinePaneHeadingThreading ||
                !this.plugin.settings
                  .activeRootLevelOrphanOutlinePaneHeadingTreeThreading,
            },
          },
          {
            name: "All Branches of an Active Root-Level ⟺ Orphan Heading Tree Threading",
            desc: "Highlight every orphan root, H1 root, and descendant branch in the combined top-level heading tree.",
            aliases: [
              "all root orphan heading branches",
              "whole bidirectional heading tree",
            ],
            control: {
              type: "toggle",
              key: "allBranchesOfActiveRootLevelOrphanOutlinePaneHeadingTreeThreading",
              defaultValue:
                DEFAULT_SETTINGS
                  .allBranchesOfActiveRootLevelOrphanOutlinePaneHeadingTreeThreading,
              disabled: () =>
                !this.plugin.settings.enableOutlinePaneHeadingThreading ||
                !this.plugin.settings
                  .activeRootLevelOrphanOutlinePaneHeadingTreeThreading,
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
      case "renderInlineSvgsInDefaultOutline":
      case "readingModeFolding":
      case "copyFullyNestedHeadingPaths":
      case "overrideTabBehavior":
      case "showEditorGutterHeadingLevelMarkers":
      case "showOutlinePaneHeadingLevelMarkers":
      case "enableOutlinePaneHeadingStaticTreeIndentationGuides":
      case "enableOutlinePaneHeadingThreading":
      case "activeSelectedOutlinePaneHeadingThreading":
      case "activeOutlinePaneHeadingThreading":
      case "allBranchesOfActiveOutlinePaneHeadingTreeThreading":
      case "activeRootLevelOutlinePaneHeadingTreeThreading":
      case "activeRootLevelOutlinePaneHeadingThreading":
      case "allBranchesOfActiveRootLevelOutlinePaneHeadingTreeThreading":
      case "activeOrphanOutlinePaneHeadingTreeThreading":
      case "activeOrphanOutlinePaneHeadingThreading":
      case "allBranchesOfActiveOrphanOutlinePaneHeadingTreeThreading":
      case "activeRootLevelOrphanOutlinePaneHeadingTreeThreading":
      case "activeRootLevelOrphanOutlinePaneHeadingThreading":
      case "allBranchesOfActiveRootLevelOrphanOutlinePaneHeadingTreeThreading":
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
