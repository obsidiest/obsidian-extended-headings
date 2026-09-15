import assert from "node:assert/strict";
import test from "node:test";
import { sourceLoader } from "./helpers/load-source.mjs";
const load = sourceLoader({ obsidian: {} });
const settingsApi = load("breadcrumb-settings");
const { DEFAULT_BREADCRUMB_SETTINGS: defaults, breadcrumbActivation, breadcrumbEnabled, breadcrumbSettingDefinitions, breadcrumbTimeout } = settingsApi;
const { breadcrumbHeadings, breadcrumbEntries, breadcrumbThreadPlan, breadcrumbAncestors } = load("breadcrumb-tree");
const { scanHeadings } = load("headings");

test("breadcrumb defaults, activation precedence, and every setting dependency", () => {
  const settings = { ...defaults };
  assert.equal(settings.breadcrumbThreadMixedActive, false);
  assert.equal(settings.breadcrumbNavigateBeforeTimeout, true);
  assert.equal(settings.breadcrumbNavigateAfterTimeout, false);
  for (const pane of ["editor", "outline"]) {
    for (const mode of ["livePreview", "source", "reading"]) assert.equal(breadcrumbEnabled(settings, pane, mode), true);
    assert.equal(breadcrumbActivation(settings, pane), "marker");
    assert.equal(settings[`${pane}BreadcrumbThreading`], false);
    assert.equal(settings[`${pane}BreadcrumbThreadMixedActive`], true);
  }
  settings.breadcrumbFieldActivation = true;
  assert.equal(breadcrumbActivation(settings, "editor"), "marker");
  settings.editorBreadcrumbFieldActivation = true;
  assert.equal(breadcrumbActivation(settings, "editor"), "field");
  assert.equal(breadcrumbActivation(settings, "outline"), "marker");
  const items = breadcrumbSettingDefinitions(() => settings)[0].items.filter((item) => item.control);
  assert.equal(new Set(items.map((item) => item.control.key)).size, Object.keys(defaults).length);
  settings.headingHoverBreadcrumb = false;
  for (const item of items) {
    if (item.control.key === "headingHoverBreadcrumb") continue;
    assert.equal(item.control.disabled(), true, item.control.key);
  }
  settings.headingHoverBreadcrumb = true;
  const item = (key) => items.find((item) => item.control.key === key).control;
  assert.equal(item("editorBreadcrumbThreadRootAll").disabled(), true);
  Object.assign(settings, { breadcrumbThreading: true, editorBreadcrumbThreading: true, breadcrumbThreadRootAll: true });
  assert.equal(item("editorBreadcrumbThreadRootAll").disabled(), false);
  settings.breadcrumbThreadRoot = false;
  assert.equal(item("editorBreadcrumbThreadRootAll").disabled(), true);
});

test("navigation controls have the requested labels, independent defaults, and persist through the settings tab", async () => {
  const loader = sourceLoader({ obsidian: { PluginSettingTab: class { update() {} } } });
  const { ExtendedHeadingsSettingTab, DEFAULT_SETTINGS } = loader("settings");
  let saves = 0;
  const plugin = { settings: { ...DEFAULT_SETTINGS }, breadcrumbSettingsChanged: async () => saves++ };
  const tab = new ExtendedHeadingsSettingTab({}, plugin);
  const items = tab.getSettingDefinitions().at(-1).items;
  assert.ok(items.some((item) => item.name === "Heading Hover Breadcrumb Navigation"));
  for (const [key, label, initial] of [
    ["breadcrumbNavigateBeforeTimeout", "Before", true],
    ["breadcrumbNavigateAfterTimeout", "After", false],
  ]) {
    const control = items.find((item) => item.control?.key === key);
    assert.equal(control.name, `Hover Over a Given Breadcrumb Heading to Change the Screen Focus to the Corresponding Heading in the Main UI ${label} the Breadcrumb Popover Timeout`);
    assert.equal(control.control.defaultValue, initial);
    assert.equal(control.control.disabled(), false);
    await tab.setControlValue(key, !initial);
    assert.equal(tab.getControlValue(key), !initial);
  }
  assert.equal(saves, 2);
  assert.equal(plugin.settings.headingHoverBreadcrumb, true);
});

