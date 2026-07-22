/// <reference types="webextension-polyfill" />
import browser from "webextension-polyfill";
import type { Operation } from "../shared/types";

const hasTabGroups = typeof (browser.tabs as any).group === "function";
const hasDiscard = typeof (browser.tabs as any).discard === "function";
const hasBookmarks = typeof (browser as any).bookmarks?.create === "function";

export async function apply(
  ops: Operation[],
): Promise<{ ok: boolean; error?: string }> {
  for (const op of ops) {
    try {
      switch (op.kind) {
        case "close":
          await browser.tabs.remove(op.tabId);
          break;
        case "move":
          await browser.tabs.move(op.tabId, {
            windowId: op.windowId,
            index: op.index,
          });
          break;
        case "create":
          await browser.tabs.create({
            windowId: op.windowId,
            url: op.url,
            index: op.index,
            active: false,
          });
          break;
        case "navigate":
          await browser.tabs.update(op.tabId, { url: op.url });
          break;
        case "group": {
          if (!hasTabGroups) break;
          if (op.groupId === "NONE") {
            await browser.tabs.group({ tabIds: [op.tabId], groupId: -1 });
          } else if (op.groupId === "NEW") {
            await browser.tabs.group({ tabIds: [op.tabId] });
          } else {
            await browser.tabs.group({ tabIds: [op.tabId], groupId: op.groupId });
          }
          break;
        }
        case "assignFolder": {
          const { tabFolderMap } = await browser.storage.local.get("tabFolderMap");
          const map: Record<number, number> = tabFolderMap ?? {};
          if (op.folderId === null) {
            delete map[op.tabId];
          } else {
            map[op.tabId] = op.folderId;
          }
          await browser.storage.local.set({ tabFolderMap: map });
          break;
        }
        case "discard":
          if (!hasDiscard) break;
          await browser.tabs.discard(op.tabId);
          break;
        case "saveForLater": {
          const { savedForLater } = await browser.storage.local.get("savedForLater");
          const list: { url: string; title: string; savedAt: number }[] = savedForLater ?? [];
          list.push({ url: op.url, title: op.title, savedAt: Date.now() });
          await browser.storage.local.set({ savedForLater: list });
          if (op.tabId > 0) {
            await browser.tabs.remove(op.tabId);
          }
          break;
        }
        case "bookmark":
          if (!hasBookmarks) break;
          await browser.bookmarks.create({ title: op.title, url: op.url });
          await browser.tabs.remove(op.tabId);
          break;
        case "restoreFromSaved": {
          await browser.tabs.create({ url: op.url, windowId: op.windowId, index: op.index });
          const { savedForLater } = await browser.storage.local.get("savedForLater");
          const list: { url: string; title: string; savedAt: number }[] = savedForLater ?? [];
          const idx = list.findIndex((item) => item.url === op.url);
          if (idx !== -1) list.splice(idx, 1);
          await browser.storage.local.set({ savedForLater: list });
          break;
        }
        default: {
          const _exhaustive: never = op;
          throw new Error(`Unknown operation kind: ${(_exhaustive as any).kind}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const tabId = op.kind === "create" ? "new" : String(op.tabId);
      return {
        ok: false,
        error: `Failed to ${op.kind} tab ${tabId}: ${msg}`,
      };
    }
  }
  return { ok: true };
}
