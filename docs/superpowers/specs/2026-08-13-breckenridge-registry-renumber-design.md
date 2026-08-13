# Breckenridge Registry Renumber Design

## Goal

Change the U.S.S. Breckenridge registry from `NCC-74638` to `NCC-74656` everywhere it is represented in the tracked Directive repository.

## Scope

The rename covers every exact tracked `NCC-74638` occurrence, including:

- the bundled Ashes of Peace campaign package and its ship identity data;
- player-facing UI fixtures, contracts, and mockups;
- focused package, projection, panel, and view tests; and
- campaign source and design documentation.

Stable identifiers such as `uss-breckenridge`, package IDs, paths, asset names, and the ship name remain unchanged. External or live SillyTavern saves and installations are outside this change. Existing unrelated working-tree changes must remain untouched.

## Approach

Apply an exact literal replacement from `NCC-74638` to `NCC-74656` in the tracked files that contain the old registry. Do not introduce a compatibility alias or a shared registry constant: this is a canonical data correction, and adding either would expand the change without a runtime requirement.

The bundled campaign package remains the runtime authority. UI and projection code will continue to consume its `ship.registry` value through existing paths; fixtures, contracts, mockups, and tests will be aligned with the new canonical value.

## Validation

Validation will establish all of the following:

1. A repository search finds no tracked `NCC-74638` references outside ignored/generated working artifacts.
2. All changed JSON parses successfully.
3. Focused campaign-package, ship-projection, panel-model, panel-state, and certified-view tests pass with `NCC-74656`.
4. The full repository test gate passes.
5. The final diff contains only the registry renumber and this approved design/implementation documentation, without unrelated working-tree changes.

## Compatibility

No migration of external persisted campaign state is included. Existing saves that embed the old registry are not rewritten. Newly loaded bundled campaign data and all tracked player-facing representations will use `NCC-74656`.
