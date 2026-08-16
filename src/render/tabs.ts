import type { Snapshot, BufferLine } from "../shared/types";
import type { SavedItem } from "../shared/storageSchema";
import {
  Divider,
  Header,
  Section,
  TabRow,
  type RenderedLine,
} from "./primitives";
import { composeDocument, type RenderedDocument } from "./document";

function pushTabRows(
  lines: RenderedLine[],
  tabs: BufferLine[],
  folderById: Map<number, string>,
  tabFolderMap?: Record<number, number>,
): void {
  const firstIndex = (group: BufferLine[]): number => Math.min(...group.map((tab) => tab.index));
  const folderGroups = new Map<number | string, BufferLine[]>();
  for (const tab of tabs) {
    const folderKey = tabFolderMap && tab.tabId !== null ? tabFolderMap[tab.tabId] ?? "__nofolder" : "__nofolder";
    const group = folderGroups.get(folderKey);
    if (group) {
      group.push(tab);
    } else {
      folderGroups.set(folderKey, [tab]);
    }
  }

  const folderKeys = [...folderGroups.keys()].sort((a, b) =>
    firstIndex(folderGroups.get(a)!) - firstIndex(folderGroups.get(b)!),
  );

  for (const folderKey of folderKeys) {
    const folderTabs = folderGroups.get(folderKey)!;
    if (folderKey !== "__nofolder") {
      const folderName = folderById.get(folderKey as number) ?? `Folder ${folderKey}`;
      lines.push(Section(`Folder: ${folderName}`));
    }

    const groups = new Map<number | string, BufferLine[]>();
    for (const tab of folderTabs) {
      const key = tab.groupId ?? "__ungrouped";
      const group = groups.get(key);
      if (group) {
        group.push(tab);
      } else {
        groups.set(key, [tab]);
      }
    }

    const groupKeys = [...groups.keys()].sort((a, b) =>
      firstIndex(groups.get(a)!) - firstIndex(groups.get(b)!),
    );

    for (const key of groupKeys) {
      const groupTabs = groups.get(key)!;
      if (key !== "__ungrouped") {
        lines.push(Section(`Group: ${key}`));
      }

      for (const tab of groupTabs) {
        lines.push(TabRow({
          tabId: tab.tabId,
          title: tab.title,
          url: tab.url,
          discarded: tab.discarded,
          editable: tab.editable,
          favIconUrl: tab.favIconUrl,
        }));
      }
    }
  }
}

export function formatSnapshot(
  snapshot: Snapshot,
  folders?: { id: number; name: string }[],
  tabFolderMap?: Record<number, number>,
  savedItems?: SavedItem[],
): RenderedDocument {
  const folderById = new Map<number, string>();
  if (folders) {
    for (const f of folders) folderById.set(f.id, f.name);
  }

  const windowGroups = new Map<number, BufferLine[]>();
  for (const tab of snapshot.lines) {
    const group = windowGroups.get(tab.windowId);
    if (group) {
      group.push(tab);
    } else {
      windowGroups.set(tab.windowId, [tab]);
    }
  }

  const sortedWindowIds = [...windowGroups.keys()].sort((a, b) => a - b);

  const lines: RenderedLine[] = [];

  for (const windowId of sortedWindowIds) {
    const tabs = windowGroups.get(windowId)!;
    lines.push(Header(`Window ${windowId}`, `${tabs.length} ${tabs.length === 1 ? "tab" : "tabs"}`));

    pushTabRows(lines, tabs, folderById, tabFolderMap);

    lines.push(Divider());
  }

  if (savedItems && savedItems.length > 0) {
    if (lines.length === 0 || (lines[lines.length - 1].text !== "" && lines[lines.length - 1].kind !== "divider")) {
      lines.push(Divider());
    }
    lines.push(Section(`Saved · ${savedItems.length} ${savedItems.length === 1 ? "item" : "items"}`));
    for (const item of savedItems) {
      lines.push(TabRow({ tabId: null, title: item.title, url: item.url }));
    }
  }

  return composeDocument(lines);
}
