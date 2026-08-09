# Expanded Interface Conformance Corrections

**Status:** Implemented and certified

**Date:** 2026-08-08

**Scope:** Restore the remaining Campaign, Mission, and People conformance gaps without redesigning the approved expanded interface or changing Directive simulation authority.

## Authority

This correction keeps the existing authority order:

1. `docs/design/mockups/directive-expanded-interface.html`
2. `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md`
3. `docs/superpowers/plans/2026-07-22-expanded-interface-production-integration.md`
4. `docs/design/DIRECTIVE_INTERFACE_DESIGN_BIBLE.md`

The frozen mockup remains unchanged. The decisions confirmed on 2026-08-08 are conformant with it:

- collapsed record chevrons point right;
- expanded record chevrons point down;
- the chevron rotates around its visual center;
- the Mission hero displays the `MAIN QUEST` kicker above the title `A Ship Underway`;
- `PRELUDE` and literal quotation marks do not appear in the Mission title treatment.

## Goals

- Restore the People detail information supported by real player-safe package and runtime data.
- Reuse the existing production player-portrait lifecycle in the People route.
- Make People drag handles and previews behave like the record being held.
- Make all Mission and People record chevrons visually centered and mockup-conformant.
- Eliminate visible floating hover/focus tooltips on mobile input surfaces.
- Make presentation-only route changes render immediately without reloading authoritative game state.
- Resolve authored mission titles consistently in Mission and Campaign.
- Preserve full-width Campaign and People compositions without unused right-side columns.

## Non-goals

- No new simulation commands or durable game-state fields.
- No hardcoded mockup records, `/files/...` asset paths, or prototype-only responses in production code.
- No inference of private facts, motives, prompts, credentials, endpoints, or director-only records.
- No change to save, load, chat, provider, diagnostics, or asset-storage semantics.
- No permanently mounted five-route application rewrite.
- No change to the frozen mockup solely to make production pass.

## Current Failures

### People projection

`buildPlayerFacingInformation()` currently projects each person from the first record bearing a given ID. Sparse `crewDataset.officers` records occur before richer package and runtime sources, so later service metadata, involvement, facts, relationship state, and history are discarded instead of merged.

The People renderer already supports Current involvement, Known information, and Relationship & history. These sections disappear in the real extension because the projected records are empty, while deterministic visual fixtures inject already-populated records and therefore conceal the production data-path failure.

### Player portrait

Directive already provides:

- `createPlayerPortraitImage()` with `assets/icons/comm-badge.svg` fallback;
- real portrait import and removal runtime actions;
- extension-storage persistence and asset deletion;
- format, decode, and storage tests;
- an older Crew detail control that exposes Import/Change and Remove.

The new People journal bypasses these facilities and sends the player through the generic person-image path, producing the incorrect missing-image icon and no management controls.

### Reordering

The shared reorder controller clones the source record but leaves its horizontal position fixed. It updates only the preview's vertical position using the pointer's original item offset. Consequently, the pointer does not remain over the cloned handle.

The preview is also rendered at `0.9` opacity, and desktop People handles inherit stretched-row placement instead of centering themselves in the row.

### Chevrons

The intended chevron path is a downward `V`. Its collapsed state is a centered `-90deg` rotation, producing a right-facing chevron. The expanded state is `0deg`, producing a downward chevron. Production has the basic state mapping but must guarantee a stable square box and centered transform origin across category and record disclosures.

### Route switching

Route selection is presentation-only, but the shell currently clears the active body and awaits a complete `getCurrentView()` before rendering the selected route. That call can perform:

- active-save validation;
- host-chat identity and metadata reads;
- current-chat campaign-scope reconciliation;
- persisted CORE projection reads;
- full campaign/player-safe projection construction;
- cloning of the large runtime view envelope.

The route then rebuilds its DOM from scratch. This makes a tab click pay for unrelated storage and host work and leaves the route body blank while it waits.

### Mission and Campaign titles

The active mission's authored title exists in the quest ledger, campaign package quest template, and mission graph. The current projection starts from the sparse mission-state object and falls back to its ID, producing `prelude-a-ship-underway`. Campaign similarly prefers `activeMissionId` when save metadata lacks a title.

## Design

### 1. Merged player-facing People records

Project people by stable person ID, collecting all eligible sources before producing the final record. Field precedence is purpose-specific rather than whole-record first-wins:

1. committed player-safe runtime fields for changing state;
2. current-chat campaign records for involvement, standing, and visible history;
3. active package person data for stable identity, public role, affiliation, and service metadata;
4. sparse dataset values only as fallbacks.

Only explicit player-visible fields enter the projection. Package records marked `directorOnly`, hidden facts, private relationship reasoning, and uncommitted proposals are rejected at the projection boundary.

The final person model retains the approved small core:

- identity, image, name, public role, affiliation/category, and service marks;
- current involvement when a visible active quest or assignment links the person;
- concise known information from explicit player-safe facts;
- relationship summary and important visible history when committed records exist.

Unsupported sections remain omitted. The implementation does not invent prose to make a sparse live campaign resemble the deterministic mockup.

