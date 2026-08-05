# Issue: navigate ops are silently dropped for fallback-matched lines

**Status:** open (accepted tradeoff, diagnosed from code)
**Severity:** medium (silent)
**Files:** `src/background/index.ts:225-232`

## What happens

After fallback identity resolution, navigations to fallback-matched tabs
are filtered out:

```ts
const filteredOps = fallbackTabIds.size > 0
  ? ops.filter(op => !(op.kind === "navigate" && fallbackTabIds.has((op as any).tabId)))
  : ops;
```

A `fallbackTitleId` is assigned when a parsed line had `tabId: null`
(because its URL didn't cleanly match a snapshot line) and we recovered a
tab id from the *previous* run's `currentUrlMap`. For such a line, if the
user edits its URL, the `navigate` op targets a `fallbackTabId` and is
**dropped silently** — the buffer then shows the new URL but the browser
tab keeps the old page until a manual refresh/re-save.

This also means an inferred-id mismatch can quietly mutate a different
tab than the user thinks. Combined with the removal of visible tab ids
from rows (`dc85124`), this is now the primary way a user can get
mis-synchronized state without any feedback.

## Impact

- `:w` reports success (`ok: true`) with the row visually showing the
  new URL, while the browser tab still points at the old URL.
- No banner, no diff marker, no undo entry for the active tab.

## Suggested fix

- When a navigate is dropped for a fallback tab, show a non-blocking
  "N navigations skipped — refresh (gr)" status, or re-send an updated
  SNAPSHOT so the row reverts to the true URL.
- Reconsider reintroducing an invisible tab id token so fallback isn't
  needed for edited rows.

## Tests

Add a diff+filter test with a stale `currentUrlMap` where a fallback id
is used, asserting the navigate is filtered and the buffer result doc
matches `formatSnapshot` of the pre-edit state.