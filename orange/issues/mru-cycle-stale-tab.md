# Issue: stale MRU `<` / `>` cycling can land on a closed/unknown tab

**Status:** open (diagnosed from code)
**Severity:** low
**Files:** `src/buffer/vimCommands.ts`, `src/adapter/BrowserAdapter.ts`

## What happens

`MRU` cycling uses the background's `mruTabIds` (and separates
window/pinned logic), but does not verify the target still exists. If the
mru id it maps to has since been closed/deleted, tab info lookup raises
and cycling breaks with no retry.

Review:

```ts
if (targetTab == null && tabMru.length > 0) {
  tabMru = tabMru.filter(t => t.id !== tab.id);   // removes current
  if (tabMru.length > 0) {
    const target = tabMru[1] ?? tabMru[0] ?? ...; / guess
  }
}
```

stale entries cause `tabs.get` to reject, the `break` skips the attempt,
and the user can't cycle — devs treat it as "buffer may be stale, gr".
Stale MRU also stalls `>` (`cycleTab(tab.id, 1)`).

## Suggested fix

On cycle, guard `browser.tabs.get(id)` — skip entries that are
`undefined` and purge them from `mruTabIds`; also ensure the action only
tabs to the current *window's* tabs (MRU across windows can confuse the
cycle direction).

## Tests

None.