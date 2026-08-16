# LCARS Campaign Guidance Correction Design

**Date:** 2026-08-15

> **Correction:** The notification-frame composition in this document is superseded by `2026-08-15-continuous-lcars-campaign-guidance-design.md`. The Campaign backlight timing and behavioral boundaries remain unchanged.

## Goal

Correct the campaign-required empty state so it reads as a composed LCARS status assembly rather than a conventional bordered card, and replace the Campaign tab's soft breathing glow with a held-state bridge-panel backlight.

## Presentation Contract

Mission, People, and Ship continue to show one centered, non-interactive guidance surface when the current chat cannot supply live campaign state. The existing ship glyph and player-facing copy remain unchanged.

The surface is built from visible LCARS parts using the existing theme palette:

- a segmented upper rail in amber, lilac, and blue;
- a central row with the bundled top-down ship glyph in a separate amber icon pod to the left of the text well;
- an unbordered dark text well containing the eyebrow, instruction, and supporting detail;
- a segmented lower rail in violet, salmon, and amber.

The rails use different segment lengths, small gaps, and rounded LCARS caps. They are structural decoration, hidden from assistive technology, and never interactive. The composition has no thin rectangular outline, inset alert stripe, connector line, arrow, duplicate Campaign action, or save-loading action.

The assembly remains centered within the route body. On mobile, the icon stays to the left of the text well while its pod and rail dimensions compress. The copy must remain readable without horizontal overflow or collision with the route bar.

## Campaign Backlight Contract

The existing Campaign route control remains the only action. While guidance is active, its own rounded tab silhouette illuminates as a whole; no separate rectangular outline or external halo is drawn around it.

One cycle lasts exactly 2.4 seconds:

- `0.0s` to `0.2s`: linear ramp from dark to fully illuminated;
- `0.2s` to `1.2s`: hold fully illuminated;
- `1.2s` to `1.4s`: linear ramp back to dark;
- `1.4s` to `2.4s`: hold dark.

The illuminated state uses the Campaign route's amber face, dark foreground icon and label, the same asymmetric rounded corners as an active LCARS button, and restrained inset light only. Geometry and transforms do not change. Hover and keyboard focus remain visible through the existing focus treatment.

Under `prefers-reduced-motion: reduce`, animation stops and the Campaign control remains steadily illuminated in its own rounded shape.

## State, Accessibility, and Scope

The existing renderer, route guards, shell synchronization, copy, and `aria-describedby` relationship remain authoritative. The correction changes presentation markup only to add decorative LCARS rails and an icon pod; it does not alter routing, campaign/save authority, persistence, or Campaign activation behavior.

## Verification

Focused tests must prove the six theme-colored segments are rendered as decorative elements, the icon remains to the left of the text, and the pulse contract uses a 2.4-second linear animation with held on/off keyframes at `8.333%`, `50%`, and `58.333%`.

Rendered desktop, certified mobile, and narrow-mobile checks must prove the assembly remains centered, fits without overflow, clears navigation, visibly uses all five existing LCARS theme colors, and keeps the icon pod left of the text well. Animation samples must prove the two hold phases are visually stable, on and off states differ, the Campaign control's rectangle never changes, and its illuminated state has rounded corners without an outline or external shadow. Existing route activation and reduced-motion behavior must continue to pass.
