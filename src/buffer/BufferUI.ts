import browser from "webextension-polyfill";
import { EditorView, basicSetup } from "codemirror";
import { keymap, lineNumbers } from "@codemirror/view";
import { vim, getCM } from "@replit/codemirror-vim";
import { Prec, EditorState } from "@codemirror/state";
import { parse } from "../model/Parser";
import { formatSnapshot } from "../render/tabs";
import { diff } from "../engine/DiffEngine";
import { LARGE_DIFF_THRESHOLD } from "../shared/constants";
import type { BgToBuffer, FolderInfo } from "../shared/messages";
import type { Operation, Snapshot } from "../shared/types";
import type { SavedItem } from "../shared/storageSchema";
import type { LineKind } from "../render/primitives";
import { headerLineDeco, sectionLineDeco, nonEditableLineDeco, nonEditableTransactionFilter, urlColorDeco, faviconDeco } from "./decorations";
import { setupVimCommands } from "./vimCommands";
import { bufferDarkTheme } from "./theme";

declare const __BUILD_HASH__: string;

const REFRESH_COOLDOWN = 2000;

let view: EditorView;
let lastSnapshot: Snapshot | null = null;
let lastUrlMap = new Map<string, number[]>();
let lastFolders: FolderInfo[] = [];
let lastTabFolderMap: Record<number, number> = {};
let lastSavedItems: SavedItem[] = [];
let dirty = false;
let programmaticDispatch = false;
let statusDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastRefresh = 0;

// Shared state maps used by decorations
export const idMap = new Map<number, number>();
export const nonEditableLines = new Set<number>();
export const faviconMap = new Map<number, string>();
export const lineUrlMap = new Map<number, string>();
export const lineKinds = new Map<number, LineKind>();
export let titleColumn = 0;

function remapLocalLineState(oldText: string, newText: string): void {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const oldByText = new Map<string, number[]>();
  for (let i = 0; i < oldLines.length; i++) {
    const lines = oldByText.get(oldLines[i]) ?? [];
    lines.push(i + 1);
    oldByText.set(oldLines[i], lines);
  }

  const oldIdMap = new Map(idMap);
  const oldNonEditable = new Set(nonEditableLines);
  const oldFavicons = new Map(faviconMap);
  const oldUrls = new Map(lineUrlMap);
  const oldKinds = new Map(lineKinds);
  const usedOldLines = new Set<number>();
  idMap.clear();
  nonEditableLines.clear();
  faviconMap.clear();
  lineUrlMap.clear();
  lineKinds.clear();

  for (let newLine = 1; newLine <= newLines.length; newLine++) {
    const candidates = oldByText.get(newLines[newLine - 1]) ?? [];
    const exact = candidates.find((line) => !usedOldLines.has(line));
    const oldLine = exact ?? (newLine <= oldLines.length ? newLine : undefined);
    if (oldLine === undefined || usedOldLines.has(oldLine)) continue;
    usedOldLines.add(oldLine);

    const tabId = oldIdMap.get(oldLine);
    if (tabId !== undefined) idMap.set(newLine, tabId);
    if (oldNonEditable.has(oldLine)) nonEditableLines.add(newLine);
    const favicon = oldFavicons.get(oldLine);
    if (favicon !== undefined) faviconMap.set(newLine, favicon);
    const url = oldUrls.get(oldLine);
    if (url !== undefined) lineUrlMap.set(newLine, url);
    const kind = oldKinds.get(oldLine);
    if (kind !== undefined) lineKinds.set(newLine, kind);
  }
}

