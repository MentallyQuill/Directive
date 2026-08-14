# Ship Callout Layout and Cohesion Motion Design

**Status:** Approved

**Date:** 2026-08-14

## Problem

The desktop Ship page renders five task cards and five leader lines from separate hard-coded index tables. The line endpoints do not use the rendered card bounds, so the lines visibly stop in open space instead of touching the cards. Task contracts already carry semantic anchors, but the current renderer does not use those anchors to choose ship origins or card positions. The existing Playwright gate checks counts, stacking, and responsive behavior without proving line-to-card contact or logical placement on the ship artwork.

On mobile, the floating cards and leaders are intentionally removed for legibility. That leaves the ship and Cohesion ring visually detached from the task accordion below it.

The Cohesion ring is also static outside task preview color changes. Filled segments should feel operational and alive, while lost Cohesion must remain visually dead. Task recovery previews need a slower synchronized emphasis that is distinct from the moving blue wave.

## Approved Outcome

- Desktop task cards occupy deterministic, visually certified positions selected from eight approved slots.
- Every desktop leader begins at an authored, ship-art-specific semantic region and ends exactly at one of the rendered card's four corners.
- Cards have no permanent left/right identity. Any task may occupy any slot and use any corner.
- Layout rejects card overlap and leader crossings before minimizing route length and applying stable preference tie-breakers.
- Mobile displays compact, tappable icon-and-level badges outside the ring, connected to the same semantic ship regions by simplified leaders.
- Filled blue Cohesion segments carry a restrained counterclockwise wave. Debt segments remain static.
- Amber task-preview segments pulse together at 0.5 Hz and override the blue wave.
- Reduced-motion mode disables all Cohesion animation while preserving state color and selection clarity.

## Authority Boundaries

### Ship-art anchors

The `ship.cohesion` package image record owns a normalized visual-anchor atlas because the coordinates describe that exact image and crop, not gameplay state. The Breckenridge atlas uses stable names such as:

- `bridge`
- `forward-sensors`
- `central-saucer`
- `engineering`
- `port-nacelle`
- `starboard-nacelle`
- `aft-hull`
- `shuttlebay`
- `sickbay`

Each entry is an `{ x, y }` point normalized to the intrinsic source image. The image resolver exposes the atlas with the resolved asset. The layout converts each point through the rendered `object-fit: contain` content rectangle, including any letterboxing.

Task contracts continue to carry a required `anchor` identifier. Breckenridge authored issues and generated templates use the precise package vocabulary. A small explicit compatibility map resolves legacy broad anchors such as `forward`, `central`, `aft`, `engineering`, `system`, `department`, `crew`, and `region`. The UI never guesses a location from a task title or prose.

Missing image metadata, an unknown anchor, or an unavailable image uses the documented `central-saucer` fallback and remains functional. The fallback is deterministic and covered by tests.

### Placement stability

Chosen card and badge positions are presentation-only. Nothing is written into campaign or save state. A stable preference order is derived from ship ID plus task-instance ID. The same task therefore prefers the same slot across page visits, while the global allocator may move it when that is required to avoid collision or crossing with the current visible task set.

## Components

### Package image resolver

The package image resolver retains and freezes validated visual anchors from the selected `ship.cohesion` image record. Coordinates must be finite values from zero through one, names must be non-empty, and malformed entries are ignored rather than propagated into layout arithmetic.

### Callout layout module

A focused Ship callout layout module owns pure geometry and deterministic selection:

- stable task hashing and slot preference;
- source-image coordinate conversion;
- desktop and mobile slot definitions;
- rectangle and bounds checks;
- four-corner enumeration;
- one-elbow path construction;
- segment-intersection and card-intersection detection;
- global assignment scoring and deterministic tie-breaking.

The module consumes measured orbit, image, control, and anchor geometry. It produces slot IDs, control coordinates, selected corner IDs, and SVG polyline points. It has no DOM ownership and no gameplay dependencies.

### Ship journal