The deterministic conformance fixture continues to provide equivalent rich records so desktop and phone rendering of every approved section is certified without shipping fixture data in runtime code.

### 2. Player portrait integration

The player record is identified from the active player-character projection rather than a display name. Both list and detail images use the existing player portrait renderer:

- a stored portrait resolves through the normal Directive asset resolver;
- no stored portrait renders the existing Star Trek comm-badge SVG treatment;
- no generic image glyph is displayed for the player.

The selected player's detail portrait exposes the existing production controls:

- **Import Image** when no portrait exists;
- **Change Image** when a portrait exists;
- **Remove Image** only when a removable portrait exists.

The control uses the existing supported MIME types, validation, persistence, replacement cleanup, runtime actions, and status reporting. Removing or replacing an image updates the People route from the returned authoritative view. NPC and package-owned portraits remain non-editable.

Desktop controls sit within the portrait frame without changing the approved portrait/detail grid. Phone controls sit with the compact portrait and remain reachable without covering the name, details, or bottom route bar.

### 3. People handle alignment and drag preview

Desktop person-record handles use `align-self: center` inside their fixed `38px` column. Category handles retain their existing header alignment.

The shared reorder controller records the handle center relative to the preview card at activation. Pointer movement updates both preview axes so the preview's cloned handle center remains under the pointer. The preview does not jump when dragging begins.

For People person records, the preview is the visible list card/header being reordered, including portrait, pips, name, role, and handle. Expanded phone detail content is not duplicated into the preview. The preview uses `opacity: 0.5` and the same width, height, colors, and geometry as the source record.

Existing behavior remains:

- mouse drag starts immediately;
- touch and pen require the approved `175ms` long press;
- the source is replaced by an exact-height placeholder;
- pointer cancellation restores the source without committing;
- keyboard Arrow Up/Arrow Down reordering remains available from the handle;
- bounded-list auto-scroll remains active;
- ordering remains presentation-only.

### 4. Centered disclosure chevrons

Mission quest records, People categories, and People records use one SVG chevron primitive:

- the SVG view box is geometrically centered;
- the visible chevron sits inside a fixed `28px` square;
- `transform-origin: 50% 50%` and `transform-box: fill-box` anchor rotation to the glyph center;
- collapsed state is `rotate(-90deg)`, pointing right;
- expanded state is `rotate(0deg)`, pointing down;
- transition duration remains the mockup's `140ms`;
- `prefers-reduced-motion` disables the transition without changing either state.

The state changes only after `aria-expanded` changes, keeping visual and accessible state synchronized.

### 5. Mobile tooltip suppression

`aria-label` and `aria-description` remain available on every control. Only the visual floating/native tooltip is suppressed.

A tooltip is considered mobile-input and must not display when any of the following is true:

- the viewport is at the phone breakpoint;
- the active shell is the phone/mobile composition;
- the primary pointer is coarse or hover is unavailable;
- the triggering pointer interaction is touch or pen.

Input modality is recorded before focus handling so a tap cannot open a focus tooltip. Pointer enter, hover, focus, and lingering native `title` behavior all respect the same decision. Switching back to a desktop mouse surface restores ordinary desktop tooltips.

Explicitly launched guidance tutorials and instructional dialogs are not hover tips and remain available.

### 6. Immediate presentation-only route switching

The shell retains the most recently completed authoritative runtime view. Selecting a route performs only synchronous presentation work:

1. normalize and store the selected route;
2. update shell route chrome and accessibility state;
3. render the selected route from the retained view;
4. restore route-local presentation state and focus as applicable.

Route selection does not call `getCurrentView()`, active-save validation, host metadata, storage reads, or game-state persistence. It also does not blank the route body before data is available.

A full authoritative refresh still occurs when:

- the shell first opens without a retained view;
- a real runtime command completes;
- save, load, campaign, chat, provider, diagnostics, or portrait actions change data;
- the host reports campaign/chat state changes;
- an explicit refresh or recovery path requests it.

The refresh stores the new completed view and redraws the current route. Request IDs continue to prevent stale asynchronous responses from replacing a newer render.

This approach is preferred over keeping every route mounted because it removes the unnecessary I/O boundary while preserving one current DOM tree, existing route-local renderers, and bounded memory use.

### 7. Authoritative mission-title resolution

Resolve an active mission ID against these sources in order:

1. matching current quest-ledger instance with a non-ID title;
2. matching active package quest template;
3. matching loaded mission graph manifest;
4. explicit non-ID mission-state title;
5. humanized ID only as a final defensive fallback.

The resolver returns structured identity rather than presentation markup. For the bundled opening mission it returns:

```js
{
  id: 'prelude-a-ship-underway',
  title: 'A Ship Underway',
  category: 'main'
}
```

Mission renders the mockup hierarchy:

- kicker: `MAIN QUEST`;
- title: `A Ship Underway`;
- list and detail title: `A Ship Underway`.

Campaign uses the same title for its Chapter fact and save/checkpoint summaries. Raw mission IDs never appear as player-facing titles when authored metadata is available.

