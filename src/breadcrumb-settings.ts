import type { SettingDefinitionItem, SettingGroupItem } from "obsidian";

export const BREADCRUMB_THREAD_OPTIONS = {
  Selected: [false, "Active Selected Heading Threading"],
  Active: [true, "Active Heading Threading"],
  All: [false, "All Branches of an Active Heading Tree Threading"],
  Root: [true, "Active Root-Level Heading Tree Threading"],
  RootActive: [true, "Active Root-Level Heading Threading"],
  RootAll: [false, "All Branches of an Active Root-Level Tree Threading"],
  Orphan: [true, "Active Orphan Heading Tree Threading"],
  OrphanActive: [true, "Active Orphan Heading Threading"],
  OrphanAll: [false, "All Branches of an Active Orphan Heading Tree Threading"],
  Mixed: [true, "Active Root-Level ⟺ Orphan Heading Tree Threading"],
  MixedActive: [true, "Active Root-Level ⟺ Orphan Heading Threading"],
  MixedAll: [false, "All Branches of an Active Root-Level ⟺ Orphan Heading Tree Threading"],
} as const;
export type BreadcrumbThreadOption = keyof typeof BREADCRUMB_THREAD_OPTIONS;
export type BreadcrumbPane = "editor" | "outline";
export type BreadcrumbMode = "livePreview" | "source" | "reading";
export type BreadcrumbScope = "breadcrumb" | "editorBreadcrumb" | "outlineBreadcrumb";
type ScopeFeature = "Markers" | "Guides" | "Threading" | "FieldActivation" | "MarkerActivation";
type ThreadKey = `${BreadcrumbScope}Thread${BreadcrumbThreadOption}`;
type ScopeKey = `${BreadcrumbScope}${ScopeFeature}`;
type ModeKey = `breadcrumb${"LivePreview" | "Source" | "Reading"}`;
type TimeoutToggle = `${BreadcrumbMode | "global"}BreadcrumbTimeoutEnabled`;
export type BreadcrumbNumberKey = `${BreadcrumbMode | "global"}BreadcrumbTimeoutSeconds`;
export type BreadcrumbBooleanKey = ScopeKey | ThreadKey | ModeKey | TimeoutToggle
  | "headingHoverBreadcrumb" | "editorHeadingHoverBreadcrumb" | "outlineHeadingHoverBreadcrumb"
  | "breadcrumbExpandTitles";
export type BreadcrumbSettings = Record<BreadcrumbBooleanKey, boolean> & Record<BreadcrumbNumberKey, number>;

const defaults = {
  headingHoverBreadcrumb: true,
  editorHeadingHoverBreadcrumb: true,
  outlineHeadingHoverBreadcrumb: true,
  breadcrumbExpandTitles: true,
  breadcrumbLivePreview: true,
  breadcrumbSource: true,
  breadcrumbReading: true,
} as BreadcrumbSettings;
for (const scope of ["breadcrumb", "editorBreadcrumb", "outlineBreadcrumb"] as const) {
  defaults[`${scope}Markers`] = true;
  defaults[`${scope}Guides`] = true;
  defaults[`${scope}Threading`] = false;
  defaults[`${scope}FieldActivation`] = false;
  defaults[`${scope}MarkerActivation`] = true;
  for (const option of Object.keys(BREADCRUMB_THREAD_OPTIONS) as BreadcrumbThreadOption[]) {
    defaults[`${scope}Thread${option}`] = BREADCRUMB_THREAD_OPTIONS[option][0];
  }
}
// Opt in globally; the existing per-pane defaults still apply once enabled.
defaults.breadcrumbThreadMixedActive = false;
export const DEFAULT_BREADCRUMB_TIMEOUT = 0.01;
export const MAX_BREADCRUMB_TIMEOUT = 2_147_483.647;
for (const mode of ["global", "livePreview", "source", "reading"] as const) {
  defaults[`${mode}BreadcrumbTimeoutEnabled`] = mode === "global";
  defaults[`${mode}BreadcrumbTimeoutSeconds`] = DEFAULT_BREADCRUMB_TIMEOUT;
}
export const DEFAULT_BREADCRUMB_SETTINGS = defaults;

