import type { Snapshot } from "./types";

export type BgToBuffer =
  | { type: "SNAPSHOT"; snapshot: Snapshot }
  | { type: "APPLY_RESULT"; ok: boolean; error?: string; snapshot: Snapshot }
  | { type: "STALE_WARNING" };

export type BufferToBg =
  | { type: "REQUEST_SNAPSHOT" }
  | { type: "SAVE"; text: string }
  | { type: "FOCUS_TAB"; tabId: number }
  | { type: "DISCARD" };
