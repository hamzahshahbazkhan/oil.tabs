# tab-oil

**oil.nvim for your browser tabs.** A Chrome extension (Manifest V3) that lets you view, close, and reorder tabs by editing a text buffer with vim keybindings.

## Usage

1. `npm install`
2. `npm run build`
3. Load the `dist/` folder unpacked in `chrome://extensions` (developer mode on)

Press **Ctrl+Shift+E** to open the tab-oil buffer.

**Permissions:** `tabs`, `storage`, `clipboardWrite`, `tabGroups`, `bookmarks` (for future folders/saved-tabs features).

## What it supports

- **View all tabs** across all windows, grouped by window, one line per tab
- **Close a tab:** delete a line in the buffer, then `:w` to apply
- **Reorder tabs:** move a line within the same window's block, then `:w` to apply
- **Create a new tab:** type a URL on a new line, `:w` opens it
- **Navigate a tab:** edit the URL on an existing line, `:w` updates it
- **Tab groups:** tabs are rendered under group sub-headers; moving a line changes its group
- **Virtual folders:** assign tabs to named folders via `▸ Folder:` headers in the buffer; folder metadata is stored locally
- **Bulk sleep (discard):** visual-select tab lines then `:sleep` to discard (free memory); discarded tabs show a `[sleep]` prefix
- **Save for later:** move a tab's line to the `── Saved For Later` section at the bottom of the buffer, then `:w` — the real tab closes and its URL is saved locally; move a saved line back to a live window to restore it
- **Global shortcuts:** configure up to 5 keyboard shortcuts on the options page (right-click extension icon → Options) to focus or open a URL, or cycle through recents
- **MRU tab cycling:** `:cnext`/`:cprev` cycles through tabs in most-recently-used order; also configurable as a global shortcut
- **Open tab under cursor:** press `gx` to jump to the real tab
- **Refresh buffer:** press `gr` to discard edits and reload from live state
- **Copy URL:** `yy` copies the URL to clipboard and the line text to vim's default register
- **Reorder via J/K:** press `J`/`K` to swap a line with its neighbor
- **Search tabs:** `:tab <query>` searches titles and URLs, jumps to the first match
- **Dark theme:** Tokyo Night-inspired color scheme

## What is NOT yet supported

- Bookmark integration (type is defined but no Ex command yet)
- Custom keymap remapping (coming in v1.0.2)

## How it works

The extension opens a CodeMirror 6 editor with vim keybindings (`@replit/codemirror-vim`). When you run `:w`, the buffer text is parsed, diffed against the last known browser snapshot, and the minimal set of `close`/`move` operations is applied to the real browser tabs.
