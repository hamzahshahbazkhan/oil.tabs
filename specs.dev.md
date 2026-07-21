# BUILD SPEC: tab-oil v0.1+v0.2 — First Working Version

> Paste this entire file as the task/prompt for your coding agent (DeepSeek
> V4 Flash in OpenCode, or similar). It is self-contained — the agent
> shouldn't need to ask clarifying questions to start. Work through the
> steps **in order**, verify each checkpoint before moving to the next, and
> stop at "STOP HERE" at the end — do not build v0.3+ features unless asked.

---

## 0. Project summary

Build a browser extension (Manifest V3, Chrome) called **tab-oil**. It is
an "oil.nvim for browser tabs": pressing a keyboard shortcut opens a text
buffer (CodeMirror 6 + vim keybindings) listing every open tab across all
windows, one line per tab. The user edits this buffer like a text file —
deleting a line closes that tab, reordering lines reorders tabs — and
running `:w` (vim save command) diffs the buffer against the real browser
state and applies the minimal set of changes needed.

**Scope for this build (v0.1+v0.2 only):**

- View all tabs in a read-only-feeling text buffer (v0.1).
- Support **closing** tabs (delete a line, `:w`) and **reordering** tabs
  within a window (move a line, `:w`) (v0.2).
- Do **NOT** implement: creating new tabs, editing URLs to navigate, tab
  groups, pinned tabs, folders, save-for-later, bookmarks, custom shortcuts,
  or cycling. Those are future versions — explicitly out of scope here.

---

## 1. Tech stack (use exactly this, do not substitute)

- TypeScript, strict mode.
- Vite + `@crxjs/vite-plugin` for the extension build.
- `webextension-polyfill` for promise-based `browser.*` APIs (write against
  `browser.tabs`, not raw `chrome.tabs` callbacks).
- `codemirror` (CM6, the `codemirror` meta-package + `@codemirror/state` +
  `@codemirror/view`) for the editor.
- `@replit/codemirror-vim` for vim keybindings.
- `vitest` for unit tests.
- Manifest V3.

---

## 2. Repository structure to create

```
tab-oil/
├── manifest.json
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── background/
│   │   ├── index.ts
│   │   ├── snapshot.ts
│   │   ├── diff.ts
│   │   ├── apply.ts
│   │   └── bufferWindow.ts
│   ├── buffer/
│   │   ├── main.ts
│   │   ├── serialize.ts
│   │   ├── decorations.ts
│   │   └── vimCommands.ts
│   ├── shared/
│   │   ├── types.ts
│   │   └── messages.ts
│   └── buffer.html
├── tests/
│   ├── diff.test.ts
│   └── serialize.test.ts
└── README.md
```

---

## 3. Shared types — `src/shared/types.ts`

Implement exactly these types:

```ts
export interface BufferLine {
  tabId: number | null; // null = not-yet-created (unused in v0.1/v0.2, but keep the field)
  windowId: number;
  index: number; // position within its window, at last snapshot
  url: string;
  title: string;
  pinned: boolean;
  discarded: boolean;
  editable: boolean; // false for chrome:// and other unwritable URLs
}

export type Operation =
  | { kind: "close"; tabId: number }
  | { kind: "move"; tabId: number; windowId: number; index: number };
// NOTE: 'create' and 'navigate' op kinds intentionally omitted for v0.1/v0.2

export interface Snapshot {
  takenAt: number;
  lines: BufferLine[]; // ground truth, ordered by windowId then index
}

export interface ParsedLine {
  tabId: number | null;
  windowId: number;
  url: string;
}
```

## 4. Message contract — `src/shared/messages.ts`

```ts
export type BgToBuffer =
  | { type: "SNAPSHOT"; snapshot: Snapshot }
  | { type: "APPLY_RESULT"; ok: boolean; error?: string; snapshot: Snapshot }
  | { type: "STALE_WARNING" };

export type BufferToBg =
  | { type: "REQUEST_SNAPSHOT" }
  | { type: "SAVE"; text: string }
  | { type: "FOCUS_TAB"; tabId: number }
  | { type: "DISCARD" };
```

Use `browser.runtime.sendMessage` / `browser.runtime.onMessage` for all
communication between background and buffer page. The buffer page must
**never** call `browser.tabs.*` directly — all browser API access goes
through the background worker.

---

## 5. Build order (follow exactly, in this sequence)

### Step 1 — Project scaffold

