import browser from "webextension-polyfill";
import { openOrFocusBufferTab, getBufferTabId, getBufferWindowId, takeSnapshot, claimBufferTab, storageSessionRemove, storageSessionGet, storageSessionSet, storageLocalGet, updateWindow, discardTab, createWindow } from "../adapter/BrowserAdapter";
import { parse } from "../model/Parser";
import { formatSnapshot } from "../render/tabs";
import { diff } from "../engine/DiffEngine";
import { plan } from "../engine/Planner";
import { execute, undoLast } from "../engine/Executor";
import { init as initTabModel, getSnapshot, replaceSnapshot, refreshBufferTabId } from "../model/TabModel";
import type { Snapshot } from "../shared/types";
import type { BgToBuffer, BufferToBg, FolderInfo } from "../shared/messages";
import type { SavedItem } from "../shared/storageSchema";

let syncInited = false;
let saveLock = Promise.resolve();

async function withSaveLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const prev = saveLock;
  saveLock = new Promise<void>(resolve => { release = resolve; });
  await prev;
  try {
    return await fn();
  } finally {
    release!();
  }
}

async function loadFolderData(): Promise<{ folders: FolderInfo[]; tabFolderMap: Record<number, number> }> {
  const { folders, tabFolderMap } = await storageLocalGet(["folders", "tabFolderMap"]);
  return {
    folders: (folders ?? []) as FolderInfo[],
    tabFolderMap: (tabFolderMap ?? {}) as Record<number, number>,
  };
}

async function loadSavedItems(): Promise<SavedItem[]> {
  const { savedForLater } = await storageLocalGet("savedForLater");
  return (savedForLater ?? []) as SavedItem[];
}

async function syncBufferSnapshot(bufferTabId: number): Promise<void> {
  const snapshot = await takeSnapshot();
  const folderData = await loadFolderData();
  const savedItems = await loadSavedItems();
  replaceSnapshot(snapshot, folderData.folders, folderData.tabFolderMap, savedItems);
  try {
    await browser.tabs.sendMessage(bufferTabId, {
      type: "SNAPSHOT_UPDATED",
      snapshot,
      folders: folderData.folders,
      tabFolderMap: folderData.tabFolderMap,
      savedItems,
    } satisfies BgToBuffer);
  } catch {
    // The buffer may have been closed during the browser operation.
  }
}

const MRU_MAX = 50;
const ACTIVE_BUFFER_KEY = "activeBufferTabId";

function isTabId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isTabIdList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isTabId);
}

function isBufferMessage(value: unknown): value is BufferToBg {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") return false;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case "REQUEST_SNAPSHOT":
    case "CYCLE_NEXT":
    case "CYCLE_PREV":
    case "UNDO_SAVE":
      return true;
    case "SAVE":
      return typeof message.text === "string";
    case "FOCUS_TAB":
      return isTabId(message.tabId);
    case "DISCARD_TABS":
    case "RELOAD_TABS":
    case "TOGGLE_MUTE_TABS":
    case "BOOKMARK_TABS":
    case "DUPLICATE_TABS":
    case "CLOSE_OTHER_TABS":
      return isTabIdList(message.tabIds);
    case "SET_PINNED_TABS":
      return isTabIdList(message.tabIds) && typeof message.pinned === "boolean";
    case "CLOSE_SIDE_TABS":
      return isTabIdList(message.tabIds) && (message.side === "left" || message.side === "right");
    case "OPEN_TAB":
      return typeof message.url === "string" && message.url.trim().length > 0;
    case "CREATE_WINDOW":
      return message.url === undefined || typeof message.url === "string";
    default:
      return false;
  }
}

async function updateMRU(tabId: number): Promise<void> {
  const { mruTabIds } = await storageLocalGet("mruTabIds");
  let list: number[] = mruTabIds ?? [];
  list = list.filter((id) => id !== tabId);
  list.unshift(tabId);
  if (list.length > MRU_MAX) list = list.slice(0, MRU_MAX);
  await browser.storage.local.set({ mruTabIds: list });
}

async function cycleTab(dir: "next" | "prev"): Promise<void> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const currentId = tabs[0]?.id;
  if (currentId === undefined) return;

  const bufferTabId = await getBufferTabId();
  const { mruTabIds } = await storageLocalGet("mruTabIds");
  const list: number[] = [];
  for (const id of (mruTabIds ?? []) as number[]) {
    if (id === bufferTabId || list.includes(id)) continue;
    try {
      await browser.tabs.get(id);
      list.push(id);
    } catch {
      // Stale tabs are removed from the persisted list below.
    }
  }
  await browser.storage.local.set({ mruTabIds: list.slice(0, MRU_MAX) });
  if (list.length < 2) return;
  const idx = list.indexOf(currentId);
  const step = dir === "next" ? -1 : 1;
  const start = idx === -1 ? (dir === "next" ? 0 : list.length - 1) : idx;
  const targetIdx = (start + step + list.length) % list.length;
  await browser.tabs.update(list[targetIdx], { active: true });
}

