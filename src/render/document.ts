import type { LineKind, RenderedLine } from "./primitives";

const SEP_WIDTH = 72;

function encodeTabId(tabId: number): string {
  const hex = tabId.toString(16);
  const selectors = [...hex].map((digit) => String.fromCharCode(0xFE00 + parseInt(digit, 16))).join("");
  return `\u200D${selectors}\u200D`;
}

export interface RenderedDocument {
  text: string;
  idMap: Map<number, number>;
  urlMap: Map<string, number[]>;
  nonEditableLines: Set<number>;
  faviconMap: Map<number, string>;
  lineUrlMap: Map<number, string>;
  lineKinds: Map<number, LineKind>;
  titleColumn: number;
}

function lineText(line: RenderedLine, titleWidth: number): string {
  switch (line.kind) {
    case "header": {
      const label = line.meta ? `${line.title} │ ${line.meta}` : line.title ?? "";
      const rules = Math.max(1, SEP_WIDTH - label.length - 1);
      return `${label} ${"─".repeat(rules)}`;
    }
    case "section":
      return `▸ ${line.text}`;
    case "divider":
      return line.text ?? "";
    case "tabRow": {
      const identity = line.tabId === undefined ? "" : encodeTabId(line.tabId);
      const titlePart = line.title ?? line.url ?? "";
      const tagPart = line.discarded ? " [sleep]" : "";
      const pad = Math.max(0, titleWidth - titlePart.length - tagPart.length);
      return `${identity}${titlePart}${tagPart}${" ".repeat(pad)} — ${line.url ?? ""}`;
    }
  }
}

function measureTitle(line: RenderedLine): number {
  if (line.kind !== "tabRow") return 0;
  const titlePart = line.title ?? "";
  const tagPart = line.discarded ? " [sleep]" : "";
  return titlePart.length + tagPart.length;
}

export function composeDocument(lines: RenderedLine[]): RenderedDocument {
  const idMap = new Map<number, number>();
  const urlMap = new Map<string, number[]>();
  const nonEditableLines = new Set<number>();
  const faviconMap = new Map<number, string>();
  const lineUrlMap = new Map<number, string>();
  const lineKinds = new Map<number, LineKind>();
  const textLines: string[] = [];

  let titleWidth = 0;
  for (const line of lines) {
    if (line.kind !== "tabRow") continue;
    titleWidth = Math.max(titleWidth, measureTitle(line));
  }

  let count = lines.length;
  while (count > 0) {
    const last = lines[count - 1];
    if (last.kind === "divider" || last.text === "") count--;
    else break;
  }

  for (let i = 0; i < count; i++) {
    const line = lines[i];
    textLines.push(lineText(line, titleWidth));
    const num = textLines.length;
    lineKinds.set(num, line.kind);

    if (line.kind !== "tabRow") continue;
    if (line.url !== undefined) lineUrlMap.set(num, line.url);
    if (line.tabId === undefined) continue;

    idMap.set(num, line.tabId);
    const ids = urlMap.get(line.url ?? "") ?? [];
    ids.push(line.tabId);
    ids.sort((a, b) => a - b);
    urlMap.set(line.url ?? "", ids);
    if (line.editable === false) nonEditableLines.add(num);
    if (line.favIconUrl) faviconMap.set(num, line.favIconUrl);
  }

  return {
    text: textLines.join("\n"),
    idMap,
    urlMap,
    nonEditableLines,
    faviconMap,
    lineUrlMap,
    lineKinds,
    titleColumn: 0,
  };
}
