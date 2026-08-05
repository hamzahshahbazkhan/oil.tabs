# Issue: Keyboard shortcut can't reopen the buffer once its tab is closed

**Status:** open (diagnosed from code)
**Severity:** high
**Files:** `src/adapter/BrowserAdapter.ts` (`openOrFocusBufferTab`)

## What happens

If the buffer *tab* is closed but its window is still open, pressing the
toggle shortcut focuses just the (buffer-less) window and never reopens
the buffer. The user is stuck: the only recovery is closing the window.

## Root cause

`openOrFocusBufferTab` (BrowserAdapter.ts:145-206) stores a
`bufferWindowId`. When that window still exists it only focuses it:

```ts
if (existingWindowId !== undefined) {
  try {
    const win = await getWindow(existingWindowId);
    if (win) {
      await updateWindow(win.id!, { focused: true });
      return;
    }
  } catch { ... }
}
```

It never checks that the buffer tab (`bufferTabId`) still exists inside
that window. The buffer and window ids are **cleared only when the whole
window closes** (background `windows.onRemoved` listener), not when the
tab is closed.

This is also reachable via the window path (`existingWindowId` found) and
the tab path (`existingTabId` found): if only a *tab* id was persisted
and that tab was closed but its window still lives, the same thing
happens.

## Repro

1. `getBufferWindowId` != undefined, then close only the buffer tab
   (keyboard shortcut), e.g. by closing the buffer.html tab within the
   popup window via `:q`/`-` might close the whole window — but if the
   popup opens with additional tabs, or you close the tab manually,
   (e.g. in a dev window with a separate tabbar) the state is reachable.
2. Press toggles again -> window focused, no buffer page -> `:w`/`gr`
   side of the UI is gone.

## Impact

User loses the ability to reopen the buffer; no error is shown, only the
already-open (empty) window.

## Suggested fix

- On `getWindow(existingWindowId)`, `browser.tabs.get(existingTabId)`,
  and verify the tab still exists:
  - If it does and belongs to that window → focus & return.
  - If not → clear the stale IDs
    (`storageSessionRemove([...])`) and fall through to create a new
    buffer window.
- Also hook `tabs.onRemoved` (not just `windows.onRemoved`) to clear
  `bufferTabId` when the buffer tab is removed, while the window id is
  kept as a "window hint" or also dropped if the window empties.

## Tests

No automation covers window/tab id (re)creation paths. Consider mocking
`browser.windows.get` + `browser.tabs` for these branches.