function updateStatusBar(): void {
  const text = view.state.doc.toString();
  const tabLines = text.split("\n").filter((l) => l.includes(" — "));
  const windowHeaders = text.split("\n").filter((l) => l.startsWith("Window "));
  let opsSummary = "";
  if (lastSnapshot) {
    const parsed = parse(text, lastUrlMap);
    const folderMap = new Map<number, number | null>();
    for (const [key, val] of Object.entries(lastTabFolderMap)) {
      folderMap.set(Number(key), val);
    }
    const savedUrls = new Set(lastSavedItems.map((item) => item.url));
    const ops = diff(lastSnapshot, parsed, folderMap, savedUrls);
    const counts: Record<Operation["kind"], number> = { close: 0, move: 0, create: 0, navigate: 0, group: 0, assignFolder: 0, discard: 0, saveForLater: 0, deleteSaved: 0, bookmark: 0, restoreFromSaved: 0 };
    for (const op of ops) {
      counts[op.kind]++;
    }
    const parts: string[] = [];
    if (counts.close) parts.push(`${counts.close} close`);
    if (counts.create) parts.push(`${counts.create} create`);
    if (counts.move) parts.push(`${counts.move} move`);
    if (counts.navigate) parts.push(`${counts.navigate} nav`);
    if (counts.group) parts.push(`${counts.group} group`);
    if (counts.assignFolder) parts.push(`${counts.assignFolder} folder`);
    if (counts.discard) parts.push(`${counts.discard} sleep`);
    if (counts.saveForLater) parts.push(`${counts.saveForLater} save`);
    if (counts.restoreFromSaved) parts.push(`${counts.restoreFromSaved} restore`);
    if (counts.deleteSaved) parts.push(`${counts.deleteSaved} delete saved`);
    opsSummary = parts.length ? ` │ ${parts.join(" · ")}` : "";
  }
  const el = document.getElementById("statusbar");
  if (el) {
    el.textContent = `${tabLines.length} tabs · ${windowHeaders.length} windows${opsSummary} · b${__BUILD_HASH__}`;
  }
}

function scheduleStatusUpdate(): void {
  if (statusDebounceTimer) clearTimeout(statusDebounceTimer);
  statusDebounceTimer = setTimeout(updateStatusBar, 150);
}

function showStaleBanner(): void {
  const el = document.getElementById("staleBanner");
  if (el) el.style.display = "";
}

function hideStaleBanner(): void {
  const el = document.getElementById("staleBanner");
  if (el) el.style.display = "none";
}

function save(force: boolean): void {
  if (!lastSnapshot) return;
  const text = view.state.doc.toString();
  const parsed = parse(text, lastUrlMap);
  const savedUrls = new Set(lastSavedItems.map((item) => item.url));
  const ops = diff(lastSnapshot, parsed, undefined, savedUrls);
  const closeCount = ops.filter((op) => op.kind === "close").length;

  if (!force && closeCount > LARGE_DIFF_THRESHOLD) {
    const ok = window.confirm(
      `This will close ${closeCount} tabs. Continue?`,
    );
    if (!ok) return;
    view.focus();
  }

  dirty = false;
  browser.runtime.sendMessage({ type: "SAVE", text });
  view.focus();
}

function focusTab(tabId: number): void {
  browser.runtime.sendMessage({ type: "FOCUS_TAB", tabId });
}

function updateMaps(snapshot: Snapshot, folders: FolderInfo[], tabFolderMap: Record<number, number>, savedItems: SavedItem[], newData: ReturnType<typeof formatSnapshot>): void {
  lastSnapshot = snapshot;
  lastFolders = folders;
  lastTabFolderMap = tabFolderMap;
  lastSavedItems = savedItems;
  lastUrlMap = newData.urlMap;

  idMap.clear();
  for (const [k, v] of newData.idMap) idMap.set(k, v);
  nonEditableLines.clear();
  for (const v of newData.nonEditableLines) nonEditableLines.add(v);
  faviconMap.clear();
  for (const [k, v] of newData.faviconMap) faviconMap.set(k, v);
  lineUrlMap.clear();
  for (const [k, v] of newData.lineUrlMap) lineUrlMap.set(k, v);
  lineKinds.clear();
  for (const [k, v] of newData.lineKinds) lineKinds.set(k, v);
  titleColumn = newData.titleColumn;
}

