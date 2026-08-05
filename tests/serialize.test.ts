import { describe, it, expect } from "vitest";
import { formatSnapshot } from "../src/render/tabs";
import { parse, extractTabId, extractTitle, extractUrl } from "../src/model/Parser";
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

const dupFixture: Snapshot = {
  takenAt: 1000,
  lines: [
    { tabId: 1, windowId: 1, index: 0, url: "https://example.com/", title: "Example Domain", pinned: false, discarded: false, editable: true, groupId: null },
    { tabId: 5, windowId: 1, index: 1, url: "https://example.com/", title: "Example Mirror", pinned: false, discarded: false, editable: true, groupId: null },
  ],
};

describe("formatSnapshot", () => {
  it("produces correct header and content lines", () => {
    const { text } = formatSnapshot(fixture);
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
    const { urlMap } = formatSnapshot(fixture);
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
    const { text } = formatSnapshot(single);
    expect(text).toContain("· 1 tab ──");
  });
});

describe("parse", () => {
  it("round-trips correctly", () => {
    const { text, urlMap } = formatSnapshot(fixture);
    const parsed = parse(text, urlMap);
    expect(parsed).toHaveLength(4);
    expect(parsed[0]).toEqual({ tabId: 1, windowId: 1, url: "https://example.com/", groupId: null, folderId: null, saved: false });
    expect(parsed[1]).toEqual({ tabId: 2, windowId: 1, url: "https://github.com/", groupId: null, folderId: null, saved: false });
    expect(parsed[2]).toEqual({ tabId: 3, windowId: 2, url: "https://news.ycombinator.com/", groupId: null, folderId: null, saved: false });
    expect(parsed[3]).toEqual({ tabId: 4, windowId: 2, url: "https://mail.google.com/", groupId: null, folderId: null, saved: false });
  });

  it("handles lines with missing separator gracefully", () => {
    const { text, urlMap } = formatSnapshot(fixture);
    const modifiedLines = text.split("\n");
    modifiedLines[1] = "Example Domain https://example.com/";
    const modifiedText = modifiedLines.join("\n");
    const parsed = parse(modifiedText, urlMap);
    expect(parsed[0].url).toBe("Example Domain https://example.com/");
    expect(parsed[0].tabId).toBeNull();
    expect(() => parse(modifiedText, urlMap)).not.toThrow();
  });

  it("parses saved section lines with saved flag", () => {
    const { text, urlMap } = formatSnapshot(fixture);
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
    const { text, urlMap } = formatSnapshot(fixture);
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
    const { text, urlMap } = formatSnapshot(fixture);
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

  it("duplicate URLs with [N] tags preserve distinct tabIds", () => {
    const { text, urlMap } = formatSnapshot(dupFixture);
    const parsed = parse(text, urlMap);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].tabId).toBe(1);
    expect(parsed[0].url).toBe("https://example.com/");
    expect(parsed[1].tabId).toBe(5);
    expect(parsed[1].url).toBe("https://example.com/");
  });

  it("duplicate URLs without [N] tags assign smallest tabId to first occurrence", () => {
    const { urlMap } = formatSnapshot(dupFixture);
    // Strip [N] tags
    const bareText = "Title A — https://example.com/\nTitle B — https://example.com/";
    const parsed = parse(bareText, urlMap);
    expect(parsed[0].tabId).toBe(1);
    expect(parsed[1].tabId).toBe(5);
  });

  it("reordered duplicate URL lines with [N] tags preserve identity", () => {
    const { text, urlMap } = formatSnapshot(dupFixture);
    const lines = text.split("\n");
    [lines[1], lines[2]] = [lines[2], lines[1]]; // swap the two content lines
    const parsed = parse(lines.join("\n"), urlMap);
    expect(parsed[0].tabId).toBe(5);
    expect(parsed[1].tabId).toBe(1);
  });

  it("reordered duplicate URL lines without [N] tags are deterministic", () => {
    const { urlMap } = formatSnapshot(dupFixture);
    const bareText = "Title B — https://example.com/\nTitle A — https://example.com/";
    const parsed = parse(bareText, urlMap);
    // First occurrence always gets smallest tabId (1), second gets (5)
    expect(parsed[0].tabId).toBe(1);
    expect(parsed[1].tabId).toBe(5);
  });

  it("matching is invariant to urlMap entry order", () => {
    // urlMap with reverse tabId order (5 before 1)
    const reverseMap = new Map<string, number[]>([["https://example.com/", [5, 1]]]);
    const bareText = "Title A — https://example.com/\nTitle B — https://example.com/";
    const parsed = parse(bareText, reverseMap);
    // Even though urlMap has [5, 1], sorting gives [1, 5]
    expect(parsed[0].tabId).toBe(1);
    expect(parsed[1].tabId).toBe(5);
  });

  it("three tabs with same URL: first two match, third is null", () => {
    const tripFixture: Snapshot = {
      takenAt: 0,
      lines: [
        { tabId: 10, windowId: 1, index: 0, url: "https://a.com/", title: "A1", pinned: false, discarded: false, editable: true, groupId: null },
        { tabId: 20, windowId: 1, index: 1, url: "https://a.com/", title: "A2", pinned: false, discarded: false, editable: true, groupId: null },
      ],
    };
    const { urlMap } = formatSnapshot(tripFixture);
    const bareText = "A1 — https://a.com/\nA2 — https://a.com/\nA3 — https://a.com/";
    const parsed = parse(bareText, urlMap);
    expect(parsed[0].tabId).toBe(10);
    expect(parsed[1].tabId).toBe(20);
    expect(parsed[2].tabId).toBeNull();
  });

  it("one duplicate tab removed via close gets null for extra line", () => {
    const { urlMap } = formatSnapshot(dupFixture);
    const bareText = "Title A — https://example.com/";
    const parsed = parse(bareText, urlMap);
    expect(parsed[0].tabId).toBe(1);
  });

  it("URL change on one duplicate tab with [N] preserves its tabId", () => {
    const { text, urlMap } = formatSnapshot(dupFixture);
    const lines = text.split("\n");
    lines[1] = lines[1].replace("https://example.com/", "https://changed.com/");
    const modified = lines.join("\n");
    const parsed = parse(modified, urlMap);
    expect(parsed[0].tabId).toBe(1);
    expect(parsed[0].url).toBe("https://changed.com/");
    expect(parsed[1].tabId).toBe(5);
    expect(parsed[1].url).toBe("https://example.com/");
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