async function focusOrOpen(url: string): Promise<void> {
  const tabs = await browser.tabs.query({ url });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await browser.tabs.update(tab.id!, { active: true });
    if (tab.windowId) {
      await updateWindow(tab.windowId, { focused: true });
    }
  } else {
    await browser.tabs.create({ url });
  }
}

browser.tabs.onActivated.addListener((info) => {
  updateMRU(info.tabId);
});

browser.windows.onRemoved.addListener(async (windowId) => {
  const bufWinId = await getBufferWindowId();
  if (bufWinId === windowId) {
    await storageSessionRemove(["bufferTabId", "bufferWindowId"]);
    await refreshBufferTabId();
  }
});

browser.tabs.onRemoved.addListener(async (tabId) => {
  if (await getBufferTabId() !== tabId) return;
  await storageSessionRemove(["bufferTabId", "bufferWindowId"]);
  await refreshBufferTabId();
  const active = await storageSessionGet(ACTIVE_BUFFER_KEY);
  if (active[ACTIVE_BUFFER_KEY] === tabId) await storageSessionRemove(ACTIVE_BUFFER_KEY);
});

browser.action.onClicked.addListener(async () => {
  await openOrFocusBufferTab();
  const snapshot = await takeSnapshot();
  if (!syncInited) {
    await initTabModel(snapshot);
    syncInited = true;
  } else {
    replaceSnapshot(snapshot);
  }
});

browser.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-tab-buffer") {
    await openOrFocusBufferTab();
    const snapshot = await takeSnapshot();
    if (!syncInited) {
      await initTabModel(snapshot);
      syncInited = true;
    } else {
      replaceSnapshot(snapshot);
    }
    return;
  }

  const match = command.match(/^shortcut-(\d)$/);
  if (match) {
    const idx = Number(match[1]);
    const { globalShortcuts } = await browser.storage.sync.get("globalShortcuts");
    const shortcuts = (globalShortcuts ?? []) as { key: string; action: string; url: string }[];
    if (idx < shortcuts.length) {
      const s = shortcuts[idx];
      if (s.action === "cycleNext") await cycleTab("next");
      else if (s.action === "cyclePrev") await cycleTab("prev");
      else if (s.url) await focusOrOpen(s.url);
    }
  }
});

