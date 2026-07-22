import type { Snapshot, ParsedLine } from "../shared/types";

const WINDOW_HEADER_RE = /^── Window (\d+) · (\d+) tabs? ──$/;
const GROUP_HEADER_RE = /^▸ Group: (\d+)$/;

export function snapshotToText(snapshot: Snapshot): {
  text: string;
  idMap: Map<number, number>;
  urlMap: Map<string, number>;
  nonEditableLines: Set<number>;
} {
  const idMap = new Map<number, number>();
  const urlMap = new Map<string, number>();
  const nonEditableLines = new Set<number>();
  const lines: string[] = [];

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

    const groups = new Map<number | string, typeof tabs>();
    for (const tab of tabs) {
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
        lines.push(`${tab.title} — ${tab.url}`);
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

    lines.push("");
    lineNum++;
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

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i];
    const headerMatch = line.match(WINDOW_HEADER_RE);
    if (headerMatch) {
      currentWindowId = parseInt(headerMatch[1], 10);
      currentGroupId = null;
      continue;
    }

    const groupHeaderMatch = line.match(GROUP_HEADER_RE);
    if (groupHeaderMatch) {
      currentGroupId = Number(groupHeaderMatch[1]);
      continue;
    }

    if (line.trim() === "") continue;

    const url = extractUrl(line);
    const tabId = urlMap.get(url) ?? null;

    result.push({ tabId, windowId: currentWindowId, url, groupId: currentGroupId });
  }

  return result;
}

export function extractUrl(line: string): string {
  const sepIndex = line.indexOf(" — ");
  if (sepIndex === -1) return line.trim();
  return line.slice(sepIndex + 3).trim();
}
