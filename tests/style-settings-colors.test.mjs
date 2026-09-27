import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sourceLoader } from "./helpers/load-source.mjs";
import { themedColorSchema } from "./helpers/style-schema.mjs";
const { THEMED_COLOR_DEFAULTS, pickerHex, styleSettingsColorStore } = sourceLoader()("style-settings-colors");

test("every themed color uses exactly the defaults declared in Style Settings", () => {
  const colors = themedColorSchema(readFileSync(new URL("../styles.css", import.meta.url), "utf8"));
  assert.equal(colors.length, 55);
  assert.deepEqual(JSON.parse(JSON.stringify([...THEMED_COLOR_DEFAULTS])), colors.map(color =>
    [color.id, [color["default-light"], color["default-dark"]]]));
});

test("color input accepts RGB/RGBA hex without accepting inherited or malformed values as colors", () => {
  for (const [input, expected] of [["#abcd", "#aabbccdd"], ["#aBc", "#aabbcc"], [" #13163C ", "#13163c"], ["#12345678", "#12345678"]]) {
    assert.equal(pickerHex(input), expected);
  }
  for (const input of ["#", "", "#NaNNaNNaN", "#abcde", "red", null, 123]) assert.equal(pickerHex(input), null);
});

test("color integration requires the manager's awaited save and settings map", () => {
  const manager = { settings: {}, getSetting() {}, async setSettings() {} };
  const app = { plugins: { getPlugin: () => ({ settingsManager: manager }) } };
  assert.equal(styleSettingsColorStore(app), manager);
  delete manager.settings;
  assert.equal(styleSettingsColorStore(app), null);
  assert.equal(styleSettingsColorStore({}), null);
});
