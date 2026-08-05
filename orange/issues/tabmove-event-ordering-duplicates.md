# Issue: cross-browser tab-move event ordering — potential duplicate lines

**Status:** open (needs empirical verification)
**Severity:** low
**Files:** `src/model/TabModel.ts` (`onTabMoved` / `onTabDetached` / `onTabAttached`)

## What happens

Cross-window tab moves are handled through `pendingDetach`:

- `onTabDetached` removes the line from `currentSnapshot` and caches a
  copy in `pendingDetach`.
- `onTabAttached` restores it from `pendingDetach` (or re-fetches via
  `browser.tabs.get` if missing), then inserts.
- `onTabMoved` handles intra-window reordering.

Chrome/Firefox event sequences differ:

- **Chrome** fires `onDetached` + `onAttached` for cross-window moves
  (`onMoved` only within a window).
- **Firefox** fires `onMoved` with a `newWindowId` for cross-window moves
  *and* `onDetached`/`onAttached` variants, depending on version.

If a browser fires `onMoved` (windowId changed → line re-inserted with
new window) followed by `onDetached`, the line is still present when
`onDetached` runs, so it is removed again and cached in `pendingDetach`,
then `onAttached` restores it — self-healing but momentarily inconsistent.

The risky case: a browser that fires `onMoved` (windowId changed, line
re-inserted) but **no** `onDetached` — then the later `onAttached`
(`pendingDetach` miss) calls `browser.tabs.get` and `insertLine`s a second
copy → duplicate rows for the same tab id.

## Impact

- Duplicate rows for the same tab (both sharing `tabId`) in the buffer
  → `usedTabId` set in the parser would only claim one; edits land on
  the wrong line.
- Self-healing in the common paths, so only observed in specific
  browser/version event sequences.

## Suggested fix

- In `onTabAttached` fallback path, guard against a duplicate by checking
  `currentSnapshot.lines.findIndex(l => l.tabId === tabId) === -1` before
  inserting.
- Verify empirically on Firefox (journal the raw event sequence during a
  drag between windows).

## Tests

Unit test `onTabAttached` with a snapshot that already contains the tabId
(re-entrant order simulation) → assert no duplicate added.