- `npm init`, install all deps from §1.
- Set up `vite.config.ts` with `@crxjs/vite-plugin` pointing at `manifest.json`.
- `tsconfig.json` with `strict: true`.
- Empty `manifest.json` (fill in Step 2).
- **Verify:** `npm run build` produces a `dist/` folder with no errors, even
  though there's no real code yet (empty background script is fine at this point).

### Step 2 — Manifest

```json
{
  "manifest_version": 3,
  "name": "tab-oil",
  "version": "0.1.0",
  "description": "oil.nvim for your browser tabs",
  "permissions": ["tabs", "storage"],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "commands": {
    "toggle-tab-buffer": {
      "suggested_key": { "default": "Ctrl+Shift+E" },
      "description": "Open the tab-oil buffer"
    }
  },
  "action": { "default_title": "tab-oil" }
}
```

- **Verify:** load the extension unpacked in `chrome://extensions` (developer
  mode on, "Load unpacked", point at `dist/`). Confirm it loads with no errors
  in the extensions page.

### Step 3 — Background: buffer window management (`src/background/bufferWindow.ts`)

- Export `openOrFocusBufferTab()`: check if a buffer tab is already open
  (track its tabId in `browser.storage.session`), if so focus it via
  `browser.tabs.update(id, {active:true})` + `browser.windows.update`, else
  create a new tab pointed at `buffer.html` (an extension page) and store
  its id.
- In `src/background/index.ts`, listen for the `toggle-tab-buffer` command
  (`browser.commands.onCommand`) and call `openOrFocusBufferTab()`.
- **Verify:** pressing Ctrl+Shift+E opens a blank `buffer.html` tab. Pressing
  it again focuses the same tab instead of opening a new one.

### Step 4 — Background: snapshot (`src/background/snapshot.ts`)

- Export `async function takeSnapshot(): Promise<Snapshot>`.
- Use `browser.tabs.query({})`, group results by `windowId`, sort each
  group by `index`, map each tab to a `BufferLine`:
  - `editable: false` if `url` starts with `chrome://`, `chrome-extension://`,
    `about:`, or `edge://` — everything else `editable: true`.
  - `discarded` comes straight from the tab object's `discarded` field.
- **Verify (manual, in browser console via the extension's service worker
  devtools):** call `takeSnapshot()` and confirm it returns one `BufferLine`
  per open tab, correctly grouped and ordered, and that the buffer tab
  itself is excluded from the results (filter it out by comparing against
  the stored buffer tabId).

### Step 5 — Wire snapshot to buffer page on open

- In `background/index.ts`, listen for `REQUEST_SNAPSHOT` messages and
  respond with `{type:'SNAPSHOT', snapshot}`.
- Also send a `SNAPSHOT` message proactively right after
  `openOrFocusBufferTab()` creates a new tab (buffer page may not be ready
  yet — have the buffer page send `REQUEST_SNAPSHOT` on its own load as the
  reliable path, and treat the proactive push as a nice-to-have, not load-bearing).
- **Verify:** nothing visible yet (buffer page has no UI) — just confirm via
  console logs that a snapshot round-trips over `runtime.sendMessage`.

### Step 6 — Buffer page: serialize (`src/buffer/serialize.ts`)

Implement two pure functions (no browser APIs, must be unit-testable):

```ts
export function snapshotToText(snapshot: Snapshot): {
  text: string;
  idMap: Map<number, number>;
};
// idMap: line number (0-indexed) -> tabId

export function parse(text: string, idMap: Map<number, number>): ParsedLine[];
```

- `snapshotToText`: produce text like:
  ```
  ── Window 1 · 3 tabs ──
  Example Domain — https://example.com/
  GitHub — https://github.com/
  Hacker News — https://news.ycombinator.com/

  ── Window 2 · 1 tab ──
  Gmail — https://mail.google.com/
  ```
  Header lines (`── ... ──`) are never in `idMap` (they have no tabId).
  Track which `windowId` each header corresponds to — you'll need this in
  `parse`.
- `parse`: walk the text line by line. Header lines update the "current
  windowId" context (parse the windowId out of the same header text you
  generated — simplest approach: keep a second lookup of header-line-number
  → windowId built alongside `idMap` in `snapshotToText`, and pass both into
  `parse`, OR regenerate windowId assignment by matching header text against
  a small ordered list of `{lineNumber, windowId}` pairs). For each content
  line: look up `idMap.get(lineNumber)` — if found, that's the tabId; the
  URL is the text after `—` (or the whole line if the separator is
  missing — be forgiving, do not throw). Return `{tabId, windowId, url}` for
  every content line, in the order they appear.
