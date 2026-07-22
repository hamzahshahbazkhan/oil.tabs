# tab-oil — Sequential Commit Plan (v0.3 → v1.0)

## Protocol for the agent (read this section every time, first)

You are continuing work on the `tab-oil` browser extension. v0.1 and v0.2
are already built and working (view all tabs; close + reorder via `:w`).
This file is the **entire remaining backlog**, broken into small,
independently-committable steps, in strict order.

**Follow this loop exactly, every time you work on this project:**

1. Read this whole file top to bottom. Find the **first unchecked `[ ]`
   box**. That is your current task. Ignore everything below it for now.
2. Do only that task. Do not jump ahead, do not batch multiple boxes into
   one commit, even if it seems efficient.
3. Run the **Verify** step listed under that task. Do not proceed if it fails.
4. If it passes: `git add -A && git commit -m "<the exact commit message given>"`.
5. Change that task's box from `[ ]` to `[x]`.
6. Append one line to the **Progress Log** section at the bottom of this
   file: date, commit hash, one-sentence note on anything unusual you hit.
7. Save this file. If you have context/turns remaining, go back to step 1
   for the next box. If you are running low on context, **stop here** —
   never stop mid-task with an uncommitted, untested change. A checked box
   with a real commit behind it is the only valid stopping point.
8. On a fresh session: step 1 is how you resume. You do not need to be told
   what to do next — this file always tells you.

**Rules that apply to every single task below:**

- Every commit must leave the project in a working, buildable state
  (`npm run build` succeeds, `npm test` passes). Never commit something broken.
- If a task's Verify step requires manual browser testing you cannot do
  yourself, do the automated parts, note in the Progress Log exactly what a
  human needs to manually check, and still commit — don't block forever on
  something you can't verify solo.
- If you discover a task is already partially done from earlier work, adapt
  rather than redo — but still commit separately and check the box.
- Do not skip a box because it looks small or obvious. Skipping breaks the
  "first unchecked box" resumption logic for future sessions.
- **Update `README.md` as part of every single task's commit, not just at
  the end of a version.** Before checking a box, add/update whatever's
  relevant: newly supported keybindings or Ex commands, new permissions and
  why they're needed, new limitations or known gaps, updated feature list.
  The README should always describe _exactly_ what the project can do as of
  that commit — never let it drift ahead (documenting unbuilt features) or
  fall behind (missing built ones). Treat "update the README" as an
  implicit last step baked into every task below, even though it isn't
  spelled out per-task to avoid repeating it 35 times. A task is not
  complete until the README reflects it.

---

## Continuing from your existing v0.1/v0.2 build

Yes — **use the same repo you already have, do not start over.** This file
is written to pick up exactly where a working v0.1/v0.2 build leaves off.
Before starting on task v0.3.1, do this one-time reconciliation pass:

1. **Baseline commit.** If your current working version isn't already fully
   committed, commit it now as-is: `git commit -m "chore: baseline working v0.1/v0.2 build"`.
   This gives you a clean revert point before any of the new tasks begin.
2. **Sanity-check assumptions.** Skim tasks v0.3.1 through v0.3.5 against
   your actual code — confirm file paths (`src/background/diff.ts` etc.),
   type names (`Operation`, `BufferLine`), and function names
   (`diff()`, `apply()`, `snapshotToText()`) match what you actually built.
   Agents sometimes name things slightly differently than a spec assumed.
   If something drifted, fix the wording in _this file_ to match your real
   code before proceeding — a few minutes here avoids the agent getting
   confused or, worse, "fixing" your code to match the spec instead of the
   other way around.
3. **Confirm the README reflects v0.1/v0.2 accurately right now**, per the
   new rule above. If it's missing, outdated, or was never written, that's
   your very first sub-task — write/update it before touching v0.3.1, so
   every commit from here on is building on an already-accurate baseline
   rather than trying to catch up later.
4. **Then proceed normally**: first unchecked box is v0.3.1, and the
   resumption loop described above takes it from there — including across
   context resets, new sessions, or even switching which model/agent you're
   using, since everything needed to resume lives in this file plus your git
   history, not in any model's memory.

---

## v0.3 — Full CRUD