The Ship journal remains responsible for rendering tasks, badges, details, and interaction. It measures the rendered controls after the image is ready, requests a layout, applies positions, and updates SVG polylines. A frame-bounded resize observer recalculates layout when the orbit or controls change size. It performs no save mutation.

Selection remains one shared state across desktop cards, mobile badges, accordion controls, leader emphasis, and segment preview.

## Desktop Placement and Routing

The desktop orbit exposes eight certified positions: two in each visual quadrant. They are presentation slots, not task types. Up to five are occupied at once.

For every visible task, the allocator considers every available slot and every card corner. It scores complete assignments in this priority order:

1. Controls remain inside the orbit and clear of the header/details boundaries.
2. Controls do not overlap.
3. Leaders do not cross other leaders.
4. Leaders do not pass through unrelated controls.
5. Total leader length is minimized.
6. Stable task preference breaks otherwise equivalent choices.

The maximum visible task count is five, so an exhaustive or bounded permutation search over eight slots remains small and deterministic.

Each leader is a two-segment SVG polyline with one restrained elbow. The first segment exits the authored ship anchor a short distance in the direction of the selected card. The second reaches the chosen rendered corner. The endpoint is derived from `getBoundingClientRect()` and converted into orbit coordinates, so the stroke physically touches the border despite viewport width, font metrics, or title length.

Leaders have no origin dot. Default leaders remain subdued violet; the selected, focused, or hovered task leader becomes amber. Cards may use any of their four corners, selected independently per layout.

Desktop card selection and detail behavior remain unchanged.

## Mobile Compact Callouts

Mobile retains the readable single-column accordion. It additionally renders one compact badge per visible task around the outside of the Cohesion ring.

Each badge contains only:

- the task's existing category icon; and
- an explicit `L1`, `L2`, `L3`, or `L4` label.

No title, reward copy, or description is duplicated around the ship. Eight certified mobile micro-slots surround the ring without covering the ship or Cohesion segments. Up to five are occupied through the same deterministic allocator and crossing rules, using mobile-specific geometry.

All mobile badge leaders remain visible but subdued. The selected badge and leader become amber. Badges are real buttons with accessible labels containing task title, level, and reward. Tapping a badge:

1. selects the matching task;
2. applies its ring preview;
3. expands the matching accordion panel; and
4. gently scrolls that accordion into view.

Programmatic scrolling uses smooth behavior only when motion is permitted. Reduced-motion mode uses immediate scrolling. Accordion buttons continue to work independently and update the matching badge state.

## Cohesion Motion

### Filled blue wave

Only `.is-filled` segments participate in idle motion. A single synchronized timeline uses each logical segment index to create a counterclockwise wave:

- progression: two segments per second;
- stagger: 0.5 seconds per segment;
- complete revolution: 10 seconds;
- visible pulse width: two overlapping neighboring segments;
- maximum scale: `1.02`;
- emphasis: a restrained brightness and glow increase carries most of the effect.

Transforms use SVG fill-box geometry and a centered transform origin so the sector expands in place without changing layout or hit bounds. The existing front/back split remains synchronized because delay derives from the logical segment index rather than DOM layer order.

Debt and queued-debt segments have no idle animation, glow cycle, or scale change.

#### Backlit-panel perceptibility refinement

The wave must read through illumination inside each segment face, matching the flat transmissive character of the LCARS sidebar rather than an exterior lamp halo. Keep the approved ten-second timeline, half-second stagger, two-segment crest, and `1.02` scale ceiling unchanged, but widen the luminance range:

- the trough uses a darker, slightly desaturated steel blue whose relative luminance is no more than 55% of the crest;
- the crest face reaches an icy near-white with every RGB channel at or above 238;
- every blue-wave drop shadow uses a blur radius no larger than 2 CSS pixels;
- the crest may retain a compact edge highlight, but no broad bloom, extra SVG filter, stroke expansion, or opacity flash is introduced.

Color interpolation carries the primary motion signal. Filter brightness and glow remain secondary so the sectors still look like backlit panel inserts when viewed on the phone-sized Ship layout.

### Amber task preview

Preview segments override every idle blue animation property. All segments owned by the active task pulse in phase:

