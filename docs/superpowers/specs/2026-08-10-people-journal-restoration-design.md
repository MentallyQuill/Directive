# People Journal Restoration Design

## Goal

Restore the approved People journal from the frozen expanded-interface contract while retaining the current V1 projection, player-identity flow, and Command Bearing strip. Every visible person, including the player record, can be organized freely.

## Authority

The visual and interaction authority remains `docs/design/mockups/directive-expanded-interface.html` and `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md`. The current V1 projection is the authority for player-safe character facts. The implementation must not revive legacy campaign state or expose private story data.

## Data Flow

`createPeoplePlayerProjection()` will continue to derive authoritative player-safe crew information. It will additionally expose package-backed portrait descriptors. The bundled crew dataset will gain explicit public service and baseline-category metadata because the current V1 dataset does not carry those fields; the renderer must not infer them from billet prose. The player identity projection remains a separate authoritative record, gains an explicit Starfleet command-service descriptor, and joins the visible People collection in the certified view model.

`buildCertifiedPeopleView()` produces one normalized People model containing:

- a stable campaign scope key;
- every visible record, including the player;
- package context for asset resolution;
- authoritative display metadata and story-derived detail;
- Command Bearing as an independent sibling model.

The renderer combines that model with presentation preferences. Preferences may change ordering, category placement, custom category labels, category order, collapse state, and current selection. They cannot change rank, division, role, portrait ownership, story facts, relationship posture, moments, or Command Bearing.

## Presentation Preferences

Add a small versioned People preference repository backed by `localStorage`. Its key is scoped by campaign ID and V1 branch/save ID so different campaigns and continuations do not overwrite one another.

Each scope stores:

- ordered category records with stable IDs, labels, and system/custom ownership;
- ordered person IDs within each category;
- collapsed category IDs;
- the selected person ID.

Reconciliation is fail-safe:

- new authoritative people append to their authored default category;
- missing people are removed from the preference projection;
- malformed, duplicate, or stale preference entries are normalized;
- system categories and authoritative people cannot be deleted;
- removing a custom category returns its people to `unknown-unsorted`;
- storage failures leave a usable in-memory collection and do not block People rendering.

The player record has no pinned exception. It may be moved and reordered like any other visible person.

## Interaction Design

Desktop and phone use the same category and ordering state.

- A toolbar adds a custom category.
- Category headers collapse/expand and expose dedicated drag handles.
- Custom categories can be renamed and removed with inline confirmation.
- Person rows show portrait thumbnails, service pips when applicable, name, and role.
- Person handles support pointer drag, `175ms` touch/pen long press, auto-scroll, and keyboard movement.
- Dragging a person across category targets changes only presentation placement.
- Keyboard `ArrowUp`/`ArrowDown` reorders within a category; crossing a boundary moves into the adjacent category.
- Selecting a person updates the desktop detail pane or expands the phone record without beginning a drag.

The existing shared reorder utilities will be extended or composed rather than copying the mockup's page-local drag implementation.

## Portraits and Detail

Package-owned characters resolve `thumb` and `detail` variants through `createPackageImage()` using the active package. The player continues to use `createPlayerPortraitImage()`.

Desktop rows retain `48px` square thumbnails. The selected detail uses the approved portrait column and lower fade. Phone uses the approved compact record and `200px` detail portrait. Missing assets use the existing media fallback instead of collapsing the image frame.

Person details remain player-safe: identity, role, public profile, current relationship posture, and visible defining moments. Service pips are derived only from explicit service metadata.

## Command Bearing

The current Command Bearing strip, balance pips, reserve/cancel actions, pending state, and refresh behavior remain unchanged. People organization is rendered below it and cannot affect Command Bearing state.

## Testing

Implementation follows red-green-refactor:

1. projection tests fail until real bundled officers expose portrait/service/category metadata without private fields;
2. preference-controller tests fail until reconciliation, custom categories, deletion fallback, free player movement, and persistence work;
3. panel tests fail until real package portraits render in rows and details and handles/categories return;
4. browser interaction tests fail until mouse, touch long-press, keyboard reorder, cross-category movement, and persistence work;
5. visual conformance covers People at `1440x900`, `1024x768`, `390x844`, and `360x800`, including categories, portraits, expanded records, drag state, and internal scrolling;
6. the full `npm.cmd test` gate must pass before merge and again after merging into `main`.

## Out of Scope

- legacy save migration or compatibility layers;
- changes to authoritative V1 campaign/story schemas;
- model-driven category mutation;
- portrait generation or editing;
- changes to Command Bearing behavior;
- unrelated route redesign.
