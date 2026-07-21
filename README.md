# tab-oil

**oil.nvim for your browser tabs.** A Chrome extension (Manifest V3) that lets you view, close, and reorder tabs by editing a text buffer with vim keybindings.

## Usage

1. `npm install`
2. `npm run build`
3. Load the `dist/` folder unpacked in `chrome://extensions` (developer mode on)

Press **Ctrl+Shift+E** to open the tab-oil buffer.

## What it supports

- **View all tabs** across all windows, grouped by window, one line per tab
- **Close a tab:** delete a line in the buffer, then `:w` to apply
- **Reorder tabs:** move a line within the same window's block, then `:w` to apply

## What is NOT yet supported

- Creating new tabs (adding lines)
- Navigating tabs (editing URLs)
- Tab groups, pinned tabs, folders
- Bookmarks, save-for-later
- Custom shortcuts or cycling

## How it works

The extension opens a CodeMirror 6 editor with vim keybindings (`@replit/codemirror-vim`). When you run `:w`, the buffer text is parsed, diffed against the last known browser snapshot, and the minimal set of `close`/`move` operations is applied to the real browser tabs.
