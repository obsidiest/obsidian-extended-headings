import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const moduleUrl = new URL("../src/style-settings-precision.ts", import.meta.url);
const source = existsSync(moduleUrl) ? readFileSync(moduleUrl, "utf8") : "";
const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

class TestEvent {
  constructor(type) {
    this.type = type;
  }
}

function loadModule() {
  if (!source) return {};
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports });
  return module.exports;
}

function inputElement(initialValue = "") {
  const listeners = new Map();
  let value = initialValue;
  const input = {
    type: "",
    inputMode: "",
    className: "",
    min: "",
    max: "",
    step: "",
    placeholder: "",
    selectionStart: 0,
    selectionEnd: 0,
    ownerDocument: null,
    setAttribute() {},
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    addEventListener(type, listener) {
      const registered = listeners.get(type) ?? [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
  };
  Object.defineProperty(input, "value", {
    get: () => value,
    set: (nextValue) => {
      const nextNumber = Number(nextValue);
      if (input.type === "range" && nextValue !== "" && Number.isFinite(nextNumber)) {
        if (input.min !== "" && nextNumber < Number(input.min)) {
          value = input.min;
          return;
        }
        if (input.max !== "" && nextNumber > Number(input.max)) {
          value = input.max;
          return;
        }
        if (input.step !== "" && input.step !== "any") {
          const minimum = input.min === "" ? 0 : Number(input.min);
          const step = Number(input.step);
          if (Number.isFinite(step) && step > 0) {
            value = String(minimum + Math.round((nextNumber - minimum) / step) * step);
            return;
          }
        }
      }
      value = nextValue;
      input.selectionStart = 0;
      input.selectionEnd = 0;
    },
  });
  Object.defineProperty(input, "valueAsNumber", {
    get: () => (value.trim() === "" ? Number.NaN : Number(value)),
  });
  return input;
}

function selectElement(initialValue, values) {
  const listeners = new Map();
  const select = {
    value: initialValue,
    options: values.map((value) => ({ value, dataset: {} })),
    ownerDocument: null,
    createEl(tag, options) {
      assert.equal(tag, "option");
      const option = {
        value: options?.attr?.value ?? "",
        textContent: options?.text ?? "",
        dataset: {},
      };
      this.options.push(option);
      return option;
    },
    addEventListener(type, listener) {
      const registered = listeners.get(type) ?? [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
  };
  return select;
}

function sliderRow({ id, slider, numberInput }) {
  const ownerDocument = {
    defaultView: {
      Event: TestEvent,
      setTimeout(callback) {
        callback();
        return 1;
      },
    },
  };
  slider.ownerDocument = ownerDocument;
  const control = {
    inserted: null,
    createEl() {
      return numberInput;
    },
    querySelector(selector) {
      if (selector === ".extended-headings-style-settings-number-input") {
        return this.inserted;
      }
      return null;
    },
    insertBefore(element) {
      this.inserted = element;
    },
  };
  return {
    matches(selector) {
      return selector === ".setting-item" || selector.includes("[data-id^=\"extended-\"]");
    },
    getAttribute(name) {
      return name === "data-id" ? id : null;
    },
    closest() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector(selector) {
      if (selector === ".setting-item-control") return control;
      if (selector === 'input[type="range"]') return slider;
      if (selector === ".setting-item-name") return { textContent: "Precise setting" };
      return null;
    },
  };
}

function selectRow({ id, select, numberInput, computedValue = "inherit" }) {
  const ownerDocument = {
    body: {},
    defaultView: {
      Event: TestEvent,
      getComputedStyle() {
        return {
          getPropertyValue(property) {
            return property === `--${id}` ? computedValue : "";
          },
        };
      },
      setTimeout(callback) {
        callback();
        return 1;
      },
    },
  };
  select.ownerDocument = ownerDocument;
  const control = {
    inserted: null,
    createEl() {
      return numberInput;
    },
    querySelector(selector) {
      if (selector === ".extended-headings-style-settings-number-input") {
        return this.inserted;
      }
      return null;
    },
    insertBefore(element) {
      this.inserted = element;
    },
  };
  return {
    matches(selector) {
      return selector === ".setting-item" || selector.includes("[data-id^=\"extended-\"]");
    },
    getAttribute(name) {
      return name === "data-id" ? id : null;
    },
    closest() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector(selector) {
      if (selector === ".setting-item-control") return control;
      if (selector === "select") return select;
      if (selector === ".setting-item-name") return { textContent: "Precise weight" };
      return null;
    },
  };
}

const precision = loadModule();

test("adds precise inputs to every Extended Headings numerical slider", () => {
  assert.equal(typeof precision.enhanceStyleSettingsNumberControls, "function");
  const slider = inputElement("0.9");
  slider.type = "range";
  slider.min = "0.6";
  slider.max = "1.4";
  slider.step = "0.05";
  const numberInput = inputElement();
  const row = sliderRow({ id: "extended-h7-size", slider, numberInput });

  assert.equal(precision.enhanceStyleSettingsNumberControls(row), 1);
  assert.equal(numberInput.type, "text");
  assert.equal(numberInput.inputMode, "decimal");
  assert.equal(numberInput.value, "0.9");
  assert.equal(numberInput.min, "0.6");
  assert.equal(numberInput.max, "1.4");
  assert.equal(numberInput.step, "any");
});

test("preserves decimal typing, caret position, and arbitrary in-range slider values", () => {
  assert.equal(typeof precision.enhanceStyleSettingsNumberControls, "function");
  const slider = inputElement("0.9");
  slider.type = "range";
  slider.min = "0.6";
  slider.max = "1.4";
  slider.step = "0.05";
  const numberInput = inputElement();
  const row = sliderRow({ id: "extended-h7-size", slider, numberInput });
  precision.enhanceStyleSettingsNumberControls(row);

  numberInput.value = "1";
  numberInput.setSelectionRange(1, 1);
  numberInput.dispatchEvent(new TestEvent("input"));
  assert.equal(slider.value, "1");
  assert.equal(numberInput.value, "1");
  assert.equal(numberInput.selectionStart, 1);

  numberInput.value = "1.";
  numberInput.setSelectionRange(2, 2);
  numberInput.dispatchEvent(new TestEvent("input"));
  assert.equal(slider.value, "1");
  assert.equal(numberInput.value, "1.");
  assert.equal(numberInput.selectionStart, 2);

  numberInput.value = "1.03";
  numberInput.setSelectionRange(4, 4);
  numberInput.dispatchEvent(new TestEvent("input"));
  assert.equal(slider.value, "1.03");
  assert.equal(slider.step, "0.05");
  assert.equal(numberInput.value, "1.03");
  assert.equal(numberInput.selectionStart, 4);

  numberInput.value = "1.5";
  numberInput.setSelectionRange(3, 3);
  numberInput.dispatchEvent(new TestEvent("input"));
  assert.equal(numberInput.value, "1.5");
  assert.equal(slider.value, "1.03");
  numberInput.dispatchEvent(new TestEvent("change"));
  assert.equal(numberInput.value, "1.03");
});

test("accepts arbitrary weights while retaining the inherited global selectors", () => {
  assert.equal(typeof precision.enhanceStyleSettingsNumberControls, "function");
  const select = selectElement("inherit", ["inherit", "100", "200", "300", "400", "500", "600", "700", "800", "900"]);
  const numberInput = inputElement();
  const row = selectRow({
    id: "extended-heading-level-marker-weight",
    select,
    numberInput,
  });

  assert.equal(precision.enhanceStyleSettingsNumberControls(row), 1);
  assert.equal(numberInput.value, "");
  assert.equal(numberInput.placeholder, "Inherit");

  numberInput.value = "5";
  numberInput.dispatchEvent(new TestEvent("input"));
  assert.equal(select.value, "inherit");
  assert.equal(numberInput.value, "5");

  numberInput.value = "500";
  numberInput.setSelectionRange(3, 3);
  numberInput.dispatchEvent(new TestEvent("input"));
  assert.equal(select.value, "500");
  assert.equal(numberInput.selectionStart, 3);

  numberInput.value = "500.";
  numberInput.setSelectionRange(4, 4);
  numberInput.dispatchEvent(new TestEvent("input"));
  assert.equal(select.value, "500");
  assert.equal(numberInput.value, "500.");
  assert.equal(numberInput.selectionStart, 4);

  numberInput.value = "500.5";
  numberInput.setSelectionRange(5, 5);
  numberInput.dispatchEvent(new TestEvent("input"));
  assert.equal(select.value, "500.5");
  assert.ok(select.options.some((option) => option.value === "500.5"));
  assert.equal(numberInput.selectionStart, 5);

  numberInput.value = "950";
  numberInput.dispatchEvent(new TestEvent("input"));
  assert.equal(select.value, "500.5");
  numberInput.dispatchEvent(new TestEvent("change"));
  assert.equal(numberInput.value, "500.5");
});

test("restores an arbitrary persisted weight from the generated CSS variable", () => {
  const select = selectElement("", ["inherit", "100", "200", "300", "400", "500", "600", "700", "800", "900"]);
  const numberInput = inputElement();
  const row = selectRow({
    id: "extended-hash-marker-weight",
    select,
    numberInput,
    computedValue: "437.5",
  });

  assert.equal(precision.enhanceStyleSettingsNumberControls(row), 1);
  assert.equal(select.value, "437.5");
  assert.equal(numberInput.value, "437.5");
  assert.ok(select.options.some((option) => option.value === "437.5"));
});

test("covers all fourteen sliders plus both inherited global weight controls", () => {
  assert.equal((styles.match(/type: variable-number-slider/g) ?? []).length, 14);
  assert.match(source, /"extended-heading-level-marker-weight"/);
  assert.match(source, /"extended-hash-marker-weight"/);
  assert.match(source, /STYLE_SETTINGS_SECTION_SELECTOR/);
});

test("wires lifecycle observation and styling for precision controls", () => {
  assert.match(main, /StyleSettingsPrecisionControls/);
  assert.match(main, /styleSettingsPrecisionControls\?\.stop\(\)/);
  assert.match(source, /new Observer\(/);
  assert.match(main, /window-open/);
  assert.match(styles, /\.extended-headings-style-settings-number-input/);
});
