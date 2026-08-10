# Coming-Later Campaign Detail Design

**Date:** 2026-08-10
**Status:** Approved

## Objective

Let players browse every campaign description from the certified Campaign library without implying that future campaigns can be started in V1.

## Approved Treatment

Campaign-library rows use the same selectable master-list interaction regardless of availability. Future-campaign rows:

- remain full-color and readable;
- contain the campaign title and current approved description;
- do not display `Coming Later` in the list row;
- behave as ordinary selectable rows with the same active-selection treatment as Ashes of Peace.

Selecting a future campaign opens its detail pane. The detail pane:

- displays `Coming Later` as the hero status;
- displays the campaign title and complete current description normally;
- greys and desaturates only the hero artwork;
- displays a disabled, greyed `New campaign` button;
- never invokes a creator, campaign-start, or runtime mutation action.

Ashes of Peace retains its playable detail behavior. Existing saved/current campaign rows and actions are unchanged.

## Considered Approaches

1. **Selectable neutral list with a locked detail state — selected.** This keeps the library useful for discovery while placing availability information beside the unavailable action.
2. **Grey but selectable list rows.** Rejected because the grey treatment continues to suggest that the rows cannot be opened.
3. **List-row modal or tooltip previews.** Rejected because it introduces a second reading surface and diverges from the certified master/detail interaction.

## Component Changes

### Certified campaign view model

The package availability value remains `available` or `coming-later`. The existing `disabled` field continues to mean that campaign creation is unavailable; it must no longer determine whether a package can be selected or shown in detail.

### Campaign master list

Every package renders through the selectable-row path. Future rows retain `data-campaign-availability="coming-later"` for the approved-variance contract and tests, but do not receive `aria-disabled`, a negative tab index, the old grey class, or a `Coming Later` state label.

### Campaign detail

Package lookup includes future packages. The package-detail renderer derives its locked state from `pack.disabled`:

- status: `Coming Later` for locked packages, `Playable in V1` otherwise;
- hero class/data attribute: availability-specific styling hook;
- action: disabled `New campaign` for locked packages; existing playable start/resume behavior otherwise.

### Styling

Remove the whole-row greyscale/opacity treatment. Add a detail-only rule that greys the future campaign hero media. The existing disabled-button rule supplies the greyed action treatment. Text remains at certified contrast.

## Accessibility And Interaction

- Future package rows are real buttons and keyboard-selectable.
- Selection uses the existing `aria-pressed` contract.
- The unavailable detail action uses the native `disabled` attribute.
- Availability is exposed as visible detail status text and a stable data attribute.
- No disabled-looking list element is focusable or clickable because no list element is disabled-looking.

## Verification

Test-first coverage must prove:

1. a future campaign row is a selectable button without list-level `Coming Later` text;
2. clicking it renders the full current description in detail;
3. the detail status is `Coming Later`;
4. the hero media has the future-detail styling hook;
5. `New campaign` is disabled and no start action fires;
6. Ashes remains playable;
7. desktop and phone Campaign layouts remain bounded and free of document overflow;
8. the approved-variance registry describes selectable preview with detail-only locking.

The full 91-check V1 gate and expanded-interface visual matrix remain required before merge.

## Non-Goals

- Enabling any future campaign package.
- Changing campaign descriptions or art assets.
- Changing save/checkpoint behavior.
- Modifying V1 state, storage, chat binding, prompt, or campaign-start semantics.
- Redesigning any non-Campaign route.
