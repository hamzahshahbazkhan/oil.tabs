import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Operation } from "../src/shared/types";

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

beforeEach(async () => {
  vi.clearAllMocks();
  mockStorageGet.mockResolvedValue({});
  apply = (await import("../src/background/apply")).apply;
});

describe("apply", () => {
  it("create op calls tabs.create with correct args", async () => {
    const ops: Operation[] = [
      { kind: "create", url: "https://newtab.com/", windowId: 1, index: 2 },
    ];
    const result = await apply(ops);
    expect(result).toEqual({ ok: true });
    expect(mockTabsCreate).toHaveBeenCalledTimes(1);
    expect(mockTabsCreate).toHaveBeenCalledWith({
      windowId: 1,
      url: "https://newtab.com/",
      index: 2,
    });
  });

  it("navigate op calls tabs.update with correct args", async () => {
    const ops: Operation[] = [
      { kind: "navigate", tabId: 42, url: "https://other.com/" },
    ];
    const result = await apply(ops);
    expect(result).toEqual({ ok: true });
    expect(mockTabsUpdate).toHaveBeenCalledTimes(1);
    expect(mockTabsUpdate).toHaveBeenCalledWith(42, { url: "https://other.com/" });
  });

  it("multiple ops in sequence are all executed", async () => {
    const ops: Operation[] = [
      { kind: "close", tabId: 1 },
      { kind: "create", url: "https://a.com/", windowId: 1, index: 0 },
    ];
    const result = await apply(ops);
    expect(result).toEqual({ ok: true });
    expect(mockTabsRemove).toHaveBeenCalledTimes(1);
    expect(mockTabsCreate).toHaveBeenCalledTimes(1);
  });

  it("assignFolder op writes to storage.local", async () => {
    mockStorageGet.mockResolvedValueOnce({});
    const ops: Operation[] = [
      { kind: "assignFolder", tabId: 1, folderId: 5 },
    ];
    const result = await apply(ops);
    expect(result).toEqual({ ok: true });
    expect(mockStorageSet).toHaveBeenCalledTimes(1);
    expect(mockStorageSet).toHaveBeenCalledWith({ tabFolderMap: { 1: 5 } });
  });

  it("discard op calls tabs.discard", async () => {
    const ops: Operation[] = [
      { kind: "discard", tabId: 42 },
    ];
    const result = await apply(ops);
    expect(result).toEqual({ ok: true });
    expect(mockTabsDiscard).toHaveBeenCalledWith(42);
  });

  it("assignFolder op with null folderId removes entry", async () => {
    mockStorageGet.mockResolvedValueOnce({ tabFolderMap: { 1: 5, 2: 3 } });
    const ops: Operation[] = [
      { kind: "assignFolder", tabId: 1, folderId: null },
    ];
    const result = await apply(ops);
    expect(result).toEqual({ ok: true });
    expect(mockStorageSet).toHaveBeenCalledWith({ tabFolderMap: { 2: 3 } });
  });

  it("failure in an op returns error and stops", async () => {
    mockTabsCreate.mockRejectedValueOnce(new Error("no window"));
    const ops: Operation[] = [
      { kind: "close", tabId: 1 },
      { kind: "create", url: "https://x.com/", windowId: 99, index: 0 },
    ];
    const result = await apply(ops);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Failed to create tab new");
    expect(result.error).toContain("no window");
    expect(mockTabsRemove).toHaveBeenCalledTimes(1);
    expect(mockTabsCreate).toHaveBeenCalledTimes(1);
  });
});
