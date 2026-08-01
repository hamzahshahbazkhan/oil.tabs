import browser from "webextension-polyfill";
import type { Snapshot, BufferLine } from "../shared/types";
import type { BgToBuffer, FolderInfo } from "../shared/messages";
import type { SavedItem } from "../shared/storageSchema";
import {
  getBufferTabId,
  sendMessage,
  storageLocalGet,
} from "../adapter/BrowserAdapter";

let currentSnapshot: Snapshot = { takenAt: 0, lines: [] };
let currentFolders: FolderInfo[] = [];
let currentTabFolderMap: Record<number, number> = {};
let currentSavedItems: SavedItem[] = [];
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let bufferTabId_: number | undefined;
let registered = false;

const pendingDetach = new Map<number, BufferLine>();

function favIconUrl(tab: browser.tabs.Tab): string | undefined {
  const url = tab.favIconUrl;
  return url && (url.startsWith("http") || url.startsWith("data:"))
    ? url
    : undefined;
}

function tabToBufferLine(tab: browser.tabs.Tab): BufferLine {
  return {
    tabId: tab.id!,
    windowId: tab.windowId!,
    index: tab.index,
    url: tab.url ?? "",
    title: tab.title ?? "",
    pinned: tab.pinned ?? false,
    discarded: tab.discarded ?? false,
    editable: !(
      tab.url?.startsWith("about:") ||
      tab.url?.startsWith("chrome:") ||
      tab.url === ""
    ),
    groupId: tab.groupId ?? null,
    favIconUrl: favIconUrl(tab),
  };
}

function insertLine(lines: BufferLine[], line: BufferLine): void {
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].windowId > line.windowId ||
      (lines[i].windowId === line.windowId && lines[i].index > line.index)
    ) {
      lines.splice(i, 0, line);
      return;
    }
  }
  lines.push(line);
}

function renumberIndices(): void {
  const windows = new Map<number, BufferLine[]>();
  for (const line of currentSnapshot.lines) {
    const group = windows.get(line.windowId);
    if (group) group.push(line);
    else windows.set(line.windowId, [line]);
  }
  for (const tabs of windows.values()) {
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].index = i;
    }
  }
}

function scheduleNotify(): void {
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(sendUpdate, 200);
}

async function sendUpdate(): Promise<void> {
  notifyTimer = null;
  if (bufferTabId_ === undefined) return;
  try {
    const msg: BgToBuffer = {
      type: "SNAPSHOT_UPDATED",
      snapshot: currentSnapshot,
      folders: currentFolders,
      tabFolderMap: currentTabFolderMap,
      savedItems: currentSavedItems,
    };
    await sendMessage(bufferTabId_, msg);
  } catch {
    // buffer tab not ready
  }
}

export async function init(snapshot: Snapshot): Promise<void> {
  currentSnapshot = snapshot;
  bufferTabId_ = await getBufferTabId();
  const { folders, tabFolderMap, savedForLater } = await storageLocalGet([
    "folders",
    "tabFolderMap",
    "savedForLater",
  ]);
  currentFolders = (folders ?? []) as FolderInfo[];
  currentTabFolderMap = (tabFolderMap ?? {}) as Record<number, number>;
  currentSavedItems = (savedForLater ?? []) as SavedItem[];

  if (!registered) {
    registered = true;
    browser.tabs.onCreated.addListener(onTabCreated);
    browser.tabs.onRemoved.addListener(onTabRemoved);
    browser.tabs.onUpdated.addListener(onTabUpdated);
    browser.tabs.onMoved.addListener(onTabMoved);
    browser.tabs.onAttached.addListener(onTabAttached);
    browser.tabs.onDetached.addListener(onTabDetached);
    browser.windows.onCreated.addListener(onWindowCreated);
    browser.windows.onRemoved.addListener(onWindowRemoved);
  }
}

export function getSnapshot(): Snapshot {
  return currentSnapshot;
}

export function replaceSnapshot(
  snapshot: Snapshot,
  folders?: FolderInfo[],
  tabFolderMap?: Record<number, number>,
  savedItems?: SavedItem[],
): void {
  currentSnapshot = snapshot;
  if (folders !== undefined) currentFolders = folders;
  if (tabFolderMap !== undefined) currentTabFolderMap = tabFolderMap;
  if (savedItems !== undefined) currentSavedItems = savedItems;
}

