import type { EditorView } from "@codemirror/view";
import { Vim } from "@replit/codemirror-vim";

export function setupVimCommands(view: EditorView): void {
  Vim.defineEx("w", "w", () => {
    const text = view.state.doc.toString();
    chrome.runtime.sendMessage({ type: "SAVE", text });
  });
}
