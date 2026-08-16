export interface BufferLine {
  tabId: number | null;
  windowId: number;
  index: number;
  url: string;
  title: string;
  pinned: boolean;
  discarded: boolean;
  editable: boolean;
  groupId: number | null;
  favIconUrl?: string;
}

export type Operation =
  | { kind: "close"; tabId: number }
  | { kind: "move"; tabId: number; windowId: number; index: number }
  | { kind: "create"; url: string; windowId: number; index: number }
  | { kind: "navigate"; tabId: number; url: string }
  | { kind: "group"; tabId: number; groupId: number | "NEW" | "NONE" }
  | { kind: "assignFolder"; tabId: number; folderId: number | null }
  | { kind: "discard"; tabId: number }
  | { kind: "saveForLater"; tabId: number | null; url: string; title: string }
  | { kind: "deleteSaved"; url: string }
  | { kind: "bookmark"; tabId: number; url: string; title: string }
  | { kind: "restoreFromSaved"; url: string; title: string; windowId: number; index: number };

export interface Snapshot {
  takenAt: number;
  lines: BufferLine[];
}

export interface ParsedLine {
  tabId: number | null;
  windowId: number;
  url: string;
  groupId: number | null;
  folderId: number | null;
  saved: boolean;
}