- [x] **v0.3.1 — Add `create` and `navigate` to the Operation type**
  - Extend `src/shared/types.ts`: add
    `| { kind: 'create'; url: string; windowId: number; index: number }`
    and `| { kind: 'navigate'; tabId: number; url: string }` to `Operation`.
  - Verify: `npm run build` compiles with no type errors (nothing consumes
    these yet, this is just the type addition).
  - Commit message: `feat(types): add create and navigate operation kinds`

- [x] **v0.3.2 — `diff()` emits `create` ops for new lines**
  - In `src/background/diff.ts`: any `ParsedLine` with `tabId === null`
    produces a `create` op using its `windowId` and its position in the
    buffer as `index`.
  - Add unit test in `tests/diff.test.ts`: a new line with no tabId → one
    `create` op with correct `windowId`/`index`; existing lines unaffected.
  - Verify: `npm test` passes, including the new test.
  - Commit message: `feat(diff): emit create ops for new buffer lines`

- [x] **v0.3.3 — `diff()` emits `navigate` ops for changed URLs**
  - In `diff.ts`: for any tabId present in both old and new, if
    `parsed.url !== oldById.get(tabId).url`, emit a `navigate` op.
  - Add unit test: change a URL on an existing line → one `navigate` op with
    the new URL; unchanged lines produce none.
  - Verify: `npm test` passes.
  - Commit message: `feat(diff): emit navigate ops for changed urls`

- [x] **v0.3.4 — Sort order: close → move → create → navigate**
  - Update `diff()`'s return statement to concatenate ops in exactly this
    order (creates must come after moves so index math against settled
    positions is correct).
  - Add unit test: a fixture producing all four op kinds at once, assert
    the returned array's kind sequence matches this order.
  - Verify: `npm test` passes.
  - Commit message: `feat(diff): enforce close-move-create-navigate op ordering`

- [x] **v0.3.5 — `apply()` executes `create` and `navigate`**
  - In `src/background/apply.ts`: add switch cases —
    `create` → `await browser.tabs.create({url, windowId, index})`;
    `navigate` → `await browser.tabs.update(tabId, {url})`.
  - Keep the exhaustiveness check (`never` in default) so TypeScript flags
    any future missing case.
  - Verify: `npm run build` compiles, switch is exhaustive.
  - Commit message: `feat(apply): execute create and navigate operations`

- [ ] **v0.3.6 — Manual end-to-end: create**
  - In a loaded-unpacked instance: `o` a new line with just a URL, `:w`,
    confirm a real new tab opens at the right window/position.
  - Verify: manual check as described; note result in Progress Log.
  - Commit message: `test: verify create-tab flow end to end` (commit any
    incidental fixes found during this check; if none needed, an empty
    commit noting the verification is acceptable — `git commit --allow-empty`)

- [ ] **v0.3.7 — Manual end-to-end: navigate**
  - Edit the URL portion of an existing line, `:w`, confirm that real tab
    navigates to the new URL (not a new tab — same tab, new location).
  - Verify: manual check; note result in Progress Log.
  - Commit message: `test: verify navigate-tab flow end to end`

- [x] **v0.3.8 — Status line: pending-change summary**
  - In `src/buffer/`, add a small fixed bottom bar in `buffer.html`.
  - On every CodeMirror doc-change event (debounce ~150ms), re-run
    `parse()` + `diff()` against the last-known snapshot (client-side, no
    round trip to background needed — you already have `lastSnapshot`/`idMap`
    available in the buffer page) and render counts, e.g.
    `3 to close · 1 to create · 2 to move`.
  - Verify: manually edit the buffer without saving, confirm the bar
    updates live and resets to empty after a successful `:w`.
  - Commit message: `feat(buffer): add live pending-change status line`

- [x] **v0.3.9 — Confirmation gate on large destructive diffs**
  - Add a constant `LARGE_DIFF_THRESHOLD = 10` (close op count) in
    `src/shared/`.
  - Before sending `SAVE`, if pending close-op count exceeds the threshold,
    show a confirm dialog (`window.confirm` is fine for now) before sending
    the message. `:w!` (map a second Ex command) bypasses the confirmation.
  - Verify: manually stage >10 deletions, confirm `:w` prompts, `:w!` doesn't.
  - Commit message: `feat(buffer): confirm before applying large destructive diffs`

