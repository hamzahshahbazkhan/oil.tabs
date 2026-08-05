# Issue: "Save for later" rollback over-removes duplicate saved items

**Status:** open (diagnosed from code)
**Severity:** medium
**Files:** `src/engine/Executor.ts` (`execSaveForLater` rollback)

## What happens

When a `saveForLater` op is rolled back (following a later op failure),
the rollback removes **all** saved items whose url+title match — not just
the one just added. Duplicate saved entries are therefore permanently
lost, and it can also remove an unrelated save that shares url+title with
the failing one.

## Root cause

```ts
async function execSaveForLater(op) {
  const list = await StorageGet(SFLL_KEY, []);
  await setStorage(SFLL_KEY, [...list, op]);
  return { rollback() { return removePossessed(SFLL_KEY, [op]) } };
}
```

where `removePossessed(key, targets)` reads the list and keeps:

```ts
list.filter((item) => !(
  item.url === targets.url && item.title === targets.title
))
```

So an op destructive rollback removes *all matching url+title entries*,
not just the one pushed by this op.

## Duplication on forward path too

`saveForLater` is not deduplicated on the forward path either: saving the
same saved line multiple times appends to `savedForLater` each time,
creating real duplicates in storage.

## Repro / impact

- If a later op in the same `big_save` fails, rollback removes the tab
  AND any other identical saved line from the saved list.
- Repeated toggling of the same "save" line accumulates dup entries in
  `savedForLater`.

## Suggested fix

- Deduplicate on push (`!(list.some(i => i.url===op.url && i.title===op.title))`),
  or give each saved item a stable id and remove by id on rollback only
  if the id matches this op's addition.

## Tests

Extend apply tests: save twice the same line, then force a failure and
check `savedForLater` keeps exactly one matching entry.