# Issue: options page "shortcut" fields are decorative — real shortcuts must be set in chrome://extensions/shortcuts

**Status:** open (diagnosed from code)
**Severity:** medium (UX)
**Files:** `options.html`, `src/options/main.ts`, `manifest.json`

## What happens

The options page lets the user type an accelerator (e.g. `Ctrl+Shift+1`)
for each of the five global actions. Those keystrokes are stored in
`chrome.storage` but **never** become actual Chrome shortcuts. Chrome's
`commands` API cannot be reconfigured at runtime; the only bindings are
the five `manifest.json` `shortcut-0..4` commands, and their actual keys
are user-assigned only via `chrome://extensions/shortcuts`.

The background's `commands.onCommand` handler maps by command **name**
(`"shortcut-0"` … `"shortcut-4"`) to `globalShortcuts[i]`; the `key`
string is read nowhere except for display.

## Impact

Users type e.g. `Alt+G`, then discover the real bindings differ (or are
unset). The UI misleads; config doesn't do what it appears to.

## Suggested fix

- Make the options UI explicit: show a link to `chrome://extensions/shortcuts`
  and render the *currently configured* key from
  `commands.getAll()` (which returns `shortcuts` per command), rather
  than an editable text field.
- Or remove the editable key input entirely.

## Tests

None (manual only).