---

## v0.4 — Ergonomics

- [x] **v0.4.1 — `gx`: jump to tab under cursor without saving**
  - In `src/buffer/vimCommands.ts`, register a `Vim.defineAction` that
    reads the tabId at the cursor's line (via the decoration/idMap lookup
    from v0.1) and sends `{type:'FOCUS_TAB', tabId}`.
  - In background: handle `FOCUS_TAB` → `browser.tabs.update(tabId,
{active:true})` then `browser.windows.update(windowId, {focused:true})`.
  - Map it to `gx` via `Vim.mapCommand`.
  - Verify: place cursor on a tab's line, press `gx`, confirm that real tab
    becomes focused/active in the browser, buffer stays open.
  - Commit message: `feat(buffer): add gx to jump to tab under cursor`

- [x] **v0.4.2 — `gr`: refresh/discard local edits**
  - Register a `Vim.defineAction` mapped to `gr` that sends
    `{type:'REQUEST_SNAPSHOT'}` and, on response, replaces the entire buffer
    doc with the freshly serialized text (discarding whatever was typed).
  - Verify: make an unsaved edit, press `gr`, confirm the buffer reverts to
    live browser state.
  - Commit message: `feat(buffer): add gr to refresh buffer from live state`

- [x] **v0.4.3 — `yy` also copies URL to system clipboard**
  - Add `clipboardWrite` permission to `manifest.json`.
  - Hook `yy` (and visual-mode `y`) so that, in addition to vim's native
    register yank, the URL portion of the yanked line(s) is also written via
    `navigator.clipboard.writeText`.
  - Verify: `yy` a tab line, paste into a text field outside the extension,
    confirm the URL is there.
  - Commit message: `feat(buffer): copy url to system clipboard on yank`

- [x] **v0.4.4 — Live-state watchers + stale warning**
  - In background `index.ts`, add listeners for `browser.tabs.onRemoved`,
    `onCreated`, `onMoved`, `onUpdated`. If the buffer tab is currently open,
    post `{type:'STALE_WARNING'}` to it (do not auto-refresh — that would
    destroy unsaved edits).
  - In the buffer page, on `STALE_WARNING`, show a small non-blocking banner:
    "Buffer may be out of date — press gr to refresh."
  - Verify: with the buffer open, manually close a tab in another window;
    confirm the banner appears and unsaved buffer edits are untouched.
  - Commit message: `feat(buffer): warn on stale state without overwriting edits`

- [x] **v0.4.5 — Read-only rendering for non-editable URLs**
  - Use the `editable: false` field (already set in `snapshot.ts` from
    v0.1) to render those lines with a distinct CSS class (dimmed) and
    block edits to them via a CM6 `EditorState.changeFilter` that rejects
    changes touching those line ranges.
  - Verify: open a `chrome://extensions` tab among your test tabs, confirm
    its buffer line is visually distinct and cannot be edited or deleted.
  - Commit message: `feat(buffer): render non-editable tabs as read-only`

---

## v0.5 — Multi-window & grouping polish

- [x] **v0.5.1 — Cross-window move via header reassignment**
  - Confirm (write a test if missing) that moving a parsed line's `windowId`
    away from its original (by cutting it under a different header and
    pasting) already produces a correct `move` op per the v0.2 diff logic.
    If a gap exists, fix `diff.ts`'s per-window grouping to handle this cleanly.
  - Verify: manually move a tab's line under a different window's header,
    `:w`, confirm the tab actually relocates to that window.
  - Commit message: `fix(diff): ensure cross-window line moves produce correct move ops`

- [x] **v0.5.2 — Add `tabGroups` support: types**
  - Add `groupId: number | null` to `BufferLine`.
  - Add `| { kind: 'group'; tabId: number; groupId: number | 'NEW' | 'NONE' }`
    to `Operation`.
  - Add `tabGroups` permission to `manifest.json`.
  - Verify: `npm run build` compiles.
  - Commit message: `feat(types): add tab group support to types and manifest`

