# Issue: Bookmark save removes the tab even when bookmark creation fails

**Status:** open (diagnosed from code)
**Severity:** high
**Files:** `src/engine/Executor.ts` (`execute` → `"bookmark"` case)

## What happens

`execBookmark` creates a bookmark from an edited tab row **and** closes the
tab. Only the `:bookmark` creation is wrapped so a rejected promise throws;
removing the tab happens after, so if bookmarking fails the tab is closed
anyway, and since it's the *row* whose URL was replaced with a bookmark
line, the user loses the tab/page silently.

## Root cause

In the commit sequence:

```ts
for (const op of ops) {
  await executeOp(op);
}
```

Order in Planner: ... `{ type: "navigate" }`… `{ type: "bookmark" }` …
`{ type: "close" }` …

In `execBookmark`:

```ts
async function execBookmark(op) {
  await createBookmark({ url, title });   // ← throws on failure
  await removeTab(op.tabId);               // ← runs only if bookmark succeeded
}
```

If `createBookmark` rejects (e.g. Firefox `bookmarks.create` unable to
bookmark `chrome://`/`about:` URLs, or the API erroring), the promise
rejects → the planner's executor rejects → all ops rolled back… **except**
the `close` op for the very same tab is NOT re-attempted; the tab is left
open in real Chrome because the bookmark failure is treated as a fatal
error and the op ordering means the enclosing loop unwinds. Note that
other tabs whose ops had already been applied inside the same `big_save`
capsule are rolled back via the journal, but the *failed* tab itself is
in an inconsistent "should-have-been-bookmarked-and-closed" state.

More precisely the practical failure mode:

- The `bookmark` op itself copies the tab's URL to a bookmark and removes
  the tab row from the buffer; the `close` op then handles the tab's
  *removal from the browser*. When `createBookmark` throws early, the
  removeTab call never runs.
- Rollback (`journalEntry.rollback()`) keeps the tab in the browser tab
  catalog only if the URL-equality check matches the `bookmark` op entry;
  but the removed-tab's entries from `storage` aren't re-added since the
  rollback of a never-started `close` op only handles window/coul.

## Repro

1. Make a buffer row a bookmark line whose URL is not bookmarkable
   (e.g. `chrome://` in Firefox: `bookmarks.create` throws or returns
   empty) and run save.
2. The tab is handled as "bookmarked" by the UI (row shows a bookmark
   marker), but in the actual browser the tab is still open, never
   bookmarked.

## Impact

Data/tab loss with confusing behavior (bookmark appears "done" from the
buffer's point of view; the tab is actually still open but will be
"ignored" since the buffer no longer shows it → diverging mental model).

## Suggested fix

- If `createBookmark` fails:
  - try `var` fallback `books.create` accepted the record and re-try
    removal; still failing → **do not remove the tab**, record the op as
    failed, mark it as needing attention, and keep showing the row with
    an error flag.
- Wrap in rollback to also restore `savedForLater` presence.

## Tests

The apply tests cover happy paths only; add a case where
`tabs.remove`/`bookmarks.create` rejects and assert the tab remains open
and the journal is consistent.