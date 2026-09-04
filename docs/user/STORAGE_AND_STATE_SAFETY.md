# V1 Storage and State Safety

Directive is currently alpha, so this section is intentionally practical and conservative.
Keep this mindset: saves are important, but recovery is designed for interruption.

## What is stored

V1 storage uses an isolated set of files.
Those files are mapped to SillyTavern user files under names that start with `directive-v1-`.

The player-facing pieces are:

Saves for active campaigns.
Checkpoints for exact snapshots.
Operation journals for campaign operations.
Draft entries for active work-in-progress state.

## How state is accepted

A save becomes official only through the accepted assistant/player pair flow.
Directive writes persistence only after validation of campaign, mission, people, and ship constraints.

If persistence fails before validation is complete, the in-memory state rolls back.
If persistence fails after partial steps, Directive reports a conflict rather than guessing a repair path.

## What a checkpoint does

Checkpoint creates a frozen V1 snapshot with `slotType: checkpoint`.
It captures the current save and opens a cloned playable continuation.
It is a checkpoint, not a full timeline undo.

Load Game uses the saved snapshot to create a new continuation.
It does not overwrite the selected save.
It keeps the old timeline intact and gives you a new playable branch.

## Save Game and Load Game safety

Save Game makes an explicit clone of the current accepted chat and saves it as a V1 snapshot.
Load Game never consumes the source snapshot.
Load Game restores a playable continuation with a new save and chat identity.

When a campaign is changed by branch/replay operations:

Directive writes owned clone filenames before host chat writes.
It verifies retained message IDs and selected swipe before commit.
If the operation fails early, it does not force the timeline in an unknown state.

## Branching and recovery behavior

Creating a native SillyTavern branch from the active campaign chat creates a saved game automatically.
Directive verifies identity links and message hashes before accepting that branch.
Bookmarks, copied chats, unrelated chats, and non-campaign branches are ignored as saved-game sources.

If a save is not recognized or the package version is wrong, Directive rejects it and shows a clear error.
Unrecognized files are ignored unless they occupy required V1 keys.

If a failure happens mid-operation, the active timeline remains authoritative until a successful compare-and-swap updates `index.activeSaveId`.
After that point, continuation moves forward.
Directive does not overwrite unrelated saves while recovering.

## Older V1 storage upgrade

Directive may find a V1 campaign save written before campaign state was split into a manifest, base, and bounded delta segments.
If the complete old record still passes the exact V1 campaign-state contract, Directive upgrades only that storage layout during startup.
It first writes and reads back an exact local recovery copy, then writes and verifies the new base, publishes the manifest last, and proves that loading the result reproduces the original save.

This is not a best-effort conversion of older gameplay formats.
If the record, indexed identity, or an existing recovery copy does not match exactly, Directive leaves the live file unchanged and stops with a specific recovery error.
SillyTavern then shows a persistent **Directive save needs attention** notice with a safe error code and backup instructions; Directive does not activate gameplay against the unresolved save.
Settings reports how many verified recovery copies are retained.
Deleting the migrated campaign also deletes its recovery copy.

## Important rules for players

Do not rename, hand-edit, or copy V1 state files.
Do not transfer saves across different package versions.
Use Settings diagnostics if anything feels inconsistent. A message there confirms when an older V1 save was upgraded and its verified recovery copy was retained.

If a campaign chat appears broken, do not try to reconstruct history by hand.
Stop using that campaign, open Settings > Diagnostics, and run storage verification.
If verification reports a problem, keep the affected account's `directive-v1` files unchanged and copy them to a safe backup location before asking for recovery help.
