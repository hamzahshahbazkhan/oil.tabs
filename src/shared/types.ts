export interface BufferLine {
  tabId: number | null;
  windowId: number;
  index: number;
  url: string;
  title: string;
  pinned: boolean;
  discarded: boolean;
  editable: boolean;
}

export type Operation =
  | { kind: "close"; tabId: number }
  | { kind: "move"; tabId: number; windowId: number; index: number };

export interface Snapshot {
  takenAt: number;
  lines: BufferLine[];
}

export interface ParsedLine {
  tabId: number | null;
  windowId: number;
  url: string;
}