- **Verify with unit tests (Vitest), in `tests/serialize.test.ts`:**
  - Round-trip test: build a `Snapshot` fixture (2 windows, several tabs),
    call `snapshotToText`, then `parse` the result — assert the parsed
    output's `tabId`/`windowId`/`url` values match the original snapshot,
    in the same order.
  - Test a line with the separator manually removed still parses without throwing.

### Step 7 — Background: diff (`src/background/diff.ts`)

Implement:

```ts
export function diff(oldSnapshot: Snapshot, parsed: ParsedLine[]): Operation[];
```

Algorithm (v0.1/v0.2 scope — only `close` and `move`, no `create`/`navigate`):

1. Build `oldById: Map<number, BufferLine>` from `oldSnapshot.lines`.
2. Build `newIds: Set<number>` from every non-null `tabId` in `parsed`.
3. **Deletions:** for every `tabId` in `oldById.keys()` not present in
   `newIds`, push `{kind:'close', tabId}`.
4. **Moves, per window, using minimal-moves (LCS-based):**
   - Group `parsed` lines (excluding closed tabIds) by their `windowId`, in
     buffer order — call this `newOrder[windowId]: number[]` (tabId arrays).
   - Group `oldSnapshot.lines` (excluding closed tabIds) by their
     `windowId`, sorted by `index` — call this `oldOrder[windowId]: number[]`.
   - For tabs whose `windowId` changed between old and new: always emit a
     `move` op (cross-window moves can't be "in the LCS" of a single window
     by definition).
   - For tabs that stayed in the same window: compute the LCS of
     `oldOrder[windowId]` vs `newOrder[windowId]` (implement a standard
     O(n*m) dynamic-programming LCS on the tabId arrays). Any tabId **not**
     in the LCS needs an explicit `move` op with its new `index` (position
     in `newOrder[windowId]`). Tabs **in** the LCS need no op — they're
     already correctly ordered relative to each other.
5. Return `[...closeOps, ...moveOps]` — closes first, always, so that
   `chrome.tabs.move` index math isn't thrown off by tabs that are about to
   disappear.

- **Verify with unit tests, in `tests/diff.test.ts`:**
  - No changes → empty array.
  - Remove one tabId from parsed → exactly one `close` op, no `move` ops.
  - Swap two tabs in the same window → `move` ops for at most those two
    tabIds, and assert zero `move` ops for every untouched tab in that window.
  - Move a tab from window A to window B → one `move` op with the new `windowId`.
  - A 10-tab window with only 2 tabs reordered → exactly the moved tabIds
    get ops, not all 10 (this is the test that actually proves the LCS logic works).

### Step 8 — Background: apply (`src/background/apply.ts`)

```ts
export async function apply(
  ops: Operation[],
): Promise<{ ok: boolean; error?: string }>;
```

- Execute ops **sequentially** (a plain `for...of` loop with `await`, not
  `Promise.all`), in the order given (already close-then-move from diff.ts).
- `close` → `await browser.tabs.remove(op.tabId)`.
- `move` → `await browser.tabs.move(op.tabId, {windowId: op.windowId, index: op.index})`.
- Wrap each call in try/catch; on error, stop immediately and return
  `{ok:false, error: <readable message including which op failed>}`.
- On full success, return `{ok:true}`.
- **Verify:** manually, once wired into the message handler (Step 9) — this
  function itself doesn't need a browser-free unit test since it's pure I/O,
  but do sanity-check the switch statement compiles and covers both op kinds
  exhaustively (TypeScript should error if a new `Operation` variant is
  added and not handled — keep the switch exhaustive with a `never` check
  in the default case).

### Step 9 — Wire `:w` end-to-end

