import type { EditorView } from "@codemirror/view";
import { Vim } from "@replit/codemirror-vim";
import { idMap } from "./bufferState";

export function setupVimCommands(
  view: EditorView,
  save: (force: boolean) => void,
  focusTab: (tabId: number) => void,
): void {
  Vim.defineEx("w", "w", () => save(false));
  Vim.defineEx("w!", "w!", () => save(true));

  Vim.defineAction("focusTab", (_cm: EditorView) => {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const tabId = idMap.get(line.number);
    if (tabId !== undefined) {
      focusTab(tabId);
    }
  });

  Vim.mapCommand("gx", "action", "focusTab");

  Vim.defineAction("refresh", () => {
    chrome.runtime.sendMessage({ type: "REQUEST_SNAPSHOT" });
  });

  Vim.mapCommand("gr", "action", "refresh");
}