browser.runtime.onMessage.addListener(
  async (message: unknown, sender: browser.Runtime.MessageSender) => {
    if (!isBufferMessage(message)) return;
    try {
      switch (message.type) {
      case "REQUEST_SNAPSHOT": {
        const senderTabId = sender.tab?.id;
        if (senderTabId === undefined) return;
        const active = await storageSessionGet(ACTIVE_BUFFER_KEY);
        const activeTabId = active[ACTIVE_BUFFER_KEY];
        if (typeof activeTabId === "number" && activeTabId !== senderTabId) {
          try {
            await browser.tabs.get(activeTabId);
            await browser.tabs.sendMessage(senderTabId, { type: "BUFFER_CONFLICT" } satisfies BgToBuffer);
            return;
          } catch {
            await storageSessionRemove(ACTIVE_BUFFER_KEY);
          }
        }
        await storageSessionSet({ [ACTIVE_BUFFER_KEY]: senderTabId });
        // Claim the page before takeSnapshot(). A newly-created popup may
        // request data before openOrFocusBufferTab() has persisted its id.
        await claimBufferTab(senderTabId, sender.tab?.windowId);
        await refreshBufferTabId();
        const snapshot = syncInited ? getSnapshot() : await takeSnapshot();
        const folderData = await loadFolderData();
        const savedItems = await loadSavedItems();
        if (!syncInited) {
          await initTabModel(snapshot);
          syncInited = true;
        }
        const response: BgToBuffer = { type: "SNAPSHOT", snapshot, folders: folderData.folders, tabFolderMap: folderData.tabFolderMap, savedItems };
        try {
          await browser.tabs.sendMessage(senderTabId, response);
        } catch {
          // Tab may have closed
        }
        break;
      }

      case "SAVE": {
        if (typeof message.text !== "string" || !sender.tab?.id) return;
        try {
          await withSaveLock(async () => {
          const snapshot = await takeSnapshot();
          const { urlMap } = formatSnapshot(snapshot);

          const storedFolderData = await loadFolderData();
          const folderIds = new Map(storedFolderData.folders.map((folder) => [folder.name, folder.id]));
          const parsed = parse(message.text, urlMap, folderIds);

          const storedData = await storageLocalGet(["folders", "tabFolderMap", "savedForLater"]);
          const storedFolders = (storedData.folders ?? []) as FolderInfo[];
          const storedTabFolderMap = (storedData.tabFolderMap ?? {}) as Record<number, number>;
          const storedSavedForLater = (storedData.savedForLater ?? []) as SavedItem[];

          const folderMap = new Map<number, number | null>();
          for (const [key, val] of Object.entries(storedTabFolderMap)) {
            folderMap.set(Number(key), val);
          }
          for (const line of parsed) {
            if (line.tabId !== null && !folderMap.has(line.tabId)) {
              folderMap.set(line.tabId, null);
            }
          }
          const savedUrls = new Set(storedSavedForLater.map((item: SavedItem) => item.url));
          const ops = diff(snapshot, parsed, folderMap, savedUrls);
          const plannedOps = plan(ops, snapshot);
          const result = await execute(plannedOps, snapshot);
          try {
            await browser.tabs.update(sender.tab!.id!, { active: true });
          } catch {
            // Buffer tab may have closed
          }
          const freshSnapshot = await takeSnapshot();

          const freshFolders: FolderInfo[] = [];
          const freshTabFolderMap: Record<number, number> = {};
          const freshSavedItems: SavedItem[] = [];
          {
            const fd = await storageLocalGet(["folders", "tabFolderMap", "savedForLater"]);
            if (fd.folders) freshFolders.push(...(fd.folders as FolderInfo[]));
            if (fd.tabFolderMap) Object.assign(freshTabFolderMap, fd.tabFolderMap as Record<number, number>);
            if (fd.savedForLater) freshSavedItems.push(...(fd.savedForLater as SavedItem[]));
          }
          replaceSnapshot(freshSnapshot, freshFolders, freshTabFolderMap, freshSavedItems);

          const response: BgToBuffer = {
            type: "APPLY_RESULT",
            ok: result.ok,
            error: "error" in result ? result.error : undefined,
            snapshot: freshSnapshot,
            folders: freshFolders,
            tabFolderMap: freshTabFolderMap,
            savedItems: freshSavedItems,
          };
          try {
            await browser.tabs.sendMessage(sender.tab!.id!, response);
          } catch {
            // Tab may have closed
          }
          });
        } catch (error) {
          const snapshot = await takeSnapshot();
          const response: BgToBuffer = {
            type: "APPLY_RESULT",
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            snapshot,
          };
          try { await browser.tabs.sendMessage(sender.tab.id, response); } catch { /* buffer closed */ }
        }
        break;
      }

      case "FOCUS_TAB": {
        if (!isTabId(message.tabId)) return;
        await browser.tabs.update(message.tabId, { active: true });
        const tab = await browser.tabs.get(message.tabId);
        if (tab.windowId) {
          await updateWindow(tab.windowId, { focused: true });
        }
        break;
      }

      case "DISCARD_TABS": {
        if (!isTabIdList(message.tabIds)) return;
        for (const tabId of message.tabIds) {
          try {
            await discardTab(tabId);
          } catch {
            // Tab may already be discarded or closed
          }
        }
        if (sender.tab?.id) await syncBufferSnapshot(sender.tab.id);
        break;
      }

      case "RELOAD_TABS": {
        if (!isTabIdList(message.tabIds)) return;
        for (const tabId of message.tabIds) {
          try {
            await browser.tabs.reload(tabId);
          } catch {
            // Tab may have been closed
          }
        }
        if (sender.tab?.id) await syncBufferSnapshot(sender.tab.id);
        break;
      }

      case "TOGGLE_MUTE_TABS": {
        if (!isTabIdList(message.tabIds)) return;
        for (const tabId of message.tabIds) {
          try {
            const tab = await browser.tabs.get(tabId);
            await browser.tabs.update(tabId, { muted: !tab.mutedInfo?.muted });
          } catch {
            // Tab may have been closed
          }
        }
        if (sender.tab?.id) await syncBufferSnapshot(sender.tab.id);
        break;
      }

      case "BOOKMARK_TABS": {
        if (!isTabIdList(message.tabIds) || !sender.tab?.id) return;
        await withSaveLock(async () => {
          const snapshot = await takeSnapshot();
          const ops = message.tabIds.flatMap((tabId: number) => {
            const line = snapshot.lines.find((item) => item.tabId === tabId);
            return line ? [{ kind: "bookmark" as const, tabId, url: line.url, title: line.title }] : [];
          });
          const result = await execute(plan(ops, snapshot), snapshot);
          const freshSnapshot = await takeSnapshot();
          replaceSnapshot(freshSnapshot);
          try {
            await browser.tabs.sendMessage(sender.tab!.id!, {
              type: "APPLY_RESULT",
              ok: result.ok,
              error: "error" in result ? result.error : undefined,
              snapshot: freshSnapshot,
            } satisfies BgToBuffer);
          } catch {
            // Buffer may have closed while the operation was running.
          }
        });
        await syncBufferSnapshot(sender.tab.id);
        break;
      }

      case "OPEN_TAB":
        if (typeof message.url !== "string" || !message.url.trim()) return;
        await browser.tabs.create({ url: message.url });
        if (sender.tab?.id) await syncBufferSnapshot(sender.tab.id);
        break;

      case "SET_PINNED_TABS":
        if (!isTabIdList(message.tabIds) || typeof message.pinned !== "boolean") return;
        for (const tabId of message.tabIds) {
          try { await browser.tabs.update(tabId, { pinned: message.pinned }); } catch { /* tab closed */ }
        }
        if (sender.tab?.id) await syncBufferSnapshot(sender.tab.id);
        break;

      case "DUPLICATE_TABS": {
        if (!isTabIdList(message.tabIds)) return;
        for (const tabId of message.tabIds) {
          try {
            const tab = await browser.tabs.get(tabId);
            if (tab.windowId !== undefined) {
              await browser.tabs.create({ windowId: tab.windowId, index: tab.index + 1, url: tab.url, active: false });
            }
          } catch { /* tab closed */ }
        }
        if (sender.tab?.id) await syncBufferSnapshot(sender.tab.id);
        break;
      }

      case "CLOSE_OTHER_TABS": {
        if (!isTabIdList(message.tabIds)) return;
        const keep = new Set(message.tabIds);
        const bufferTabId = await getBufferTabId();
        const selectedTab = await browser.tabs.get(message.tabIds[0]).catch(() => undefined);
        const windowId = selectedTab?.windowId;
        if (windowId === undefined) return;
        const tabs = await browser.tabs.query({ windowId });
        for (const tab of tabs) {
          if (tab.id !== undefined && tab.id !== bufferTabId && !keep.has(tab.id)) {
            try { await browser.tabs.remove(tab.id); } catch { /* tab closed */ }
          }
        }
        if (sender.tab?.id) await syncBufferSnapshot(sender.tab.id);
        break;
      }

      case "CLOSE_SIDE_TABS": {
        if (!isTabIdList(message.tabIds) || (message.side !== "left" && message.side !== "right")) return;
        const selected = new Set(message.tabIds);
        const tabs = await browser.tabs.query({});
        for (const tab of tabs) {
          if (tab.id === undefined || tab.windowId === undefined || selected.has(tab.id)) continue;
          const anchor = tabs.find((candidate) => candidate.id !== undefined && candidate.windowId === tab.windowId && selected.has(candidate.id));
          if (!anchor || (message.side === "left" ? tab.index < anchor.index : tab.index > anchor.index)) continue;
          try { await browser.tabs.remove(tab.id); } catch { /* tab closed */ }
        }
        if (sender.tab?.id) await syncBufferSnapshot(sender.tab.id);
        break;
      }

      case "CREATE_WINDOW":
        await createWindow({ url: message.url?.trim() || "about:blank", type: "normal", width: 1000, height: 800, left: 0, top: 0 });
        if (sender.tab?.id) await syncBufferSnapshot(sender.tab.id);
        break;

      case "UNDO_SAVE": {
        await withSaveLock(async () => {
          const result = await undoLast();
          const snapshot = await takeSnapshot();
          replaceSnapshot(snapshot);
          if (sender.tab?.id) {
            try {
              await browser.tabs.sendMessage(sender.tab.id, {
                type: "APPLY_RESULT",
                ok: result.ok,
                error: "error" in result ? result.error : undefined,
                snapshot,
              } satisfies BgToBuffer);
            } catch { /* buffer closed */ }
          }
        });
        break;
      }

      case "CYCLE_NEXT":
        await cycleTab("next");
        break;

      case "CYCLE_PREV":
        await cycleTab("prev");
        break;
      }
    } catch (error) {
      if (sender.tab?.id) {
        try {
          await browser.tabs.sendMessage(sender.tab.id, {
            type: "APPLY_RESULT",
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            snapshot: await takeSnapshot(),
          } satisfies BgToBuffer);
        } catch {
          // The buffer may have closed while reporting the error.
        }
      }
    }
  },
);
