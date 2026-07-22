import { EditorView } from "@codemirror/view";

export const bufferDarkTheme = EditorView.theme({
  "&": {
    backgroundColor: "#0f111a",
    color: "#c0caf5",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-cursor": {
    borderLeftColor: "#f7768e",
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "#2f3a5e !important",
  },
  ".cm-gutters": {
    backgroundColor: "#0f111a",
    color: "#2c3052",
    border: "none",
    borderRight: "1px solid #1a1c2e",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 16px",
    fontSize: "12px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#1a1c2e",
    color: "#737aa2",
  },
  ".cm-activeLine": {
    backgroundColor: "#1a1c2e",
  },
  ".cm-headerLine": {
    backgroundColor: "#16182a",
    color: "#7aa2f7",
    fontWeight: 600,
  },
  ".cm-headerLine .cm-lineNumbers .cm-gutterElement": {
    color: "#7aa2f7",
  },
  ".cm-nonEditable": {
    opacity: 0.35,
    pointerEvents: "none",
  },
  "&.cm-focused .cm-cursorLayer .cm-cursor": {
    visibility: "visible",
  },
  ".cm-selectionMatch": {
    backgroundColor: "#2f3a5e",
  },
  ".cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "#2f3a5e",
  },
  ".cm-searchMatch": {
    backgroundColor: "#3b4261",
    outline: "1px solid #565f89",
  },
  ".cm-searchMatch.selected": {
    backgroundColor: "#2f3a5e",
  },
  ".cm-scroller": {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', 'Menlo', monospace",
    fontSize: "13px",
    lineHeight: "1.6",
  },
  ".cm-content": {
    caretColor: "#f7768e",
    padding: "4px 0",
  },
  ".cm-panels": {
    backgroundColor: "#1a1c2e",
    color: "#a9b1d6",
    border: "1px solid #2c3052",
  },
  ".cm-panels input": {
    backgroundColor: "#0f111a",
    color: "#c0caf5",
    border: "1px solid #2c3052",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
  },
  ".cm-panels label": {
    color: "#a9b1d6",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
  },
}, { dark: true });
