import browser from "webextension-polyfill";
import type { Snapshot, BufferLine } from "../shared/types";
import { MAX_FAVICON_DATA_URL_LENGTH } from "../shared/constants";

const BUFFER_TAB_ID_KEY = "bufferTabId";
const BUFFER_WINDOW_ID_KEY = "bufferWindowId";

export const hasTabGroups = typeof (browser.tabs as any).group === "function";
export const hasTabUngroup = typeof (browser.tabs as any).ungroup === "function";
export const hasDiscard = typeof (browser.tabs as any).discard === "function";
export const hasBookmarks =
  typeof (browser as any).bookmarks?.create === "function";

// ── Tab operations ──────────────────────────────────────────────────────

export async function getTab(tabId: number): Promise<browser.Tabs.Tab> {
  return browser.tabs.get(tabId);
}

export async function removeTab(tabId: number): Promise<void> {
  await browser.tabs.remove(tabId);
}

export async function createTab(params: {
  windowId: number;
  url: string;
  index: number;
  active?: boolean;
}): Promise<browser.Tabs.Tab> {
  return (await browser.tabs.create(params)) as browser.Tabs.Tab;
}

export async function moveTab(
  tabId: number,
  params: { windowId: number; index: number },
): Promise<browser.Tabs.Tab> {
  return (await browser.tabs.move(tabId, params)) as browser.Tabs.Tab;
}

export async function updateTab(
  tabId: number,
  params: { url?: string; active?: boolean; muted?: boolean },
): Promise<void> {
  await browser.tabs.update(tabId, params);
}

export async function discardTab(tabId: number): Promise<void> {
  await (browser.tabs as any).discard(tabId);
}

export async function groupTabs(params: {
  tabIds: number[];
  groupId?: number;
}): Promise<number> {
  return (browser.tabs as any).group(params);
}

export async function ungroupTabs(tabIds: number[]): Promise<void> {
  await (browser.tabs as any).ungroup(tabIds);
}

export async function queryTabs(
  params: browser.Tabs.QueryQueryInfoType,
): Promise<browser.Tabs.Tab[]> {
  return browser.tabs.query(params);
}

// ── Bookmark operations ─────────────────────────────────────────────────

export async function createBookmark(params: {
  title: string;
  url: string;
}): Promise<browser.Bookmarks.BookmarkTreeNode> {
  return browser.bookmarks.create(params);
}

export async function removeBookmark(id: string): Promise<void> {
  await browser.bookmarks.remove(id);
}

// ── Storage operations ──────────────────────────────────────────────────

export async function storageLocalGet(
  keys: string | string[],
): Promise<Record<string, any>> {
  return browser.storage.local.get(keys);
}

export async function storageLocalSet(
  data: Record<string, any>,
): Promise<void> {
  await browser.storage.local.set(data);
}

export async function storageSessionGet(
  keys: string | string[],
): Promise<Record<string, any>> {
  return browser.storage.session.get(keys);
}

export async function storageSessionSet(
  data: Record<string, any>,
): Promise<void> {
  await browser.storage.session.set(data);
}

export async function storageSessionRemove(
  keys: string | string[],
): Promise<void> {
  await browser.storage.session.remove(keys);
}

// ── Window operations ───────────────────────────────────────────────────

export async function getWindow(
  windowId: number,
): Promise<browser.Windows.Window> {
  return browser.windows.get(windowId, { populate: false });
}

export async function updateWindow(
  windowId: number,
  params: { focused?: boolean },
): Promise<browser.Windows.Window> {
  return browser.windows.update(windowId, params);
}

export async function getLastFocusedWindow(): Promise<browser.Windows.Window> {
  return browser.windows.getLastFocused();
}

export async function createWindow(params: {
  url: string;
  type: "popup" | "normal";
  width: number;
  height: number;
  left: number;
  top: number;
}): Promise<browser.Windows.Window> {
  return browser.windows.create(params);
}

// ── Buffer window lifecycle ─────────────────────────────────────────────

