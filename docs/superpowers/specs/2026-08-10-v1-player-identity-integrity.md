# V1 Player Identity Integrity Design

**Status:** Approved 2026-08-10

## Goal

Restore the player portrait path that V1 already owns, show the accepted commander identity on the People route, and remove stale code and naming that imply alternate or legacy authority.

## Constraints

- V1 state is the only runtime authority.
- Do not load, translate, mirror, migrate, or otherwise support legacy chats or saves.
- The accepted player record remains immutable after campaign creation.
- Do not add `player` to `V1_MUTABLE_STATE_DOMAINS`.
- Only the creator may import or remove a portrait. The People route displays the accepted result without edit controls.
- Do not perform live SillyTavern qualification in this slice.
- Preserve `.codex-remote-attachments/` and unrelated user files.

## Current Failure

The runtime implements creator portrait import and removal, but its view envelope omits the media capability consumed by the creator panel. The control is therefore disabled even on a host that supports the complete portrait lifecycle. Campaign start copies an accepted portrait into `campaignState.player`, but the exact V1 player projection omits the player identity and the People route cannot display it.

Two modules left by the pre-V1 UI path are now unreachable: `mission-display-identity.mjs`, which searches several superseded mission representations, and `player-portrait-controls.js`, which offers post-creation portrait editing. Two authoritative V1 proposal sources also contain `Shadow` in their identifiers even though they are not shadow writers.

## Design

### Runtime capability

`campaignViewEnvelope()` will expose:

```js
media: {
  playerPortraitImportSupported: boolean
}
```

The value is true only when the active storage adapter provides both `writeBase64File()` and `deleteFile()`. This matches the complete creator lifecycle: replace imports delete the old asset and explicit removal deletes it. The character creator will require that capability for both import and removal controls.

### Exact player projection

Add `src/projection/v1/player-identity-projection.mjs` with:

```js
createPlayerIdentityProjection({ campaignState }) => {
  kind: 'directive.playerIdentityProjection.v1',
  id,
  name,
  pronounsOrAddress,
  rank,
  billet,
  role,
  species,
  appearance,
  firstImpression,
  dossier,
  portrait
}
```

The projection copies only accepted player-facing identity fields from `campaignState.player`. It does not expose creator inputs, storage internals, adjudication data, or a mutation interface. `createV1PlayerProjection()` will include it as `player` and the projection validator will require the exact kind.

### People route

`createV1CrewPanelModel()` will return the projected `player` alongside crew and Command Bearing. `renderCrewPanel()` will render one commander card before the Senior Staff heading. It uses the existing `createPlayerPortraitImage()` display primitive and contains no import, change, or remove controls.

The card presents name, rank/billet, species, appearance or dossier summary, and the accepted portrait when present. Missing portrait data uses the existing neutral player-portrait placeholder.

### Authority hygiene

- Delete `src/ui/mission-display-identity.mjs`; authored V1 mission definitions already provide the exact projected title.
- Delete `src/ui/player-portrait-controls.js`; post-creation player editing is outside the V1 authority contract.
- Rename the two V1 proposal sources containing `Shadow` to names describing their actual authoritative responsibility.
- Add focused assertions to the state-spine runtime test so persisted proposal descriptors cannot regress to shadow terminology.

## Testing

- Runtime-app test: capable storage reports portrait support; incomplete storage does not.
- Creator panel contract: removal is unavailable when the complete host capability is absent.
- Player identity projection test: accepted visible fields and portrait are copied; mutation of the projection cannot mutate campaign state.
- Composite projection and panel-model tests: the exact player projection is mandatory and reaches the People model.
- People panel DOM test: commander identity and portrait render before senior staff without edit controls.
- Portrait asset/storage test: supported formats, size rejection, safe storage path, and deletion behavior.
- State-spine runtime test: authoritative proposal source names contain no shadow terminology.
- Full `npm.cmd test` gate.

## Non-goals

- Changing an accepted player or portrait after campaign start.
- Adding a second player record, compatibility mapper, or fallback mission resolver.
- Refactoring the large runtime or state-spine modules.
- Installing into or exercising a live SillyTavern profile.
