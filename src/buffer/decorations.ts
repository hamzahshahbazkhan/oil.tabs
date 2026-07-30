import { StateField, RangeSetBuilder, EditorState } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import {
  Decoration,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { nonEditableLines, faviconMap, idMap, lineUrlMap } from "./BufferUI";
import { extractUrl } from "../model/Parser";

class FaviconWidget extends WidgetType {
  constructor(readonly src: string) { super() }
  eq(other: FaviconWidget) { return other.src === this.src }
  toDOM() {
    if (this.src) {
      const img = document.createElement("img");
      img.src = this.src;
      img.className = "cm-favicon";
      img.loading = "lazy";
      img.onerror = () => { img.style.display = "none"; };
      return img;
    }
    const dot = document.createElement("span");
    dot.className = "cm-favicon-placeholder";
    return dot;
  }
  ignoreEvent() { return true; }
}

const WINDOW_HEADER_RE = /^── Window \d+/;
const TAB_LINE_RE = / — /;

const brandColors: Record<string, string> = {
  "youtube.com": "#ff0000",
  "youtu.be": "#ff0000",
  "github.com": "#58a6ff",
  "twitter.com": "#1d9bf0",
  "x.com": "#1d9bf0",
  "reddit.com": "#ff4500",
  "google.com": "#4285f4",
  "wikipedia.org": "#e0e0e0",
  "netflix.com": "#e50914",
  "twitch.tv": "#9146ff",
  "discord.com": "#5865f2",
  "figma.com": "#f24e1e",
  "notion.com": "#e0e0e0",
  "linear.app": "#5e6ad2",
  "vercel.com": "#e0e0e0",
  "apple.com": "#ff2d55",
  "amazon.com": "#ff9900",
  "linkedin.com": "#0a66c2",
  "stackoverflow.com": "#f48024",
  "npmjs.com": "#cb3837",
  "docker.com": "#2496ed",
  "slack.com": "#e0a0d0",
  "spotify.com": "#1db954",
  "vscode.dev": "#007acc",
  "mozilla.org": "#ff9400",
  "whatsapp.com": "#25d366",
  "telegram.org": "#26a5e4",
  "microsoft.com": "#00a4ef",
  "notion.site": "#e0e0e0",
  "codepen.io": "#0ebeff",
  "medium.com": "#ab8c5a",
  "dev.to": "#a0a0a0",
  "hashnode.com": "#2962ff",
  "gitlab.com": "#fc6d26",
  "bitbucket.org": "#2684ff",
  "atlassian.com": "#0052cc",
  "jira.com": "#0052cc",
  "trello.com": "#0079bf",
  "airbnb.com": "#ff5a5f",
  "uber.com": "#000000",
  "lyft.com": "#ff00bf",
  "doordash.com": "#ff3000",
};

function hashColor(domain: string): string {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  const sat = 55 + (Math.abs(hash) % 25);
  const light = 50 + (Math.abs(hash >> 4) % 20);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function getDomainColor(url: string): string | null {
  try {
    let host = new URL(url).hostname;
    if (host.startsWith("www.")) host = host.slice(4);
    const parts = host.split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts.slice(i).join(".");
      if (brandColors[key]) return brandColors[key];
    }
    return hashColor(host);
  } catch {
    return null;
  }
}

export const urlColorDeco = StateField.define<DecorationSet>({
  create(state: EditorState) {
    return buildUrlColorDecorations(state);
  },
  update(deco: DecorationSet, tr) {
    if (tr.docChanged) return buildUrlColorDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildUrlColorDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    if (!TAB_LINE_RE.test(line.text)) continue;
    const url = extractUrl(line.text);
    const color = getDomainColor(url);
    if (color) {
      builder.add(line.from, line.from, Decoration.line({ attributes: { style: `color: ${color}` } }));
    }
  }
  return builder.finish();
}

export const faviconDeco = StateField.define<DecorationSet>({
  create(state: EditorState) {
    return buildFaviconDecorations(state);
  },
  update(deco: DecorationSet, tr) {
    if (tr.docChanged) return buildFaviconDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildFaviconDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let i = 1; i <= state.doc.lines; i++) {
    if (!idMap.has(i)) continue;
    const line = state.doc.line(i);
    const docUrl = extractUrl(line.text);
    const storedUrl = lineUrlMap.get(i);
    const showPlaceholder = storedUrl !== undefined && docUrl !== storedUrl;
    const faviconUrl = showPlaceholder ? "" : (faviconMap.get(i) ?? "");
    builder.add(line.from, line.from, Decoration.widget({ widget: new FaviconWidget(faviconUrl), side: -1 }));
  }
  return builder.finish();
}

export const headerLineDeco = StateField.define<DecorationSet>({
  create(state: EditorState) {
    return buildHeaderDecorations(state);
  },
  update(deco: DecorationSet, tr) {
    if (tr.docChanged) return buildHeaderDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildHeaderDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const deco = Decoration.line({ class: "cm-headerLine" });
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    if (WINDOW_HEADER_RE.test(line.text)) {
      builder.add(line.from, line.from, deco);
    }
  }
  return builder.finish();
}

const nonEditableDeco = Decoration.line({ class: "cm-nonEditable" });

export const nonEditableLineDeco = StateField.define<DecorationSet>({
  create(state: EditorState) {
    return buildNonEditableDecorations(state);
  },
  update(deco: DecorationSet, tr) {
    if (tr.docChanged) return buildNonEditableDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildNonEditableDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let i = 1; i <= state.doc.lines; i++) {
    if (nonEditableLines.has(i)) {
      const line = state.doc.line(i);
      builder.add(line.from, line.from, nonEditableDeco);
    }
  }
  return builder.finish();
}

export const nonEditableTransactionFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return [tr];

  let isFullReplace = false;
  tr.changes.iterChanges((fromA, toA) => {
    if (fromA === 0 && toA === tr.startState.doc.length) {
      isFullReplace = true;
    }
  });
  if (isFullReplace) return [tr];

  for (const lineNo of nonEditableLines) {
    if (lineNo < 1 || lineNo > tr.startState.doc.lines) continue;
    const line = tr.startState.doc.line(lineNo);
    let touched = false;
    tr.changes.iterChanges((fromA, toA) => {
      if (fromA < line.to && toA > line.from) {
        touched = true;
      }
    });
    if (touched) return [];
  }
  return [tr];
});
