/// <reference types="webextension-polyfill" />
import browser from "webextension-polyfill";
import type { Operation } from "../shared/types";

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
          });
          break;
        case "navigate":
          await browser.tabs.update(op.tabId, { url: op.url });
          break;
        case "group": {
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
          await browser.tabs.discard(op.tabId);
          break;
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
