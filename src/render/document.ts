import type { LineKind, RenderedLine } from "./primitives";

export interface RenderedDocument {
  text: string;
  idMap: Map<number, number>;
  urlMap: Map<string, number[]>;
  nonEditableLines: Set<number>;
  faviconMap: Map<number, string>;
  lineUrlMap: Map<number, string>;
  lineKinds: Map<number, LineKind>;
}

export function composeDocument(lines: RenderedLine[]): RenderedDocument {
  const idMap = new Map<number, number>();
  const urlMap = new Map<string, number[]>();
  const nonEditableLines = new Set<number>();
  const faviconMap = new Map<number, string>();
  const lineUrlMap = new Map<number, string>();
  const lineKinds = new Map<number, LineKind>();
  const textLines: string[] = [];

  let count = lines.length;
  while (count > 0 && lines[count - 1].text === "") count--;

  for (let i = 0; i < count; i++) {
    const line = lines[i];
    textLines.push(line.text);
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
  };
}