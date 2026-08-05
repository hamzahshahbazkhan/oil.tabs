# Issue: `createWindow` planner stage is dead code; users can't create a window from the buffer

**Status:** open (diagnosed from code)
**Severity:** low
**Files:** `src/engine/Planner.ts`, `src/engine/Executor.ts`

## What happens

- `Planner.ts` declares `WindowOperation = { kind: "createWindow" }`,
  lists `"createWindow"` first in `STAGE_ORDER`, and buckets
  `extraWindowOps` into it (Planner.ts:106-110).
- **`Executor.ts`'s switch (lines 292-303) has no `createWindow` case** —
  if such an op were ever produced it would be silently skipped.
- **No caller passes `extraWindowOps`**: `plan(filteredOps, snapshot)` is
  called in exactly one place (`src/background/index.ts:228`) without it.

So the stage is unreachable dead code, and there is no user-facing way to
express "open this URL in a new window" or to add a window to the buffer
text — typing a new `Window <id> │ …` header just re-maps the following
rows to that windowId, which the diff then treats as **moves** of the
existing tabs into that (non-existent) window. A `Window 99999` header
therefore silently corrupts: tabs get cross-window moves to a window that
never exists, and the executor fails when the target window can't be
found, rolling back.

## Suggested fix

- Either remove the `createWindow` stage, or implement
  `execCreateWindow` and add a buffer command (e.g. `:newWindow <url>`)
  that emits a `createWindow` op and passes it via `extraWindowOps`.

## Tests

The apply/diff suites don't exercise `createWindow`.