export function validBreadcrumbTimeout(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_BREADCRUMB_TIMEOUT;
}

export function breadcrumbTimeout(settings: BreadcrumbSettings, mode: BreadcrumbMode): number {
  const scope = settings[`${mode}BreadcrumbTimeoutEnabled`] ? mode : "global";
  const value = settings[`${scope}BreadcrumbTimeoutEnabled`]
    ? settings[`${scope}BreadcrumbTimeoutSeconds`] : DEFAULT_BREADCRUMB_TIMEOUT;
  return (validBreadcrumbTimeout(value) ? value : DEFAULT_BREADCRUMB_TIMEOUT) * 1000;
}

export function breadcrumbEnabled(settings: BreadcrumbSettings, pane: BreadcrumbPane, mode: BreadcrumbMode): boolean {
  const modeKey = { livePreview: "breadcrumbLivePreview", source: "breadcrumbSource", reading: "breadcrumbReading" } as const;
  return settings.headingHoverBreadcrumb && settings[`${pane}HeadingHoverBreadcrumb`] && settings[modeKey[mode]];
}

export function breadcrumbFeature(settings: BreadcrumbSettings, pane: BreadcrumbPane, feature: ScopeFeature): boolean {
  return settings[`breadcrumb${feature}`] && settings[`${pane}Breadcrumb${feature}`];
}

export function breadcrumbActivation(settings: BreadcrumbSettings, pane: BreadcrumbPane): "field" | "marker" | null {
  return breadcrumbFeature(settings, pane, "FieldActivation") ? "field"
    : breadcrumbFeature(settings, pane, "MarkerActivation") ? "marker" : null;
}

export function breadcrumbThreadOptions(settings: BreadcrumbSettings, pane: BreadcrumbPane): Record<BreadcrumbThreadOption, boolean> {
  return Object.fromEntries((Object.keys(BREADCRUMB_THREAD_OPTIONS) as BreadcrumbThreadOption[])
    .map((key) => [key, settings[`breadcrumbThread${key}`] && settings[`${pane}BreadcrumbThread${key}`]])) as Record<BreadcrumbThreadOption, boolean>;
}

