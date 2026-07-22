import type { Snapshot, ParsedLine } from "../shared/types";
import type { SavedItem } from "../shared/storageSchema";

const WINDOW_HEADER_RE = /^── Window (\d+) · (\d+) tabs? ──$/;
const GROUP_HEADER_RE = /^▸ Group: (\d+)$/;
const FOLDER_HEADER_RE = /^▸ Folder: (.+)$/;
const SAVED_HEADER_RE = /^── Saved For Later · (\d+) items? ──$/;

export function snapshotToText(
  snapshot: Snapshot,
  folders?: { id: number; name: string }[],
  tabFolderMap?: Record<number, number>,
  savedItems?: SavedItem[],
): {
  text: string;
  idMap: Map<number, number>;
  urlMap: Map<string, number>;
  nonEditableLines: Set<number>;
} {
  const idMap = new Map<number, number>();
  const urlMap = new Map<string, number>();
  const nonEditableLines = new Set<number>();
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
          lines.push(`${title} — ${tab.url}`);
          if (tab.tabId !== null) {
            idMap.set(lineNum, tab.tabId);
            urlMap.set(tab.url, tab.tabId);
          }
          if (!tab.editable) {
            nonEditableLines.add(lineNum);
          }
          lineNum++;
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

  return { text: lines.join("\n"), idMap, urlMap, nonEditableLines };
}

export function parse(text: string, urlMap: Map<string, number>): ParsedLine[] {
  const result: ParsedLine[] = [];
  const textLines = text.split("\n");
  let currentWindowId = 0;
  let currentGroupId: number | null = null;
  let currentFolderId: number | null = null;
  let inSavedSection = false;
  const seenUrl = new Set<string>();

  const folders = new Map<string, number>();

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i];

    if (line.match(SAVED_HEADER_RE)) {
      inSavedSection = true;
      currentWindowId = 0;
      currentGroupId = null;
      currentFolderId = null;
      continue;
    }

    const headerMatch = line.match(WINDOW_HEADER_RE);
    if (headerMatch) {
      currentWindowId = parseInt(headerMatch[1], 10);
      currentGroupId = null;
      currentFolderId = null;
      inSavedSection = false;
      continue;
    }

    const groupHeaderMatch = line.match(GROUP_HEADER_RE);
    if (groupHeaderMatch) {
      currentGroupId = Number(groupHeaderMatch[1]);
      continue;
    }

    const folderHeaderMatch = line.match(FOLDER_HEADER_RE);
    if (folderHeaderMatch) {
      const name = folderHeaderMatch[1].trim();
      if (!folders.has(name)) {
        folders.set(name, folders.size + 1);
      }
      currentFolderId = folders.get(name)!;
      currentGroupId = null;
      continue;
    }

    if (line.trim() === "") continue;

    const url = extractUrl(line);
    let tabId = urlMap.get(url) ?? null;
    if (tabId !== null) {
      if (seenUrl.has(url)) {
        tabId = null;
      } else {
        seenUrl.add(url);
      }
    }

    result.push({ tabId, windowId: currentWindowId, url, groupId: currentGroupId, folderId: currentFolderId, saved: inSavedSection });
  }

  return result;
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed;
  if (/\s/.test(trimmed)) return trimmed;
  return "https://" + trimmed;
}

export function extractUrl(line: string): string {
  const sepIndex = line.lastIndexOf(" — ");
  const raw = sepIndex === -1 ? line.trim() : line.slice(sepIndex + 3).trim();
  return normalizeUrl(raw);
}

export function extractTitle(line: string): string {
  const sepIndex = line.lastIndexOf(" — ");
  if (sepIndex === -1) return "";
  return line.slice(0, sepIndex).trim();
}
