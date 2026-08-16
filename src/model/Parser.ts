import type { ParsedLine } from "../shared/types";

const WINDOW_HEADER_RE = /^Window (\d+) │ (\d+) tabs? ─+$/;
const GROUP_HEADER_RE = /^▸ Group: (\d+)$/;
const FOLDER_HEADER_RE = /^▸ Folder: (.+)$/;
const SAVED_HEADER_RE = /^▸ Saved/;
const RULE_LINE_RE = /─{3,}$/;
const TAB_ID_RE = /^\[\s*\d+\]\s*/;
const HIDDEN_TAB_ID_RE = /^\u2063(\d+)\u2063/;

export function extractTabId(line: string): number | null {
  const hidden = line.match(HIDDEN_TAB_ID_RE);
  if (hidden) return parseInt(hidden[1], 10);
  const match = line.match(/^\[\s*(\d+)\]/);
  return match ? parseInt(match[1], 10) : null;
}

function stripTabId(line: string): string {
  return line.replace(HIDDEN_TAB_ID_RE, "").replace(TAB_ID_RE, "");
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  if (/\s/.test(trimmed)) return trimmed;
  return "https://" + trimmed;
}

export function extractUrl(line: string): string {
  const clean = stripTabId(line);
  const sepIndex = clean.lastIndexOf(" — ");
  const raw = sepIndex === -1 ? clean.trim() : clean.slice(sepIndex + 3).trim();
  return normalizeUrl(raw);
}

export function extractTitle(line: string): string {
  const clean = stripTabId(line);
  const sepIndex = clean.lastIndexOf(" — ");
  if (sepIndex === -1) return "";
  return clean.slice(0, sepIndex).trim();
}

export function parse(
  text: string,
  urlMap: Map<string, number[]>,
  persistedFolders?: Map<string, number>,
): ParsedLine[] {
  const result: ParsedLine[] = [];
  const textLines = text.split("\n");
  let currentWindowId = 0;
  let currentGroupId: number | null = null;
  let currentFolderId: number | null = null;
  let inSavedSection = false;
  const usedTabIds = new Set<number>();

  const validTabIds = new Set<number>();
  for (const ids of urlMap.values()) {
    for (const id of ids) validTabIds.add(id);
  }

  const folders = new Map<string, number>(persistedFolders ?? []);
  let nextFolderId = Math.max(0, ...folders.values()) + 1;

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
        folders.set(name, nextFolderId++);
      }
      currentFolderId = folders.get(name)!;
      currentGroupId = null;
      continue;
    }

    if (line.match(RULE_LINE_RE)) continue;

    if (line.trim() === "") continue;

    const tabIdFromLine = extractTabId(line);
    const url = extractUrl(line);

    let tabId: number | null = null;

    if (tabIdFromLine !== null && validTabIds.has(tabIdFromLine) && !usedTabIds.has(tabIdFromLine)) {
      tabId = tabIdFromLine;
    }

    if (tabId === null) {
      const ids = (urlMap.get(url) ?? []).slice().sort((a, b) => a - b);
      tabId = ids.find(id => !usedTabIds.has(id)) ?? null;
    }

    if (tabId !== null) usedTabIds.add(tabId);

    result.push({ tabId, windowId: currentWindowId, url, groupId: currentGroupId, folderId: currentFolderId, saved: inSavedSection });
  }

  return result;
}
