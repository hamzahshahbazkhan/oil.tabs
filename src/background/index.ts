import browser from "webextension-polyfill";
import { openOrFocusBufferTab, getBufferTabId, getBufferWindowId } from "./bufferWindow";
import { takeSnapshot } from "./snapshot";
import type { Snapshot } from "../shared/types";
import type { BgToBuffer, BufferToBg } from "../shared/messages";
import type { SavedItem } from "../shared/storageSchema";
import { snapshotToText, parse } from "../buffer/serialize";
import { diff } from "./diff";
import { apply } from "./apply";

let lastSnapshot: Snapshot | null = null;
let currentUrlMap: Map<string, number[]> | null = null;
let previousUrlMap: Map<string, number[]> | null = null;
let lastFolders: { id: number; name: string }[] = [];
let lastTabFolderMap: Record<number, number> = {};
let lastSavedItems: SavedItem[] = [];

async function loadFolderData(): Promise<{ folders: { id: number; name: string }[]; tabFolderMap: Record<number, number> }> {
  const { folders, tabFolderMap } = await browser.storage.local.get(["folders", "tabFolderMap"]);
  return {
    folders: (folders ?? []) as { id: number; name: string }[],
    tabFolderMap: (tabFolderMap ?? {}) as Record<number, number>,
  };
}

async function loadSavedItems(): Promise<SavedItem[]> {
  const { savedForLater } = await browser.storage.local.get("savedForLater");
  return (savedForLater ?? []) as SavedItem[];
}

const MRU_MAX = 50;

async function updateMRU(tabId: number): Promise<void> {
  const { mruTabIds } = await browser.storage.local.get("mruTabIds");
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

  const { mruTabIds } = await browser.storage.local.get("mruTabIds");
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
      await browser.windows.update(tab.windowId, { focused: true });
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

browser.tabs.onUpdated.addListener(() => { sendStaleWarning(); });

browser.windows.onRemoved.addListener(async (windowId) => {
  const bufWinId = await getBufferWindowId();
  if (bufWinId === windowId) {
    await browser.storage.session.remove(["bufferTabId", "bufferWindowId"]);
  }
});

browser.action.onClicked.addListener(async () => {
  await openOrFocusBufferTab();
  const snapshot = await takeSnapshot();
  const { urlMap } = snapshotToText(snapshot);
  lastSnapshot = snapshot;
  currentUrlMap = urlMap;
});

browser.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-tab-buffer") {
    await openOrFocusBufferTab();
    const snapshot = await takeSnapshot();
    const { urlMap } = snapshotToText(snapshot);
    lastSnapshot = snapshot;
    currentUrlMap = urlMap;
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
  async (message: BufferToBg, sender: browser.runtime.MessageSender) => {
    switch (message.type) {
      case "REQUEST_SNAPSHOT": {
        previousUrlMap = currentUrlMap;
        const snapshot = await takeSnapshot();
        const { urlMap } = snapshotToText(snapshot);
        lastSnapshot = snapshot;
        currentUrlMap = urlMap;
        const folderData = await loadFolderData();
        lastFolders = folderData.folders;
        lastTabFolderMap = folderData.tabFolderMap;
        lastSavedItems = await loadSavedItems();
        const response: BgToBuffer = { type: "SNAPSHOT", snapshot, folders: folderData.folders, tabFolderMap: folderData.tabFolderMap, savedItems: lastSavedItems };
        try {
          await browser.tabs.sendMessage(sender.tab!.id!, response);
        } catch {
          // Tab may have closed
        }
        break;
      }

      case "SAVE": {
        previousUrlMap = currentUrlMap;

        const snapshot = await takeSnapshot();
        const { urlMap } = snapshotToText(snapshot);
        lastSnapshot = snapshot;
        currentUrlMap = urlMap;

        const parsed = parse(message.text, currentUrlMap);

        const fallbackTabIds = new Set<number>();
        if (previousUrlMap) {
          const existingIds = new Set(snapshot.lines.map(l => l.tabId));
          const assignedIds = new Set<number>();
          for (const p of parsed) {
            if (p.tabId !== null) assignedIds.add(p.tabId);
          }
          for (const p of parsed) {
            if (p.tabId === null) {
              const prevIds = previousUrlMap.get(p.url) ?? [];
              const prevId = prevIds.find(id => existingIds.has(id) && !assignedIds.has(id));
              if (prevId !== undefined) {
                p.tabId = prevId;
                assignedIds.add(prevId);
                fallbackTabIds.add(prevId);
              }
            }
          }
        }

        const { folders: storedFolders, tabFolderMap: storedTabFolderMap, savedForLater } = await browser.storage.local.get(["folders", "tabFolderMap", "savedForLater"]);
        const folderMap = new Map<number, number | null>();
        if (storedTabFolderMap) {
          for (const [key, val] of Object.entries(storedTabFolderMap as Record<string, number>)) {
            folderMap.set(Number(key), val);
          }
        }
        for (const line of parsed) {
          if (line.tabId !== null && !folderMap.has(line.tabId)) {
            folderMap.set(line.tabId, null);
          }
        }
        const currentSaved = (savedForLater ?? []) as SavedItem[];
        const savedUrls = new Set(currentSaved.map((item: SavedItem) => item.url));
        const ops = diff(lastSnapshot, parsed, folderMap, savedUrls);
        const filteredOps = fallbackTabIds.size > 0
          ? ops.filter(op => !(op.kind === "navigate" && fallbackTabIds.has((op as any).tabId)))
          : ops;
        const result = await apply(filteredOps);
        try {
          await browser.tabs.update(sender.tab!.id!, { active: true });
        } catch {
          // Buffer tab may have closed
        }
        const freshSnapshot = await takeSnapshot();
        const { urlMap: freshUrlMap } = snapshotToText(freshSnapshot);
        lastSnapshot = freshSnapshot;
        currentUrlMap = freshUrlMap;
        const freshFolderData = await loadFolderData();
        lastFolders = freshFolderData.folders;
        lastTabFolderMap = freshFolderData.tabFolderMap;
        lastSavedItems = await loadSavedItems();

        const response: BgToBuffer = {
          type: "APPLY_RESULT",
          ok: result.ok,
          error: result.error,
          snapshot: freshSnapshot,
          folders: freshFolderData.folders,
          tabFolderMap: freshFolderData.tabFolderMap,
          savedItems: lastSavedItems,
        };
        try {
          await browser.tabs.sendMessage(sender.tab!.id!, response);
        } catch {
          // Tab may have closed
        }
        break;
      }

      case "FOCUS_TAB": {
        await browser.tabs.update(message.tabId, { active: true });
        const tab = await browser.tabs.get(message.tabId);
        if (tab.windowId) {
          await browser.windows.update(tab.windowId, { focused: true });
        }
        break;
      }

      case "DISCARD_TABS": {
        for (const tabId of message.tabIds) {
          try {
            await browser.tabs.discard(tabId);
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