export function breadcrumbSettingDefinitions(getSettings: () => BreadcrumbSettings): SettingDefinitionItem<keyof BreadcrumbSettings>[] {
  type Item = SettingGroupItem<keyof BreadcrumbSettings>;
  const off = (...keys: BreadcrumbBooleanKey[]) => () => keys.some((key) => !getSettings()[key]);
  const globalOff: BreadcrumbBooleanKey[] = ["headingHoverBreadcrumb"];
  const toggle = (key: BreadcrumbBooleanKey, name: string, parents = globalOff, desc = ""): Item => ({
    name, desc, control: { type: "toggle", key, defaultValue: defaults[key], disabled: off(...parents) },
  });
  const subheading = (name: string): Item => ({ name, render: (setting) => { setting.setHeading(); } });
  const items: Item[] = [toggle("headingHoverBreadcrumb", "Heading Hover Breadcrumb", [],
    "Show a floating, navigable heading hierarchy at the selected hover location."),
  subheading("Hovering Breadcrumb Activation Scope")];
  for (const [feature, label] of [["FieldActivation", "Field"], ["MarkerActivation", "Marker"]] as const) {
    const name = `Full-Width Heading ${label} Heading Hover Breadcrumb Activation`;
    items.push(toggle(`breadcrumb${feature}`, name, globalOff,
      feature === "FieldActivation" ? "The full heading row takes priority over marker activation in each enabled pane." : "Activate across the H1–H12 level marker, excluding the heading hashes."));
    for (const pane of ["editor", "outline"] as const) {
      items.push(toggle(`${pane}Breadcrumb${feature}`, `${pane === "editor" ? "Editor" : "Outline"} Pane ${name}`,
        [...globalOff, `breadcrumb${feature}`, `${pane}HeadingHoverBreadcrumb`]));
    }
  }
  for (const pane of ["editor", "outline"] as const) {
    const title = `${pane === "editor" ? "Editor" : "Outline"} Pane Heading Hover Breadcrumb`;
    items.push(subheading(title), toggle(`${pane}HeadingHoverBreadcrumb`, title));
  }
  items.push(subheading("Viewing Modes"));
  for (const [key, label] of [["breadcrumbLivePreview", "Live Preview"], ["breadcrumbSource", "Source Mode"], ["breadcrumbReading", "Reading Mode"]] as const) {
    items.push(toggle(key, `Heading Hover Breadcrumb in ${label}`));
  }
  items.push(toggle("breadcrumbExpandTitles", "Expand Long Heading Titles in Heading Hover Breadcrumb", globalOff,
    "Wrap complete titles onto additional lines. Disable to use a single line with an ellipsis."));
  for (const [feature, label] of [["Markers", "Heading Markers"], ["Guides", "Static Tree Indentation Guides"], ["Threading", "Threading"]] as const) {
    const title = `Heading Hover Breadcrumb ${label}`;
    items.push(subheading(title), toggle(`breadcrumb${feature}`, title));
    for (const pane of ["editor", "outline"] as const) {
      items.push(toggle(`${pane}Breadcrumb${feature}`, `${pane === "editor" ? "Editor" : "Outline"} Pane ${title}`,
        [...globalOff, `breadcrumb${feature}`, `${pane}HeadingHoverBreadcrumb`]));
    }
    if (feature !== "Threading") continue;
    for (const scope of ["breadcrumb", "editorBreadcrumb", "outlineBreadcrumb"] as const) {
      const pane = scope === "editorBreadcrumb" ? "editor" : "outline";
      const prefix = scope === "breadcrumb" ? "" : `${pane === "editor" ? "Editor" : "Outline"} Pane `;
      items.push(subheading(`${prefix}Heading Hover Breadcrumb Threading Modes`));
      for (const option of Object.keys(BREADCRUMB_THREAD_OPTIONS) as BreadcrumbThreadOption[]) {
        const parents: BreadcrumbBooleanKey[] = [...globalOff, "breadcrumbThreading"];
        if (scope !== "breadcrumb") parents.push(`${scope}Threading`, `${pane}HeadingHoverBreadcrumb`, `breadcrumbThread${option}`);
        const supermode = option.startsWith("Root") ? "Root" : option.startsWith("Orphan") ? "Orphan" : option.startsWith("Mixed") ? "Mixed" : null;
        if (supermode && option !== supermode) {
          parents.push(`${scope}Thread${supermode}`, `breadcrumbThread${supermode}`);
        }
        items.push(toggle(`${scope}Thread${option}`, `${prefix}${BREADCRUMB_THREAD_OPTIONS[option][1]}`, parents,
          option === "Selected" ? "Thread the selected breadcrumb heading instead of the hovered heading." : "Applies inside this heading hover breadcrumb; independent of main Outline threading."));
      }
    }
  }
  items.push(subheading("Heading Hover Breadcrumb Popover Timeout"));
  for (const [mode, label] of [["global", "Global"], ["livePreview", "Live Preview Mode"], ["source", "Source Mode"], ["reading", "Reading Mode"]] as const) {
    const key: BreadcrumbNumberKey = `${mode}BreadcrumbTimeoutSeconds`;
    items.push(toggle(`${mode}BreadcrumbTimeoutEnabled`, mode === "global"
      ? "Globally Control Heading Hover Breadcrumb Timeout" : `Control ${label} Heading Hover Breadcrumb Timeout Individually`, globalOff,
    "Individual mode controls override the global timeout. With neither enabled, the default is 0.01 seconds."));
    items.push({ name: `${label} Heading Hover Breadcrumb Popover Timeout`,
      desc: "Seconds after leaving the heading, the popover, and the gap between them. Decimals are supported; 0 closes immediately.",
      control: { type: "number", key, defaultValue: defaults[key], min: 0, max: MAX_BREADCRUMB_TIMEOUT, step: "any",
        disabled: off(...globalOff, `${mode}BreadcrumbTimeoutEnabled`) } });
  }
  return [{ type: "group", heading: "Heading Hover Breadcrumb", items }];
}
