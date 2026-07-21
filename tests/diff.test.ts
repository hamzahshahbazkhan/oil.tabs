import { describe, it, expect } from "vitest";
import { diff } from "../src/background/diff";
import type { Snapshot, ParsedLine, Operation } from "../src/shared/types";

function makeSnapshot(lines: { tabId: number; windowId: number; index: number }[]): Snapshot {
  return {
    takenAt: 0,
    lines: lines.map((l) => ({
      tabId: l.tabId,
      windowId: l.windowId,
      index: l.index,
      url: "https://example.com/",
      title: "Example",
      pinned: false,
      discarded: false,
      editable: true,
    })),
  };
}

function makeParsed(lines: { tabId: number | null; windowId: number }[]): ParsedLine[] {
  return lines.map((l) => ({
    tabId: l.tabId,
    windowId: l.windowId,
    url: "https://example.com/",
  }));
}

describe("diff", () => {
  it("no changes returns empty array", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const parsed = makeParsed([{ tabId: 1, windowId: 1 }]);
    expect(diff(old, parsed)).toEqual([]);
  });

  it("removing one tabId produces one close op", () => {
    const old = makeSnapshot([
      { tabId: 1, windowId: 1, index: 0 },
      { tabId: 2, windowId: 1, index: 1 },
    ]);
    const parsed = makeParsed([{ tabId: 1, windowId: 1 }]);
    const ops = diff(old, parsed);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "close", tabId: 2 });
  });

  it("swapping two tabs in same window produces move ops", () => {
    const old = makeSnapshot([
      { tabId: 1, windowId: 1, index: 0 },
      { tabId: 2, windowId: 1, index: 1 },
    ]);
    const parsed = makeParsed([
      { tabId: 2, windowId: 1 },
      { tabId: 1, windowId: 1 },
    ]);
    const ops = diff(old, parsed);
    expect(ops.length).toBeGreaterThanOrEqual(1);
    const moveOps = ops.filter((op) => op.kind === "move");
    expect(moveOps.length).toBeLessThanOrEqual(2);
  });

  it("moving a tab from window A to B produces one move op", () => {
    const old = makeSnapshot([
      { tabId: 1, windowId: 1, index: 0 },
      { tabId: 2, windowId: 2, index: 0 },
    ]);
    const parsed = makeParsed([
      { tabId: 1, windowId: 2 },
      { tabId: 2, windowId: 2 },
    ]);
    const ops = diff(old, parsed);
    const moveOps = ops.filter((op) => op.kind === "move") as Operation[];
    expect(moveOps.length).toBeGreaterThanOrEqual(1);
    const tab1Move = moveOps.find((op) => op.kind === "move" && op.tabId === 1);
    expect(tab1Move).toBeDefined();
    if (tab1Move && tab1Move.kind === "move") {
      expect(tab1Move.windowId).toBe(2);
    }
  });

  it("LCS: only moved tabIds get ops, not all 10", () => {
    const tabIds = Array.from({ length: 10 }, (_, i) => i + 1);
    const old = makeSnapshot(
      tabIds.map((id) => ({ tabId: id, windowId: 1, index: id - 1 })),
    );
    const parsed = makeParsed(
      tabIds.map((id) => {
        if (id === 3) return { tabId: 5, windowId: 1 };
        if (id === 5) return { tabId: 3, windowId: 1 };
        return { tabId: id, windowId: 1 };
      }),
    );
    const ops = diff(old, parsed);
    const moveOps = ops.filter((op) => op.kind === "move");
    const movedTabIds = moveOps.map((op) => op.tabId);
    // At most 3 elements may need moves (the two swapped + possibly one displaced)
    expect(moveOps.length).toBeLessThanOrEqual(3);
    // All moved tabIds must be among the affected set {3, 4, 5}
    for (const id of movedTabIds) {
      expect([3, 4, 5]).toContain(id);
    }
    // No other tabIds should be moved
    expect(moveOps.length).toBeLessThan(4);
  });

  it("null tabIds in parsed are ignored (no create ops emitted)", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const parsed = makeParsed([
      { tabId: 1, windowId: 1 },
      { tabId: null, windowId: 1 },
      { tabId: null, windowId: 1 },
    ]);
    const ops = diff(old, parsed);
    expect(ops).toEqual([]);
  });
});
