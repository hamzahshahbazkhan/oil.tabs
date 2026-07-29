import type { BufferLine, Operation, ParsedLine, Snapshot } from "../shared/types";

export function diff(oldSnapshot: Snapshot, parsed: ParsedLine[], folderMap?: Map<number, number | null>, savedUrls?: Set<string>): Operation[] {
  const oldById = new Map<number, BufferLine>();
  for (const line of oldSnapshot.lines) {
    if (line.tabId !== null) {
      oldById.set(line.tabId, line);
    }
  }

  const savedTabIds = new Set<number>();
  const newIds = new Set<number>();
  for (const line of parsed) {
    if (line.tabId !== null && !line.saved) {
      newIds.add(line.tabId);
    }
    if (line.tabId !== null && line.saved) {
      savedTabIds.add(line.tabId);
    }
  }

  const closeOps: Operation[] = [];
  for (const tabId of oldById.keys()) {
    if (!newIds.has(tabId) && !savedTabIds.has(tabId)) {
      closeOps.push({ kind: "close", tabId });
    }
  }

  const closedIds = new Set(closeOps.filter((op): op is { kind: "close"; tabId: number } => op.kind === "close").map((op) => op.tabId));

  const createOps: Operation[] = [];
  const perWindowPos = new Map<number, number>();
  for (const line of parsed) {
    const pos = perWindowPos.get(line.windowId) ?? 0;
    if (line.tabId === null && !line.saved) {
      createOps.push({ kind: "create", url: line.url, windowId: line.windowId, index: pos });
    }
    perWindowPos.set(line.windowId, pos + 1);
  }

  const newOrder = new Map<number, number[]>();
  for (const line of parsed) {
    if (line.tabId !== null && !closedIds.has(line.tabId)) {
      const group = newOrder.get(line.windowId);
      if (group) {
        group.push(line.tabId);
      } else {
        newOrder.set(line.windowId, [line.tabId]);
      }
    }
  }

  const oldOrder = new Map<number, number[]>();
  for (const line of oldSnapshot.lines) {
    if (line.tabId !== null && !closedIds.has(line.tabId)) {
      const group = oldOrder.get(line.windowId);
      if (group) {
        group.push(line.tabId);
      } else {
        oldOrder.set(line.windowId, [line.tabId]);
      }
    }
  }

  const oldWindowOf = new Map<number, number>();
  for (const line of oldSnapshot.lines) {
    if (line.tabId !== null) {
      oldWindowOf.set(line.tabId, line.windowId);
    }
  }

  const moveOps: Operation[] = [];

  for (const [windowId, tabIds] of newOrder) {
    for (const tabId of tabIds) {
      const oldWid = oldWindowOf.get(tabId);
      if (oldWid !== undefined && oldWid !== windowId) {
        const index = tabIds.indexOf(tabId);
        moveOps.push({ kind: "move", tabId, windowId, index });
      }
    }
  }

  const allWindowIds = new Set([...oldOrder.keys(), ...newOrder.keys()]);
  for (const windowId of allWindowIds) {
    const oldArr = oldOrder.get(windowId) ?? [];
    const newArr = newOrder.get(windowId) ?? [];

    const crossWindowMovedOut = new Set(
      moveOps.filter((op): op is { kind: "move"; tabId: number; windowId: number; index: number } => op.kind === "move" && oldWindowOf.get(op.tabId) === windowId).map((op) => op.tabId)
    );
    const crossWindowMovedIn = new Set(
      moveOps.filter((op): op is { kind: "move"; tabId: number; windowId: number; index: number } => op.kind === "move" && op.windowId === windowId && oldWindowOf.get(op.tabId) !== windowId).map((op) => op.tabId)
    );

    const oldFiltered = oldArr.filter((id) => !crossWindowMovedOut.has(id));
    const newFiltered = newArr.filter((id) => !crossWindowMovedOut.has(id) && !crossWindowMovedIn.has(id));

    const lcs = computeLCS(oldFiltered, newFiltered);
    const lcsSet = new Set(lcs);

    for (const tabId of newFiltered) {
      if (!lcsSet.has(tabId)) {
        const index = newArr.indexOf(tabId);
        moveOps.push({ kind: "move", tabId, windowId, index });
      }
    }
  }

  const navigateOps: Operation[] = [];
  for (const line of parsed) {
    if (line.tabId !== null) {
      const oldLine = oldById.get(line.tabId);
      if (oldLine && oldLine.url !== line.url) {
        navigateOps.push({ kind: "navigate", tabId: line.tabId, url: line.url });
      }
    }
  }

  const groupOps: Operation[] = [];
  for (const line of parsed) {
    if (line.tabId !== null) {
      const oldLine = oldById.get(line.tabId);
      if (oldLine && oldLine.groupId !== line.groupId) {
        const targetGroupId: number | "NONE" = line.groupId ?? "NONE";
        groupOps.push({ kind: "group", tabId: line.tabId, groupId: targetGroupId });
      }
    }
  }

  const folderOps: Operation[] = [];
  if (folderMap) {
    for (const line of parsed) {
      if (line.tabId !== null) {
        const oldFolder = folderMap.get(line.tabId) ?? null;
        if (oldFolder !== line.folderId) {
          folderOps.push({ kind: "assignFolder", tabId: line.tabId, folderId: line.folderId });
        }
      }
    }
  }

  const saveRestoreOps: Operation[] = [];
  for (const line of parsed) {
    if (line.saved) {
      if (line.tabId !== null) {
        const oldLine = oldById.get(line.tabId);
        saveRestoreOps.push({ kind: "saveForLater", tabId: line.tabId, url: line.url, title: oldLine?.title ?? "" });
      } else {
        saveRestoreOps.push({ kind: "saveForLater", tabId: 0, url: line.url, title: "" });
      }
    }
  }
  if (savedUrls) {
    const savedRestorePos = new Map<number, number>();
    for (const line of parsed) {
      if (!line.saved && line.tabId === null && savedUrls.has(line.url)) {
        const pos = savedRestorePos.get(line.windowId) ?? 0;
        saveRestoreOps.push({ kind: "restoreFromSaved", url: line.url, title: "", windowId: line.windowId, index: pos });
        savedRestorePos.set(line.windowId, pos + 1);
      }
    }
  }

  const validMoveOps = validateMoveOps(moveOps, oldSnapshot);

  return [...closeOps, ...validMoveOps, ...createOps, ...navigateOps, ...groupOps, ...folderOps, ...saveRestoreOps];
}

