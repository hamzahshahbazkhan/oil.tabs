/// <reference types="webextension-polyfill" />
import browser from "webextension-polyfill";
import type { BufferLine, Snapshot } from "../shared/types";

const BUFFER_TAB_ID_KEY = "bufferTabId";

export async function takeSnapshot(): Promise<Snapshot> {
  const { [BUFFER_TAB_ID_KEY]: stored } = await browser.storage.session.get(BUFFER_TAB_ID_KEY);
  const bufferTabId = stored as number | undefined;

  const tabs = await browser.tabs.query({});

  const lines: BufferLine[] = [];

  for (const tab of tabs) {
    if (tab.id !== undefined && tab.id === bufferTabId) continue;
    if (tab.id === undefined || tab.windowId === undefined || tab.url === undefined) continue;

    const url = tab.url;
    const editable = true;

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
    });
  }

  lines.sort((a, b) => {
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return a.index - b.index;
  });

  return { takenAt: Date.now(), lines };
}
