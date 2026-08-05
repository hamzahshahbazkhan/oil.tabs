# Audit issue index — orange/issues

All issues written during the read-only audit of the tab-oil extension
(`commit 71f13bc` + `dc85124`, build hash `b71f13bc`).

Severity: **high** = user-visible breakage / silent divergence,
**medium** = wrong-but-recoverable behavior, **low** = cosmetic/dead code.

| File | Severity | One-line summary |
|------|----------|------------------|
| `clipboard-yank.md` | high (preexisting) | `yy` OS-clipboard copy depends on active-tab permissions; Linux middle-click vs Ctrl+V; stale-extension build issue. |
| `stale-dirty-flag.md` | **high** | Internal dispatches mark the doc dirty → every `SNAPSHOT_UPDATED` is rejected → live sync never applies; stale banner always shown after first external change. |
| `buffer-reopen-stuck.md` | **high** | Closing only the buffer tab leaves `bufferWindowId` set; shortcut re-focuses the empty window and can't reopen the buffer. |
| `bookmark-fails-closes-tab.md` | **high** | If `bookmarks.create` fails, the tab isn't closed and is left in an inconsistent "bookmarked" state; rollback doesn't restore it. |
| `tabmodel-groupid--1-leak.md` | medium | Live events keep `groupId: -1` → spurious `Group: -1` sections in buffer text (initial render normalizes to null). Also `onTabUpdated` ignores `changeInfo.groupId`. |
| `save-for-later-rollback-duplicates.md` | medium | Save-for-later rollback filters by (url,title) removing all matches → duplicates lost; forward path accumulates dup entries. |
| `folder-ids-out-of-order.md` | medium | Folder ids re-derived from header order on every parse; reordering folder lines re-assigns tabs to wrong folders on save. |
| `tab-identity-without-ids.md` | medium | Without visible tab ids, URL-edit identity degrades; duplicate-URL rows can target the wrong tab. |
| `navigate-dropped-fallback.md` | medium (silent) | Navigate ops for fallback-matched rows are filtered; buffer shows new URL, browser keeps old — `:w` reports success. |
| `options-shortcut-keys-are-decorative.md` | medium (UX) | Options "key" inputs never bind real shortcuts; users must go to `chrome://extensions/shortcuts`. |
| `mru-cycle-stale-tab.md` | low | `<`/`>` cycling can hit closed/stale MRU entries; cycle breaks without retry. |
| `tabmove-event-ordering-duplicates.md` | low | Cross-browser `onMoved`/`onDetached`/`onAttached` ordering could duplicate a row if a browser skips `onDetached`. |
| `editable-flag-inconsistent.md` | low | `takeSnapshot` marks everything editable; TabModel marks `about:`/`chrome:`/`""` non-editable → inconsistent row behavior. |
| `create-window-dead-code.md` | low | `createWindow` stage has no executor case and no caller; typing a new `Window` header silently becomes cross-window moves. |
| `window-header-tab-count.md` | low (closed) | Header count is derived from the same loop that renders rows; self-consistent — no action. |

## Cross-cutting notes

- **#1 by impact:** `stale-dirty-flag.md` effectively disables the
  live-sync feature (banner + skip on every external change).
- **Identity tradeoff:** with visible tab ids removed, all three
  medium issues (`tab-identity`, `navigate-dropped-fallback`,
  `folder-ids-out-of-order`) stem from position/URL-based identity;
  a hidden stable token per row would fix all three at once.
- `tsc --noEmit` still reports ~58 pre-existing type errors; `npm run
  build` succeeds. The trailing-newline churn on `document.ts` /
  `Parser.ts` noted during earlier sessions is a dev-env artifact, not a
  product bug.
- No code was changed during this audit — every file above is
  documentation only.