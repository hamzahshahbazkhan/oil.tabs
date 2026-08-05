export type LineKind =
  | "header"
  | "section"
  | "divider"
  | "statusLine"
  | "tabRow"
  | "emptyState";

export interface RenderedLine {
  kind: LineKind;
  text?: string;
  title?: string;
  meta?: string;
  tabId?: number;
  url?: string;
  discarded?: boolean;
  favIconUrl?: string;
  editable?: boolean;
}

export function Header(title: string, meta?: string): RenderedLine {
  return { kind: "header", title, meta };
}

export function Section(text: string): RenderedLine {
  return { kind: "section", text };
}

export function Divider(): RenderedLine {
  return { kind: "divider" };
}

export function StatusLine(text: string): RenderedLine {
  return { kind: "statusLine", text };
}

export interface TabRowInput {
  tabId: number | null;
  title: string;
  url: string;
  discarded?: boolean;
  editable?: boolean;
  favIconUrl?: string;
}

export function TabRow(line: TabRowInput): RenderedLine {
  return {
    kind: "tabRow",
    tabId: line.tabId ?? undefined,
    title: line.title,
    url: line.url,
    discarded: line.discarded,
    favIconUrl: line.favIconUrl,
    editable: line.editable,
  };
}

export function EmptyState(text: string): RenderedLine {
  return { kind: "emptyState", text };
}