function renderSnapshot(snapshot: Snapshot, folders?: FolderInfo[], tabFolderMap?: Record<number, number>, savedItems?: SavedItem[], replaceDoc?: boolean): void {
  const f = folders ?? [];
  const tfm = tabFolderMap ?? {};
  const si = savedItems ?? [];
  const prevCursor = view.state.selection.main.head;
  const prevLine = view.state.doc.lineAt(prevCursor);
  const prevTabId = idMap.get(prevLine.number);
  const newData = formatSnapshot(snapshot, f, tfm, si);
  updateMaps(snapshot, f, tfm, si, newData);

  dirty = false;
  if (replaceDoc === false) return;

  const text = newData.text;
  if (text === view.state.doc.toString()) return;

  programmaticDispatch = true;
  try {
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: text,
      },
    });
  } finally {
    programmaticDispatch = false;
  }

  let newPos: number;
  if (prevTabId !== undefined) {
    let found = false;
    for (let i = 1; i <= view.state.doc.lines; i++) {
      if (idMap.get(i) === prevTabId) {
        newPos = view.state.doc.line(i).from;
        found = true;
        break;
      }
    }
    if (!found) {
      newPos = Math.min(prevCursor, Math.max(0, view.state.doc.length - 1));
    }
  } else {
    newPos = Math.min(prevCursor, Math.max(0, view.state.doc.length - 1));
  }

  view.dispatch({
    selection: { anchor: newPos },
    scrollIntoView: true,
  });
  view.focus();
}