export async function refreshBufferTabId(): Promise<void> {
  bufferTabId_ = await getBufferTabId();
}

async function onTabCreated(tab: browser.tabs.Tab): Promise<void> {
  if (
    tab.id === undefined ||
    tab.id === bufferTabId_ ||
    tab.windowId === undefined
  )
    return;
  const line = tabToBufferLine(tab);
  if (line.tabId === null) return;
  insertLine(currentSnapshot.lines, line);
  renumberIndices();
  scheduleNotify();
}

async function onTabRemoved(
  tabId: number,
  _info: browser.tabs.TabRemoveInfo,
): Promise<void> {
  pendingDetach.delete(tabId);
  const idx = currentSnapshot.lines.findIndex((l) => l.tabId === tabId);
  if (idx === -1) return;
  currentSnapshot.lines.splice(idx, 1);
  renumberIndices();
  scheduleNotify();
}

async function onTabUpdated(
  tabId: number,
  changeInfo: browser.tabs.TabChangeInfo,
  tab: browser.tabs.Tab,
): Promise<void> {
  if (tabId === bufferTabId_) return;
  if (
    !changeInfo.url &&
    !changeInfo.title &&
    changeInfo.discarded === undefined &&
    changeInfo.pinned === undefined &&
    changeInfo.favIconUrl === undefined
  )
    return;

  const idx = currentSnapshot.lines.findIndex((l) => l.tabId === tabId);
  if (idx === -1) return;

  const line = currentSnapshot.lines[idx];
  if (changeInfo.url !== undefined) line.url = tab.url ?? line.url;
  if (changeInfo.title !== undefined) line.title = tab.title ?? line.title;
  if (changeInfo.discarded !== undefined)
    line.discarded = tab.discarded ?? line.discarded;
  if (changeInfo.pinned !== undefined) line.pinned = tab.pinned ?? line.pinned;
  if (changeInfo.favIconUrl !== undefined) line.favIconUrl = tab.favIconUrl;

  scheduleNotify();
}

async function onTabMoved(
  tabId: number,
  moveInfo: browser.tabs.TabMoveInfo,
): Promise<void> {
  const idx = currentSnapshot.lines.findIndex((l) => l.tabId === tabId);
  if (idx === -1) return;

  const line = currentSnapshot.lines[idx];
  line.windowId = moveInfo.windowId;
  currentSnapshot.lines.splice(idx, 1);
  insertLine(currentSnapshot.lines, line);
  renumberIndices();
  scheduleNotify();
}

async function onTabAttached(
  tabId: number,
  attachInfo: browser.tabs.TabAttachInfo,
): Promise<void> {
  let line: BufferLine;
  const pending = pendingDetach.get(tabId);
  if (pending) {
    pendingDetach.delete(tabId);
    line = pending;
    line.windowId = attachInfo.newWindowId;
    line.index = attachInfo.newPosition;
  } else {
    try {
      const tab = await browser.tabs.get(tabId);
      if (tab.id === undefined || tab.id === bufferTabId_) return;
      line = tabToBufferLine(tab);
    } catch {
      return;
    }
  }
  insertLine(currentSnapshot.lines, line);
  renumberIndices();
  scheduleNotify();
}

async function onTabDetached(
  tabId: number,
  _detachInfo: browser.tabs.TabDetachInfo,
): Promise<void> {
  const idx = currentSnapshot.lines.findIndex((l) => l.tabId === tabId);
  if (idx === -1) return;

  pendingDetach.set(tabId, { ...currentSnapshot.lines[idx] });
  currentSnapshot.lines.splice(idx, 1);
  renumberIndices();
  scheduleNotify();
}

async function onWindowCreated(_window: browser.Windows.Window): Promise<void> {
  // new windows start with no tabs; nothing to add
}

async function onWindowRemoved(windowId: number): Promise<void> {
  const before = currentSnapshot.lines.length;
  for (const [tabId, line] of pendingDetach) {
    if (line.windowId === windowId) pendingDetach.delete(tabId);
  }
  currentSnapshot.lines = currentSnapshot.lines.filter(
    (l) => l.windowId !== windowId,
  );
  if (currentSnapshot.lines.length < before) {
    scheduleNotify();
  }
}
