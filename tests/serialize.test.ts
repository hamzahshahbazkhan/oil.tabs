import { describe, it, expect } from "vitest";
import { snapshotToText, parse } from "../src/buffer/serialize";
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
    expect(lines[1]).toBe("Example Domain — https://example.com/");
    expect(lines[2]).toBe("GitHub — https://github.com/");
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe("── Window 2 · 2 tabs ──");
    expect(lines[5]).toBe("Hacker News — https://news.ycombinator.com/");
    expect(lines[6]).toBe("Gmail — https://mail.google.com/");
    expect(lines).toHaveLength(7);
  });

  it("urlMap maps URLs to tabIds", () => {
    const { urlMap } = snapshotToText(fixture);
    expect(urlMap.get("https://example.com/")).toBe(1);
    expect(urlMap.get("https://github.com/")).toBe(2);
    expect(urlMap.get("https://news.ycombinator.com/")).toBe(3);
    expect(urlMap.get("https://mail.google.com/")).toBe(4);
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
    expect(parsed[0]).toEqual({ tabId: 1, windowId: 1, url: "https://example.com/", groupId: null, folderId: null });
    expect(parsed[1]).toEqual({ tabId: 2, windowId: 1, url: "https://github.com/", groupId: null, folderId: null });
    expect(parsed[2]).toEqual({ tabId: 3, windowId: 2, url: "https://news.ycombinator.com/", groupId: null, folderId: null });
    expect(parsed[3]).toEqual({ tabId: 4, windowId: 2, url: "https://mail.google.com/", groupId: null, folderId: null });
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

  it("reordered lines preserve tabId via URL matching", () => {
    const { text, urlMap } = snapshotToText(fixture);
    const lines = text.split("\n");
    // Swap lines 1 and 2 (the two content lines in window 1)
    [lines[1], lines[2]] = [lines[2], lines[1]];
    const modifiedText = lines.join("\n");
    const parsed = parse(modifiedText, urlMap);
    // After swap: line 1 has tab2's text, line 2 has tab1's text
    // But tabIds should follow URLs: tabId 2 at position 0, tabId 1 at position 1
    expect(parsed[0].tabId).toBe(2);
    expect(parsed[0].url).toBe("https://github.com/");
    expect(parsed[1].tabId).toBe(1);
    expect(parsed[1].url).toBe("https://example.com/");
  });

  it("handles empty text", () => {
    const parsed = parse("", new Map());
    expect(parsed).toHaveLength(0);
  });
});
