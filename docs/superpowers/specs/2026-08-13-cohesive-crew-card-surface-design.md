# Cohesive Crew Card Surface

## Goal

Make each desktop Crew roster card read as one visual surface across its character content and reorder handle while preserving the two controls as separate accessible buttons.

## Design

The existing `.collection-person-row` article remains the shared card container. Its `.people-row` selection button and `.collection-person-drag-handle` reorder button remain siblings so selection, keyboard focus, and drag behavior do not change.

Desktop hover and focus-within presentation moves to the shared article. The selection button becomes visually transparent and no longer owns a bottom border. The article owns the only divider, allowing the subtle line and highlight to extend through the handle column. The selected-card gradient continues to take precedence over hover presentation.

Mobile Crew cards retain their current accordion and touch-drag styling; the new shared-surface selectors are scoped to `.people-desktop-journal`.

## Verification

Playwright coverage checks both hover entry points: the character body and the reorder handle. It verifies that the article owns the highlight and full-width divider, both child buttons remain transparent, and the existing mobile geometry and drag checks continue to pass.
