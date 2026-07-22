import { StateField, RangeSetBuilder, EditorState } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import {
  Decoration,
  EditorView,
} from "@codemirror/view";
import { nonEditableLines } from "./bufferState";

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

const nonEditableDeco = Decoration.line({ class: "cm-nonEditable" });

export const nonEditableLineDeco = StateField.define<DecorationSet>({
  create(state: EditorState) {
    return buildNonEditableDecorations(state);
  },
  update(deco: DecorationSet, tr) {
    if (tr.docChanged) return buildNonEditableDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildNonEditableDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let i = 1; i <= state.doc.lines; i++) {
    if (nonEditableLines.has(i)) {
      const line = state.doc.line(i);
      builder.add(line.from, line.from, nonEditableDeco);
    }
  }
  return builder.finish();
}

export const nonEditableTransactionFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return [tr];
  for (const lineNo of nonEditableLines) {
    if (lineNo < 1 || lineNo > tr.startState.doc.lines) continue;
    const line = tr.startState.doc.line(lineNo);
    let touched = false;
    tr.changes.iterChanges((fromA, toA) => {
      if (fromA < line.to && toA > line.from) {
        touched = true;
      }
    });
    if (touched) return [];
  }
  return [tr];
});
