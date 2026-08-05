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
    backgroundColor: "#7aa2f7",
    color: "#1a1b26",
    fontWeight: 600,
  },
  ".cm-sectionLine": {
    color: "#737aa2",
    fontWeight: 600,
  },
  ".cm-urlMuted": {
    color: "#565f89",
  },
  ".cm-headerLine .cm-lineNumbers .cm-gutterElement": {
    backgroundColor: "#7aa2f7",
    color: "#1a1b26",
  },
  ".cm-nonEditable": {
    opacity: 0.35,
    pointerEvents: "none",
  },
  "img.cm-favicon": {
    width: "16px",
    height: "16px",
    verticalAlign: "middle",
    marginRight: "6px",
    marginLeft: "2px",
  },
  "span.cm-favicon-placeholder": {
    display: "inline-block",
    backgroundColor: "#3b4261",
    width: "16px",
    height: "16px",
    verticalAlign: "middle",
    marginRight: "6px",
    marginLeft: "2px",
    borderRadius: "50%",
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
    lineHeight: "1.7",
  },
  ".cm-content": {
    caretColor: "#f7768e",
    padding: "12px 0",
  },
  ".cm-line": {
    padding: "2px 24px 2px 8px",
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
