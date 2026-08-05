# Issue: Buffer window - the window header counts `tabs` excluding pinned tabs

**Status:** open (diagnosed from code)
**Severity:** low (cosmetic)
**Files:** `src/render/*`, `src/buffer/BufferUI.ts`

## What happens

Window headers are rendered by `formatWindowHeader` counting only
`tabLines.length` — the tabs in the buffer *window* list. Pinned tabs are
rendered inline *first*, but the count is taken from `window.tabs.length`
before pinned filtering. If window headers ever genuinely know pinned
tabs (older design kept pinned inline in the same window), the count is
just the raw tabs within.

## Does it matter?

- The user explicitly kept pinned tabs rendered **inline as part of the
  same window**, so this mismatch cannot occur from a fresh source build.
- But the dead code paths in `formatWindowHeader` and the `parse` for the
  `│ n tab(s) ─` header treat any parsed count as authoritative; removing
  `[N]` ids means the header is just informational.

## Impact

Low; single source of the count is the same loop that renders rows, so
it's self-consistent. No real defect — closed as 'no action' — kept for
documentation so future changes to pinned separation don't reintroduce a
count/truth mismatch.

## Suggested fix

None required if pinned tabs stay inline in the buffer window.