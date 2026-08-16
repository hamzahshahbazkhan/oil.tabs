import { describe, it, expect } from "vitest";
import { diff, validateMoveOps } from "../src/engine/DiffEngine";
import type { Snapshot, ParsedLine, Operation } from "../src/shared/types";

function makeSnapshot(lines: { tabId: number; windowId: number; index: number; pinned?: boolean }[]): Snapshot {
  return {
    takenAt: 0,
    lines: lines.map((l) => ({
      tabId: l.tabId,
      windowId: l.windowId,
      index: l.index,
      url: "https://example.com/",
      title: "Example",
      pinned: l.pinned ?? false,
      discarded: false,
      editable: true,
      groupId: null,
    })),
  };
}

function makeParsed(lines: { tabId: number | null; windowId: number; url?: string; groupId?: number | null; folderId?: number | null; saved?: boolean }[]): ParsedLine[] {
  return lines.map((l) => ({
    tabId: l.tabId,
    windowId: l.windowId,
    url: l.url ?? "https://example.com/",
    groupId: l.groupId ?? null,
    folderId: l.folderId ?? null,
    saved: l.saved ?? false,
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

  it("null tabIds produce create ops with correct windowId and index", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const parsed = makeParsed([
      { tabId: 1, windowId: 1 },
      { tabId: null, windowId: 1 },
      { tabId: null, windowId: 2 },
    ]);
    const ops = diff(old, parsed);
    const createOps = ops.filter((op) => op.kind === "create");
    expect(createOps).toHaveLength(2);
    expect(createOps[0]).toEqual({ kind: "create", url: "https://example.com/", windowId: 1, index: 1 });
    expect(createOps[1]).toEqual({ kind: "create", url: "https://example.com/", windowId: 2, index: 0 });
  });

  it("same tabId with same url produces no navigate op", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const parsed = makeParsed([{ tabId: 1, windowId: 1 }]);
    const ops = diff(old, parsed);
    expect(ops.filter((op) => op.kind === "navigate")).toHaveLength(0);
  });

  it("same tabId with different url produces one navigate op", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const parsed = makeParsed([{ tabId: 1, windowId: 1, url: "https://other.com/" }]);
    const ops = diff(old, parsed);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: "navigate", tabId: 1, url: "https://other.com/" });
  });

  it("url changed only for one tab in multi-line buffer produces only one navigate op", () => {
    const old = makeSnapshot([
      { tabId: 1, windowId: 1, index: 0 },
      { tabId: 2, windowId: 1, index: 1 },
    ]);
    const parsed = makeParsed([
      { tabId: 1, windowId: 1, url: "https://changed.com/" },
      { tabId: 2, windowId: 1 },
    ]);
    const ops = diff(old, parsed);
    const navigateOps = ops.filter((op) => op.kind === "navigate");
    expect(navigateOps).toHaveLength(1);
    expect(navigateOps[0]).toEqual({ kind: "navigate", tabId: 1, url: "https://changed.com/" });
  });

  it("navigate ops are placed after create ops in result", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const parsed = makeParsed([
      { tabId: 1, windowId: 1, url: "https://changed.com/" },
      { tabId: null, windowId: 1 },
    ]);
    const ops = diff(old, parsed);
    const kinds = ops.map((op) => op.kind);
    const createIdx = kinds.indexOf("create");
    const navigateIdx = kinds.indexOf("navigate");
    expect(createIdx).toBeLessThan(navigateIdx);
  });

  it("create ops are placed after close and move in result", () => {
    const old = makeSnapshot([
      { tabId: 1, windowId: 1, index: 0 },
      { tabId: 2, windowId: 1, index: 1 },
      { tabId: 3, windowId: 1, index: 2 },
    ]);
    // close tab 1, move tab 3 to front, create new tab between
    const parsed = makeParsed([
      { tabId: 3, windowId: 1 },
      { tabId: null, windowId: 1 },
      { tabId: 2, windowId: 1 },
    ]);
    const ops = diff(old, parsed);
    const kinds = ops.map((op) => op.kind);
    const closeIdx = kinds.indexOf("close");
    const createIdx = kinds.indexOf("create");
    const moveIdx = kinds.indexOf("move");
    expect(closeIdx).toBeLessThan(moveIdx);
    expect(moveIdx).toBeLessThan(createIdx);
  });

  it("changing groupId produces one group op", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const parsed = makeParsed([{ tabId: 1, windowId: 1, groupId: 5 }]);
    const ops = diff(old, parsed);
    const groupOps = ops.filter((op) => op.kind === "group");
    expect(groupOps).toHaveLength(1);
    expect(groupOps[0]).toEqual({ kind: "group", tabId: 1, groupId: 5 });
  });

  it("invalid pinned/unpinned interleave is rejected by validateMoveOps", () => {
    const old = makeSnapshot([
      { tabId: 1, windowId: 1, index: 0, pinned: true },
      { tabId: 2, windowId: 1, index: 1, pinned: false },
      { tabId: 3, windowId: 1, index: 2, pinned: true },
    ]);
    // Tab 3 (pinned) at index 2 → invalid because pinned tabs can only be [0, pinnedCount=2)
    // Tab 2 (unpinned) at index 0 → invalid because unpinned can't be before pinned
    const invalidMoves: Operation[] = [
      { kind: "move", tabId: 2, windowId: 1, index: 0 },
      { kind: "move", tabId: 3, windowId: 1, index: 2 },
    ];
    // Tab 1 (pinned) at index 1 → valid (stays within pinned section [0, 2))
    const validMoves: Operation[] = [
      { kind: "move", tabId: 1, windowId: 1, index: 1 },
    ];
    const valid = validateMoveOps([...invalidMoves, ...validMoves], old);
    expect(valid).toHaveLength(1);
    expect(valid[0].tabId).toBe(1);
  });

  it("removing groupId produces NONE group op", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const oldWithGroup = {
      ...old,
      lines: old.lines.map((l) => ({ ...l, groupId: 3 })),
    };
    const parsed = makeParsed([{ tabId: 1, windowId: 1, groupId: null }]);
    const ops = diff(oldWithGroup, parsed);
    const groupOps = ops.filter((op) => op.kind === "group");
    expect(groupOps).toHaveLength(1);
    expect(groupOps[0]).toEqual({ kind: "group", tabId: 1, groupId: "NONE" });
  });

  it("changing folderId produces assignFolder op", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const parsed = makeParsed([{ tabId: 1, windowId: 1, folderId: 5 }]);
    const folderMap = new Map<number, number | null>([[1, null]]);
    const ops = diff(old, parsed, folderMap);
    const folderOps = ops.filter((op) => op.kind === "assignFolder");
    expect(folderOps).toHaveLength(1);
    expect(folderOps[0]).toEqual({ kind: "assignFolder", tabId: 1, folderId: 5 });
  });

  it("no folderMap passed produces no assignFolder ops", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const parsed = makeParsed([{ tabId: 1, windowId: 1, folderId: 5 }]);
    const ops = diff(old, parsed);
    const folderOps = ops.filter((op) => op.kind === "assignFolder");
    expect(folderOps).toHaveLength(0);
  });

  it("line in saved section with tabId produces saveForLater op", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const parsed = makeParsed([{ tabId: 1, windowId: 1, saved: true }]);
    const ops = diff(old, parsed);
    const saveOps = ops.filter((op) => op.kind === "saveForLater");
    expect(saveOps).toHaveLength(1);
    expect(saveOps[0]).toEqual({ kind: "saveForLater", tabId: 1, url: "https://example.com/", title: "Example" });
    const closeOps = ops.filter((op) => op.kind === "close");
    expect(closeOps).toHaveLength(0);
  });

  it("line in saved section without tabId produces saveForLater op without a tab id", () => {
    const old = makeSnapshot([]);
    const parsed = makeParsed([{ tabId: null, windowId: 0, url: "https://saved.com/", saved: true }]);
    const ops = diff(old, parsed);
    const saveOps = ops.filter((op) => op.kind === "saveForLater");
    expect(saveOps).toHaveLength(1);
    expect(saveOps[0]).toEqual({ kind: "saveForLater", tabId: null, url: "https://saved.com/", title: "" });
  });

  it("live line with null tabId matching saved URL produces restoreFromSaved op", () => {
    const old = makeSnapshot([]);
    const parsed = makeParsed([{ tabId: null, windowId: 1, url: "https://saved.com/" }]);
    const savedUrls = new Set(["https://saved.com/"]);
    const ops = diff(old, parsed, undefined, savedUrls);
    const restoreOps = ops.filter((op) => op.kind === "restoreFromSaved");
    expect(restoreOps).toHaveLength(1);
    expect(restoreOps[0]).toEqual({ kind: "restoreFromSaved", url: "https://saved.com/", title: "", windowId: 1, index: 0 });
  });

  it("live line with existing tabId matching saved URL does not produce restoreFromSaved op", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const parsed = makeParsed([{ tabId: 1, windowId: 1, url: "https://saved.com/" }]);
    const savedUrls = new Set(["https://saved.com/"]);
    const ops = diff(old, parsed, undefined, savedUrls);
    const restoreOps = ops.filter((op) => op.kind === "restoreFromSaved");
    expect(restoreOps).toHaveLength(0);
  });

  it("saved section tabIds are not counted as closeOps", () => {
    const old = makeSnapshot([
      { tabId: 1, windowId: 1, index: 0 },
      { tabId: 2, windowId: 1, index: 1 },
    ]);
    const parsed = makeParsed([
      { tabId: 1, windowId: 1, saved: true },
    ]);
    const ops = diff(old, parsed);
    const closeOps = ops.filter((op) => op.kind === "close");
    expect(closeOps).toHaveLength(1);
    expect(closeOps[0]).toEqual({ kind: "close", tabId: 2 });
  });

  it("removing folderId produces assignFolder op with null", () => {
    const old = makeSnapshot([{ tabId: 1, windowId: 1, index: 0 }]);
    const parsed = makeParsed([{ tabId: 1, windowId: 1, folderId: null }]);
    const folderMap = new Map<number, number | null>([[1, 3]]);
    const ops = diff(old, parsed, folderMap);
    const folderOps = ops.filter((op) => op.kind === "assignFolder");
    expect(folderOps).toHaveLength(1);
    expect(folderOps[0]).toEqual({ kind: "assignFolder", tabId: 1, folderId: null });
  });

  it("cross-window move produces correct index", () => {
    const old = makeSnapshot([
      { tabId: 1, windowId: 1, index: 0 },
      { tabId: 2, windowId: 1, index: 1 },
      { tabId: 3, windowId: 2, index: 0 },
    ]);
    // Move tab 1 from window 1 to window 2, before tab 3
    const parsed = makeParsed([
      { tabId: 2, windowId: 1 },
      { tabId: 1, windowId: 2 },
      { tabId: 3, windowId: 2 },
    ]);
    const ops = diff(old, parsed);
    const moveOps = ops.filter((op): op is Operation & { kind: "move" } => op.kind === "move");
    const tab1Move = moveOps.find(op => op.tabId === 1);
    expect(tab1Move).toBeDefined();
    if (tab1Move) {
      expect(tab1Move.windowId).toBe(2);
      expect(tab1Move.index).toBe(0);
    }
  });

  it("same-window reorder within LCS produces correct indices", () => {
    const old = makeSnapshot([
      { tabId: 1, windowId: 1, index: 0 },
      { tabId: 2, windowId: 1, index: 1 },
      { tabId: 3, windowId: 1, index: 2 },
      { tabId: 4, windowId: 1, index: 3 },
    ]);
    // Move tab 4 to position 0 (large shift)
    const parsed = makeParsed([
      { tabId: 4, windowId: 1 },
      { tabId: 1, windowId: 1 },
      { tabId: 2, windowId: 1 },
      { tabId: 3, windowId: 1 },
    ]);
    const ops = diff(old, parsed);
    const tab4Move = ops.find((op): op is Operation & { kind: "move" } => op.kind === "move" && op.tabId === 4);
    expect(tab4Move).toBeDefined();
    if (tab4Move) {
      expect(tab4Move.index).toBe(0);
    }
  });

  it("moving all tabs out of a window leaves no stale state", () => {
    const old = makeSnapshot([
      { tabId: 1, windowId: 1, index: 0 },
      { tabId: 2, windowId: 1, index: 1 },
    ]);
    const parsed = makeParsed([
      { tabId: 1, windowId: 2 },
      { tabId: 2, windowId: 2 },
    ]);
    const ops = diff(old, parsed);
    const closeOps = ops.filter(op => op.kind === "close");
    expect(closeOps).toHaveLength(0);
    const moveOps = ops.filter(op => op.kind === "move");
    expect(moveOps.length).toBeGreaterThanOrEqual(1);
    for (const op of moveOps) {
      expect((op as any).windowId).toBe(2);
    }
  });
});