export function validateMoveOps(moveOps: Operation[], snapshot: Snapshot): Operation[] {
  const pinnedByTab = new Map<number, boolean>();
  const oldWindowOf = new Map<number, number>();
  for (const line of snapshot.lines) {
    if (line.tabId !== null) {
      pinnedByTab.set(line.tabId, line.pinned);
      oldWindowOf.set(line.tabId, line.windowId);
    }
  }

  const basePinnedCount = new Map<number, number>();
  for (const line of snapshot.lines) {
    if (line.tabId !== null && line.pinned) {
      basePinnedCount.set(line.windowId, (basePinnedCount.get(line.windowId) ?? 0) + 1);
    }
  }

  const pendingMoveOps = moveOps.filter((op): op is Operation & { kind: "move" } => op.kind === "move");

  for (const op of pendingMoveOps) {
    const isPinned = pinnedByTab.get(op.tabId) ?? false;
    const oldWid = oldWindowOf.get(op.tabId);
    if (oldWid !== undefined && oldWid !== op.windowId) {
      if (isPinned) {
        basePinnedCount.set(oldWid, (basePinnedCount.get(oldWid) ?? 1) - 1);
        basePinnedCount.set(op.windowId, (basePinnedCount.get(op.windowId) ?? 0) + 1);
      }
    }
  }

  return pendingMoveOps.filter((op) => {
    const isPinned = pinnedByTab.get(op.tabId) ?? false;
    let pinnedCount = basePinnedCount.get(op.windowId) ?? 0;
    const oldWid = oldWindowOf.get(op.tabId);
    if (oldWid !== undefined && oldWid !== op.windowId && isPinned) {
      pinnedCount--;
    }
    if (isPinned && op.index >= pinnedCount) return false;
    if (!isPinned && op.index < pinnedCount) return false;
    return true;
  });
}

function computeLCS(a: number[], b: number[]): number[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: number[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}