function applySnapshotUpdate(snapshot: Snapshot, folders?: FolderInfo[], tabFolderMap?: Record<number, number>, savedItems?: SavedItem[]): void {
  if (dirty) {
    showStaleBanner();
    return;
  }

  const f = folders ?? [];
  const tfm = tabFolderMap ?? {};
  const si = savedItems ?? [];
  const newData = formatSnapshot(snapshot, f, tfm, si);
  const newText = newData.text;
  const oldText = view.state.doc.toString();

  if (newText === oldText) return;

  const cursor = view.state.selection.main.head;
  const cursorLine = view.state.doc.lineAt(cursor);
  const cursorTabId = idMap.get(cursorLine.number);

  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  let startLine = 0;
  while (startLine < oldLines.length && startLine < newLines.length && oldLines[startLine] === newLines[startLine]) {
    startLine++;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= startLine && newEnd >= startLine && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  updateMaps(snapshot, f, tfm, si, newData);
  dirty = false;

  const from = startLine < view.state.doc.lines ? view.state.doc.line(startLine + 1).from : view.state.doc.length;
  const to = oldEnd >= 0 && oldEnd < view.state.doc.lines ? view.state.doc.line(oldEnd + 1).to : view.state.doc.length;
  const insert = newLines.slice(startLine, newEnd + 1).join("\n");

  programmaticDispatch = true;
  try {
    view.dispatch({ changes: { from, to, insert } });
  } finally {
    programmaticDispatch = false;
  }

  if (cursorTabId !== undefined) {
    for (let i = 1; i <= view.state.doc.lines; i++) {
      if (idMap.get(i) === cursorTabId) {
        view.dispatch({
          selection: { anchor: view.state.doc.line(i).from },
          scrollIntoView: true,
        });
        break;
      }
    }
  }

  hideStaleBanner();
  updateStatusBar();
}

export function setupBufferUI(): void {
  try {
    const statusListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        if (!programmaticDispatch) {
          remapLocalLineState(update.startState.doc.toString(), update.state.doc.toString());
          dirty = true;
        }
        scheduleStatusUpdate();
      }
    });

    view = new EditorView({
      state: EditorState.create({
        extensions: [
          basicSetup,
          lineNumbers({
            formatNumber: (lineNo, state) => {
              const cursor = state.selection.main.head;
              const cursorLine = state.doc.lineAt(cursor);
              const diff = lineNo - cursorLine.number;
              return diff === 0 ? String(lineNo) : String(Math.abs(diff));
            },
          }),
          vim(),
          bufferDarkTheme,
          headerLineDeco,
          sectionLineDeco,
          nonEditableLineDeco,
          urlColorDeco,
          faviconDeco,
          nonEditableTransactionFilter,
          statusListener,
          Prec.highest(keymap.of([
            {
              key: "Enter",
              run: (v: EditorView) => {
                const cm = getCM(v);
                const vs = cm?.state?.vim;
                if (!vs || vs.insertMode || vs.visualMode) return false;
                const cursor = v.state.selection.main.head;
                const line = v.state.doc.lineAt(cursor);
                const tabId = idMap.get(line.number);
                if (tabId !== undefined) {
                  browser.runtime.sendMessage({ type: "FOCUS_TAB", tabId });
                  return true;
                }
                return false;
              },
            },
            {
              key: "Ctrl-Enter",
              run: (v: EditorView) => {
                const cm = getCM(v);
                const vs = cm?.state?.vim;
                if (!vs || vs.insertMode || vs.visualMode) return false;
                const cursor = v.state.selection.main.head;
                const line = v.state.doc.lineAt(cursor);
                const tabId = idMap.get(line.number);
                if (tabId !== undefined) {
                  browser.runtime.sendMessage({ type: "FOCUS_TAB", tabId });
                  return true;
                }
                return false;
              },
            },
            {
              key: "Ctrl-s",
              run: (v: EditorView) => {
                const cm = getCM(v);
                const vs = cm?.state?.vim;
                if (!vs || vs.insertMode) return false;

                const tabIds: number[] = [];
                const sel = v.state.selection.main;
                const fromLine = v.state.doc.lineAt(sel.from);
                const toLine = v.state.doc.lineAt(sel.to);
                const seen = new Set<number>();

                for (let i = fromLine.number; i <= toLine.number; i++) {
                  const tabId = idMap.get(i);
                  if (tabId !== undefined && !seen.has(tabId)) {
                    seen.add(tabId);
                    tabIds.push(tabId);
                  }
                }

                if (tabIds.length > 0) {
                  browser.runtime.sendMessage({ type: "DISCARD_TABS", tabIds });
                  return true;
                }
                return false;
              },
            },
            {
              key: "Ctrl-m",
              run: (v: EditorView) => {
                const cm = getCM(v);
                const vs = cm?.state?.vim;
                if (!vs || vs.insertMode) return false;

                const tabIds: number[] = [];
                const sel = v.state.selection.main;
                const fromLine = v.state.doc.lineAt(sel.from);
                const toLine = v.state.doc.lineAt(sel.to);
                const seen = new Set<number>();

                for (let i = fromLine.number; i <= toLine.number; i++) {
                  const tabId = idMap.get(i);
                  if (tabId !== undefined && !seen.has(tabId)) {
                    seen.add(tabId);
                    tabIds.push(tabId);
                  }
                }

                if (tabIds.length > 0) {
                  browser.runtime.sendMessage({ type: "TOGGLE_MUTE_TABS", tabIds });
                  return true;
                }
                return false;
              },
            },
          ])),
        ],
      }),
      parent: document.getElementById("editor")!,
    });

    view.focus();

    setupVimCommands(view, save, focusTab);

    browser.runtime.onMessage.addListener((message: BgToBuffer) => {
      switch (message.type) {
        case "SNAPSHOT":
          hideStaleBanner();
          renderSnapshot(message.snapshot, message.folders, message.tabFolderMap, message.savedItems, true);
          updateStatusBar();
          break;
        case "APPLY_RESULT":
          if (message.ok) {
            hideStaleBanner();
            renderSnapshot(message.snapshot, message.folders, message.tabFolderMap, message.savedItems, false);
            updateStatusBar();
          } else {
            alert(`tab-oil error: ${message.error}`);
          }
          break;
        case "STALE_WARNING":
          if (!dirty) {
            const now = Date.now();
            if (now - lastRefresh > REFRESH_COOLDOWN) {
              lastRefresh = now;
              browser.runtime.sendMessage({ type: "REQUEST_SNAPSHOT" });
            }
          } else {
            showStaleBanner();
          }
          break;
        case "SNAPSHOT_UPDATED":
          applySnapshotUpdate(message.snapshot, message.folders, message.tabFolderMap, message.savedItems);
          break;
      }
    });

    browser.runtime.sendMessage({ type: "REQUEST_SNAPSHOT" });
  } catch (e) {
    console.error("tab-oil init error:", e);
    document.body.textContent = `tab-oil init error: ${e}`;
  }
}
