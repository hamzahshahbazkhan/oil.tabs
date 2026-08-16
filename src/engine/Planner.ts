import type { Operation, Snapshot } from "../shared/types";

type Stage =
  | "create"
  | "crossWindowMove"
  | "sameWindowMove"
  | "group"
  | "assignFolder"
  | "navigate"
  | "bookmark"
  | "saveForLater"
  | "deleteSaved"
  | "close"
  | "discard"
  | "restoreFromSaved";

const STAGE_ORDER: Stage[] = [
  "create",
  "crossWindowMove",
  "sameWindowMove",
  "group",
  "assignFolder",
  "navigate",
  "bookmark",
  "saveForLater",
  "deleteSaved",
  "close",
  "discard",
  "restoreFromSaved",
];

export function plan(
  ops: Operation[],
  snapshot: Snapshot,
): Operation[] {
  const tabWindow = new Map<number, number>();
  for (const line of snapshot.lines) {
    if (line.tabId !== null) {
      tabWindow.set(line.tabId, line.windowId);
    }
  }

  const buckets = new Map<Stage, Operation[]>();
  for (const stage of STAGE_ORDER) {
    buckets.set(stage, []);
  }

  const badKind = (_: never): never => {
    throw new Error("unreachable");
  };

  for (const op of ops) {
    switch (op.kind) {
      case "create":
        buckets.get("create")!.push(op);
        break;

      case "restoreFromSaved":
        buckets.get("restoreFromSaved")!.push(op);
        break;

      case "close":
        buckets.get("close")!.push(op);
        break;

      case "discard":
        buckets.get("discard")!.push(op);
        break;

      case "navigate":
        buckets.get("navigate")!.push(op);
        break;

      case "group":
        buckets.get("group")!.push(op);
        break;

      case "assignFolder":
        buckets.get("assignFolder")!.push(op);
        break;

      case "bookmark":
        buckets.get("bookmark")!.push(op);
        break;

      case "saveForLater":
        buckets.get("saveForLater")!.push(op);
        break;

      case "deleteSaved":
        buckets.get("deleteSaved")!.push(op);
        break;

      case "move": {
        const currentWid = tabWindow.get(op.tabId);
        const isCross = currentWid !== undefined && currentWid !== op.windowId;
        buckets.get(isCross ? "crossWindowMove" : "sameWindowMove")!.push(op);
        break;
      }

      default:
        badKind(op);
    }
  }

  const result: Operation[] = [];
  for (const stage of STAGE_ORDER) {
    for (const op of buckets.get(stage)!) {
      result.push(op);
    }
  }
  return result;
}