- [x] **v0.5.3 — Render tab groups as sub-sections**
  - In `snapshot.ts`, populate `groupId` from `browser.tabs.query` results.
  - In `serialize.ts`, render a sub-header per group within a window (e.g.
    `▸ Group: Work`), ungrouped tabs need no sub-header.
  - Verify: manually create a Chrome tab group, open the buffer, confirm it
    renders as a labeled sub-section.
  - Commit message: `feat(buffer): render tab groups as sub-sections`

- [x] **v0.5.4 — `diff()` + `apply()` handle group changes**
  - `diff.ts`: if a parsed line's target group differs from its original,
    emit a `group` op.
  - `apply.ts`: `group` → `browser.tabs.group({tabIds:[tabId], groupId})` for
    existing groups, or create a new group for `'NEW'`, or
    `browser.tabs.ungroup([tabId])` for `'NONE'`.
  - Add a unit test in `diff.test.ts` for group-change detection.
  - Verify: `npm test` passes; manually move a line under a different
    group's sub-header, `:w`, confirm the real tab's group changes.
  - Commit message: `feat(diff,apply): support moving tabs between groups`

- [x] **v0.5.5 — Pinned-tab boundary handling**
  - Add `pinned` awareness to `diff.ts`'s move logic: if a proposed move
    would interleave a pinned tab among unpinned ones (or vice versa) in a
    way Chrome's API will reject/clamp, detect this **before** calling
    `apply()` and surface a clear status-line error instead of letting the
    API call fail silently or clamp unexpectedly.
  - Add a unit test: attempt an illegal pinned/unpinned interleave, assert
    `diff()` (or a new `validate()` pre-check) flags it.
  - Verify: `npm test` passes; manually attempt to reorder a pinned tab into
    the unpinned section, confirm a clear error rather than confusing behavior.
  - Commit message: `feat(diff): detect and reject illegal pinned tab reordering`

---

## v0.6 — Personal workflow layer

_(Full design reference: see `tab-oil-architecture.md` §9b if available in
this repo/workspace. If that file isn't present, the task descriptions
below are self-contained enough to proceed without it.)_

- [ ] **v0.6.1 — Storage schema for folders + saved items**
  - Add `bookmarks` permission to `manifest.json`.
  - Create `src/shared/storageSchema.ts` with `VirtualFolder`,
    `SavedItem`, and the `ExtensionStorage`/`UserSettings` shapes (folders,
    tabFolderMap, savedForLater, mruTabIds; globalShortcuts, largeDiffConfirmThreshold).
  - Verify: `npm run build` compiles.
  - Commit message: `feat(storage): add schema for folders, saved items, settings`

- [ ] **v0.6.2 — Virtual folders: assign + render**
  - Add `assignFolder` to `Operation` (metadata-only, no browser API call —
    `apply.ts` routes it to `browser.storage.local` instead of `browser.tabs`).
  - Render folder headers as a second grouping layer under window headers
    in `serialize.ts`, one level deep only.
  - `diff.ts`: detect folder reassignment the same way group changes are
    detected (v0.5.4 pattern).
  - Key by tabId at runtime; fall back to normalized URL (origin+pathname)
    when a tabId lookup misses, per the stability tradeoff noted in the
    architecture doc.
  - Add unit tests for folder-assignment diff detection.
  - Verify: `npm test` passes; manually assign a tab to a folder, `:w`,
    `gr` to refresh, confirm the assignment persisted.
  - Commit message: `feat(folders): add virtual folder assignment and rendering`

- [ ] **v0.6.3 — Bulk sleep (discard) via visual mode**
  - Add `discard` to `Operation`; `apply.ts` → `browser.tabs.discard(tabId)`.
  - Add a visual-mode-range Ex command (e.g. `:'<,'>sleep`) in
    `vimCommands.ts` that reads all tabIds under the selected line range and
    sends a batch of `discard` ops in one `SAVE`-style message (or a
    dedicated `BULK_ACTION` message type if cleaner — your call, keep it
    consistent with the existing message contract style).
  - Render discarded tabs dimmed/marked using the existing `discarded` field.
  - Verify: manually visual-select 3+ lines, run the sleep command, confirm
    exactly those tabs go dormant (check via Chrome's own tab hover tooltip
    or task manager) and no others are affected.
  - Commit message: `feat(buffer): add bulk tab sleep via visual mode`

