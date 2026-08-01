# Audit Explanations

## 1. Concurrent SAVE Race

**Concept: Async reentrancy / critical sections**

When an async function reads state, computes, and writes — two invocations can interleave:

```
Save A:  read_storage ── compute_ops ── execute ── write_storage
Save B:                    read_storage ── compute_ops ── execute ── write_storage
```

B reads **stale** data (A hasn't written yet), computes ops against tabs A already closed, then **its rollback undoes A's work**. Net result: tabs A meant to close are still open — silent data corruption.

**The code** (before fix in `src/background/index.ts`):

```ts
case "SAVE": {
  const snapshot = await takeSnapshot();          // read
  const ops = diff(snapshot, parsed, ...);        // compute
  const result = await execute(plannedOps, snapshot);  // write
  // ...
}
```

No guard at all. Two rapid Ctrl-S presses → double execution.

**The fix: promise-chain mutex**

```ts
let saveLock = Promise.resolve();

async function withSaveLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const prev = saveLock;
  saveLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev; // wait for the previous save to finish
  try {
    return await fn(); // exclusive access
  } finally {
    release!(); // unblock the next waiter
  }
}
```

**How it works** — the lock is a **chain of promises**. Each new save:

1. Captures the current tail (`prev`)
2. Creates a new unresolved promise as the new tail
3. Awaits `prev` (blocks until the prior save calls `release()`)
4. Runs the save body exclusively
5. Calls `release()` to resolve the new tail, allowing the next waiter

Visually:

```
Save 1 arrives:  prev = resolved(✔),  new tail = promise_1,  await ✔ → runs immediately
Save 2 arrives:  prev = promise_1,     new tail = promise_2,  await promise_1 → blocks
Save 1 finishes: release() → promise_1 resolves
Save 2:          promise_1 resolved → runs
```

The fix wraps the entire SAVE logic:

```ts
case "SAVE": {
  await withSaveLock(async () => {
    // diff, execute, refresh — all serialized
  });
  break;
}
```

**Why not a boolean flag?** `await` yields the event loop. A boolean `let saving = false` would let two awaits both see `false` before either sets it to `true`. The promise chain is atomic because `saveLock` is replaced synchronously before any `await`.

---

## 2. O(n²) Move Indexing

**Concept: Algorithm complexity**

`Array.indexOf` is O(n) — it scans every element. Calling it inside a loop that already iterates every element makes the whole thing O(n²):

```
For 100 tabs:  100 × 100 = 10,000 comparisons
For 1000 tabs: 1,000 × 1,000 = 1,000,000 comparisons
```

**The bug in `src/engine/DiffEngine.ts`:**

```ts
for (const [windowId, tabIds] of newOrder) {
  for (const tabId of tabIds) {
    // ...
    moveOps.push({
      kind: "move",
      tabId,
      windowId,
      index: tabIds.indexOf(tabId), // ← scans whole array for each tab!
    });
  }
}
```

We already have `tabId` from iterating `tabIds` — we know its position is the current loop index. But we can't use the loop counter here because the inner loop body doesn't naturally carry it (it uses `for...of`). The fix:

```ts
for (const [windowId, tabIds] of newOrder) {
  const indexOfTab = new Map<number, number>();
  for (let i = 0; i < tabIds.length; i++) indexOfTab.set(tabIds[i], i); // O(n) pass to build lookup table

  for (const tabId of tabIds) {
    // ...
    moveOps.push({
      kind: "move",
      tabId,
      windowId,
      index: indexOfTab.get(tabId)!, // O(1) hash-map lookup
    });
  }
}
```

**The data structure: `Map<K, V>`** — a hash table. `set` and `get` are both O(1) average case. Building it costs O(n), then each lookup costs O(1). Total: O(n). The same pattern was applied to the LCS section where `newArr.indexOf(tabId)` was also O(n²).

**The LCS algorithm itself** — the **Longest Common Subsequence** is computed with DP:

```
DP table: dp[i][j] = LCS of a[0..i) and b[0..j)
Recurrence:
  if a[i-1] == b[j-1]: dp[i][j] = dp[i-1][j-1] + 1
  else:                dp[i][j] = max(dp[i-1][j], dp[i][j-1])

Backtracking reconstructs the actual subsequence by walking
the DP table from dp[m][n] back to dp[0][0].
```

The DP table is O(m×n) memory. The backtracking is O(m+n).

---

## 3. Redundant Storage Reads

**Concept: IPC overhead**

Every `browser.storage.local.get()` crosses the extension process boundary — it's an IPC message. Even a fast one takes ~1-5ms. Doing 5 when 1 suffices wastes 4-20ms per save.

**The bug:**

```ts
// READ 1: for computing the diff
const { folders, tabFolderMap, savedForLater } = await storageLocalGet([
  "folders",
  "tabFolderMap",
  "savedForLater",
]);

// ... execute ...

// READ 2: for post-save state
const freshFolderData = await loadFolderData(); // wraps storageLocalGet(["folders", "tabFolderMap"])
// READ 3: for post-save state
const freshSavedItems = await loadSavedItems(); // wraps storageLocalGet("savedForLater")
```

Three reads for data that could come from one. `loadFolderData()` and `loadSavedItems()` were helper functions that each made their own storage call, unaware that the caller already had the data.

**The fix** — single read, destructure once:

```ts
const storedData = await storageLocalGet([
  "folders",
  "tabFolderMap",
  "savedForLater",
]);
const storedFolders = storedData.folders ?? [];
const storedTabFolderMap = storedData.tabFolderMap ?? {};
const storedSavedForLater = storedData.savedForLater ?? [];

// ... diff and execute ...

// Post-save: single read instead of two helpers
const fd = await storageLocalGet(["folders", "tabFolderMap", "savedForLater"]);
```

---

## 4. Dead Variable (`previousUrlMap`)

**Concept: Observability debt**

A variable that's written but never read is **dead code**. It signals incomplete refactoring and confuses readers.

```ts
let previousUrlMap: Map<string, number[]> | null = null; // declared

// In REQUEST_SNAPSHOT:
previousUrlMap = prevUrlMap; // written

// In SAVE:
previousUrlMap = prevUrlMap; // written twice
previousUrlMap = prevUrlMap;
```

It was part of an older URL-fallback scheme. When that scheme changed, the variable remained. **Zero behavioral impact** from removing it — the code does exactly the same thing.

**How to catch these:** `@typescript-eslint/no-unused-vars` with `args: "none"` catches unused variables while allowing unused function parameters (e.g., for event handlers).

---

## 5. Unwrapped Browser API Call

**Concept: Facade pattern / single point of contact**

BrowserAdapter is meant to be the **only** module that directly calls `browser.*`. When code elsewhere does the same thing, it defeats:

- Centralized feature detection
- Consistent error handling
- Mockability for tests

**The bug:**

```ts
// background/index.ts
await (browser.tabs as any).discard(tabId); // bypasses the facade
```

And in BrowserAdapter:

```ts
export async function discardTab(tabId: number): Promise<void> {
  await (browser.tabs as any).discard(tabId);
}
```

Identical logic. But if we later add a `hasDiscard` feature check in the facade, the background handler would miss it. And the `as any` cast is scattered to another file.

**The fix:**

```ts
import { discardTab } from "../adapter/BrowserAdapter";
await discardTab(tabId);
```

---

## 6. Inconsistent Favicon Filtering

**Concept: Invariant preservation**

Two code paths that produce semantically equivalent data must apply the same transformations. If they diverge, consumers see inconsistent behavior.

**The divergence:**

`takeSnapshot` in BrowserAdapter `src/adapter/BrowserAdapter.ts`:

```ts
const favIconUrl =
  tab.favIconUrl &&
  (tab.favIconUrl.startsWith("http") || tab.favIconUrl.startsWith("data:"))
    ? tab.favIconUrl
    : undefined;
```

But `tabToBufferLine` in TabModel `src/model/TabModel.ts`:

```ts
favIconUrl: tab.favIconUrl,  // raw value — could be chrome://favicon/..., blob:, data:, moz-extension://...
```

**Consequence:** Incremental snapshot updates (from TabModel event listeners) would include `chrome-extension://` favicons. Full snapshot refreshes (from `takeSnapshot`) would strip them. The buffer tab would see the icon appear and disappear on every alternate update.

**The fix:**

```ts
function favIconUrl(tab: browser.tabs.Tab): string | undefined {
  const url = tab.favIconUrl;
  return url && (url.startsWith("http") || url.startsWith("data:"))
    ? url
    : undefined;
}
```

Both paths now agree.

---

## 7. LCS Edge Case — Empty Arrays

**Concept: Defensive programming / edge case handling**

Every algorithm must handle its boundary cases. The LCS DP table allocates `(m+1) × (n+1)` entries.

**The fix:**

```ts
function computeLCS(a: number[], b: number[]): number[] {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return []; // ← guard before allocation
  // ... rest of the algorithm ...
}
```

This is a **fail-fast** guard. If either input is empty, the LCS is trivially empty. No need to allocate or compute.

**The LCS DP algorithm explained:**

```python
# dp[i][j] = LCS length of a[0..i) and b[0..j)
# Recurrence:
#   if a[i] == b[j]: dp[i][j] = dp[i-1][j-1] + 1
#   else:            dp[i][j] = max(dp[i-1][j], dp[i][j-1])

# Example: a = [1, 2, 3], b = [2, 1, 3]
# DP table:
#        ""   2    1    3
# ""   [ 0,   0,   0,   0 ]
#  1   [ 0,   0,   1,   1 ]   ← matches b[2]
#  2   [ 0,   1,   1,   1 ]   ← matches b[1]
#  3   [ 0,   1,   1,   2 ]   ← matches b[3]
#
# Backtrack: start at dp[3][4]=2
#   a[2]=3 == b[3]=3 → LCS=[3], go to dp[2][3]=1
#   a[1]=2 != b[2]=1 → max(dp[1][3]=1, dp[2][2]=1) → tie, go up to dp[1][3]=1
#   a[0]=1 == b[2]=1 → LCS=[1,3], go to dp[0][2]=0
#   i=0 or j=0 → stop
# Result: [1, 3]
```

---

## 8. Promise Mutex — Deeper Dive

The `withSaveLock` pattern is versatile. Here's how it compares to other approaches:

| Approach              | Trade-off                                                        |
| --------------------- | ---------------------------------------------------------------- |
| **Boolean flag**      | Race: both readers can see `false` before either writes `true`   |
| **Promise chain**     | (this fix) Simple, no dependencies, works with single event loop |
| **Semaphore library** | Overkill for binary locking                                      |
| **Queue**             | More complex; allows prioritization but not needed here          |

**Why the promise chain is atomic:**

```ts
let saveLock = Promise.resolve();

async function withSaveLock(fn) {
  let release;
  const prev = saveLock; // (1) capture current tail
  saveLock = new Promise((r) => {
    release = r;
  }); // (2) replace tail synchronously
  await prev; // (3) block until released
  try {
    return await fn();
  } finally {
    release();
  } // (4) release next waiter
}
```

Steps 1 and 2 run **synchronously** (no `await` between them). In JavaScript, synchronous code is single-threaded within one microtask — no other handler can interleave. So when a second SAVE arrives, it always sees the updated `saveLock` (step 2), and `prev` (step 1) is the promise from step 2 of the first save. The chain is unbroken.
