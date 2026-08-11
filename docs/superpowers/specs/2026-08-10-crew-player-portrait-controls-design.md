# Crew Player Portrait Controls Design

## Problem

Directive accepts a player portrait during Character Creator and carries it into the active V1 campaign, but the Crew page renders the player's personnel record without any way to change that portrait. The existing creator-only import and removal actions cannot mutate an active campaign save.

## Approved behavior

- The player record on the Crew page offers `Add image` when no portrait exists and `Replace image` when one exists.
- A player record with a portrait also offers `Remove image`.
- Removing an image requires confirmation before campaign state changes.
- The controls appear in the shared player detail on desktop and mobile, never on NPC records.
- PNG, JPEG, and WebP remain the only accepted formats, with the existing 5 MB limit and normalization behavior.
- Unsupported hosts render disabled portrait controls with explanatory titles.

## Runtime custody

Active-campaign portrait actions reuse `createPlayerPortraitUpload`, `storeV1PlayerPortrait`, and `deleteV1PlayerPortrait`. Replacement writes the new file, persists the new descriptor to `campaignState.player.portrait`, and only then attempts to delete the superseded file. If campaign persistence fails, Directive deletes the new file and retains the prior state and portrait.

Removal first persists `campaignState.player.portrait = null`, then attempts file cleanup. A cleanup failure is logged and returned as a warning result, but the saved state stays cleared so it never points at a file Directive could not confirm exists.

## UI flow

`renderCrewPanel` passes the runtime view and actions into `createPeopleJournal`. `createPeopleDetail` adds a compact portrait action row only when `record.isPlayer` is true. The hidden file input uses the same accepted MIME types as Character Creator. After a successful add, replacement, or removal, the action refreshes the route.

`Remove image` calls the host confirmation dialog with a specific portrait-removal warning. Cancellation performs no runtime action and no refresh.

## Verification

- Crew panel DOM tests prove player-only control visibility, add/replace labels, disabled-host behavior, file selection, confirmation cancellation, confirmed removal, and refresh behavior.
- Runtime app tests prove active-save persistence, replacement cleanup ordering, failed-persistence rollback, and removal cleanup warnings.
- The complete alpha gate must remain green before merge and again on `main` after merge.