- [ ] **v0.6.4 — Save for later + real bookmarks**
  - Add `bookmark` and `saveForLater` to `Operation`.
  - `apply.ts`: `bookmark` → `browser.bookmarks.create` then close;
    `saveForLater` → append to `browser.storage.local`'s `savedForLater`
    list then close.
  - Render a third virtual buffer section: `── Saved For Later · N items ──`.
  - Add `restoreFromSaved` operation: `browser.tabs.create({url})` + remove
    from the saved list.
  - Add unit tests for the relevant diff/serialize additions.
  - Verify: `npm test` passes; manually save a tab, confirm it moves from
    the live section to the Saved section; restore it, confirm the reverse.
  - Commit message: `feat(saved): add save-for-later and bookmark actions`

- [ ] **v0.6.5 — Options page + custom global shortcuts**
  - Add an `options_page` entry to `manifest.json` pointing at a new
    `options.html`.
  - Build a minimal table UI: rows of `{key, action}`, actions limited to
    `focusOrOpen(urlPattern)` for this task. Persist to
    `browser.storage.sync`.
  - In background: implement `focusOrOpen` — query tabs for a URL match,
    focus if found else `browser.tabs.create`.
  - Register a small number of `commands` entries in the manifest that read
    from this settings table at trigger time (mind Chrome's per-extension
    shortcut count cap).
  - Verify: manually configure a shortcut → a URL pattern, trigger it twice
    (confirm second press focuses the existing tab, doesn't duplicate).
  - Commit message: `feat(shortcuts): add configurable global focus-or-open shortcuts`

- [ ] **v0.6.6 — MRU tab cycling**
  - In background: maintain an MRU tabId array via `browser.tabs.onActivated`,
    capped length (50), persisted to `browser.storage.local` so it survives
    service-worker restarts.
  - Implement `cycleNext`/`cyclePrev` as both a settings-page global
    shortcut action (extend v0.6.5's action list) and a buffer-local
    `Vim.mapCommand` pair.
  - Add the `cycleWithinFolder(folderId)` filter variant, using v0.6.2's
    folder membership map.
  - Verify: manually activate 4-5 tabs in a specific order, trigger cycle
    actions, confirm traversal follows actual recency order, not tab-strip order.
  - Commit message: `feat(cycling): add MRU-based tab cycling with folder filter`

- [ ] **v0.6.7 — Integration pass**
  - Open the buffer with folders, saved items, groups, and regular tabs all
    present simultaneously. Simplify rendering if visually cluttered (e.g.
    collapse empty folders/groups).
  - Re-run the full v0.2 manual test sweep (close/reorder) to confirm no
    regression from everything added since.
  - Verify: all of the above pass together in one session.
  - Commit message: `fix(buffer): polish combined rendering of folders, groups, and saved items`

---

## v1.0 — Release polish

- [ ] **v1.0.1 — Firefox build pass**
  - Confirm `webextension-polyfill` usage is complete (no raw `chrome.*`
    calls remaining anywhere in `src/`).
  - Note any Chrome-only APIs used (`tabGroups` is Chrome-only) and
    feature-detect at startup, hiding the relevant UI on Firefox rather than
    erroring.
  - Verify: load unpacked in Firefox (`about:debugging`), confirm core
    view/close/reorder/create/navigate flows work; grouping UI gracefully
    absent.
  - Commit message: `fix(compat): verify and fix firefox compatibility`

- [ ] **v1.0.2 — Keymap customization**
  - Extend the options page: let the user remap the buffer-internal keys
    (`gx`, `gr`, sleep command, cycle) via `Vim.mapCommand`, re-applied on
    buffer page load from `browser.storage.sync` settings.
  - Verify: remap `gx` to a different key, confirm the new binding works and
    the old one no longer does.
  - Commit message: `feat(options): add buffer keymap customization`

- [ ] **v1.0.3 — Display mode toggle**
  - Add a compact display mode (URL only, no title) as a user setting,
    toggleable from the options page, affecting `serialize.ts`'s output format.
  - Verify: toggle the setting, confirm buffer re-render reflects it.
  - Commit message: `feat(buffer): add compact display mode option`

- [ ] **v1.0.4 — Closed-tab undo stack**
  - Before executing a `close` op in `apply.ts`, capture the tab's
    `{url, windowId, index}` into an in-memory (or `storage.session`) stack,
    capped length.
  - Add an Ex command (`:undo` conflicts with vim's native undo — use
    something like `:restore` or a dedicated key) that pops the stack and
    re-creates the tab.
  - Verify: close a tab via `:w`, run the restore command, confirm it reopens
    at approximately the right position.
  - Commit message: `feat(buffer): add closed-tab restore stack`

- [ ] **v1.0.5 — Packaging**
  - Add production build script (minification, version bump workflow).
  - Write store-listing copy (short description, permissions justification
    for each permission requested — required by both Chrome Web Store and
    Firefox AMO review).
  - Verify: produce a zipped build artifact suitable for store upload.
  - Commit message: `chore(release): add production build and packaging scripts`

---

## Progress Log

_(Append one line per completed task, oldest first. Do not delete old entries.)_

```
2026-07-22  af498d6  v0.3.1  Added create/navigate Operation variants; added stub cases in apply.ts to keep exhaustive switch compiling.
2026-07-22  b4e4e75  v0.3.2  diff() emits create ops for parsed lines with tabId=null; index computed as per-window position in buffer.
2026-07-22  2d97d70  v0.3.3  diff() emits navigate ops when a new URL differs from the snapshot line with the same tabId.
2026-07-22  e015399  v0.3.4  Already implemented close→move→create→navigate ordering in diff() as part of v0.3.2/3.
2026-07-22  aa33f28  v0.3.5  Replaced create/navigate stubs in apply() with real browser.tabs.create/update calls; added apply tests.
2026-07-22  7c9072d  v0.3.8  Added fixed bottom status bar to buffer.html; debounced live parse+diff update on every doc change; clears on successful :w.
2026-07-22  5290cd6  v0.3.9  Added LARGE_DIFF_THRESHOLD constant and confirm dialog before SAVE when close count exceeds threshold; added :w! bypass.
2026-07-22  f70a725  v0.4.1  Added gx mapping to focus tab under cursor; created bufferState.ts shared idMap; background FOCUS_TAB now also focuses the window.
2026-07-22  f9c8a95  v0.4.2  Added gr mapping that sends REQUEST_SNAPSHOT; existing SNAPSHOT handler replaces buffer, discarding edits.
2026-07-22  79fc0e3  v0.4.3  Added clipboardWrite permission; mapped yy to action that extracts URL via extractUrl() and calls navigator.clipboard.writeText().
2026-07-22  1a1c554  v0.4.4  Added tab event listeners in background that send STALE_WARNING to buffer tab; buffer shows/hides a non-blocking banner.
2026-07-22  2bd948f  v0.4.5  snapshotToText now returns nonEditableLines set; buffer renders them dimmed and blocks changes via transactionFilter.
2026-07-22  beb634a  v0.5.1+2  Marked v0.5.1 done (already tested). Added groupId to BufferLine, 'group' to Operation, tabGroups permission; stubs in apply/diff for new variant.
2026-07-22  d0b3fff  v0.5.3  snapshotToText groups tabs by groupId and renders ▸ Group: N sub-headers; parse skips group header lines.
2026-07-22  a6fdb3e  v0.5.4  diff() now compares groupId between old and parsed, emitting group ops; apply() calls browser.tabs.group; parse() tracks groupId; added groupId to ParsedLine.
2026-07-22  2836707  v0.5.5  Added validateMoveOps() in diff.ts that filters out moves violating pinned/unpinned ordering; integrated into diff() before return.
2026-07-22  d7ecf18  fix  Fixed 4 bugs: GROUP_HEADER_RE now captures only the group number (was capturing "Group: N" → NaN); snapshot.ts groupId extraction handles ID 0 correctly; apply.ts group case chains NEW/NONE/number; nonEditable filter bounds-checks lineNo against doc length.
```
