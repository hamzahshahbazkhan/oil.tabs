import { describe, it, expect } from "vitest";
import { snapshotToText, parse, extractTabId, extractTitle, extractUrl } from "../src/buffer/serialize";
import type { Snapshot } from "../src/shared/types";

const fixture: Snapshot = {
  takenAt: 1000,
  lines: [
    { tabId: 1, windowId: 1, index: 0, url: "https://example.com/", title: "Example Domain", pinned: false, discarded: false, editable: true, groupId: null },
    { tabId: 2, windowId: 1, index: 1, url: "https://github.com/", title: "GitHub", pinned: false, discarded: false, editable: true, groupId: null },
    { tabId: 3, windowId: 2, index: 0, url: "https://news.ycombinator.com/", title: "Hacker News", pinned: false, discarded: false, editable: true, groupId: null },
    { tabId: 4, windowId: 2, index: 1, url: "https://mail.google.com/", title: "Gmail", pinned: false, discarded: false, editable: true, groupId: null },
  ],
};

describe("snapshotToText", () => {
  it("produces correct header and content lines", () => {
    const { text } = snapshotToText(fixture);
    const lines = text.split("\n");
    expect(lines[0]).toBe("── Window 1 · 2 tabs ──");
    expect(lines[1]).toBe("[1] Example Domain — https://example.com/");
    expect(lines[2]).toBe("[2] GitHub — https://github.com/");
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe("── Window 2 · 2 tabs ──");
    expect(lines[5]).toBe("[3] Hacker News — https://news.ycombinator.com/");
    expect(lines[6]).toBe("[4] Gmail — https://mail.google.com/");
    expect(lines).toHaveLength(7);
  });

  it("urlMap maps URLs to tabIds", () => {
    const { urlMap } = snapshotToText(fixture);
    expect(urlMap.get("https://example.com/")).toEqual([1]);
    expect(urlMap.get("https://github.com/")).toEqual([2]);
    expect(urlMap.get("https://news.ycombinator.com/")).toEqual([3]);
    expect(urlMap.get("https://mail.google.com/")).toEqual([4]);
  });

  it("uses singular 'tab' for single-tab windows", () => {
    const single: Snapshot = {
      takenAt: 0,
      lines: [
        { tabId: 1, windowId: 1, index: 0, url: "https://a.com/", title: "A", pinned: false, discarded: false, editable: true, groupId: null },
      ],
    };
    const { text } = snapshotToText(single);
    expect(text).toContain("· 1 tab ──");
  });
});

