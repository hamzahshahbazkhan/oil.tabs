import type { BufferLine, Operation, ParsedLine, Snapshot } from "../shared/types";

export function diff(
  oldSnapshot: Snapshot,
  parsed: ParsedLine[],
  folderMap?: Map<number, number | null>,
  savedUrls?: Set<string>,
): Operation[] {
  // ── Phase 1: Build identity maps ──

  const oldById = new Map<number, BufferLine>();
  const oldWindowOf = new Map<number, number>();
  for (const line of oldSnapshot.lines) {
    if (line.tabId !== null) {
      oldById.set(line.tabId, line);
      oldWindowOf.set(line.tabId, line.windowId);
    }
  }

  const tabIdsBeingSaved = new Set<number>();
  const tabIdsInNewText = new Set<number>();
  for (const line of parsed) {
    if (line.tabId === null) continue;
    if (line.saved) tabIdsBeingSaved.add(line.tabId);
    else tabIdsInNewText.add(line.tabId);
  }

  // ── Phase 2: Close ops (tabs removed from the live layout) ──

  const closeOps: Operation[] = [];
  for (const tabId of oldById.keys()) {
    if (!tabIdsInNewText.has(tabId) && !tabIdsBeingSaved.has(tabId)) {
      closeOps.push({ kind: "close", tabId });
    }
  }
  const closedIds = new Set(closeOps.map((op) => op.tabId));

  // ── Phase 3: Create ops (new URLs the user typed) ──

  const tabIndexWithinWindow = new Map<number, number>();
  const createOps: Operation[] = [];
  for (const line of parsed) {
    const idx = tabIndexWithinWindow.get(line.windowId) ?? 0;
    if (line.tabId === null && !line.saved) {
      createOps.push({ kind: "create", url: line.url, windowId: line.windowId, index: idx });
    }
    tabIndexWithinWindow.set(line.windowId, idx + 1);
  }

  // ── Phase 4: Identity-change ops (navigate / group / folder) ──

  const navigateOps: Operation[] = [];
  const groupOps: Operation[] = [];
  const folderOps: Operation[] = [];
  for (const line of parsed) {
    if (line.tabId === null) continue;
    const old = oldById.get(line.tabId);
    if (!old) continue;

    if (old.url !== line.url) {
      navigateOps.push({ kind: "navigate", tabId: line.tabId, url: line.url });
    }
    if (old.groupId !== line.groupId) {
      groupOps.push({ kind: "group", tabId: line.tabId, groupId: line.groupId ?? "NONE" });
    }
    if (folderMap) {
      const oldFolder = folderMap.get(line.tabId) ?? null;
      if (oldFolder !== line.folderId) {
        folderOps.push({ kind: "assignFolder", tabId: line.tabId, folderId: line.folderId });
      }
    }
  }

  // ── Phase 5: Move ops (cross-window then within-window via LCS) ──

  const canMove = (tabId: number) => !closedIds.has(tabId) && !tabIdsBeingSaved.has(tabId);

  const oldOrder = new Map<number, number[]>();
  for (const line of oldSnapshot.lines) {
    if (line.tabId !== null && canMove(line.tabId)) {
      const a = oldOrder.get(line.windowId) ?? [];
      a.push(line.tabId);
      oldOrder.set(line.windowId, a);
    }
  }

  const newOrder = new Map<number, number[]>();
  for (const line of parsed) {
    if (line.tabId !== null && canMove(line.tabId)) {
      const a = newOrder.get(line.windowId) ?? [];
      a.push(line.tabId);
      newOrder.set(line.windowId, a);
    }
  }

  const moveOps: Operation[] = [];

  // 5a — cross-window moves
  for (const [windowId, tabIds] of newOrder) {
    for (const tabId of tabIds) {
      const oldWid = oldWindowOf.get(tabId);
      if (oldWid !== undefined && oldWid !== windowId) {
        moveOps.push({ kind: "move", tabId, windowId, index: tabIds.indexOf(tabId) });
      }
    }
  }

  // 5b — within-window moves (LCS, avoid redundant ops for cross-window arrivals)
  const allWindowIds = new Set([...oldOrder.keys(), ...newOrder.keys()]);
  for (const windowId of allWindowIds) {
    const oldArr = oldOrder.get(windowId) ?? [];
    const newArr = newOrder.get(windowId) ?? [];

    const movedOut = new Set(
      moveOps
        .filter((op): op is Operation & { kind: "move" } =>
          op.kind === "move" && oldWindowOf.get(op.tabId) === windowId)
        .map((op) => op.tabId),
    );
    const movedIn = new Set(
      moveOps
        .filter((op): op is Operation & { kind: "move" } =>
          op.kind === "move" && op.windowId === windowId && oldWindowOf.get(op.tabId) !== windowId)
        .map((op) => op.tabId),
    );

    const stableOld = oldArr.filter((id) => !movedOut.has(id));
    const stableNew = newArr.filter((id) => !movedIn.has(id) && !movedOut.has(id));

    const lcs = computeLCS(stableOld, stableNew);
    const lcsSet = new Set(lcs);

    for (const tabId of stableNew) {
      if (!lcsSet.has(tabId)) {
        moveOps.push({ kind: "move", tabId, windowId, index: newArr.indexOf(tabId) });
      }
    }
  }

  // ── Phase 6: Validate move ops ──

  const validMoveOps = validateMoveOps(moveOps, oldSnapshot);

  // ── Phase 7: Save / restore ops ──

  const saveRestoreOps: Operation[] = [];
  for (const line of parsed) {
    if (!line.saved) continue;
    if (line.tabId !== null) {
      const old = oldById.get(line.tabId);
      saveRestoreOps.push({ kind: "saveForLater", tabId: line.tabId, url: line.url, title: old?.title ?? "" });
    } else {
      saveRestoreOps.push({ kind: "saveForLater", tabId: 0, url: line.url, title: "" });
    }
  }
  if (savedUrls) {
    const restorePos = new Map<number, number>();
    for (const line of parsed) {
      if (!line.saved && line.tabId === null && savedUrls.has(line.url)) {
        const p = restorePos.get(line.windowId) ?? 0;
        saveRestoreOps.push({ kind: "restoreFromSaved", url: line.url, title: "", windowId: line.windowId, index: p });
        restorePos.set(line.windowId, p + 1);
      }
    }
  }

  // ── Phase 8: Return in execution order ──

  return [
    ...closeOps,
    ...validMoveOps,
    ...createOps,
    ...navigateOps,
    ...groupOps,
    ...folderOps,
    ...saveRestoreOps,
  ];
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

  // pinned count from snapshot
  const basePinnedCount = new Map<number, number>();
  for (const line of snapshot.lines) {
    if (line.tabId !== null && line.pinned) {
      basePinnedCount.set(line.windowId, (basePinnedCount.get(line.windowId) ?? 0) + 1);
    }
  }

  const pendingMoves = moveOps.filter((op): op is Operation & { kind: "move" } => op.kind === "move");

  // adjust pinned count for cross-window moves
  for (const op of pendingMoves) {
    const pinned = pinnedByTab.get(op.tabId) ?? false;
    const oldWid = oldWindowOf.get(op.tabId);
    if (oldWid !== undefined && oldWid !== op.windowId && pinned) {
      basePinnedCount.set(oldWid, (basePinnedCount.get(oldWid) ?? 1) - 1);
      basePinnedCount.set(op.windowId, (basePinnedCount.get(op.windowId) ?? 0) + 1);
    }
  }

  return pendingMoves.filter((op) => {
    const pinned = pinnedByTab.get(op.tabId) ?? false;
    let count = basePinnedCount.get(op.windowId) ?? 0;
    const oldWid = oldWindowOf.get(op.tabId);
    if (oldWid !== undefined && oldWid !== op.windowId && pinned) {
      count--;
    }
    if (pinned && op.index >= count) return false;
    if (!pinned && op.index < count) return false;
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
