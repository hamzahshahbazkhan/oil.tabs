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
  let currentFolder: number | string = "__unset";
  let currentGroup: number | string = "__unset";
  for (const tab of tabs.slice().sort((a, b) => a.index - b.index)) {
    const folderKey = tabFolderMap && tab.tabId !== null ? tabFolderMap[tab.tabId] ?? "__nofolder" : "__nofolder";
    if (folderKey !== currentFolder) {
      currentFolder = folderKey;
      currentGroup = "__unset";
      if (folderKey !== "__nofolder") {
        const folderName = folderById.get(folderKey as number) ?? `Folder ${folderKey}`;
        lines.push(Section(`Folder: ${folderName}`));
      }
    }

    const groupKey = tab.groupId ?? "__ungrouped";
    if (groupKey !== currentGroup) {
      currentGroup = groupKey;
      if (groupKey !== "__ungrouped") lines.push(Section(`Group: ${groupKey}`));
    }

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
