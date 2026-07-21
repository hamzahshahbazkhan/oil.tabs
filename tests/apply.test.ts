import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Operation } from "../src/shared/types";

const mockTabsRemove = vi.fn();
const mockTabsMove = vi.fn();
const mockTabsCreate = vi.fn();
const mockTabsUpdate = vi.fn();

vi.mock("webextension-polyfill", () => ({
  default: {
    tabs: {
      remove: (...args: unknown[]) => mockTabsRemove(...args),
      move: (...args: unknown[]) => mockTabsMove(...args),
      create: (...args: unknown[]) => mockTabsCreate(...args),
      update: (...args: unknown[]) => mockTabsUpdate(...args),
    },
  },
}));

let apply: Awaited<typeof import("../src/background/apply")>["apply"];

beforeEach(async () => {
  vi.clearAllMocks();
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
