import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Operation, Snapshot } from "../src/shared/types";

const mockTabsGet = vi.fn();
const mockTabsRemove = vi.fn();
const mockTabsMove = vi.fn();
const mockTabsCreate = vi.fn();
const mockTabsUpdate = vi.fn();
const mockTabsDiscard = vi.fn();
const mockStorageGet = vi.fn();
const mockStorageSet = vi.fn();

vi.mock("webextension-polyfill", () => ({
  default: {
    tabs: {
      get: (...args: unknown[]) => mockTabsGet(...args),
      remove: (...args: unknown[]) => mockTabsRemove(...args),
      move: (...args: unknown[]) => mockTabsMove(...args),
      create: (...args: unknown[]) => mockTabsCreate(...args),
      update: (...args: unknown[]) => mockTabsUpdate(...args),
      discard: (...args: unknown[]) => mockTabsDiscard(...args),
    },
    storage: {
      local: {
        get: (...args: unknown[]) => mockStorageGet(...args),
        set: (...args: unknown[]) => mockStorageSet(...args),
      },
    },
  },
}));

let apply: Awaited<typeof import("../src/background/apply")>["apply"];

function snapshot(lines?: { tabId: number; windowId: number }[]): Snapshot {
  return {
    takenAt: 0,
    lines: (lines ?? [{ tabId: 1, windowId: 1 }]).map((l) => ({
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

beforeEach(async () => {
  vi.clearAllMocks();
  mockStorageGet.mockResolvedValue({});
  mockTabsGet.mockResolvedValue({ id: 1, windowId: 1, index: 0, url: "https://old.com/", groupId: -1 });
  apply = (await import("../src/background/apply")).apply;
});

describe("apply", () => {
  it("create op calls tabs.create with correct args", async () => {
    mockTabsCreate.mockResolvedValue({ id: 100 });
    const ops: Operation[] = [
      { kind: "create", url: "https://newtab.com/", windowId: 1, index: 2 },
    ];
    const result = await apply(ops, snapshot());
    expect(result).toEqual({ ok: true });
    expect(mockTabsCreate).toHaveBeenCalledTimes(1);
    expect(mockTabsCreate).toHaveBeenCalledWith({
      windowId: 1,
      url: "https://newtab.com/",
      index: 2,
      active: false,
    });
  });

  it("navigate op calls tabs.update with correct args", async () => {
    mockTabsGet.mockResolvedValue({ id: 42, windowId: 1, index: 0, url: "https://old.com/" });
    const ops: Operation[] = [
      { kind: "navigate", tabId: 42, url: "https://other.com/" },
    ];
    const result = await apply(ops, snapshot([{ tabId: 42, windowId: 1 }]));
    expect(result).toEqual({ ok: true });
    expect(mockTabsUpdate).toHaveBeenCalledTimes(1);
    expect(mockTabsUpdate).toHaveBeenCalledWith(42, { url: "https://other.com/" });
  });

  it("multiple ops in sequence are all executed", async () => {
    mockTabsGet.mockResolvedValue({ id: 1, windowId: 1, index: 0, url: "https://close.com/" });
    mockTabsCreate.mockResolvedValue({ id: 100 });
    const ops: Operation[] = [
      { kind: "close", tabId: 1 },
      { kind: "create", url: "https://a.com/", windowId: 1, index: 0 },
    ];
    const result = await apply(ops, snapshot());
    expect(result).toEqual({ ok: true });
    expect(mockTabsRemove).toHaveBeenCalledTimes(1);
    expect(mockTabsCreate).toHaveBeenCalledTimes(1);
  });

  it("assignFolder op writes to storage.local", async () => {
    mockStorageGet.mockResolvedValue({});
    const ops: Operation[] = [
      { kind: "assignFolder", tabId: 1, folderId: 5 },
    ];
    const result = await apply(ops, snapshot());
    expect(result).toEqual({ ok: true });
    expect(mockStorageSet).toHaveBeenCalledTimes(1);
    expect(mockStorageSet).toHaveBeenCalledWith({ tabFolderMap: { 1: 5 } });
  });

  it("discard op calls tabs.discard", async () => {
    const ops: Operation[] = [
      { kind: "discard", tabId: 42 },
    ];
    const result = await apply(ops, snapshot([{ tabId: 42, windowId: 1 }]));
    expect(result).toEqual({ ok: true });
    expect(mockTabsDiscard).toHaveBeenCalledWith(42);
  });

  it("saveForLater op adds to storage and closes tab", async () => {
    mockStorageGet.mockResolvedValue({});
    mockTabsGet.mockResolvedValue({ id: 5, windowId: 1, index: 2, url: "https://save.com/" });
    const ops: Operation[] = [
      { kind: "saveForLater", tabId: 5, url: "https://save.com/", title: "Save Me" },
    ];
    const result = await apply(ops, snapshot([{ tabId: 5, windowId: 1 }]));
    expect(result).toEqual({ ok: true });
    expect(mockStorageSet).toHaveBeenCalled();
    expect(mockTabsRemove).toHaveBeenCalledWith(5);
    const setCall = mockStorageSet.mock.calls[0][0];
    expect(setCall.savedForLater).toHaveLength(1);
    expect(setCall.savedForLater[0].url).toBe("https://save.com/");
  });

  it("restoreFromSaved op creates tab and removes from storage", async () => {
    mockTabsCreate.mockResolvedValue({ id: 100 });
    mockStorageGet.mockResolvedValue({ savedForLater: [{ url: "https://restore.com/", title: "Restore Me", savedAt: 100 }] });
    const ops: Operation[] = [
      { kind: "restoreFromSaved", url: "https://restore.com/", title: "Restore Me", windowId: 1, index: 2 },
    ];
    const result = await apply(ops, snapshot());
    expect(result).toEqual({ ok: true });
    expect(mockTabsCreate).toHaveBeenCalledWith({ url: "https://restore.com/", windowId: 1, index: 2 });
    expect(mockStorageSet).toHaveBeenCalledWith({ savedForLater: [] });
  });

  it("assignFolder op with null folderId removes entry", async () => {
    mockStorageGet.mockResolvedValue({ tabFolderMap: { 1: 5, 2: 3 } });
    const ops: Operation[] = [
      { kind: "assignFolder", tabId: 1, folderId: null },
    ];
    const result = await apply(ops, snapshot([{ tabId: 1, windowId: 1 }, { tabId: 2, windowId: 1 }]));
    expect(result).toEqual({ ok: true });
    expect(mockStorageSet).toHaveBeenCalledWith({ tabFolderMap: { 2: 3 } });
  });

  it("validation fails for non-existent tabId", async () => {
    const ops: Operation[] = [
      { kind: "close", tabId: 999 },
    ];
    const result = await apply(ops, snapshot());
    expect(result.ok).toBe(false);
    expect(result.error).toContain("does not exist in the snapshot");
  });

  it("validation fails for non-existent target window", async () => {
    const ops: Operation[] = [
      { kind: "create", url: "https://x.com/", windowId: 999, index: 0 },
    ];
    const result = await apply(ops, snapshot());
    expect(result.ok).toBe(false);
    expect(result.error).toContain("does not exist in the snapshot");
  });

  it("failure rolls back prior operations", async () => {
    mockTabsGet.mockResolvedValue({ id: 1, windowId: 1, index: 0, url: "https://close.com/" });
    mockTabsCreate.mockResolvedValue({ id: 100 });
    // close tab 1 succeeds, close tab 2 fails
    mockTabsRemove.mockResolvedValueOnce(undefined);
    mockTabsRemove.mockRejectedValueOnce(new Error("tab not found"));
    const ops: Operation[] = [
      { kind: "close", tabId: 1 },
      { kind: "close", tabId: 2 },
    ];
    const result = await apply(ops, snapshot([{ tabId: 1, windowId: 1 }, { tabId: 2, windowId: 1 }]));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Failed to close tab 2");
    // Tab 1 close was rolled back (recreated via tabs.create)
    expect(mockTabsRemove).toHaveBeenCalledTimes(2);       // both close ops attempted
    expect(mockTabsCreate).toHaveBeenCalledTimes(1);       // rollback create of tab 1
  });

  it("validation passes when all ops reference known tabs and windows", async () => {
    mockTabsGet.mockResolvedValue({ id: 2, windowId: 2, index: 1, url: "https://other.com/" });
    const ops: Operation[] = [
      { kind: "move", tabId: 2, windowId: 2, index: 0 },
    ];
    const s = snapshot([
      { tabId: 1, windowId: 1 },
      { tabId: 2, windowId: 2 },
    ]);
    const result = await apply(ops, s);
    expect(result).toEqual({ ok: true });
  });
});
