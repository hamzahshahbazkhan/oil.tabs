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
          throw new Error("create not yet implemented");
        case "navigate":
          throw new Error("navigate not yet implemented");
        default: {
          const _exhaustive: never = op;
          throw new Error(`Unknown operation kind: ${(_exhaustive as any).kind}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Failed to ${op.kind} tab ${op.tabId}: ${msg}`,
      };
    }
  }
  return { ok: true };
}
