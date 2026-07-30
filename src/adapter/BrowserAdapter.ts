import browser from "webextension-polyfill";
import type { Snapshot, BufferLine } from "../shared/types";

const BUFFER_TAB_ID_KEY = "bufferTabId";
const BUFFER_WINDOW_ID_KEY = "bufferWindowId";

export const hasTabGroups = typeof (browser.tabs as any).group === "function";
export const hasDiscard = typeof (browser.tabs as any).discard === "function";
export const hasBookmarks = typeof (browser as any).bookmarks?.create === "function";

// ── Tab operations ──────────────────────────────────────────────────────

export async function getTab(tabId: number): Promise<browser.tabs.Tab> {
  return browser.tabs.get(tabId);
}

export async function removeTab(tabId: number): Promise<void> {
  await browser.tabs.remove(tabId);
}

export async function createTab(params: { windowId: number; url: string; index: number; active?: boolean }): Promise<browser.tabs.Tab> {
  return browser.tabs.create(params);
}

export async function moveTab(tabId: number, params: { windowId: number; index: number }): Promise<browser.tabs.Tab> {
  return browser.tabs.move(tabId, params);
}

export async function updateTab(tabId: number, params: { url?: string; active?: boolean; muted?: boolean }): Promise<void> {
  await browser.tabs.update(tabId, params);
}

export async function discardTab(tabId: number): Promise<void> {
  await (browser.tabs as any).discard(tabId);
}

export async function groupTabs(params: { tabIds: number[]; groupId?: number }): Promise<number> {
  return (browser.tabs as any).group(params);
}

export async function queryTabs(params: browser.tabs.QueryQueryInfo): Promise<browser.tabs.Tab[]> {
  return browser.tabs.query(params);
}

// ── Bookmark operations ─────────────────────────────────────────────────

export async function createBookmark(params: { title: string; url: string }): Promise<browser.bookmarks.BookmarkTreeNode> {
  return browser.bookmarks.create(params);
}

export async function removeBookmark(id: string): Promise<void> {
  await browser.bookmarks.remove(id);
}

// ── Storage operations ──────────────────────────────────────────────────

export async function storageLocalGet(keys: string | string[]): Promise<Record<string, any>> {
  return browser.storage.local.get(keys);
}

export async function storageLocalSet(data: Record<string, any>): Promise<void> {
  await browser.storage.local.set(data);
}

export async function storageSessionGet(keys: string | string[]): Promise<Record<string, any>> {
  return browser.storage.session.get(keys);
}

export async function storageSessionSet(data: Record<string, any>): Promise<void> {
  await browser.storage.session.set(data);
}

export async function storageSessionRemove(keys: string | string[]): Promise<void> {
  await browser.storage.session.remove(keys);
}

export async function storageSyncGet(keys: string | string[]): Promise<Record<string, any>> {
  return browser.storage.sync.get(keys);
}

// ── Window operations ───────────────────────────────────────────────────

export async function getWindow(windowId: number): Promise<browser.windows.Window> {
  return browser.windows.get(windowId, { populate: false });
}

export async function updateWindow(windowId: number, params: { focused?: boolean }): Promise<browser.windows.Window> {
  return browser.windows.update(windowId, params);
}

export async function getLastFocusedWindow(): Promise<browser.windows.Window> {
  return browser.windows.getLastFocused();
}

export async function createWindow(params: { url: string; type: "popup" | "normal"; width: number; height: number; left: number; top: number }): Promise<browser.windows.Window> {
  return browser.windows.create(params);
}

// ── Buffer window lifecycle ─────────────────────────────────────────────

export async function openOrFocusBufferTab(): Promise<void> {
  const stored = await browser.storage.session.get([BUFFER_TAB_ID_KEY, BUFFER_WINDOW_ID_KEY]);
  const existingTabId = stored[BUFFER_TAB_ID_KEY] as number | undefined;
  const existingWindowId = stored[BUFFER_WINDOW_ID_KEY] as number | undefined;

  if (existingWindowId !== undefined) {
    try {
      const win = await getWindow(existingWindowId);
      if (win) {
        await updateWindow(win.id!, { focused: true });
        return;
      }
    } catch {
      await storageSessionRemove([BUFFER_TAB_ID_KEY, BUFFER_WINDOW_ID_KEY]);
    }
  } else if (existingTabId !== undefined) {
    try {
      const tab = await getTab(existingTabId);
      if (tab && tab.windowId !== undefined) {
        await updateWindow(tab.windowId, { focused: true });
        return;
      }
    } catch {
      await storageSessionRemove([BUFFER_TAB_ID_KEY, BUFFER_WINDOW_ID_KEY]);
    }
  }

  let left = 0;
  let top = 0;
  let width = 1200;
  let height = 800;
  try {
    const win = await getLastFocusedWindow();
    if (win && win.type === "normal" && win.width && win.height) {
      width = Math.round(win.width * 0.88);
      height = Math.round(win.height * 0.85);
      left = win.left! + Math.round((win.width - width) / 2);
      top = win.top! + Math.round((win.height - height) / 2);
    }
  } catch {
    // Use defaults
  }

  const popup = await createWindow({
    url: browser.runtime.getURL("buffer.html"),
    type: "popup",
    width,
    height,
    left,
    top,
  });

  if (popup.tabs && popup.tabs[0] && popup.tabs[0].id !== undefined) {
    await storageSessionSet({
      [BUFFER_TAB_ID_KEY]: popup.tabs[0].id,
      [BUFFER_WINDOW_ID_KEY]: popup.id,
    });
  }
}

export async function getBufferTabId(): Promise<number | undefined> {
  const stored = await storageSessionGet(BUFFER_TAB_ID_KEY);
  return stored[BUFFER_TAB_ID_KEY] as number | undefined;
}

export async function getBufferWindowId(): Promise<number | undefined> {
  const stored = await storageSessionGet(BUFFER_WINDOW_ID_KEY);
  return stored[BUFFER_WINDOW_ID_KEY] as number | undefined;
}

// ── Snapshot ────────────────────────────────────────────────────────────

export async function takeSnapshot(): Promise<Snapshot> {
  const bufferTabId = await getBufferTabId();
  const tabs = await queryTabs({});

  const lines: BufferLine[] = [];

  for (const tab of tabs) {
    if (tab.id !== undefined && tab.id === bufferTabId) continue;
    if (tab.id === undefined || tab.windowId === undefined || tab.url === undefined) continue;

    const url = tab.url;
    const editable = true;
    const favIconUrl = tab.favIconUrl && (tab.favIconUrl.startsWith("http") || tab.favIconUrl.startsWith("data:")) ? tab.favIconUrl : undefined;

    lines.push({
      tabId: tab.id,
      windowId: tab.windowId,
      index: tab.index,
      url,
      title: tab.title ?? "",
      pinned: tab.pinned ?? false,
      discarded: tab.discarded ?? false,
      editable,
      groupId: tab.groupId !== undefined && tab.groupId > -1 ? tab.groupId : null,
      favIconUrl,
    });
  }

  lines.sort((a, b) => {
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return a.index - b.index;
  });

  return { takenAt: Date.now(), lines };
}

// ── Messaging ───────────────────────────────────────────────────────────

export async function sendMessage(tabId: number, message: any): Promise<void> {
  await browser.tabs.sendMessage(tabId, message);
}
