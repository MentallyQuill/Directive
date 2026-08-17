# Quiet Contextual Ship Chronometer Design

**Date:** 2026-08-17
**Status:** Approved
**Scope:** Recompose the existing authoritative Campaign and Mission chronometers so they quietly contextualize each page without competing with its title.

## Goal

The clock is a reminder of the campaign's accepted story position. It should be easy to find when wanted, but the Campaign or Mission identity must remain the first visual read.

Keep the chronometer on both pages and preserve its canonical values, accessible name, and non-interactive behavior. Change only its page composition and presentation.

## Chosen Approach

Use page-specific contextual anchoring with one shared typographic language:

- Campaign places time inside the lower hero caption area, opposite the campaign identity.
- Mission places time on the hero's eyebrow row, opposite the mission-status label and above the full-width mission title.
- Neither page presents the chronometer as a standalone card.
- Mobile keeps each clock in normal flow after the page identity or summary, with the same quiet hierarchy.

This replaces the current upper-corner overlay treatment. A shared metadata strip was rejected because it would add another band of interface chrome. A minimally restyled corner overlay was rejected because the Mission clock would still occupy leftover space instead of participating in the header composition.

## Shared Visual Hierarchy

- Remove the chronometer background, enclosing border, corner radius, shadow, heavy colored edge, and card padding.
- Keep `SHIP TIME` as a small muted uppercase label.
- Reduce the clock below the Campaign and Mission title sizes while retaining tabular numerals.
- Keep Stardate smaller than the clock and tint it with the owning page accent.
- Use no animation, hover state, focus state, tooltip, or manual control.
- Do not communicate authority or meaning through color alone; all three textual labels remain visible.

## Campaign Composition

The active Campaign hero caption becomes a two-column composition on desktop and tablet:

- The existing status, title, player/role/ship metadata, and summary remain in the left flexible column.
- The chronometer occupies a compact right column aligned to the bottom of the identity block.
- A short, low-contrast amber top rule defines the readout, but there is no surrounding surface or right-edge bar.
- The campaign title remains the dominant type. The clock must not exceed 20px while the title remains 29px at the desktop size.
- The caption's existing bottom gradient supplies contrast; no separate clock scrim is added.

The chronometer belongs inside `.campaign-hero-copy` so its layout participates in the caption rather than being positioned independently over the artwork.

At widths up to 640px, the caption becomes one column. The clock follows the existing identity and summary, aligns left, uses the available width without an enclosing card, and adds only a small top margin and rule. It must not create horizontal overflow or cover the ship artwork.

## Mission Composition

The Mission hero becomes an explicit grid instead of reserving right padding for an absolutely positioned clock:

- Row one contains the Mission status on the left and the compact chronometer on the right.
- The Mission title spans the full available width on row two.
- The Mission summary spans the full available width on row three.
- The chronometer retains a compact two-line form: label and clock together, Stardate below.
- The clock must not exceed 18px while the mission title remains 27px at the desktop size.
- Lilac appears only as the Stardate/accent text; no lilac edge is added to the chronometer itself.

At widths up to 640px, the mobile accordion already owns the mission identity in its trigger. The expanded detail keeps the summary first and places the unboxed chronometer immediately after it in normal flow. It spans the content width, aligns left, and does not duplicate the mission title.

## Component and Data Boundaries

`src/ui/ship-chronometer.js` remains the single read-only renderer for both variants. It continues to accept only `directive.timePlayerProjection.v1` and renders nothing for absent or invalid projections.

Campaign and Mission panels continue to receive the same certified time projection. Campaign changes only the chronometer's DOM parent; Mission changes only CSS grid participation. No accepted-pair, projection, formatting, persistence, prompt, or chat-normalization behavior changes.

## Failure and Accessibility Behavior

- Missing or invalid accepted time still omits the entire chronometer.
- The accessible name remains `Current accepted ship time`.
- Tabular numerals remain enabled so accepted time updates do not change digit widths.
- The clock remains non-interactive and is not announced as a live region.
- Responsive fallback must remain readable with long campaign summaries and mission titles; content wraps before any horizontal overflow is allowed.

## Verification

Update the focused chronometer browser test before implementation so the old overlay/card composition fails. Automated coverage must prove:

- Campaign chronometer is a child of the hero caption and shares its bottom composition on desktop.
- Mission hero uses grid participation rather than reserved right padding or absolute clock positioning.
- Both variants have transparent backgrounds, no enclosing border, no shadow, and no heavy right edge.
- Campaign and Mission title font sizes remain larger than their clock values.
- Desktop clocks do not overlap or reduce title/summary content to an artificial reserved column.
- Mobile clocks remain in flow after their local identity/summary, stay within the content width, and create no horizontal overflow.
- Clock and Stardate strings remain `08:37:39` and `Stardate 53068.4` in the certified fixture.
- Tabular numerals and the accessible label remain intact.

Run the focused chronometer visual test, certified Campaign and Mission panel tests, expanded-interface conformance, and the full alpha gate before pushing `main`.

## Non-Goals

- No change to clock authority, accepted-pair custody, time advancement, or formatting.
- No global clock and no clock on Campaign library records.
- No redesign of Campaign artwork, Mission objectives, mission deadline clocks, or route navigation.
- No new animation, interaction, control, tooltip, or preference.