export async function openOrFocusBufferTab(): Promise<void> {
  const stored = await browser.storage.session.get([
    BUFFER_TAB_ID_KEY,
    BUFFER_WINDOW_ID_KEY,
  ]);
  const existingTabId = stored[BUFFER_TAB_ID_KEY] as number | undefined;
  if (existingTabId !== undefined) {
    try {
      const tab = await getTab(existingTabId);
      if (tab && tab.windowId !== undefined) {
        await updateWindow(tab.windowId, { focused: true });
        await browser.tabs.update(existingTabId, { active: true });
        return;
      }
    } catch {
      await storageSessionRemove([BUFFER_TAB_ID_KEY, BUFFER_WINDOW_ID_KEY]);
    }
  }

  let windowId: number | undefined;
  try {
    const win = await getLastFocusedWindow();
    if (win?.type === "normal") windowId = win.id;
  } catch {
    // The browser chooses the active window if its focused window is unavailable.
  }

  const bufferTab = await browser.tabs.create({
    url: browser.runtime.getURL("buffer.html"),
    active: true,
    ...(windowId === undefined ? {} : { windowId }),
  });

  if (bufferTab.id !== undefined) {
    await storageSessionSet({
      [BUFFER_TAB_ID_KEY]: bufferTab.id,
      [BUFFER_WINDOW_ID_KEY]: bufferTab.windowId,
    });
  }
}

export async function getBufferTabId(): Promise<number | undefined> {
  const stored = await storageSessionGet(BUFFER_TAB_ID_KEY);
  return stored[BUFFER_TAB_ID_KEY] as number | undefined;
}

/**
 * Claim a loaded buffer page before its first snapshot request is handled.
 * The page can send that request before windows.create() has finished
 * persisting its returned tab id, so relying only on openOrFocusBufferTab()
 * leaves a small but real initialization race.
 */
export async function claimBufferTab(tabId: number, windowId?: number): Promise<void> {
  await storageSessionSet({
    [BUFFER_TAB_ID_KEY]: tabId,
    ...(windowId === undefined ? {} : { [BUFFER_WINDOW_ID_KEY]: windowId }),
  });
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
    if (
      tab.id === undefined ||
      tab.windowId === undefined ||
      tab.url === undefined
    )
      continue;

    const url = tab.url;
    const editable = !(
      url.startsWith("about:") ||
      url.startsWith("chrome:") ||
      url === ""
    );
    const favIconUrl =
      tab.favIconUrl &&
      (tab.favIconUrl.startsWith("http") || tab.favIconUrl.startsWith("data:"))
      && (!tab.favIconUrl.startsWith("data:") || tab.favIconUrl.length <= MAX_FAVICON_DATA_URL_LENGTH)
        ? tab.favIconUrl
        : undefined;

    lines.push({
      tabId: tab.id,
      windowId: tab.windowId,
      index: tab.index,
      url,
      title: tab.title ?? "",
      pinned: tab.pinned ?? false,
      discarded: tab.discarded ?? false,
      editable,
      groupId:
        tab.groupId !== undefined && tab.groupId > -1 ? tab.groupId : null,
      favIconUrl,
      incognito: tab.incognito ?? false,
    });
  }

  lines.sort((a, b) => {
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return a.index - b.index;
  });

  const liveTabIds = new Set(lines.map((line) => line.tabId));
  const stored = await storageLocalGet("tabFolderMap");
  const folderMap: Record<number, number> = stored.tabFolderMap ?? {};
  let folderMapChanged = false;
  for (const key of Object.keys(folderMap)) {
    if (!liveTabIds.has(Number(key))) {
      delete folderMap[Number(key)];
      folderMapChanged = true;
    }
  }
  if (folderMapChanged) await storageLocalSet({ tabFolderMap: folderMap });

  return { takenAt: Date.now(), lines };
}

// ── Messaging ───────────────────────────────────────────────────────────

export async function sendMessage(tabId: number, message: any): Promise<void> {
  await browser.tabs.sendMessage(tabId, message);
}
