import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

// A preview highlight never changes the editor selection or the undo history.
export const breadcrumbHighlight = StateEffect.define<number | null>();
export const breadcrumbHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(breadcrumbHighlight)) continue;
      const line = effect.value;
      value = line === null || line < 0 || line >= transaction.newDoc.lines ? Decoration.none
        : Decoration.set([Decoration.line({ class: "extended-breadcrumb-main-highlight" }).range(transaction.newDoc.line(line + 1).from)]);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});
