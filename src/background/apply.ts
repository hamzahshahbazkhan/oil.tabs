/// <reference types="webextension-polyfill" />
import browser from "webextension-polyfill";
import type { Operation, Snapshot } from "../shared/types";

const hasTabGroups = typeof (browser.tabs as any).group === "function";
const hasDiscard = typeof (browser.tabs as any).discard === "function";
const hasBookmarks = typeof (browser as any).bookmarks?.create === "function";

interface JournalEntry {
  description: string;
  rollback: () => Promise<void>;
}

// ── Validation ───────────────────────────────────────────────────────────

function tabIdOf(op: Operation): number | null {
  if (op.kind === "create") return null;
  if (op.kind === "restoreFromSaved") return null;
  return (op as any).tabId ?? null;
}

function validateOps(ops: Operation[], snapshot: Snapshot): string | null {
  const snapTabIds = new Set<number>();
  const snapWindowIds = new Set<number>();
  for (const line of snapshot.lines) {
    if (line.tabId !== null) snapTabIds.add(line.tabId);
    snapWindowIds.add(line.windowId);
  }

  for (const op of ops) {
    const tid = tabIdOf(op);
    if (tid !== null && !snapTabIds.has(tid)) {
      return `Tab ${tid} does not exist in the snapshot. It may have been closed.`;
    }
    if (
      (op.kind === "create" || op.kind === "restoreFromSaved") &&
      !snapWindowIds.has(op.windowId)
    ) {
      return `Window ${op.windowId} does not exist in the snapshot.`;
    }
    if (op.kind === "move" && !snapWindowIds.has(op.windowId)) {
      return `Target window ${op.windowId} does not exist in the snapshot.`;
    }
  }

  return null;
}

// ── Per-operation execution with rollback capture ────────────────────────

async function execClose(op: Operation & { kind: "close" }): Promise<JournalEntry> {
  const tab = await browser.tabs.get(op.tabId);
  const before = { url: tab.url ?? "", windowId: tab.windowId, index: tab.index };
  await browser.tabs.remove(op.tabId);
  return {
    description: `close tab ${op.tabId}`,
    rollback: async () => {
      await browser.tabs.create({
        url: before.url,
        windowId: before.windowId,
        index: before.index,
        active: false,
      });
    },
  };
}

async function execMove(op: Operation & { kind: "move" }): Promise<JournalEntry> {
  const tab = await browser.tabs.get(op.tabId);
  const before = { windowId: tab.windowId, index: tab.index };
  await browser.tabs.move(op.tabId, { windowId: op.windowId, index: op.index });
  return {
    description: `move tab ${op.tabId}`,
    rollback: async () => {
      await browser.tabs.move(op.tabId, { windowId: before.windowId, index: before.index });
    },
  };
}

async function execCreate(op: Operation & { kind: "create" }): Promise<JournalEntry> {
  const newTab = await browser.tabs.create({
    windowId: op.windowId,
    url: op.url,
    index: op.index,
    active: false,
  });
  const createdId = newTab.id;
  return {
    description: `create tab`,
    rollback: async () => {
      if (createdId !== undefined) {
        await browser.tabs.remove(createdId);
      }
    },
  };
}

async function execNavigate(op: Operation & { kind: "navigate" }): Promise<JournalEntry> {
  const tab = await browser.tabs.get(op.tabId);
  const beforeUrl = tab.url ?? "";
  await browser.tabs.update(op.tabId, { url: op.url });
  return {
    description: `navigate tab ${op.tabId}`,
    rollback: async () => {
      await browser.tabs.update(op.tabId, { url: beforeUrl });
    },
  };
}

async function execGroup(op: Operation & { kind: "group" }): Promise<JournalEntry> {
  if (!hasTabGroups) return { description: "group (noop)", rollback: async () => {} };

  const tab = await browser.tabs.get(op.tabId);
  const beforeGroupId: number | null = tab.groupId && tab.groupId > 0 ? tab.groupId : null;

  if (op.groupId === "NONE") {
    await browser.tabs.group({ tabIds: [op.tabId], groupId: -1 });
  } else if (op.groupId === "NEW") {
    await browser.tabs.group({ tabIds: [op.tabId] });
  } else {
    await browser.tabs.group({ tabIds: [op.tabId], groupId: op.groupId });
  }

  return {
    description: `group tab ${op.tabId}`,
    rollback: async () => {
      if (beforeGroupId !== null) {
        await browser.tabs.group({ tabIds: [op.tabId], groupId: beforeGroupId });
      } else {
        await browser.tabs.group({ tabIds: [op.tabId], groupId: -1 });
      }
    },
  };
}

async function execAssignFolder(op: Operation & { kind: "assignFolder" }): Promise<JournalEntry> {
  const { tabFolderMap } = await browser.storage.local.get("tabFolderMap");
  const map: Record<number, number> = tabFolderMap ?? {};
  const beforeVal: number | null = map[op.tabId] ?? null;

  if (op.folderId === null) {
    delete map[op.tabId];
  } else {
    map[op.tabId] = op.folderId;
  }
  await browser.storage.local.set({ tabFolderMap: map });

  return {
    description: `assignFolder tab ${op.tabId}`,
    rollback: async () => {
      const { tabFolderMap } = await browser.storage.local.get("tabFolderMap");
      const m: Record<number, number> = tabFolderMap ?? {};
      if (beforeVal === null) {
        delete m[op.tabId];
      } else {
        m[op.tabId] = beforeVal;
      }
      await browser.storage.local.set({ tabFolderMap: m });
    },
  };
}

