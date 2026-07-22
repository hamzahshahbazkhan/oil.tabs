# tab-oil

This demo is to test an idea and prototype. A new and better way to manage browser tabs inspired by oil.nvim.
If or when this thing is made into real project you would, ideally, have a better way to bookmark, arrange, reorder, manage, close, mute, open, organize your tabs.

## Usage

1. `npm install`
2. `npm run build`
3. Load the `dist/` folder unpacked in `chrome://extensions` (developer mode on)

Press **Ctrl+Shift+E** to open the tab-oil buffer (configurable in `chrome://extensions/shortcuts` — e.g. change it to `Ctrl+Minus`).

**Permissions:** `tabs`, `storage`, `clipboardWrite`, `tabGroups`, `bookmarks` (for future folders/saved-tabs features).

**Firefox:** Most features work (`tabGroups` and `discard` are Chrome-only and gracefully skipped). Load unpacked via `about:debugging`.

## Quick Start

| Action                          | Keys                          |
| ------------------------------- | ----------------------------- |
| Open buffer                     | `Ctrl+Shift+E`                |
| Open the tab under cursor       | `gx` or `Enter` (normal mode) |
| Save & apply edits to real tabs | `:w`                          |
| Refresh buffer from live state  | `gr`                          |
| Copy tab URL                    | `yy`                          |

## Vim Keybindings

All keybindings work in **normal mode** (press `Esc` to enter normal mode).

### Tab Actions

| Key              | Action                                                                        |
| ---------------- | ----------------------------------------------------------------------------- |
| `gx`             | Focus/jump to the tab under the cursor                                        |
| `Enter` / `<CR>` | Focus/jump to the tab under the cursor                                        |
| `-`              | Close the tab-oil buffer (go back)                                            |
| `J`              | Swap the current line with the one below (reorder tab down)                   |
| `K`              | Swap the current line with the one above (reorder tab up)                     |
| `yy`             | Yank: copy the tab's URL to clipboard and line text to vim's default register |
| `gr`             | Refresh: discard local edits and reload the buffer from live browser state    |

### Motion & Editing

All standard Vim motions (`h`/`j`/`k`/`l`, `w`/`b`, `^`/`$`, `gg`/`G`, etc.) and editing commands (`x`, `dd`, `p`, `u`/`Ctrl+r`, etc.) work as expected.

**Note:** Lines marked with `── Window`, `── Saved For Later`, and `▸` group/folder headers are **non-editable** — they cannot be modified or moved. Tabs below them are fully editable.

## Ex Commands

| Command        | Alias         | Action                                                                                              |
| -------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| `:w`           |               | Save buffer and apply all changes to browser tabs (close, move, navigate, create)                   |
| `:w!`          |               | Force save — skip the confirmation dialog when closing many tabs                                    |
| `:tab <query>` | `:ta <query>` | Search tabs by title or URL for the given query and jump to the first match                         |
| `:sleep`       | `:sl`         | Discard (sleep) selected tab lines. Works with visual selection (`V` then `:sleep`) to bulk-discard |
| `:cnext`       | `:cn`         | Cycle to the next tab in most-recently-used (MRU) order                                             |
| `:cprev`       | `:cp`         | Cycle to the previous tab in most-recently-used (MRU) order                                         |

### Using `:sleep`

1. Select tab lines with `V` (visual line mode) or `Ctrl+v` (visual block)
2. Run `:sleep`
3. The real tabs will be discarded (frees memory); discarded lines show a `[sleep]` prefix

## Global Shortcuts

Configure up to 5 keyboard shortcuts on the options page (right-click extension icon → Options).

| Shortcut       | Action                      |
| -------------- | --------------------------- |
| _configurable_ | Focus a specific tab        |
| _configurable_ | Open a specific URL         |
| _configurable_ | Cycle to next tab (MRU)     |
| _configurable_ | Cycle to previous tab (MRU) |

## Buffer Layout

```
── Window 1                          ← non-editable window header
  About Blank                        ← editable tab
  ▸ Work                             ← non-editable group header
    GitHub                           ← editable tab in group
── Window 2                          ← non-editable window header
  Example Domain                     ← editable tab
── Saved For Later                   ← non-editable saved section header
  My Article — https://...           ← saved-for-later entry
```

- **Window headers** (`── Window N`) are non-editable dividers.
- **Group headers** (`▸ GroupName`) are non-editable dividers.
- **Folder headers** (`▸ Folder: Name`) tag the tabs below them with a virtual folder.
- **Tab lines** (`Title — url`) are fully editable. Edit the URL to navigate the tab; edit the title for display only.
- **Saved for later section** (`── Saved For Later`) at the bottom holds tabs you've moved out of live windows. Move a saved line back into any window block and `:w` to restore it in the browser.

## How it works

The extension opens a CodeMirror 6 editor with vim keybindings (`@replit/codemirror-vim`). When you run `:w`, the buffer text is parsed, diffed against the last known browser snapshot, and the minimal set of `close`/`move`/`navigate` operations is applied to the real browser tabs.

## What is NOT yet supported

- Bookmark integration (type is defined but no Ex command yet)
- Custom keymap remapping (coming in v1.0.2)