test("breadcrumb is the last main-settings section and its timeout values reach runtime", async () => {
  const loader = sourceLoader({ obsidian: { PluginSettingTab: class {} } });
  const { ExtendedHeadingsSettingTab, DEFAULT_SETTINGS } = loader("settings");
  const plugin = { settings: { ...DEFAULT_SETTINGS }, breadcrumbSettingsChanged: async () => {} };
  const tab = new ExtendedHeadingsSettingTab({}, plugin);
  const groups = tab.getSettingDefinitions().filter((item) => item.type === "group");
  assert.equal(groups.at(-1).heading, "Heading Hover Breadcrumb");
  assert.ok(groups.at(-1).items.some((item) => item.name === "Heading Hover Breadcrumb Popover Timeout"));
  await tab.setControlValue("globalBreadcrumbTimeoutSeconds", 1.275);
  assert.equal(tab.getControlValue("globalBreadcrumbTimeoutSeconds"), 1.275);
  assert.equal(breadcrumbTimeout(plugin.settings, "livePreview"), 1275);
});

test("timeouts accept fractional seconds, honor per-mode overrides, and reject invalid persistence", () => {
  const settings = { ...defaults, globalBreadcrumbTimeoutSeconds: 1.275 };
  assert.equal(breadcrumbTimeout(settings, "source"), 1275);
  settings.sourceBreadcrumbTimeoutEnabled = true; settings.sourceBreadcrumbTimeoutSeconds = 0;
  assert.equal(breadcrumbTimeout(settings, "source"), 0);
  settings.sourceBreadcrumbTimeoutSeconds = 0.35;
  assert.equal(breadcrumbTimeout(settings, "source"), 350);
  for (const value of [NaN, Infinity, -1, 3e9, "1.2"]) {
    settings.sourceBreadcrumbTimeoutSeconds = value;
    assert.equal(breadcrumbTimeout(settings, "source"), 10);
  }
});

test("ancestor paths preserve skipped levels, roots, and orphan trees through H12", () => {
  const headings = breadcrumbHeadings(scanHeadings("### Orphan\n############ Deep orphan\n# One\n## Child\n############ Deep child\n# Two\n#### Another", 1, 12));
  assert.deepEqual(Array.from(breadcrumbAncestors(headings, 1)), [0, 1]);
  assert.deepEqual(Array.from(breadcrumbEntries(headings, 4, null)), [2, 3, 4]);
  const options = Object.fromEntries(Object.keys(settingsApi.BREADCRUMB_THREAD_OPTIONS).map((key) => [key, false]));
  Object.assign(options, { Active: true });
  assert.deepEqual(Array.from(breadcrumbThreadPlan(headings, 4, options).edges), [3, 4]);
  Object.assign(options, { Root: true, RootActive: true });
  assert.deepEqual(Array.from(breadcrumbEntries(headings, 6, options)), [2, 5, 6]);
  Object.assign(options, { Mixed: true, MixedActive: true });
  assert.deepEqual(Array.from(breadcrumbEntries(headings, 1, options)), [0, 1, 2, 5]);
  options.Mixed = false;
  Object.assign(options, { Root: true, RootAll: true });
  assert.deepEqual(Array.from(breadcrumbEntries(headings, 4, options)), [2, 3, 4, 5, 6]);
  Object.assign(options, { Mixed: true, MixedAll: true });
  assert.deepEqual(Array.from(breadcrumbEntries(headings, 1, options)), [0, 1, 2, 3, 4, 5, 6]);
  options.Mixed = false; options.Orphan = true; options.OrphanAll = true;
  assert.deepEqual(Array.from(breadcrumbEntries(headings, 1, options)), [0, 1]);
});
