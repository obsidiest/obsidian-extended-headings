const STYLE_SETTING_MARKER_SELECTOR = [
  '[data-id^="extended-"]',
  '[data-id^="extended-headings-style@@extended-"]',
  '[data-id*="@@extended-"]',
].join(", ");
const STYLE_SETTINGS_SECTION_SELECTOR = [
  '.style-settings-heading[data-id="extended-headings-style"]',
  '.style-settings-heading[data-id$="@@extended-headings-style"]',
].join(", ");
const NUMBER_INPUT_CLASS = "extended-headings-style-settings-number-input";
const NUMERIC_SELECT_IDS = new Set([
  "extended-heading-level-marker-weight",
  "extended-hash-marker-weight",
]);

type QueryableNode = ParentNode & {
  matches?: (selector: string) => boolean;
};

export class StyleSettingsPrecisionControls {
  private readonly observers = new Map<Document, MutationObserver>();

  start(documents?: Iterable<Document>): void {
    for (const ownerDocument of documents ?? getDefaultDocuments()) {
      this.observeDocument(ownerDocument);
    }
  }

  observeDocument(ownerDocument: Document | null | undefined): void {
    if (!ownerDocument?.body || this.observers.has(ownerDocument)) return;

    enhanceStyleSettingsNumberControls(ownerDocument);
    const Observer =
      ownerDocument.defaultView?.MutationObserver ??
      (typeof MutationObserver === "undefined" ? null : MutationObserver);
    if (!Observer) return;

    const observer = new Observer(() => {
      enhanceStyleSettingsNumberControls(ownerDocument);
    });
    observer.observe(ownerDocument.body, {
      attributes: true,
      attributeFilter: ["data-id"],
      childList: true,
      subtree: true,
    });
    this.observers.set(ownerDocument, observer);
  }

  stop(): void {
    for (const observer of this.observers.values()) observer.disconnect();
    this.observers.clear();
  }
}

export function enhanceStyleSettingsNumberControls(root: ParentNode): number {
  let enhanced = 0;
  for (const row of findExtendedHeadingsSettingRows(root)) {
    const control = row.querySelector<HTMLElement>(".setting-item-control");
    if (!control || control.querySelector(`.${NUMBER_INPUT_CLASS}`)) continue;

    const slider = row.querySelector<HTMLInputElement>('input[type="range"]');
    const select = isNumericSelectRow(row)
      ? row.querySelector<HTMLSelectElement>("select")
      : null;
    if (!slider && !select) continue;

    const ownerDocument = (slider ?? select)?.ownerDocument;
    if (!ownerDocument) continue;
    const numberInput = control.createEl("input");
    numberInput.type = "number";
    numberInput.className = NUMBER_INPUT_CLASS;
    const settingName = row.querySelector(".setting-item-name")?.textContent?.trim();
    numberInput.setAttribute(
      "aria-label",
      settingName ? `${settingName} precise value` : "Precise numerical value",
    );
    numberInput.setAttribute("title", "Enter a precise value");

    if (slider) configureSliderInput(numberInput, slider, ownerDocument);
    else if (select) configureNumericSelectInput(numberInput, select, ownerDocument);

    const resetButton = control.querySelector<HTMLElement>(".clickable-icon");
    resetButton?.addEventListener("click", () => {
      const schedule = ownerDocument.defaultView?.setTimeout ?? setTimeout;
      schedule(() => syncNumberInput(numberInput, slider, select), 0);
    });
    control.insertBefore(numberInput, resetButton ?? null);
    enhanced += 1;
  }
  return enhanced;
}

function configureSliderInput(
  numberInput: HTMLInputElement,
  slider: HTMLInputElement,
  ownerDocument: Document,
): void {
  numberInput.value = slider.value;
  numberInput.min = slider.min;
  numberInput.max = slider.max;
  numberInput.step = slider.step || "any";

  const syncFromSlider = (): void => {
    numberInput.value = slider.value;
  };
  const syncToSlider = (eventType: "input" | "change"): boolean => {
    const value = getValidNumberValue(numberInput, slider.min, slider.max, slider.step);
    if (value === null) return false;

    const changed = slider.value !== value;
    slider.value = value;
    const EventConstructor = ownerDocument.defaultView?.Event ?? Event;
    if (eventType === "change" && changed) {
      slider.dispatchEvent(new EventConstructor("input", { bubbles: true }));
    }
    slider.dispatchEvent(new EventConstructor(eventType, { bubbles: true }));
    return true;
  };

  slider.addEventListener("input", syncFromSlider);
  slider.addEventListener("change", syncFromSlider);
  numberInput.addEventListener("input", () => syncToSlider("input"));
  numberInput.addEventListener("change", () => {
    if (!syncToSlider("change")) syncFromSlider();
  });
}

