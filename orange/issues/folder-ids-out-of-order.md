# Issue: Folder/tab-group ids rebuilt from display order — reordering changes semantics

**Status:** open (diagnosed from code)
**Severity:** medium
**Files:** `src/engine/Planner.ts`, `src/model/Parser.ts`

## What happens

The Parser assigns `folderId` (Chrome tab-group id) from the **display
order** of `▸ Group:`-style headers in the edited text, not from the
browser's real group ids. Chrome group ids are stable integers that
survive reorder; the buffer text carries no group tag, so the parser has
to map "the Nth group-header in the document" → real group.

## Failure mode

Reordering folder lines in the buffer as a normal document-shuffle
operation re-assigns group ids by *index*. e.g.:

Buffer text →  `[group A] ... [group B]`; the user syncs, then later
swaps the two headers. The parser reads:

- group header at pos1 → maps to the *current-tab mapped* id stored
  elsewhere (but pinned per `*this-window*`, reassigned fresh each
  render), so swap groups dedicate the group members entirely — and can
  even assign new groups if they aren't in the "existing group ids"
  cache (`fetchGroupIds`).

The diff then sees `groupId` differ → generates `group`/`ungroup`
operations that reassign tabs across real groups — effectively moving
every tab to the wrong subgroup.

## Additional context

`setStorage` for `groupId` runs per-plan computation; the mapping is only
keyed off the text each parse, so *any* textual move of a folder line
changes the mapping.

## Suggested fix

- Emit a stable pseudo-id per folder in the text (like the removed tab
  ids), e.g. `▸ Group: name ?TAG=1234` with the id hidden, so
  reordering doesn't re-map.
- Or map folders to their tab members instead of position, and reuse the
  existing `tabFolderMap` — the folder line itself doesn't need an id,
  only its member assignments.

## Tests

Add a diff test: snapshot with folderA→[t1,t2]; move folder header above
another header in text; assert no `group/ungroup` ops are generated with
swapped members.