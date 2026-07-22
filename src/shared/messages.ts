import type { Snapshot } from "./types";

export interface FolderInfo {
  id: number;
  name: string;
}

export type BgToBuffer =
  | { type: "SNAPSHOT"; snapshot: Snapshot; folders?: FolderInfo[]; tabFolderMap?: Record<number, number> }
  | { type: "APPLY_RESULT"; ok: boolean; error?: string; snapshot: Snapshot; folders?: FolderInfo[]; tabFolderMap?: Record<number, number> }
  | { type: "STALE_WARNING" };

export type BufferToBg =
  | { type: "REQUEST_SNAPSHOT" }
  | { type: "SAVE"; text: string }
  | { type: "FOCUS_TAB"; tabId: number }
  | { type: "DISCARD_TABS"; tabIds: number[] };