function configureNumericSelectInput(
  numberInput: HTMLInputElement,
  select: HTMLSelectElement,
  ownerDocument: Document,
): void {
  const numericOptions = Array.from(select.options)
    .map((option) => parseFiniteNumber(option.value))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const minimum = numericOptions[0] ?? 100;
  const maximum = numericOptions[numericOptions.length - 1] ?? 900;
  const step = numericOptions.length > 1 ? numericOptions[1] - minimum : 100;
  numberInput.min = String(minimum);
  numberInput.max = String(maximum);
  numberInput.step = String(step);
  numberInput.placeholder = "Inherit";

  const syncFromSelect = (): void => {
    numberInput.value = parseFiniteNumber(select.value) === null ? "" : select.value;
  };
  const syncToSelect = (): boolean => {
    const value = getValidNumberValue(
      numberInput,
      numberInput.min,
      numberInput.max,
      numberInput.step,
    );
    if (
      value === null ||
      !Array.from(select.options).some((option) => option.value === value)
    ) return false;

    select.value = value;
    const EventConstructor = ownerDocument.defaultView?.Event ?? Event;
    select.dispatchEvent(new EventConstructor("input", { bubbles: true }));
    select.dispatchEvent(new EventConstructor("change", { bubbles: true }));
    return true;
  };

  syncFromSelect();
  select.addEventListener("input", syncFromSelect);
  select.addEventListener("change", syncFromSelect);
  numberInput.addEventListener("input", syncToSelect);
  numberInput.addEventListener("change", () => {
    if (!syncToSelect()) syncFromSelect();
  });
}

function syncNumberInput(
  numberInput: HTMLInputElement,
  slider: HTMLInputElement | null,
  select: HTMLSelectElement | null,
): void {
  if (slider) numberInput.value = slider.value;
  else if (select) numberInput.value = parseFiniteNumber(select.value) === null ? "" : select.value;
}

function getValidNumberValue(
  numberInput: HTMLInputElement,
  minimumValue: string,
  maximumValue: string,
  stepValue: string,
): string | null {
  const rawValue = numberInput.value.trim();
  const numericValue = numberInput.valueAsNumber;
  if (rawValue === "" || !Number.isFinite(numericValue)) return null;

  const minimum = parseFiniteNumber(minimumValue);
  const maximum = parseFiniteNumber(maximumValue);
  if (
    (minimum !== null && numericValue < minimum) ||
    (maximum !== null && numericValue > maximum)
  ) return null;

  const step = stepValue === "any" ? null : parseFiniteNumber(stepValue);
  if (step !== null && step > 0) {
    const stepBase = minimum ?? 0;
    const stepsFromBase = (numericValue - stepBase) / step;
    const tolerance = Number.EPSILON * 16 * Math.max(1, Math.abs(stepsFromBase));
    if (Math.abs(stepsFromBase - Math.round(stepsFromBase)) > tolerance) return null;
  }
  return rawValue;
}

function parseFiniteNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDefaultDocuments(): Document[] {
  return typeof document === "undefined" ? [] : [document];
}

function findExtendedHeadingsSettingRows(root: ParentNode): Element[] {
  const rows = new Set<Element>();
  const candidate = root as QueryableNode;
  if (candidate.matches?.(STYLE_SETTING_MARKER_SELECTOR)) {
    addSettingRow(candidate as unknown as Element, rows);
  }
  for (const marker of Array.from(
    root.querySelectorAll<Element>(STYLE_SETTING_MARKER_SELECTOR),
  )) addSettingRow(marker, rows);

  const sections: Element[] = [];
  if (candidate.matches?.(STYLE_SETTINGS_SECTION_SELECTOR)) {
    sections.push(candidate as unknown as Element);
  }
  sections.push(
    ...Array.from(root.querySelectorAll<Element>(STYLE_SETTINGS_SECTION_SELECTOR)),
  );
  for (const section of sections) {
    const container = section.nextElementSibling;
    if (!container?.matches(".style-settings-container")) continue;
    for (const row of Array.from(container.querySelectorAll<Element>(".setting-item"))) {
      rows.add(row);
    }
  }
  return Array.from(rows);
}

function addSettingRow(marker: Element, rows: Set<Element>): void {
  const row = marker.matches(".setting-item") ? marker : marker.closest(".setting-item");
  if (row) rows.add(row);
}

function isNumericSelectRow(row: Element): boolean {
  const rawId = row.getAttribute("data-id")
    ?? row.querySelector<Element>("[data-id]")?.getAttribute("data-id")
    ?? "";
  const parts = rawId.split("@@");
  const settingId = parts[parts.length - 1] ?? rawId;
  return NUMERIC_SELECT_IDS.has(settingId);
}
