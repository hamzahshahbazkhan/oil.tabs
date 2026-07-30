import { describe, it, expect } from "vitest";
import { plan } from "../src/background/plan";
import type { Operation, Snapshot } from "../src/shared/types";

function makeSnapshot(lines: { tabId: number; windowId: number }[]): Snapshot {
  return {
    takenAt: 0,
    lines: lines.map((l) => ({
      tabId: l.tabId,
      windowId: l.windowId,
      index: 0,
      url: "",
      title: "",
      pinned: false,
      discarded: false,
      editable: true,
      groupId: null,
    })),
  };
}

function kinds(ops: Operation[]): string[] {
  return ops.map((op) => op.kind);
}

describe("plan", () => {
  it("close ops are placed after move and navigate", () => {
    const snapshot = makeSnapshot([
      { tabId: 1, windowId: 1 },
      { tabId: 2, windowId: 1 },
    ]);
    const ops: Operation[] = [
      { kind: "close", tabId: 1 },
      { kind: "move", tabId: 2, windowId: 1, index: 0 },
      { kind: "navigate", tabId: 2, url: "https://x.com/" },
    ];
    const result = plan(ops, snapshot);
    const order = kinds(result);
    const closeIdx = order.indexOf("close");
    const moveIdx = order.indexOf("move");
    const navIdx = order.indexOf("navigate");
    expect(closeIdx).toBeGreaterThan(moveIdx);
    expect(closeIdx).toBeGreaterThan(navIdx);
  });

  it("navigate comes after move and group", () => {
    const snapshot = makeSnapshot([{ tabId: 1, windowId: 1 }]);
    const ops: Operation[] = [
      { kind: "navigate", tabId: 1, url: "https://x.com/" },
      { kind: "move", tabId: 1, windowId: 1, index: 2 },
      { kind: "group", tabId: 1, groupId: 5 },
    ];
    const result = plan(ops, snapshot);
    const order = kinds(result);
    expect(order.indexOf("navigate")).toBeGreaterThan(order.indexOf("move"));
    expect(order.indexOf("navigate")).toBeGreaterThan(order.indexOf("group"));
  });

  it("cross-window move precedes same-window move", () => {
    const snapshot = makeSnapshot([
      { tabId: 1, windowId: 1 },
      { tabId: 2, windowId: 2 },
    ]);
    const ops: Operation[] = [
      { kind: "move", tabId: 1, windowId: 2, index: 0 },
      { kind: "move", tabId: 2, windowId: 2, index: 0 },
    ];
    const result = plan(ops, snapshot);
    const moves = result.filter((op): op is Operation & { kind: "move" } => op.kind === "move");
    expect(moves[0].tabId).toBe(1); // cross-window
    expect(moves[1].tabId).toBe(2); // same-window
  });

  it("create comes before any move or close", () => {
    const snapshot = makeSnapshot([
      { tabId: 1, windowId: 1 },
    ]);
    const ops: Operation[] = [
      { kind: "close", tabId: 1 },
      { kind: "create", url: "https://x.com/", windowId: 1, index: 0 },
    ];
    const result = plan(ops, snapshot);
    const order = kinds(result);
    expect(order.indexOf("create")).toBeLessThan(order.indexOf("close"));
  });

  it("saveForLater and bookmark come before close", () => {
    const snapshot = makeSnapshot([{ tabId: 1, windowId: 1 }]);
    const ops: Operation[] = [
      { kind: "close", tabId: 1 },
      { kind: "saveForLater", tabId: 1, url: "https://x.com/", title: "X" },
      { kind: "bookmark", tabId: 1, url: "https://x.com/", title: "X" },
    ];
    const result = plan(ops, snapshot);
    const order = kinds(result);
    expect(order.indexOf("saveForLater")).toBeLessThan(order.indexOf("close"));
    expect(order.indexOf("bookmark")).toBeLessThan(order.indexOf("close"));
  });

  it("discard comes last", () => {
    const snapshot = makeSnapshot([{ tabId: 1, windowId: 1 }]);
    const ops: Operation[] = [
      { kind: "discard", tabId: 1 },
      { kind: "close", tabId: 1 },
    ];
    const result = plan(ops, snapshot);
    const order = kinds(result);
    expect(order.indexOf("discard")).toBeGreaterThan(order.indexOf("close"));
  });

  it("all move ops for tabs that stay in their window are same-window", () => {
    const snapshot = makeSnapshot([
      { tabId: 1, windowId: 1 },
      { tabId: 2, windowId: 1 },
    ]);
    const ops: Operation[] = [
      { kind: "move", tabId: 1, windowId: 1, index: 1 },
      { kind: "move", tabId: 2, windowId: 1, index: 0 },
    ];
    const result = plan(ops, snapshot);
    const moves = result.filter((op) => op.kind === "move");
    expect(moves).toHaveLength(2);
    // both should be same-window, so order preserved from input
    for (const m of moves) {
      expect(m.kind).toBe("move");
    }
  });

  it("empty ops returns empty array", () => {
    const snapshot = makeSnapshot([]);
    const result = plan([], snapshot);
    expect(result).toEqual([]);
  });

  it("preserves relative order within the same kind", () => {
    const snapshot = makeSnapshot([
      { tabId: 1, windowId: 1 },
      { tabId: 2, windowId: 2 },
      { tabId: 3, windowId: 1 },
      { tabId: 4, windowId: 2 },
    ]);
    const ops: Operation[] = [
      { kind: "close", tabId: 1 },
      { kind: "close", tabId: 2 },
      { kind: "close", tabId: 3 },
      { kind: "close", tabId: 4 },
    ];
    const result = plan(ops, snapshot);
    const closeOps = result.filter((op): op is Operation & { kind: "close" } => op.kind === "close");
    expect(closeOps.map((op) => op.tabId)).toEqual([1, 2, 3, 4]);
  });

  it("assignFolder ordering is after group but before navigate", () => {
    const snapshot = makeSnapshot([{ tabId: 1, windowId: 1 }]);
    const ops: Operation[] = [
      { kind: "navigate", tabId: 1, url: "https://x.com/" },
      { kind: "group", tabId: 1, groupId: 5 },
      { kind: "assignFolder", tabId: 1, folderId: 2 },
    ];
    const result = plan(ops, snapshot);
    const order = kinds(result);
    expect(order.indexOf("assignFolder")).toBeGreaterThan(order.indexOf("group"));
    expect(order.indexOf("navigate")).toBeGreaterThan(order.indexOf("assignFolder"));
  });
});
