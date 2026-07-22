import type { BufferLine, Operation, ParsedLine, Snapshot } from "../shared/types";

export function diff(oldSnapshot: Snapshot, parsed: ParsedLine[]): Operation[] {
  const oldById = new Map<number, BufferLine>();
  for (const line of oldSnapshot.lines) {
    if (line.tabId !== null) {
      oldById.set(line.tabId, line);
    }
  }

  const newIds = new Set<number>();
  for (const line of parsed) {
    if (line.tabId !== null) {
      newIds.add(line.tabId);
    }
  }

  const closeOps: Operation[] = [];
  for (const tabId of oldById.keys()) {
    if (!newIds.has(tabId)) {
      closeOps.push({ kind: "close", tabId });
    }
  }

  const closedIds = new Set(closeOps.filter((op): op is { kind: "close"; tabId: number } => op.kind === "close").map((op) => op.tabId));

  const createOps: Operation[] = [];
  const perWindowPos = new Map<number, number>();
  for (const line of parsed) {
    const pos = perWindowPos.get(line.windowId) ?? 0;
    if (line.tabId === null) {
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

    const crossWindowMoved = new Set(
      moveOps.filter((op): op is { kind: "move"; tabId: number; windowId: number; index: number } => op.kind === "move" && oldWindowOf.get(op.tabId) === windowId).map((op) => op.tabId)
    );

    const oldFiltered = oldArr.filter((id) => !crossWindowMoved.has(id));
    const newFiltered = newArr.filter((id) => !crossWindowMoved.has(id));

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

  const validMoveOps = validateMoveOps(moveOps, oldSnapshot);

  return [...closeOps, ...validMoveOps, ...createOps, ...navigateOps, ...groupOps];
}

export function validateMoveOps(moveOps: Operation[], snapshot: Snapshot): Operation[] {
  const pinnedByTab = new Map<number, boolean>();
  for (const line of snapshot.lines) {
    if (line.tabId !== null) {
      pinnedByTab.set(line.tabId, line.pinned);
    }
  }

  const perWindowPinnedCount = new Map<number, number>();
  for (const line of snapshot.lines) {
    if (line.tabId !== null && line.pinned) {
      perWindowPinnedCount.set(line.windowId, (perWindowPinnedCount.get(line.windowId) ?? 0) + 1);
    }
  }

  return moveOps.filter((op): op is Operation & { kind: "move" } => {
    if (op.kind !== "move") return false;
    const isPinned = pinnedByTab.get(op.tabId) ?? false;
    const pinnedCount = perWindowPinnedCount.get(op.windowId) ?? 0;
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