- In `background/index.ts`, handle the `SAVE` message:
  1. `const parsed = parse(msg.text, currentIdMap)` — `currentIdMap` is
     whatever idMap was produced by the most recent `snapshotToText` call
     (store it in the background worker's memory alongside the last snapshot).
  2. `const ops = diff(lastSnapshot, parsed)`.
  3. `const result = await apply(ops)`.
  4. `const freshSnapshot = await takeSnapshot()` (re-snapshot regardless of
     success/failure — browser is ground truth).
  5. Reply with `{type:'APPLY_RESULT', ok: result.ok, error: result.error, snapshot: freshSnapshot}`.
  6. Update `lastSnapshot`/`currentIdMap` to the fresh values.
- **Verify:** this is covered by the end-to-end checkpoint in Step 13 below
  — don't try to verify this step in isolation, it needs the buffer UI.

### Step 10 — Buffer page: CodeMirror setup (`src/buffer/main.ts`, `src/buffer/decorations.ts`)

- Mount a CM6 `EditorView` into `buffer.html`'s DOM, with `basicSetup` +
  the `@replit/codemirror-vim` `vim()` extension.
- On page load, send `{type:'REQUEST_SNAPSHOT'}`, and on receiving a
  `SNAPSHOT` message, call `snapshotToText` and set the editor's document
  to the resulting text. Store the returned `idMap` in a module-level
  variable (or a CM6 `StateField` if you're comfortable with that — a plain
  module variable is acceptable for this version, don't over-engineer it).
- Implement `decorations.ts`: a `StateField` or simple line-number lookup
  that, given a line number, returns the corresponding tabId from the
  current `idMap` (needed by the `:w` handler to know which id maps to
  which line, and later by `gx`-style features you are NOT building yet).
- Header lines should be visually distinguished (e.g. a CSS class via a
  `Decoration.line` mark) but do not need to be strictly read-only for this
  version — treat "don't edit header lines" as a user-honor-system rule for
  now, not an enforced constraint. (Enforcing it properly is a nice-to-have,
  not required for v0.1/v0.2 — do it only if time remains after everything
  else here works.)

### Step 11 — Buffer page: vim `:w` command (`src/buffer/vimCommands.ts`)

```ts
Vim.defineEx("w", "w", () => {
  const text = view.state.doc.toString();
  browser.runtime.sendMessage({ type: "SAVE", text });
});
```

- On receiving `APPLY_RESULT`: if `ok`, re-render the buffer from the fresh
  snapshot (same as initial load) and show a brief success indicator
  (`console.log` is fine, a visible status line is optional polish for this
  version). If `!ok`, show `error` somewhere visible (a simple `alert()` or
  a DOM element — doesn't need to be pretty yet).

### Step 12 — README

Write a short `README.md`: how to `npm install`, `npm run build`, load
unpacked in Chrome, and the two things it currently supports (view all
tabs; delete a line + `:w` closes that tab; reorder lines + `:w` reorders
tabs). State explicitly that create/navigate/groups are not yet supported.

### Step 13 — End-to-end manual verification (THE checkpoint for this whole build)

Do all of these, in a real loaded-unpacked Chrome instance, with several
tabs open across 2+ windows:

1. Press Ctrl+Shift+E → a buffer tab opens showing every real tab, grouped
   correctly by window, headers included, buffer tab itself excluded.
2. Press Ctrl+Shift+E again → it focuses the existing buffer tab, does not
   open a duplicate.
3. In normal mode, move to a tab's line, `dd` to delete it, `:w` → confirm
   that real tab actually closes in the browser, and the buffer refreshes
   to reflect the new (accurate) state.
4. Move a line to a different position within the same window's block
   (cut with `dd`, paste elsewhere with `p`, or visual-mode move), `:w` →
   confirm the real tab strip reorders to match, and unrelated tabs in that
   window did **not** get spuriously moved (you can eyeball this, or add a
   temporary `console.log` in `apply.ts` to print how many `move` ops ran —
   it should be a small number, not "every tab in the window").
5. `:w` with zero changes made → confirm no errors, no unnecessary API calls.
6. Delete a line whose tab has already been closed manually in the browser
   in the meantime, then `:w` → confirm this doesn't crash (it's fine if it
   just silently no-ops or shows a benign error for that one op; it should
   not break the rest of the save).

**If all six checks pass, this build is done.** Do not proceed to
create/navigate ops, groups, folders, or any other feature from later
versions unless explicitly asked.

---

## 6. What NOT to build (explicit exclusions)

- No `create` or `navigate` operations — new lines and edited URLs should be
  silently ignored by `diff()` for this version (only match/emit ops for
  lines whose `tabId` is present in both old and new — a `parsed` line with
  `tabId: null` simply produces no operation, don't error on it either).
- No tab groups, no pinned-tab special-casing, no virtual folders, no
  save-for-later, no bookmarks, no custom shortcuts, no cycling.
- No side panel — use a plain extension tab for the buffer page.
- No Firefox build yet — Chrome only for this version (webextension-polyfill
  is still worth using now so Firefox support later is a smaller lift, but
  don't spend time testing on Firefox for this build).

---

## STOP HERE

This spec covers v0.1 (read-only view) + v0.2 (close + reorder) only. Once
Step 13's six checks all pass, stop and report back what was built and the
results of the manual verification — do not continue into v0.3 (create/navigate)
without a new instruction.