async function execDiscard(op: Operation & { kind: "discard" }): Promise<JournalEntry> {
  if (!hasDiscard) return { description: "discard (noop)", rollback: async () => {} };

  await browser.tabs.discard(op.tabId);
  return {
    description: `discard tab ${op.tabId}`,
    rollback: async () => {
      console.warn(`Cannot undo discard of tab ${op.tabId} — tab remains discarded.`);
    },
  };
}

async function execSaveForLater(op: Operation & { kind: "saveForLater" }): Promise<JournalEntry> {
  const { savedForLater } = await browser.storage.local.get("savedForLater");
  const list: { url: string; title: string; savedAt: number }[] = savedForLater ?? [];
  list.push({ url: op.url, title: op.title, savedAt: Date.now() });
  await browser.storage.local.set({ savedForLater: list });

  let beforeTab: { url: string; windowId: number; index: number } | null = null;
  if (op.tabId > 0) {
    try {
      const t = await browser.tabs.get(op.tabId);
      beforeTab = { url: t.url ?? "", windowId: t.windowId, index: t.index };
    } catch {
      // Tab may already be gone
    }
    await browser.tabs.remove(op.tabId);
  }

  return {
    description: `saveForLater`,
    rollback: async () => {
      const { savedForLater } = await browser.storage.local.get("savedForLater");
      const updated = (savedForLater ?? []).filter(
        (item: any) => !(item.url === op.url && item.title === op.title),
      );
      await browser.storage.local.set({ savedForLater: updated });

      if (beforeTab) {
        await browser.tabs.create({
          url: beforeTab.url,
          windowId: beforeTab.windowId,
          index: beforeTab.index,
          active: false,
        });
      }
    },
  };
}

async function execBookmark(op: Operation & { kind: "bookmark" }): Promise<JournalEntry> {
  if (!hasBookmarks) return { description: "bookmark (noop)", rollback: async () => {} };

  let beforeTab: { url: string; windowId: number; index: number } | null = null;
  try {
    const t = await browser.tabs.get(op.tabId);
    beforeTab = { url: t.url ?? "", windowId: t.windowId, index: t.index };
  } catch {
    // Tab may already be gone
  }

  let bookmarkId: string | undefined;
  try {
    const bmNode = await browser.bookmarks.create({ title: op.title, url: op.url });
    bookmarkId = bmNode.id;
  } catch {
    // Bookmark creation failed but we still need to handle the tab
  }

  await browser.tabs.remove(op.tabId);

  return {
    description: `bookmark tab ${op.tabId}`,
    rollback: async () => {
      if (bookmarkId !== undefined) {
        try {
          await browser.bookmarks.remove(bookmarkId);
        } catch {
          console.warn(`Could not remove bookmark ${bookmarkId}`);
        }
      }
      if (beforeTab) {
        await browser.tabs.create({
          url: beforeTab.url,
          windowId: beforeTab.windowId,
          index: beforeTab.index,
          active: false,
        });
      }
    },
  };
}

async function execRestoreFromSaved(op: Operation & { kind: "restoreFromSaved" }): Promise<JournalEntry> {
  const newTab = await browser.tabs.create({
    url: op.url,
    windowId: op.windowId,
    index: op.index,
  });
  const createdId = newTab.id;

  const { savedForLater } = await browser.storage.local.get("savedForLater");
  const list: { url: string; title: string; savedAt: number }[] = savedForLater ?? [];
  const idx = list.findIndex((item) => item.url === op.url);
  const removed = idx !== -1 ? list.splice(idx, 1)[0] : null;
  await browser.storage.local.set({ savedForLater: list });

  return {
    description: `restoreFromSaved`,
    rollback: async () => {
      if (createdId !== undefined) {
        await browser.tabs.remove(createdId);
      }
      const { savedForLater } = await browser.storage.local.get("savedForLater");
      const restored = savedForLater ?? [];
      if (removed) restored.push(removed);
      await browser.storage.local.set({ savedForLater: restored });
    },
  };
}

// ── Main entry point ─────────────────────────────────────────────────────

export async function apply(
  ops: Operation[],
  preSnapshot: Snapshot,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validationError = validateOps(ops, preSnapshot);
  if (validationError) return { ok: false, error: validationError };

  const journal: JournalEntry[] = [];

  for (const op of ops) {
    try {
      let entry: JournalEntry;
      switch (op.kind) {
        case "close":        entry = await execClose(op); break;
        case "move":         entry = await execMove(op); break;
        case "create":       entry = await execCreate(op); break;
        case "navigate":     entry = await execNavigate(op); break;
        case "group":        entry = await execGroup(op); break;
        case "assignFolder": entry = await execAssignFolder(op); break;
        case "discard":      entry = await execDiscard(op); break;
        case "saveForLater": entry = await execSaveForLater(op); break;
        case "bookmark":     entry = await execBookmark(op); break;
        case "restoreFromSaved": entry = await execRestoreFromSaved(op); break;
        default: {
          const _exhaustive: never = op;
          throw new Error(`Unknown operation kind: ${(_exhaustive as any).kind}`);
        }
      }
      journal.push(entry);
    } catch (err) {
      // Rollback in reverse order (LIFO)
      const rollbackErrors: string[] = [];
      for (let i = journal.length - 1; i >= 0; i--) {
        try {
          await journal[i].rollback();
        } catch (rbErr) {
          rollbackErrors.push(
            `"${journal[i].description}" undo: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`,
          );
        }
      }

      const msg = err instanceof Error ? err.message : String(err);
      const tabId =
        op.kind === "create" || op.kind === "restoreFromSaved"
          ? "new"
          : String((op as any).tabId ?? "");
      let error = `Failed to ${op.kind} tab ${tabId}: ${msg}`;
      if (rollbackErrors.length > 0) {
        error += ` | Partial rollback: ${rollbackErrors.join("; ")}`;
      }
      return { ok: false, error };
    }
  }

  return { ok: true };
}
