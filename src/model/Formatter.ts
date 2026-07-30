import type { Snapshot } from "../shared/types";
import type { SavedItem } from "../shared/storageSchema";

export interface FormattedSnapshot {
  text: string;
  idMap: Map<number, number>;
  urlMap: Map<string, number[]>;
  nonEditableLines: Set<number>;
  faviconMap: Map<number, string>;
  lineUrlMap: Map<number, string>;
}

export function formatSnapshot(
  snapshot: Snapshot,
  folders?: { id: number; name: string }[],
  tabFolderMap?: Record<number, number>,
  savedItems?: SavedItem[],
): FormattedSnapshot {
  const idMap = new Map<number, number>();
  const urlMap = new Map<string, number[]>();
  const nonEditableLines = new Set<number>();
  const faviconMap = new Map<number, string>();
  const lineUrlMap = new Map<number, string>();
  const lines: string[] = [];

  const folderById = new Map<number, string>();
  if (folders) {
    for (const f of folders) folderById.set(f.id, f.name);
  }

  const windowGroups = new Map<number, typeof snapshot.lines>();
  for (const tab of snapshot.lines) {
    const group = windowGroups.get(tab.windowId);
    if (group) {
      group.push(tab);
    } else {
      windowGroups.set(tab.windowId, [tab]);
    }
  }

  const sortedWindowIds = [...windowGroups.keys()].sort((a, b) => a - b);

  let lineNum = 0;

  for (const windowId of sortedWindowIds) {
    const tabs = windowGroups.get(windowId)!;
    lines.push(`── Window ${windowId} · ${tabs.length} ${tabs.length === 1 ? "tab" : "tabs"} ──`);
    lineNum++;

    const folderGroups = new Map<number | string, typeof tabs>();
    for (const tab of tabs) {
      const folderKey = tabFolderMap && tab.tabId !== null ? tabFolderMap[tab.tabId] ?? "__nofolder" : "__nofolder";
      const group = folderGroups.get(folderKey);
      if (group) {
        group.push(tab);
      } else {
        folderGroups.set(folderKey, [tab]);
      }
    }

    const folderKeys = [...folderGroups.keys()].sort((a, b) => {
      if (a === "__nofolder") return 1;
      if (b === "__nofolder") return -1;
      return (a as number) - (b as number);
    });

    for (const folderKey of folderKeys) {
      const folderTabs = folderGroups.get(folderKey)!;
      if (folderKey !== "__nofolder") {
        const folderName = folderById.get(folderKey as number) ?? `Folder ${folderKey}`;
        lines.push(`▸ Folder: ${folderName}`);
        lineNum++;
      }

      const groups = new Map<number | string, typeof folderTabs>();
      for (const tab of folderTabs) {
        const key = tab.groupId ?? "__ungrouped";
        const group = groups.get(key);
        if (group) {
          group.push(tab);
        } else {
          groups.set(key, [tab]);
        }
      }

      const groupKeys = [...groups.keys()].sort((a, b) => {
        if (a === "__ungrouped") return 1;
        if (b === "__ungrouped") return -1;
        return (a as number) - (b as number);
      });

      for (const key of groupKeys) {
        const groupTabs = groups.get(key)!;
        if (key !== "__ungrouped") {
          lines.push(`▸ Group: ${key}`);
          lineNum++;
        }

        for (const tab of groupTabs) {
          const title = tab.discarded ? `[sleep] ${tab.title}` : tab.title;
          const tabTag = tab.tabId !== null ? `[${tab.tabId}] ` : "";
          lines.push(`${tabTag}${title} — ${tab.url}`);
          lineNum++;
          if (tab.tabId !== null) {
            idMap.set(lineNum, tab.tabId);
            const ids = urlMap.get(tab.url) ?? [];
            ids.push(tab.tabId);
            ids.sort((a, b) => a - b);
            urlMap.set(tab.url, ids);
          }
          if (!tab.editable) {
            nonEditableLines.add(lineNum);
          }
          if (tab.favIconUrl) {
            faviconMap.set(lineNum, tab.favIconUrl);
          }
          lineUrlMap.set(lineNum, tab.url);
        }
      }
    }

    lines.push("");
    lineNum++;
  }

  if (savedItems && savedItems.length > 0) {
    if (lines[lines.length - 1] !== "") {
      lines.push("");
      lineNum++;
    }
    lines.push(`── Saved For Later · ${savedItems.length} ${savedItems.length === 1 ? "item" : "items"} ──`);
    lineNum++;
    for (const item of savedItems) {
      lines.push(`${item.title} — ${item.url}`);
      lineNum++;
    }
  }

  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return { text: lines.join("\n"), idMap, urlMap, nonEditableLines, faviconMap, lineUrlMap };
}
