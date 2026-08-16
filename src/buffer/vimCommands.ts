import browser from "webextension-polyfill";
import type { EditorView } from "@codemirror/view";
import { Vim } from "@replit/codemirror-vim";
import { idMap, nonEditableLines, lineKinds } from "./BufferUI";
import { extractUrl, extractTitle, normalizeUrl } from "../model/Parser";

// The package's declarations lag its runtime API (notably Ex callbacks and mapCommand).
// Keep the compatibility boundary local instead of weakening the rest of the codebase.
const VimCompat = Vim as any;
const registerEx = (name: string, prefix: string, callback: (...args: any[]) => void): void => {
  try {
    if (name.startsWith(prefix)) {
      VimCompat.defineEx(name, prefix, callback);
    } else {
      VimCompat.defineEx(name, name, callback);
      VimCompat.defineEx(prefix, prefix, callback);
    }
  } catch (error) {
    console.warn(`tab-oil: unable to register Ex command ${name}`, error);
  }
};
const defineEx = registerEx;

export function setupVimCommands(
  view: EditorView,
  save: (force: boolean) => void,
  focusTab: (tabId: number) => void,
): void {
  defineEx("w", "w", () => save(false));
  defineEx("w!", "w!", () => save(true));

  VimCompat.defineAction("focusTab", (_cm: EditorView) => {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const tabId = idMap.get(line.number);
    if (tabId !== undefined) {
      focusTab(tabId);
    }
  });

  VimCompat.mapCommand("gx", "action", "focusTab");

  VimCompat.defineAction("refresh", () => {
    browser.runtime.sendMessage({ type: "REQUEST_SNAPSHOT" });
  });

  VimCompat.mapCommand("gr", "action", "refresh");

  const copyToClipboard = (text: string, onResult: (ok: boolean) => void): void => {
    const transferred = (ok: boolean): void => onResult(ok);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => transferred(true)).catch(() => transferred(legacyCopy(text)));
    } else {
      transferred(legacyCopy(text));
    }
  };

  const legacyCopy = (text: string): boolean => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const flashStatus = (msg: string): void => {
    const el = document.getElementById("statusbar");
    if (!el) return;
    el.textContent = msg;
    setTimeout(() => {
      if (el.textContent === msg) el.textContent = "";
    }, 2500);
  };

  const isSavedRow = (lineNo: number): boolean => {
    for (let i = lineNo; i >= 1; i--) {
      if (lineKinds.get(i) === "header") return false;
      if (lineKinds.get(i) === "section") return view.state.doc.line(i).text.startsWith("▸ Saved");
    }
    return false;
  };

  VimCompat.defineAction("yankUrl", (_cm: EditorView) => {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const url = extractUrl(line.text);
    VimCompat.registerController.pushText('"', 'y', line.text + "\n", true);
    copyToClipboard(url, (ok) => flashStatus(ok ? `yanked URL: ${url}` : "clipboard blocked — failed to copy"));
  });

  VimCompat.mapCommand("yy", "action", "yankUrl");

  defineEx("yanktitle", "yt", () => {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    copyToClipboard(extractTitle(line.text), (ok) => flashStatus(ok ? "yanked title" : "clipboard blocked — failed to copy"));
  });

  defineEx("yankall", "ya", () => {
    const urls: string[] = [];
    for (let i = 1; i <= view.state.doc.lines; i++) {
      if (!nonEditableLines.has(i) && idMap.has(i)) urls.push(extractUrl(view.state.doc.line(i).text));
    }
    copyToClipboard(urls.join("\n"), (ok) => flashStatus(ok ? `yanked ${urls.length} URLs` : "clipboard blocked — failed to copy"));
  });

  defineEx("tab", "ta", (arg: string) => {
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

  VimCompat.defineAction("moveLineDown", () => {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    if (nonEditableLines.has(line.number)) return;
    let next = line.number + 1;
    if (next > view.state.doc.lines || nonEditableLines.has(next)) return;
    const nextLine = view.state.doc.line(next);
    if (isSavedRow(line.number) !== isSavedRow(next)) return;
    view.dispatch({
      changes: [
        { from: line.from, to: line.to, insert: nextLine.text },
        { from: nextLine.from, to: nextLine.to, insert: line.text },
      ],
      selection: { anchor: nextLine.from },
    });
  });

  VimCompat.defineAction("moveLineUp", () => {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    if (nonEditableLines.has(line.number)) return;
    let prev = line.number - 1;
    if (prev < 1 || nonEditableLines.has(prev)) return;
    const prevLine = view.state.doc.line(prev);
    if (isSavedRow(line.number) !== isSavedRow(prev)) return;
    view.dispatch({
      changes: [
        { from: prevLine.from, to: prevLine.to, insert: line.text },
        { from: line.from, to: line.to, insert: prevLine.text },
      ],
      selection: { anchor: prevLine.from },
    });
  });

  VimCompat.mapCommand("J", "action", "moveLineDown");
  VimCompat.mapCommand("K", "action", "moveLineUp");

  const closeBuffer = () => window.close();

  VimCompat.defineAction("closeBuffer", closeBuffer);
  VimCompat.mapCommand("-", "action", "closeBuffer", { context: "normal" });

  defineEx("q", "q", closeBuffer);
  defineEx("quit", "quit", closeBuffer);

  defineEx("cnext", "cn", () => {
    browser.runtime.sendMessage({ type: "CYCLE_NEXT" });
  });

  defineEx("cprev", "cp", () => {
    browser.runtime.sendMessage({ type: "CYCLE_PREV" });
  });

  const selectedTabIds = (): number[] => {
    const sel = view.state.selection.main;
    const fromLine = view.state.doc.lineAt(sel.from);
    const toLine = view.state.doc.lineAt(sel.to);
    const tabIds: number[] = [];
    const seen = new Set<number>();
    for (let i = fromLine.number; i <= toLine.number; i++) {
      if (nonEditableLines.has(i)) continue;
      const tabId = idMap.get(i);
      if (tabId !== undefined && !seen.has(tabId)) {
        seen.add(tabId);
        tabIds.push(tabId);
      }
    }
    return tabIds;
  };

  defineEx("pin", "pin", () => {
    const tabIds = selectedTabIds();
    if (tabIds.length > 0) browser.runtime.sendMessage({ type: "SET_PINNED_TABS", tabIds, pinned: true });
  });
  defineEx("unpin", "unp", () => {
    const tabIds = selectedTabIds();
    if (tabIds.length > 0) browser.runtime.sendMessage({ type: "SET_PINNED_TABS", tabIds, pinned: false });
  });
  defineEx("mute", "mu", () => {
    const tabIds = selectedTabIds();
    if (tabIds.length > 0) browser.runtime.sendMessage({ type: "TOGGLE_MUTE_TABS", tabIds });
  });
  defineEx("duplicate", "dup", () => {
    const tabIds = selectedTabIds();
    if (tabIds.length > 0) browser.runtime.sendMessage({ type: "DUPLICATE_TABS", tabIds });
  });
  defineEx("only", "only", () => {
    const tabIds = selectedTabIds();
    if (tabIds.length > 0) browser.runtime.sendMessage({ type: "CLOSE_OTHER_TABS", tabIds });
  });
  defineEx("closeleft", "cl", () => {
    const tabIds = selectedTabIds();
    if (tabIds.length > 0) browser.runtime.sendMessage({ type: "CLOSE_SIDE_TABS", tabIds, side: "left" });
  });
  defineEx("closeright", "cr", () => {
    const tabIds = selectedTabIds();
    if (tabIds.length > 0) browser.runtime.sendMessage({ type: "CLOSE_SIDE_TABS", tabIds, side: "right" });
  });
  defineEx("new-window", "nw", (arg: string) => {
    browser.runtime.sendMessage({ type: "CREATE_WINDOW", url: arg?.trim() || undefined });
  });
  defineEx("undo-save", "us", () => {
    browser.runtime.sendMessage({ type: "UNDO_SAVE" });
  });

  defineEx("bookmark", "bm", () => {
    const tabIds = selectedTabIds();
    if (tabIds.length > 0) browser.runtime.sendMessage({ type: "BOOKMARK_TABS", tabIds });
  });

  defineEx("open", "e", (arg: string) => {
    const url = normalizeUrl(arg?.trim() ?? "");
    if (url) browser.runtime.sendMessage({ type: "OPEN_TAB", url });
  });

  defineEx("reload", "rel", () => {
    const tabIds = selectedTabIds();
    if (tabIds.length > 0) browser.runtime.sendMessage({ type: "RELOAD_TABS", tabIds });
  });

  defineEx("sleep", "sl", () => {
    const tabIds = selectedTabIds();
    if (tabIds.length > 0) {
      browser.runtime.sendMessage({ type: "DISCARD_TABS", tabIds });
    }
  });
}
