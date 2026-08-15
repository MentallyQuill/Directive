# Compact Beveled Ship Desktop Callouts

**Date:** 2026-08-15

## Goal

Make the floating command-assignment callouts around the desktop Ship graphic feel intentional and compact. Each callout should follow the width of its visible title row instead of reserving the same broad width, gain a restrained LCARS-adjacent bevel, and show the assignment level without adding another row.

## Scope

This change applies only to `.ship-task-button` controls while they are absolutely positioned around the Ship graphic in the desktop layout.

The following surfaces remain visually and behaviorally unchanged:

- mobile callout badges;
- responsive accordion rows and inline detail panels at or below the existing 820px breakpoint;
- assignment detail content, Cohesion rewards, category symbols, leader behavior, selection behavior, and authoritative task data.

## Desktop Callout Contract

The first row reads, from left to right:

`L2  [category symbol]  Assignment Title`

The level label uses `L${task.level}` with Arabic numerals, matching the existing mobile badge convention. It is visually compact and uses the same restrained violet state color as the category symbol. Both level and symbol adopt the existing amber hover/selected treatment.

The callout uses intrinsic inline sizing rather than the current shared responsive width. Its width follows the maximum-content width of the title row, including the level label, category symbol, title, gaps, and horizontal padding, with a 120px minimum and the existing 205px maximum. Titles that exceed the maximum retain the existing single-line ellipsis. The existing minimum height and second-row Cohesion reward remain unchanged.

All four corners use a 4px bevel. The bevel replaces the rounded desktop corners while retaining the dark surface, violet border, thicker left accent edge, amber hover/selected state, shadow, pointer behavior, and visible keyboard focus treatment.

## Responsive Isolation

Desktop-only level markup is hidden when the Ship route switches `.ship-task-nav` to its in-flow accordion layout. The existing responsive rules continue to set accordion controls to full available width and restore their current rounded open/closed geometry. No level label is inserted into either accordion presentation.

The existing mobile badge continues to render its own `L${task.level}` label. This design does not alter that badge's markup or styling.

## Layout and Data Flow

`src/ui/ship-journal.js` renders one desktop level span in each floating task button using the already-authoritative numeric `task.level`. No new projection, persistence field, or mutable state is introduced.

The desktop callout layout already measures each rendered button and passes its actual width and height into `createShipCalloutLayout()`. Intrinsic widths therefore flow through the existing measured layout path. The change does not add title measurement logic, font metrics, or hard-coded per-task widths.

## Verification

Focused structural coverage must prove:

- each desktop task button includes one `L${task.level}` label before its category symbol;
- the existing mobile badge label is unchanged;
- responsive accordion rows do not show the desktop level label;
- the desktop CSS uses intrinsic sizing with bounded minimum and maximum widths;
- the desktop bevel is 4px and responsive accordion corner behavior is unchanged.

Rendered desktop verification at the certified Ship viewports must prove:

- short titles produce narrower callouts than long titles until the maximum is reached;
- callouts remain in bounds, unique, non-overlapping, and connected to stable leader routes;
- title ellipsis still protects unusually long names;
- hover, selected, pointer, and keyboard-focus states remain legible;
- the Ship composition and Cohesion ring remain unobstructed.

The focused Ship checks, full `npm.cmd test` gate, `git diff --check`, and final worktree inspection must pass before publication.
