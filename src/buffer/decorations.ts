import { StateField, RangeSetBuilder, EditorState } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import {
  Decoration,
  EditorView,
} from "@codemirror/view";

const WINDOW_HEADER_RE = /^── Window \d+/;

export const headerLineDeco = StateField.define<DecorationSet>({
  create(state: EditorState) {
    return buildHeaderDecorations(state);
  },
  update(deco: DecorationSet, tr) {
    if (tr.docChanged) return buildHeaderDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildHeaderDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const deco = Decoration.line({ class: "cm-headerLine" });
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    if (WINDOW_HEADER_RE.test(line.text)) {
      builder.add(line.from, line.from, deco);
    }
  }
  return builder.finish();
}
