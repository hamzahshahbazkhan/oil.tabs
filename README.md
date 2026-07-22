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
- **Create a new tab:** type a URL on a new line, `:w` opens it
- **Navigate a tab:** edit the URL on an existing line, `:w` updates it
- **Tab groups:** tabs are rendered under group sub-headers; moving a line changes its group
- **Open tab under cursor:** press `gx` to jump to the real tab
- **Refresh buffer:** press `gr` to discard edits and reload from live state
- **Copy URL:** `yy` copies the URL to clipboard and the line text to vim's default register
- **Reorder via J/K:** press `J`/`K` to swap a line with its neighbor
- **Search tabs:** `:tab <query>` searches titles and URLs, jumps to the first match
- **Dark theme:** Tokyo Night-inspired color scheme

## What is NOT yet supported

- Virtual folders, saved/bookmarked tabs
- Bulk sleep, MRU cycling
- Custom shortcuts or keymap remapping

## How it works

The extension opens a CodeMirror 6 editor with vim keybindings (`@replit/codemirror-vim`). When you run `:w`, the buffer text is parsed, diffed against the last known browser snapshot, and the minimal set of `close`/`move` operations is applied to the real browser tabs.
