import browser from "webextension-polyfill";
import { EditorView, basicSetup } from "codemirror";
import { vim } from "@replit/codemirror-vim";
import { snapshotToText, parse } from "./serialize";
import { headerLineDeco, nonEditableLineDeco, nonEditableTransactionFilter } from "./decorations";
import { setupVimCommands } from "./vimCommands";
import { diff } from "../background/diff";
import { LARGE_DIFF_THRESHOLD } from "../shared/constants";
import type { BgToBuffer, FolderInfo } from "../shared/messages";
import type { Operation, Snapshot } from "../shared/types";
import type { SavedItem } from "../shared/storageSchema";
import { EditorState } from "@codemirror/state";
import { idMap, nonEditableLines } from "./bufferState";
import { bufferDarkTheme } from "./theme";

let view: EditorView;
let lastSnapshot: Snapshot | null = null;
let lastUrlMap = new Map<string, number>();
let lastFolders: FolderInfo[] = [];
let lastTabFolderMap: Record<number, number> = {};
let lastSavedItems: SavedItem[] = [];
let dirty = false;
let statusDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function updateStatusBar() {
  const text = view.state.doc.toString();
  const tabLines = text.split("\n").filter((l) => l.includes(" — "));
  const windowHeaders = text.split("\n").filter((l) => l.startsWith("── Window"));
  let opsSummary = "";
  if (lastSnapshot) {
    const parsed = parse(text, lastUrlMap);
    const folderMap = new Map<number, number | null>();
    for (const [key, val] of Object.entries(lastTabFolderMap)) {
      folderMap.set(Number(key), val);
    }
    const savedUrls = new Set(lastSavedItems.map((item) => item.url));
    const ops = diff(lastSnapshot, parsed, folderMap, savedUrls);
    const counts: Record<Operation["kind"], number> = { close: 0, move: 0, create: 0, navigate: 0, group: 0, assignFolder: 0, discard: 0, saveForLater: 0, bookmark: 0, restoreFromSaved: 0 };
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
    opsSummary = parts.length ? ` │ ${parts.join(" · ")}` : "";
  }
  const el = document.getElementById("statusbar");
  if (el) {
    el.textContent = `${tabLines.length} tabs · ${windowHeaders.length} windows${opsSummary}`;
  }
}

function scheduleStatusUpdate() {
  if (statusDebounceTimer) clearTimeout(statusDebounceTimer);
  statusDebounceTimer = setTimeout(updateStatusBar, 150);
}

function showStaleBanner() {
  const el = document.getElementById("staleBanner");
  if (el) el.style.display = "";
}

function hideStaleBanner() {
  const el = document.getElementById("staleBanner");
  if (el) el.style.display = "none";
}

function save(force: boolean) {
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
  }

  dirty = false;
  browser.runtime.sendMessage({ type: "SAVE", text });
}

function focusTab(tabId: number) {
  browser.runtime.sendMessage({ type: "FOCUS_TAB", tabId });
}

function init() {
  try {
    const statusListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        dirty = true;
        scheduleStatusUpdate();
      }
    });

    view = new EditorView({
      state: EditorState.create({
        extensions: [
          basicSetup,
          vim(),
          bufferDarkTheme,
          headerLineDeco,
          nonEditableLineDeco,
          nonEditableTransactionFilter,
          statusListener,
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
          renderSnapshot(message.snapshot, message.folders, message.tabFolderMap, message.savedItems);
          updateStatusBar();
          break;
        case "APPLY_RESULT":
          if (message.ok) {
            hideStaleBanner();
            renderSnapshot(message.snapshot, message.folders, message.tabFolderMap, message.savedItems);
            updateStatusBar();
          } else {
            alert(`tab-oil error: ${message.error}`);
          }
          break;
        case "STALE_WARNING":
          if (!dirty) {
            browser.runtime.sendMessage({ type: "REQUEST_SNAPSHOT" });
          } else {
            showStaleBanner();
          }
          break;
      }
    });

    browser.runtime.sendMessage({ type: "REQUEST_SNAPSHOT" });
  } catch (e) {
    console.error("tab-oil init error:", e);
    document.body.textContent = `tab-oil init error: ${e}`;
  }
}

function renderSnapshot(snapshot: Snapshot, folders?: FolderInfo[], tabFolderMap?: Record<number, number>, savedItems?: SavedItem[]): void {
  dirty = false;
  lastSnapshot = snapshot;
  lastFolders = folders ?? [];
  lastTabFolderMap = tabFolderMap ?? {};
  lastSavedItems = savedItems ?? [];
  const { text, urlMap, idMap: newIdMap, nonEditableLines: newNonEditable } = snapshotToText(snapshot, lastFolders, lastTabFolderMap, lastSavedItems);
  lastUrlMap = urlMap;
  idMap.clear();
  for (const [k, v] of newIdMap) {
    idMap.set(k, v);
  }
  nonEditableLines.clear();
  for (const v of newNonEditable) {
    nonEditableLines.add(v);
  }
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: text,
    },
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
