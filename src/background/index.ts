import browser from "webextension-polyfill";
import { openOrFocusBufferTab, getBufferTabId, getBufferWindowId, takeSnapshot, storageSessionRemove, storageLocalGet, updateWindow, discardTab } from "../adapter/BrowserAdapter";
import { parse } from "../model/Parser";
import { formatSnapshot } from "../render/tabs";
import { diff } from "../engine/DiffEngine";
import { plan } from "../engine/Planner";
import { execute } from "../engine/Executor";
import { init as initTabModel, getSnapshot, replaceSnapshot, refreshBufferTabId } from "../model/TabModel";
import type { Snapshot } from "../shared/types";
import type { BgToBuffer, FolderInfo } from "../shared/messages";
import type { SavedItem } from "../shared/storageSchema";

let syncInited = false;
let currentUrlMap: Map<string, number[]> | null = null;

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

const MRU_MAX = 50;

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

  const { mruTabIds } = await storageLocalGet("mruTabIds");
  const list: number[] = mruTabIds ?? [];
  const idx = list.indexOf(currentId);
  if (idx === -1) return;

  const step = dir === "next" ? -1 : 1;
  let targetIdx = (idx + step + list.length) % list.length;
  let attempts = 0;
  while (attempts < list.length) {
    const targetId = list[targetIdx];
    if (targetId !== currentId) {
      try {
        await browser.tabs.update(targetId, { active: true });
        return;
      } catch {
        list.splice(targetIdx, 1);
        if (targetIdx <= idx) break;
      }
    }
    targetIdx = (targetIdx + step + list.length) % list.length;
    attempts++;
  }
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

async function sendStaleWarning(): Promise<void> {
  const tabId = await getBufferTabId();
  if (tabId === undefined) return;
  try {
    await browser.tabs.sendMessage(tabId, { type: "STALE_WARNING" });
  } catch {
    // Buffer tab may not be open
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

browser.action.onClicked.addListener(async () => {
  await openOrFocusBufferTab();
  const snapshot = await takeSnapshot();
  const { urlMap } = formatSnapshot(snapshot);
  currentUrlMap = urlMap;
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
    const { urlMap } = formatSnapshot(snapshot);
    currentUrlMap = urlMap;
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
    const shortcuts: { key: string; action: string; url: string }[] = globalShortcuts ?? [];
    if (idx < shortcuts.length) {
      const s = shortcuts[idx];
      if (s.action === "cycleNext") await cycleTab("next");
      else if (s.action === "cyclePrev") await cycleTab("prev");
      else if (s.url) await focusOrOpen(s.url);
    }
  }
});

browser.runtime.onMessage.addListener(
  async (message: any, sender: browser.runtime.MessageSender) => {
    switch (message.type) {
      case "REQUEST_SNAPSHOT": {
        const snapshot = syncInited ? getSnapshot() : await takeSnapshot();
        const { urlMap } = formatSnapshot(snapshot);
        const folderData = await loadFolderData();
        const savedItems = await loadSavedItems();
        currentUrlMap = urlMap;
        if (!syncInited) {
          await initTabModel(snapshot);
          syncInited = true;
        }
        const response: BgToBuffer = { type: "SNAPSHOT", snapshot, folders: folderData.folders, tabFolderMap: folderData.tabFolderMap, savedItems };
        try {
          await browser.tabs.sendMessage(sender.tab!.id!, response);
        } catch {
          // Tab may have closed
        }
        break;
      }

      case "SAVE": {
        await withSaveLock(async () => {
          const snapshot = await takeSnapshot();
          const { urlMap } = formatSnapshot(snapshot);

          const parsed = parse(message.text, urlMap);

          const fallbackTabIds = new Set<number>();
          if (currentUrlMap) {
            const existingIds = new Set(snapshot.lines.map(l => l.tabId));
            const assignedIds = new Set<number>();
            for (const p of parsed) {
              if (p.tabId !== null) assignedIds.add(p.tabId);
            }
            for (const p of parsed) {
              if (p.tabId === null) {
                const prevIds = (currentUrlMap.get(p.url) ?? []).slice().sort((a, b) => a - b);
                const prevId = prevIds.find(id => existingIds.has(id) && !assignedIds.has(id));
                if (prevId !== undefined) {
                  p.tabId = prevId;
                  assignedIds.add(prevId);
                  fallbackTabIds.add(prevId);
                }
              }
            }
          }

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
          const filteredOps = fallbackTabIds.size > 0
            ? ops.filter(op => !(op.kind === "navigate" && fallbackTabIds.has((op as any).tabId)))
            : ops;
          const plannedOps = plan(filteredOps, snapshot);
          const result = await execute(plannedOps, snapshot);
          try {
            await browser.tabs.update(sender.tab!.id!, { active: true });
          } catch {
            // Buffer tab may have closed
          }
          const freshSnapshot = await takeSnapshot();
          const { urlMap: freshUrlMap } = formatSnapshot(freshSnapshot);
          currentUrlMap = freshUrlMap;

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
        break;
      }

      case "FOCUS_TAB": {
        await browser.tabs.update(message.tabId, { active: true });
        const tab = await browser.tabs.get(message.tabId);
        if (tab.windowId) {
          await updateWindow(tab.windowId, { focused: true });
        }
        break;
      }

      case "DISCARD_TABS": {
        for (const tabId of message.tabIds) {
          try {
            await discardTab(tabId);
          } catch {
            // Tab may already be discarded or closed
          }
        }
        break;
      }

      case "RELOAD_TABS": {
        for (const tabId of message.tabIds) {
          try {
            await browser.tabs.reload(tabId);
          } catch {
            // Tab may have been closed
          }
        }
        break;
      }

      case "TOGGLE_MUTE_TABS": {
        for (const tabId of message.tabIds) {
          try {
            const tab = await browser.tabs.get(tabId);
            await browser.tabs.update(tabId, { muted: !tab.mutedInfo?.muted });
          } catch {
            // Tab may have been closed
          }
        }
        break;
      }

      case "CYCLE_NEXT":
        await cycleTab("next");
        break;

      case "CYCLE_PREV":
        await cycleTab("prev");
        break;
    }
  },
);
