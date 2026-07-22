import browser from "webextension-polyfill";
import { openOrFocusBufferTab, getBufferTabId } from "./bufferWindow";
import { takeSnapshot } from "./snapshot";
import type { Snapshot } from "../shared/types";
import type { BgToBuffer, BufferToBg } from "../shared/messages";
import { snapshotToText, parse } from "../buffer/serialize";
import { diff } from "./diff";
import { apply } from "./apply";

let lastSnapshot: Snapshot | null = null;
let currentUrlMap: Map<string, number> | null = null;
let lastFolders: { id: number; name: string }[] = [];
let lastTabFolderMap: Record<number, number> = {};

async function loadFolderData(): Promise<{ folders: { id: number; name: string }[]; tabFolderMap: Record<number, number> }> {
  const { folders, tabFolderMap } = await browser.storage.local.get(["folders", "tabFolderMap"]);
  return {
    folders: (folders ?? []) as { id: number; name: string }[],
    tabFolderMap: (tabFolderMap ?? {}) as Record<number, number>,
  };
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

browser.tabs.onRemoved.addListener(() => { sendStaleWarning(); });
browser.tabs.onCreated.addListener(() => { sendStaleWarning(); });
browser.tabs.onMoved.addListener(() => { sendStaleWarning(); });
browser.tabs.onUpdated.addListener(() => { sendStaleWarning(); });

browser.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-tab-buffer") {
    await openOrFocusBufferTab();
    const snapshot = await takeSnapshot();
    const { urlMap } = snapshotToText(snapshot);
    lastSnapshot = snapshot;
    currentUrlMap = urlMap;
  }
});

browser.runtime.onMessage.addListener(
  async (message: BufferToBg, sender: browser.runtime.MessageSender) => {
    switch (message.type) {
      case "REQUEST_SNAPSHOT": {
        const snapshot = await takeSnapshot();
        const { urlMap } = snapshotToText(snapshot);
        lastSnapshot = snapshot;
        currentUrlMap = urlMap;
        const folderData = await loadFolderData();
        lastFolders = folderData.folders;
        lastTabFolderMap = folderData.tabFolderMap;
        const response: BgToBuffer = { type: "SNAPSHOT", snapshot, folders: folderData.folders, tabFolderMap: folderData.tabFolderMap };
        try {
          await browser.tabs.sendMessage(sender.tab!.id!, response);
        } catch {
          // Tab may have closed
        }
        break;
      }

      case "SAVE": {
        if (!lastSnapshot || !currentUrlMap) {
          const snapshot = await takeSnapshot();
          const { urlMap } = snapshotToText(snapshot);
          lastSnapshot = snapshot;
          currentUrlMap = urlMap;
        }

        const parsed = parse(message.text, currentUrlMap);
        const { folders: storedFolders, tabFolderMap: storedTabFolderMap } = await browser.storage.local.get(["folders", "tabFolderMap"]);
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
        const ops = diff(lastSnapshot, parsed, folderMap);
        const result = await apply(ops);
        const freshSnapshot = await takeSnapshot();
        const { urlMap: freshUrlMap } = snapshotToText(freshSnapshot);
        lastSnapshot = freshSnapshot;
        currentUrlMap = freshUrlMap;
        const freshFolderData = await loadFolderData();
        lastFolders = freshFolderData.folders;
        lastTabFolderMap = freshFolderData.tabFolderMap;

        const response: BgToBuffer = {
          type: "APPLY_RESULT",
          ok: result.ok,
          error: result.error,
          snapshot: freshSnapshot,
          folders: freshFolderData.folders,
          tabFolderMap: freshFolderData.tabFolderMap,
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
    }
  },
);