- frequency: 0.5 Hz;
- period: 2 seconds;
- maximum scale: `1.02`;
- emphasis: synchronized amber brightness and glow.

The amber pulse continues while a task remains selected, including after pointer hover ends. Hover or keyboard focus temporarily previews another task through the existing selection-return behavior.

Amber preview segments use the same contained-lighting language. Their trough remains recognizably amber, their synchronized crest reaches a warm near-white, and all drop-shadow blur radii remain at or below 2 CSS pixels. The two-second period, shared phase, and `1.02` scale ceiling do not change.

### Reduced motion

Under `prefers-reduced-motion: reduce`, segment animation and animated scrolling are disabled. Filled, debt, preview, selected-line, and selected-badge colors remain fully distinguishable without motion.

## Lifecycle and Failure Handling

- Layout waits for the cohesion image to load or reach a terminal error state.
- Measurement is scheduled through one animation frame so repeated resize notifications coalesce.
- The observer stops producing work after its workspace disconnects.
- A missing `ResizeObserver` receives initial layout and a passive window-resize fallback.
- If no zero-crossing assignment exists, the deterministic scorer selects the lowest-crossing valid assignment and exposes the count to the visual test harness.
- If measurement cannot produce finite geometry, controls fall back to the current readable CSS layout and leaders remain hidden rather than floating unattached.

## Verification

### Pure geometry tests

Add focused unit coverage for:

- stable hashing and preference order;
- intrinsic-image to rendered-content coordinate conversion;
- all four card corners;
- elbow construction;
- segment intersection, shared endpoints, and non-crossing routes;
- deterministic global assignment;
- malformed/missing anchor fallback;
- desktop and mobile bounds.

### DOM interaction tests

Extend fake-DOM coverage to prove:

- precise task anchors reach the renderer;
- desktop cards and mobile badges share task identity and selected state;
- badge accessible names include title, level, and reward;
- tapping a badge selects and expands the matching accordion;
- hover/focus preview restoration remains intact.

### Playwright visual certification

Expand the Ship visual gate at 1440 by 900, 1024 by 768, 390 by 844, and 360 by 500. Use multiple deterministic task/anchor fixtures so every desktop quadrant, every card corner, all mobile micro-slot families, and representative ship regions are exercised.

For desktop, assert:

- every leader endpoint is within 1.5 CSS pixels of its selected card corner;
- every leader origin is within 1.5 CSS pixels of the resolved ship anchor;
- no cards overlap or leave the orbit;
- no leaders cross or traverse unrelated cards in certified fixtures;
- rerendering preserves assignment;
- resizing and returning to the original viewport restores the original assignment;
- all lines remain below cards and above the ship/ring layers.

For mobile, assert:

- badges remain outside the measured ring and clear of the ship-safe region;
- badges and leaders do not overlap or cross;
- every badge has its icon and level;
- tapping selects, expands, and scrolls to the matching accordion;
- selected badge, leader, and preview segments agree.

For motion, inspect Web Animations and computed styles at controlled timeline positions:

- only filled blue segments have the idle wave;
- index order advances counterclockwise every 0.5 seconds;
- no more than two neighboring blue segments occupy the emphasized portion of the wave;
- preview segments share one two-second phase and override blue motion;
- debt segments never animate;
- scale never exceeds `1.02`;
- the blue crest is near-white, the blue trough is at most 55% of crest luminance, and animated shadow blur never exceeds 2 CSS pixels;
- the amber crest is warm near-white and its animated shadow blur never exceeds 2 CSS pixels;
- reduced-motion mode reports no segment animations.

Capture fresh initial, selected, mobile-badge, and controlled-animation screenshots. Run focused Ship DOM, interaction, geometry, and Playwright suites, then the full repository gate.

## Out of Scope

- Changing Cohesion rules, rewards, task generation, queue limits, or Story Settlement authority.
- Persisting presentation slots in saves.
- Inferring ship locations from prose.
- Adding desktop origin markers.
- Replacing the mobile task accordion.
- Animating debt segments.
- Changing the ship artwork or Cohesion segment geometry.
