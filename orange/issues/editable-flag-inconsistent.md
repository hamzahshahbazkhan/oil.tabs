# Issue: editable flag inconsistent between initial snapshot and live updates

**Status:** open (diagnosed from code)
**Severity:** low
**Files:** `src/adapter/BrowserAdapter.ts` (`takeSnapshot`), `src/model/TabModel.ts` (`tabToBufferLine`), `src/render/document.ts`, `src/buffer/BufferUI.ts`

## What happens

- `takeSnapshot` (initial render): `const editable = true;` for **every**
  tab — including `chrome://`, `about:` and empty-url tabs.
- `TabModel.tabToBufferLine` (live updates): `editable` is `false` for
  `about:*`, `chrome:*`, and `""` URLs.

The buffer's non-editable line set (`nonEditableLines` in document.ts /
BufferUI.ts) is populated only when a rendered line carries
`editable: false`. Hence:

- On first render, every row is editable → user can try to edit a
  `chrome://` row.
- After any live update, the same row becomes non-editable and is skipped
  by the vim commands that respect `nonEditableLines` (movement/edit
  guards in vimCommands).

This gives an inconsistent, flickering read-only behavior depending on
how the buffer got its text, and the divider/header lines are never
marked non-editable (their kind is not `tabRow`, so `editable === false`
is never applied to them).

## Suggested fix

- Extract one `isEditable(url)` helper and use it in both producers
  (or run TabModel rows through the same normalization).
- Also consider marking header/section lines non-editable explicitly.

## Tests

Both producers currently lack a unit test around `editable`; the render
round-trips use `editable: true` fixtures.