import type { Snapshot } from "./types";
import type { SavedItem } from "./storageSchema";

export interface FolderInfo {
  id: number;
  name: string;
}

export type BgToBuffer =
  | { type: "SNAPSHOT"; snapshot: Snapshot; folders?: FolderInfo[]; tabFolderMap?: Record<number, number>; savedItems?: SavedItem[] }
  | { type: "APPLY_RESULT"; ok: boolean; error?: string; snapshot: Snapshot; folders?: FolderInfo[]; tabFolderMap?: Record<number, number>; savedItems?: SavedItem[] }
  | { type: "STALE_WARNING" }
  | { type: "SNAPSHOT_UPDATED"; snapshot: Snapshot; folders?: FolderInfo[]; tabFolderMap?: Record<number, number>; savedItems?: SavedItem[] };

export type BufferToBg =
  | { type: "REQUEST_SNAPSHOT" }
  | { type: "SAVE"; text: string }
  | { type: "FOCUS_TAB"; tabId: number }
  | { type: "DISCARD_TABS"; tabIds: number[] }
  | { type: "RELOAD_TABS"; tabIds: number[] }
  | { type: "TOGGLE_MUTE_TABS"; tabIds: number[] }
  | { type: "BOOKMARK_TABS"; tabIds: number[] }
  | { type: "OPEN_TAB"; url: string }
  | { type: "CYCLE_NEXT" }
  | { type: "CYCLE_PREV" };
