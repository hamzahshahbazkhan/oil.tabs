# Issue: Live sync disabled by the "stale buffer" dirty flag

**Status:** open (diagnosed from code)
**Severity:** high
**Files:** `src/buffer/BufferUI.ts`

## What happens

After the buffer renders its initial snapshot, any external tab change is
skipped with the "Buffer may be out of date — press gr to refresh" banner.
Live updates stop working; the user must constantly press `gr`.

## Root cause

Every transaction that touches the document flips the dirty flag on,
including **programmatic** dispatches made by the extension itself.

`statusListener` (BufferUI.ts:245-250):

```ts
const statusListener = EditorView.updateListener.of((update) => {
  if (update.docChanged) {
    dirty = true;
    scheduleStatusUpdate();
  }
});
```

But `renderSnapshot()` sets `dirty = false` and then dispatches a full
replace (BufferUI.ts:142-155):

```ts
dirty = false;
if (replaceDoc === false) return;
const text = newData.text;
if (text === view.state.doc.toString()) return;
...
view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
```

`view.dispatch` runs the same `updateListener`, so `dirty` becomes `true`
again **immediately after** the render resets it. The very next
`SNAPSHOT_UPDATED` message is then rejected:

```ts
function applySnapshotUpdate(...) {
  if (dirty) {
    showStaleBanner();
    return;
  }
  ...
  view.dispatch({ changes: { from, to, insert } });  // also sets dirty = true again
}
```

So the sequence is: initial `SNAPSHOT` → replace → dirty = true → first
`SNAPSHOT_UPDATED` → banner + skip → and the merge at the end of
`applySnapshotUpdate` re-dirties the doc, so every subsequent update is
also skipped.

## Repro

1. Open the buffer (Ctrl+Shift+E).
2. Open a new tab in any window.
3. Back in the buffer: the "out of date" banner appears and the new tab
   does not appear until an explicit `gr` (REQUEST_SNAPSHOT).

## Expected

Programmatic document replacements/merges must not mark the buffer
"dirty" (dirty should reflect **user** edits only, which is what `:w`
must save). The stale-banner logic should not trigger for
extension-initiated dispatches.

## Suggested fix

Only set `dirty = true` when the transaction originated from user input,
e.g. check `update.transactions[0].isUserEvent("input")` /
`transaction.isUserEvent("input.delete")` etc. (CodeMirror's
`Transaction.annotation(Transaction.userEvent)` / `isUserEvent`), or set a
"suppress dirty" annotation flag around internal dispatches:

```ts
view.dispatch({
  changes: ..., 
  annotations: Transaction.addToHistory ? [] : [],
  // e.g. StateEffect / custom annotation that the listener checks
});
```

## Tests

None currently cover the update-listener / stale-banner interplay. Add a
small unit test that renders a snapshot, dispatches a programmatic
change, then asserts the following `SNAPSHOT_UPDATED` is *not* treated as
stale. (Hard to unit test the real CodeMirror listener without a DOM
harness; at minimum a logic test isolating the `dirty` handling.)