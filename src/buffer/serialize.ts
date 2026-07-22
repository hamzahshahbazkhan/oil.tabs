import type { Snapshot, ParsedLine } from "../shared/types";

const WINDOW_HEADER_RE = /^── Window (\d+) · (\d+) tabs? ──$/;

export function snapshotToText(snapshot: Snapshot): {
  text: string;
  idMap: Map<number, number>;
  urlMap: Map<string, number>;
} {
  const idMap = new Map<number, number>();
  const urlMap = new Map<string, number>();
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

    for (const tab of tabs) {
      lines.push(`${tab.title} — ${tab.url}`);
      if (tab.tabId !== null) {
        idMap.set(lineNum, tab.tabId);
        urlMap.set(tab.url, tab.tabId);
      }
      lineNum++;
    }

    lines.push("");
    lineNum++;
  }

  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return { text: lines.join("\n"), idMap, urlMap };
}

export function parse(text: string, urlMap: Map<string, number>): ParsedLine[] {
  const result: ParsedLine[] = [];
  const textLines = text.split("\n");
  let currentWindowId = 0;

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i];
    const headerMatch = line.match(WINDOW_HEADER_RE);
    if (headerMatch) {
      currentWindowId = parseInt(headerMatch[1], 10);
      continue;
    }

    if (line.trim() === "") continue;

    const url = extractUrl(line);
    const tabId = urlMap.get(url) ?? null;

    result.push({ tabId, windowId: currentWindowId, url });
  }

  return result;
}

export function extractUrl(line: string): string {
  const sepIndex = line.indexOf(" — ");
  if (sepIndex === -1) return line.trim();
  return line.slice(sepIndex + 3).trim();
}
