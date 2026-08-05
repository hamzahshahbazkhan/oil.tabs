# Issue: Editing a URL into an unknown tab "navigate" op filters silently / no fallback identity

**Status:** open (diagnosed from code)
**Severity:** medium
**Files:** `src/engine/DiffEngine.ts`, `src/model/Parser.ts`

## What happens

Since `[N]` tab ids were dropped from rows (commit `dc85124`), tab
identity on URL edits and on duplicate URLs is weaker:

1. When a *new URL* is typed into a row, the Parser cannot match it to a
   known tab, so `tabId: null` for that line. The diff then classifies
   the row as `navigate` (old tab url changed), but the "navigate"
   operation targets `op.tabId` which is *null*:

   ```ts
   if (oldUrl && newUrl && oldUrl !== newUrl) → { type: "navigate" }
   ```
   …applied via `execNavigate( op, updatedTab(url,tabId))` → `tabs.update(tabId, { url})` where `tabId` may be null → the tab-update silently fails (Chrome throws or no-ops). Task done quietly; the buffer and browser diverge.

2. With duplicate URLs (two or more lines carrying the *same* netloc/path),
   the parser's `usedTabId` map lets *one* of them claim a deterministic
   tab id; the second gets `tabId: null` (or may seize a sibling's id)
   → edits on the second line behave like `navigate` against the wrong
   tab, producing incorrect `close`, `move` or `navigate` outcomes.

## Suggested fix

- Re-add the invisible stable tab id assigned at render (like the former
  `[N]` tag) **but render it only on demand** (e.g. a toggle command), so
  edit-target-anchoring is exact.
- Or: on `tabId: null` rows, prefer matching the tab whose *current url
  basis matches only* when one exists, else treat the row as "create".

## Tests

Add a parser+diff round trip with two identical URLs and an edited one —
assert target tab ids are stable.