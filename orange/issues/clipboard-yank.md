# Issue: `yy` doesn't copy the tab URL to the clipboard reliably

**Status:** open (in investigation)
**Builds involved:** b71f13bc / dc85124

## What happened

Pressing `yy` on a tab row is supposed to copy that tab's URL to the
system clipboard (the full line stays in the vim register for in-buffer
`p`). In practice the clipboard doesn't get the URL:

- Sometimes pasting outside the buffer yielded the *entire buffer text*.
- Currently copying produces *nothing*.

## What was already done

- `yy` maps to a custom action (`src/buffer/vimCommands.ts`): writes
  `extractUrl(line.text)` to the clipboard via
  `navigator.clipboard.writeText()`, falling back to a hidden-textarea
  `document.execCommand("copy")`.
- The copy happens *after* the vim `"` register push (full line) so the
  register doesn't overwrite the URL.
- A status-bar flash shows `yanked URL: <url>` on success or
  `clipboard blocked — failed to copy` on failure, and the status bar
  prints a build hash (`b71f13bc`) so we can confirm which build is
  running.
- `clipboardWrite` is declared in `manifest.json`.

## Suspicion

Running on Linux: `navigator.clipboard` writes the **clipboard**, but
terminal **middle-click** pastes the separate **primary selection**, so
pasting with middle-click shows stale or empty content even though the
copy succeeded. The user-reported "whole buffer pasted" earlier was a
stale extension build (old code paths entirely different), now
eliminated via the build hash.

## To reproduce

1. Open the buffer (Ctrl+Shift+E).
2. Move onto a tab row, press `yy`.
3. Note the status bar message.
4. Paste with Ctrl+V (clipboard) *and* with middle-click (primary).

## Expected

The status bar reads `yanked URL: <url>` and Ctrl+V pastes just the URL.

## Notes / candidate fixes

- If `navigator.clipboard` is rejected on Linux in the extension page,
  try copying via the background service worker with `clipboardWrite`.
- Optionally also set the primary selection (X11) so middle-click
  matches Ctrl+V; note `navigator.clipboard`/`execCommand` typically
  only stub the clipboard, not the primary selection.
- Report what the status bar says after `yy` — it distinguishes
  "copy failed" from "copy ok but paste method mismatch".

## Next step

User to run `yy` on the current build and report the exact status-bar
message.