describe("parse", () => {
  it("round-trips correctly", () => {
    const { text, urlMap } = snapshotToText(fixture);
    const parsed = parse(text, urlMap);
    expect(parsed).toHaveLength(4);
    expect(parsed[0]).toEqual({ tabId: 1, windowId: 1, url: "https://example.com/", groupId: null, folderId: null, saved: false });
    expect(parsed[1]).toEqual({ tabId: 2, windowId: 1, url: "https://github.com/", groupId: null, folderId: null, saved: false });
    expect(parsed[2]).toEqual({ tabId: 3, windowId: 2, url: "https://news.ycombinator.com/", groupId: null, folderId: null, saved: false });
    expect(parsed[3]).toEqual({ tabId: 4, windowId: 2, url: "https://mail.google.com/", groupId: null, folderId: null, saved: false });
  });

  it("handles lines with missing separator gracefully", () => {
    const { text, urlMap } = snapshotToText(fixture);
    const modifiedLines = text.split("\n");
    modifiedLines[1] = "Example Domain https://example.com/";
    const modifiedText = modifiedLines.join("\n");
    const parsed = parse(modifiedText, urlMap);
    expect(parsed[0].url).toBe("Example Domain https://example.com/");
    expect(parsed[0].tabId).toBeNull();
    expect(() => parse(modifiedText, urlMap)).not.toThrow();
  });

  it("parses saved section lines with saved flag", () => {
    const { text, urlMap } = snapshotToText(fixture);
    const savedText = text + "\n\n── Saved For Later · 2 items ──\nSaved One — https://saved1.com/\nSaved Two — https://saved2.com/";
    const parsed = parse(savedText, urlMap);
    const savedLines = parsed.filter((l) => l.saved);
    expect(savedLines).toHaveLength(2);
    expect(savedLines[0].url).toBe("https://saved1.com/");
    expect(savedLines[1].url).toBe("https://saved2.com/");
    const liveLines = parsed.filter((l) => !l.saved);
    expect(liveLines).toHaveLength(4);
  });

  it("reordered lines preserve tabId via URL matching", () => {
    const { text, urlMap } = snapshotToText(fixture);
    const lines = text.split("\n");
    [lines[1], lines[2]] = [lines[2], lines[1]];
    const modifiedText = lines.join("\n");
    const parsed = parse(modifiedText, urlMap);
    expect(parsed[0].tabId).toBe(2);
    expect(parsed[0].url).toBe("https://github.com/");
    expect(parsed[0].saved).toBe(false);
    expect(parsed[1].tabId).toBe(1);
    expect(parsed[1].url).toBe("https://example.com/");
  });

  it("handles empty text", () => {
    const parsed = parse("", new Map());
    expect(parsed).toHaveLength(0);
  });

  it("URL change preserves tabId via embedded [tabId]", () => {
    const { text, urlMap } = snapshotToText(fixture);
    const modified = text.replace("https://example.com/", "https://changed.com/");
    const parsed = parse(modified, urlMap);
    // First tab keeps tabId 1 even though URL changed
    expect(parsed[0].tabId).toBe(1);
    expect(parsed[0].url).toBe("https://changed.com/");
    // Other tabs unaffected
    expect(parsed[1].tabId).toBe(2);
    expect(parsed[2].tabId).toBe(3);
    expect(parsed[3].tabId).toBe(4);
  });

  it("duplicate URLs preserve distinct tabIds via embedded [tabId]", () => {
    const { text, urlMap } = snapshotToText(fixture);
    // Duplicate the first line
    const lines = text.split("\n");
    const dupLine = lines[1].replace("[1]", "[99]"); // mimic a new tab with the same URL
    lines.splice(2, 0, dupLine);
    const modified = lines.join("\n");
    const parsed = parse(modified, urlMap);
    // Line [99] has tabId 99 but it's not in urlMap, so it falls back to URL matching
    // urlMap has [1] for the URL, but 1 is already used by line 1
    // So line 2 gets tabId null (URL already claimed)
    expect(parsed[0].tabId).toBe(1);
    expect(parsed[1].tabId).toBeNull();
    expect(parsed[2].tabId).toBe(2);
  });
});

describe("extractTabId", () => {
  it("extracts tabId from bracketed prefix", () => {
    expect(extractTabId("[42] title — url")).toBe(42);
    expect(extractTabId("[1] title")).toBe(1);
  });

  it("returns null for lines without tabId prefix", () => {
    expect(extractTabId("title — url")).toBeNull();
    expect(extractTabId("")).toBeNull();
  });

  it("ignores non-numeric bracketed content", () => {
    expect(extractTabId("[sleep] title")).toBeNull();
  });
});

describe("extractTitle", () => {
  it("strips tabId prefix", () => {
    expect(extractTitle("[42] Example Domain — https://example.com/")).toBe("Example Domain");
  });

  it("works without tabId prefix", () => {
    expect(extractTitle("Example Domain — https://example.com/")).toBe("Example Domain");
  });
});

describe("extractUrl", () => {
  it("strips tabId prefix before extracting URL", () => {
    expect(extractUrl("[42] Example Domain — https://example.com/")).toBe("https://example.com/");
  });

  it("works without tabId prefix", () => {
    expect(extractUrl("Example Domain — https://example.com/")).toBe("https://example.com/");
  });

  it("handles line without title separator", () => {
    expect(extractUrl("[42] https://example.com/")).toBe("https://example.com/");
  });
});