Dynamic and imported campaigns use their own authored titles. No Breckenridge-specific title is hardcoded in the renderer.

### 8. Full-width route containment

Campaign and People master/detail compositions fill the available route-body width:

- the master column keeps its approved fixed width;
- the detail column is `minmax(0, 1fr)` with no legacy maximum-width cap;
- images and written detail stay inside their allocated tracks;
- route-local scroll containers own overflow;
- the document never gains horizontal overflow.

Phone continues to use the approved accordion/expanded-record composition rather than inheriting the desktop split pane.

## Accessibility

- Portrait actions have explicit accessible names and status feedback.
- File input behavior remains keyboard-operable through the visible import/change control.
- Removing a portrait returns focus to a stable portrait action.
- Drag handles remain separate buttons from selection and disclosure targets.
- Pointer dragging, long-press dragging, and keyboard reordering produce the same final order.
- `aria-expanded` is the source of truth for chevron state.
- Mobile tooltip suppression does not remove accessible descriptions.
- Route controls preserve tablist, selected, current-page, and roving-focus semantics.
- Immediate route rendering must not introduce a focus trap or move focus into a stale detached subtree.

## Error Handling

- A failed portrait import leaves the prior portrait and storage pointer intact and reports the real validation/storage error.
- A failed portrait removal leaves the current portrait visible and reports the failure.
- Missing package title metadata falls back defensively without throwing or exposing internal object values.
- A route selected before the first view completes keeps the shell chrome responsive and renders when the first authoritative view arrives.
- A superseded asynchronous refresh cannot overwrite a newer route render.
- Drag cancellation or lost pointer capture restores the original record and removes preview/placeholder artifacts.

## Verification

### Projection and unit contracts

- Sparse and rich person sources merge by ID with explicit field precedence.
- Director-only and hidden records cannot enter People details.
- Player identity selects the comm-badge/player-portrait path.
- Mission IDs resolve through quest ledger and package metadata before fallback.
- Campaign and Mission consume the same resolved title.
- Route selection performs no `getCurrentView()` or storage/host refresh call.
- Runtime-changing actions still trigger a complete refresh.
- Touch/pen-origin focus cannot show a visual tooltip.

### DOM and interaction contracts

- Player placeholder contains the comm-badge SVG and no generic image icon.
- Import, change, and remove controls call the real runtime action adapter.
- Desktop People handles are vertically centered.
- Drag preview handle center remains within a minimal measurement tolerance of the pointer on both axes.
- People drag preview is the full visible record at computed opacity `0.5`.
- Mouse, touch long-press, keyboard reorder, placeholder, cancellation, and auto-scroll remain functional.
- Collapsed chevrons point right; expanded chevrons point down.
- Computed transform origin is centered and the transition is `140ms`, except under reduced motion.
- Mobile route taps never create a floating or native hover tooltip.
- Mission and Campaign contain no raw `prelude-a-ship-underway` player-facing title.

### Visual conformance

Capture Campaign, Mission, and People at:

- `1440x900`
- `1024x768`
- `390x844`
- `360x800`

Include:

- empty and populated player portrait states;
- portrait action states;
- populated People details and collapsed relationship/history;
- selected and expanded records;
- centered collapsed and expanded chevrons;
- People mouse and touch drag previews;
- long content and independent scrolling;
- Campaign and People full-width geometry;
- Mission hero, list, detail, and Campaign Chapter title.

DOM measurements must cover major bounding boxes, grid tracks, preview opacity and pointer anchoring, transform origin, route-switch call counts, scroll regions, and document overflow. Screenshot thresholds remain strict; font antialiasing tolerance cannot mask layout or color differences.

### Performance certification

- A route click updates `data-active-route`, route chrome, and route content without awaiting a runtime-view fetch.
- Deterministic browser tests assert that route selection renders by the next animation frame.
- Live installed-copy testing records click-to-route-content timing on desktop and phone and verifies that navigation no longer approaches the current roughly one-second delay.
- Initial shell opening and genuine runtime actions may still await authoritative data and are measured separately from presentation-only navigation.

### Completion gates

- Focused projection, portrait, shell, tooltip, drag, Mission, Campaign, People, and visual-conformance tests pass after their respective phases.
- The production extension is synchronized to the actual `default-user` installed copy without overwriting user data.
- Live SillyTavern checks exercise portrait import/change/remove, all route changes, save/load/open-chat behavior, provider/settings behavior, diagnostics download, and desktop/phone interaction states.
- Full `npm.cmd test` passes before completion.

## Migration Order

1. Add failing projection/title and route-switch contracts.
2. Repair shared player-facing record and mission-title projection.
3. Integrate existing player portrait behavior into People.
4. Repair shared drag anchoring, opacity, handle alignment, and chevrons.
5. Harden mobile tooltip modality suppression.
6. Change route selection to retained-view rendering while preserving full refresh triggers.
7. Finish Campaign/People width and overflow conformance.
8. Expand deterministic visual and interaction certification.
9. Run focused, full, installed-copy, and live-host verification.

Each phase preserves the current backend and all unrelated user changes. No production phase begins until this specification and its implementation plan are approved.
