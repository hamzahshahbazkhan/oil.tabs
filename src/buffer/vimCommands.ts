import type { EditorView } from "@codemirror/view";
import { Vim } from "@replit/codemirror-vim";
import { idMap, nonEditableLines } from "./bufferState";
import { extractUrl, extractTitle } from "./serialize";

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

  Vim.defineAction("yankUrl", (_cm: EditorView) => {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const url = extractUrl(line.text);
    navigator.clipboard.writeText(url);
    Vim.registerController.pushText('"', 'y', line.text + "\n", true);
  });

  Vim.mapCommand("yy", "action", "yankUrl");

  Vim.defineEx("tab", "ta", (arg: string) => {
    if (!arg || arg.trim() === "") return;
    const q = arg.trim().toLowerCase();
    for (let i = 1; i <= view.state.doc.lines; i++) {
      const line = view.state.doc.line(i);
      if (nonEditableLines.has(i)) continue;
      const url = extractUrl(line.text);
      const title = extractTitle(line.text);
      if (url.toLowerCase().includes(q) || title.toLowerCase().includes(q)) {
        const tabId = idMap.get(i);
        if (tabId !== undefined) {
          view.dispatch({ selection: { anchor: line.from } });
          focusTab(tabId);
          return;
        }
      }
    }
  });

  Vim.defineAction("moveLineDown", () => {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const next = line.number + 1;
    if (next > view.state.doc.lines) return;
    const nextLine = view.state.doc.line(next);
    if (nonEditableLines.has(line.number) || nonEditableLines.has(next)) return;
    const lineText = line.text;
    const nextText = nextLine.text;
    view.dispatch({
      changes: [
        { from: line.from, to: line.to, insert: nextText },
        { from: nextLine.from, to: nextLine.to, insert: lineText },
      ],
      selection: { anchor: nextLine.from },
    });
  });

  Vim.defineAction("moveLineUp", () => {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const prev = line.number - 1;
    if (prev < 1) return;
    const prevLine = view.state.doc.line(prev);
    if (nonEditableLines.has(line.number) || nonEditableLines.has(prev)) return;
    const lineText = line.text;
    const prevText = prevLine.text;
    view.dispatch({
      changes: [
        { from: prevLine.from, to: prevLine.to, insert: lineText },
        { from: line.from, to: line.to, insert: prevText },
      ],
      selection: { anchor: prevLine.from },
    });
  });

  Vim.mapCommand("J", "action", "moveLineDown");
  Vim.mapCommand("K", "action", "moveLineUp");
}
