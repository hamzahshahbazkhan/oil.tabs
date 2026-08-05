export type LineKind =
  | "header"
  | "section"
  | "divider"
  | "statusLine"
  | "tabRow"
  | "emptyState";

export interface RenderedLine {
  kind: LineKind;
  text: string;
  tabId?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  editable?: boolean;
}

export function Header(title: string, meta?: string): RenderedLine {
  return { kind: "header", text: `── ${title}${meta ? ` · ${meta}` : ""} ──` };
}

export function Section(text: string): RenderedLine {
  return { kind: "section", text: `▸ ${text}` };
}

export function Divider(): RenderedLine {
  return { kind: "divider", text: "" };
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
  const title = line.discarded ? `[sleep] ${line.title}` : line.title;
  const tag = line.tabId !== null ? `[${line.tabId}] ` : "";
  return {
    kind: "tabRow",
    text: `${tag}${title} — ${line.url}`,
    tabId: line.tabId ?? undefined,
    title: line.title,
    url: line.url,
    favIconUrl: line.favIconUrl,
    editable: line.editable,
  };
}

export function EmptyState(text: string): RenderedLine {
  return { kind: "emptyState", text };
}