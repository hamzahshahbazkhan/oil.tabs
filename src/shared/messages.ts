import type { Snapshot } from "./types";
import type { SavedItem } from "./storageSchema";

export interface FolderInfo {
  id: number;
  name: string;
}

export type BgToBuffer =
  | { type: "SNAPSHOT"; snapshot: Snapshot; folders?: FolderInfo[]; tabFolderMap?: Record<number, number>; savedItems?: SavedItem[] }
  | { type: "APPLY_RESULT"; ok: boolean; error?: string; snapshot: Snapshot; folders?: FolderInfo[]; tabFolderMap?: Record<number, number>; savedItems?: SavedItem[] }
  | { type: "SNAPSHOT_UPDATED"; snapshot: Snapshot; folders?: FolderInfo[]; tabFolderMap?: Record<number, number>; savedItems?: SavedItem[] }
  | { type: "BUFFER_CONFLICT" };

export type BufferToBg =
  | { type: "REQUEST_SNAPSHOT" }
  | { type: "CLOSE_BUFFER" }
  | { type: "SAVE"; text: string }
  | { type: "FOCUS_TAB"; tabId: number }
  | { type: "DISCARD_TABS"; tabIds: number[] }
  | { type: "RELOAD_TABS"; tabIds: number[] }
  | { type: "TOGGLE_MUTE_TABS"; tabIds: number[] }
  | { type: "BOOKMARK_TABS"; tabIds: number[] }
  | { type: "OPEN_TAB"; url: string }
  | { type: "SET_PINNED_TABS"; tabIds: number[]; pinned: boolean }
  | { type: "DUPLICATE_TABS"; tabIds: number[] }
  | { type: "CLOSE_OTHER_TABS"; tabIds: number[] }
  | { type: "CLOSE_SIDE_TABS"; tabIds: number[]; side: "left" | "right" }
  | { type: "CREATE_WINDOW"; url?: string }
  | { type: "UNDO_SAVE" }
  | { type: "CYCLE_NEXT" }
  | { type: "CYCLE_PREV" };
