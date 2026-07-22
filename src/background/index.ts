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
        const response: BgToBuffer = { type: "SNAPSHOT", snapshot };
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
        const ops = diff(lastSnapshot, parsed);
        const result = await apply(ops);
        const freshSnapshot = await takeSnapshot();
        const { urlMap: freshUrlMap } = snapshotToText(freshSnapshot);
        lastSnapshot = freshSnapshot;
        currentUrlMap = freshUrlMap;

        const response: BgToBuffer = {
          type: "APPLY_RESULT",
          ok: result.ok,
          error: result.error,
          snapshot: freshSnapshot,
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

      case "DISCARD": {
        break;
      }
    }
  },
);
