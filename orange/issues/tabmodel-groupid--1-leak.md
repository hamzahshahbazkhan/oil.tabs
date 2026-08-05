# Issue: `groupId: -1` leaks from live tab events → spurious "Group: -1" sections

**Status:** open (diagnosed from code)
**Severity:** medium
**Files:** `src/model/TabModel.ts` (`tabToBufferLine`), `src/render/tabs.ts` (`pushTabRows`), `src/adapter/BrowserAdapter.ts (`takeSnapshot)

## The mismatch

Two different producer paths disagree on what "ungrouped" means:

- `takeSnapshot` (initial / SNAPSHOT / SAVE) **normalizes**:
  ```ts
  groupId: tab.groupId !== undefined && tab.groupId > -1 ? tab.groupId : null
  ```
  → ungrouped tab → `null`.
- `TabModel.tabToBufferLine` (live onCreated/onUpdated/etc.) does **not**:
  ```ts
  groupId: tab.groupId ?? null,
  ```
  → Chrome sends `groupId: -1` for an ungrouped tab → the live BufferLine carries `-1`.

`pushTabRows renders any non-`"__ungrouped` key` as a section header:
```ts
const key = tab.groupId ?? "__ungrouped";
...
if (key !== "__ungrouped") lines.push(Section(`Group: ${key}`));
```

So **the same tab renders as `Group: -1` after live updates but plain
(no group header) on initial render.** The very first tab event that triggers a
`SNAPSHOT_UPDATED` (e.g. title change on any tab) rewrites the buffer
text to include `Group: -1` headers.

## Secondary issue in the same area

`onTabUpdated` ignores `changeInfo.groupId`:

```ts
if (!changeInfo.url && !changeInfo.title &&
    changeInfo.discarded === undefined &&
    changeInfo.pinned === undefined && changeInfo.favIconUrl === undefined) return;
```

Group memberships changed via mouse/Chrome UI or another window never reaches the
buffer rows until a manual refresh.

## Impact

- Ugly `-1` sections appear in the buffer once live-sync starts updating.
- Group membership changes are never reflected live in buffer rows.
- (Parse round-trips stay consistent: `Group: -1` header → Parser sets groupId
  `-1` → diff `-1 === -1 → no ops — so no spurious save churn, just ugly UI.)

## Suggested fix

Normalize in `tabToBufferLine` the same way `takeSnapshot does, e.g.

```ts
groupId: tab.groupId !== undefined && tab.groupId > -1 ? tab.groupId : null,
```
and add `changeInfo.groupId !== undefined` to the early-return guard +
make onTabUpdated update `line.groupId`.

## Tests

Add a render test: BufferLine with groupId `-1 → no `Group:` section;
groupId `0` → `Group: 0`.