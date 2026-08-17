# Authoritative Ship Chronometer Design

**Date:** 2026-08-16
**Status:** Approved
**Scope:** Remove model-authored ship-time text from Directive campaign chat and display the accepted clock in the Current Campaign and Mission interfaces.

## Problem

Directive persists one canonical clock in validated V1 campaign state, but the narration prompt also asks the SillyTavern narrator to print a proposed scene-end timestamp. The visible proposal can disagree with the accepted-pair time decision, move backward between responses, or use a different format. The same Stardate is also rendered with different precision in chat and saved-game surfaces.

The player needs one readable clock whose presentation cannot diverge from accepted state.

## Chosen Approach

Use a restrained LCARS chronometer in Directive itself:

- A prominent instrument overlays the upper-right of the active Current Campaign hero.
- A compact instrument sits in the Current Mission hero, separate from mission deadlines.
- Both read from the same player-safe projection of `campaignState.timeLedger`.
- The clock changes only when accepted state changes. It does not tick from wall-clock time.
- SillyTavern narration no longer calculates or prints Stardate or ship time.

Two alternatives were rejected:

1. Quiet metadata beneath campaign and mission summaries was too easy to miss for a primary chronology signal.
2. A persistent global shell clock gave time too much prominence on People, Ship, Settings, and campaign-library screens where it has no immediate purpose.

## Visual Design

### Current Campaign

The chronometer is positioned in the active campaign hero's upper-right corner, above the image and outside the lower title/summary gradient. It is a compact dark translucent instrument with a restrained amber LCARS edge and three text levels:

```text
SHIP TIME
08:37:39
STARDATE 53068.4
```

`SHIP TIME` is a small uppercase label. The `HH:MM:SS` value is the dominant element, rendered with tabular numerals so its width remains stable. Stardate is secondary and uses the same single-decimal formatter everywhere.

The instrument is informational, not a button. It has no hover treatment, menu, tooltip, or manual time control.

### Mission

The Mission hero gains a compact horizontal version aligned to the upper-right of the mission identity:

```text
SHIP TIME  08:37:39
STARDATE   53068.4
```

It uses the Mission route's lilac framing while keeping the clock digits neutral. It must not be placed inside the existing `Time-sensitive` section, because those cards describe mission deadlines and countdowns rather than current story time.

### Responsive Behavior

- Desktop and tablet place the Campaign instrument at the hero's upper-right and the Mission instrument at the hero's right edge.
- At narrow widths, each instrument becomes a full-width compact strip within its hero, below the identity/summary content. It must not cover the campaign ship art or reduce touch-target space.
- Mobile campaign-browser/library records do not display a clock unless the record is the active Current Campaign dashboard.
- The chronometer contains no continuous animation. A state refresh replaces its text atomically; reduced-motion behavior therefore needs no alternate animation.

## Authority and Data Flow

1. Accepted-pair interpretation proposes bounded elapsed whole seconds.
2. Deterministic runtime custody validates and commits the new `timeLedger` values.
3. The V1 player projection exposes only the current accepted clock and Stardate, not decisions, reasons, source anchors, or ledger history.
4. Campaign and Mission view models consume that shared player-safe projection.
5. A shared UI component and shared formatting functions render both chronometers.

The projection has an exact kind and contains normalized display values derived from the validated ledger. Missing or invalid time is not guessed from chat, save names, wall-clock time, or prose.

## Chat Behavior

- The runtime prompt supplies accepted current time for chronology but explicitly tells the narrator not to print a time header, footer, tracker, or Stardate line.
- Directive-created opening narration no longer appends a footer.
- On generation completion, Directive removes a terminal Stardate/time line from the newly generated selected assistant response before attaching response metadata. This catches strict, legacy, malformed-colon, and unstarred model output without treating it as authority.
- Existing historical chat text is not rewritten. Its accepted-pair hashes and user data remain untouched.
- The existing accepted-source parser remains compatibility-stable for historical saves.

## Formatting

One formatter owns all player-facing representations:

- Ship clock: `HH:MM:SS`, 24-hour time, zero padded.
- Stardate: one decimal, for example `53068.4`.
- No `hours` suffix in the UI; the `SHIP TIME` label supplies context.

Saved-game and checkpoint metadata should use the same Stardate formatter when touched by this work, eliminating raw six-decimal display without changing persisted numeric precision.

## Failure Behavior

- If no bound V1 campaign exists, no chronometer is rendered.
- If the player-safe time projection is unavailable, the chronometer is omitted rather than showing zero, wall time, or stale chat text.
- Failure to strip a generated footer is reported diagnostically but must not mutate campaign state.
- Chat normalization updates the selected swipe and visible message together, then saves once. Other swipes and unrelated message metadata remain unchanged.

## Accessibility

- Each chronometer is a labeled read-only region with an accessible name such as `Current accepted ship time`.
- Clock digits use tabular numerals and retain WCAG-readable contrast against the instrument surface.
- Visual labels remain present; meaning is not communicated by color alone.
- No live-region announcement is required for background updates. Opening either page exposes the current value normally to assistive technology.

## Verification

Automated coverage must prove:

- Time projection exposes only accepted canonical values and rejects invalid input.
- Campaign and Mission views render identical clock and Stardate strings from one projection.
- The chronometer is absent without a bound V1 campaign.
- The narration prompt prohibits printed time while retaining current-time context.
- Opening narration contains no footer.
- Newly generated strict, legacy, malformed, and unstarred terminal timestamps are removed from the selected message and swipe without changing narration or metadata.
- Existing historical accepted-source parsing and hashes remain unchanged.
- Saved-game Stardate labels use the shared formatter.
- Desktop and mobile browser checks confirm placement, no clipping, no artwork obstruction, and readable contrast on Campaign and Mission pages.
- Accepted-pair settlement, replay, invalidation, branching, and save hydration tests remain green.

## Non-Goals

- No wall-clock ticking or animation.
- No manual time controls.
- No time inference from response length, word count, fixed per-message increments, or printed timestamps.
- No global shell chronometer.
- No historical chat rewrite or live-save migration.
- No change to accepted-pair authority or SillyTavern provider ownership.
