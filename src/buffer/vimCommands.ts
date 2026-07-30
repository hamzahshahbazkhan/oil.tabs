import browser from "webextension-polyfill";
import type { EditorView } from "@codemirror/view";
import { Vim } from "@replit/codemirror-vim";
import { idMap, nonEditableLines } from "./BufferUI";
import { extractUrl, extractTitle } from "../model/Parser";

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
    browser.runtime.sendMessage({ type: "REQUEST_SNAPSHOT" });
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
    if (nonEditableLines.has(line.number)) return;
    let next = line.number + 1;
    while (next <= view.state.doc.lines && nonEditableLines.has(next)) {
      next++;
    }
    if (next > view.state.doc.lines) return;
    const nextLine = view.state.doc.line(next);
    view.dispatch({
      changes: [
        { from: line.from, to: line.to, insert: nextLine.text },
        { from: nextLine.from, to: nextLine.to, insert: line.text },
      ],
      selection: { anchor: nextLine.from },
    });
  });

  Vim.defineAction("moveLineUp", () => {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    if (nonEditableLines.has(line.number)) return;
    let prev = line.number - 1;
    while (prev >= 1 && nonEditableLines.has(prev)) {
      prev--;
    }
    if (prev < 1) return;
    const prevLine = view.state.doc.line(prev);
    view.dispatch({
      changes: [
        { from: prevLine.from, to: prevLine.to, insert: line.text },
        { from: line.from, to: line.to, insert: prevLine.text },
      ],
      selection: { anchor: prevLine.from },
    });
  });

  Vim.mapCommand("J", "action", "moveLineDown");
  Vim.mapCommand("K", "action", "moveLineUp");

  const closeBuffer = () => window.close();

  Vim.defineAction("closeBuffer", closeBuffer);
  Vim.mapCommand("-", "action", "closeBuffer", { context: "normal" });

  Vim.defineEx("q", "q", closeBuffer);
  Vim.defineEx("quit", "quit", closeBuffer);

  Vim.defineEx("cnext", "cn", () => {
    browser.runtime.sendMessage({ type: "CYCLE_NEXT" });
  });

  Vim.defineEx("cprev", "cp", () => {
    browser.runtime.sendMessage({ type: "CYCLE_PREV" });
  });

  Vim.defineEx("sleep", "sl", () => {
    const sel = view.state.selection.main;
    const fromLine = view.state.doc.lineAt(sel.from);
    const toLine = view.state.doc.lineAt(sel.to);
    const tabIds: number[] = [];
    for (let i = fromLine.number; i <= toLine.number; i++) {
      if (nonEditableLines.has(i)) continue;
      const tabId = idMap.get(i);
      if (tabId !== undefined) tabIds.push(tabId);
    }
    if (tabIds.length > 0) {
      browser.runtime.sendMessage({ type: "DISCARD_TABS", tabIds });
    }
  });
}
