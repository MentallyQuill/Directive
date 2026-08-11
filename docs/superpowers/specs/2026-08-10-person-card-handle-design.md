# Person Card Handle Design

## Goal

Differentiate individual People records from People categories by applying the supplied two-horizontal-line handle to person cards while preserving the existing dotted category handle.

## Visual Contract

- Category reorder handles remain unchanged: the current dotted glyph, 32px hit target, blue color, and existing focus treatment.
- Desktop and mobile person-card reorder handles use the supplied `handle-category.svg` two-line shape.
- The supplied SVG is copied into Directive under a person-specific asset name so its product role is unambiguous.
- The person glyph renders as a CSS mask. It inherits the existing blue handle color without changing the source geometry.
- Person handles retain the existing 32px interactive width and accessible `Reorder <name>` label.

## Component Boundary

`people-journal.js` adds a person-only class when it constructs an individual record handle. Category handles continue through the shared handle constructor without that class. The distinction is presentational only; no ordering, persistence, selection, or story-state code changes.

`directive.css` keeps the current dotted pseudo-element as the default category presentation and overrides only the person-specific pseudo-element with the SVG mask.

## Interaction Contract

Mouse dragging, touch long-press dragging, keyboard Arrow movement, cross-category movement, focus restoration, and campaign-branch persistence remain unchanged. Command Bearing and all People category controls remain unchanged.

## Verification

- A component test distinguishes category handles from person handles and confirms both desktop and mobile person records receive the new class.
- Browser visual conformance confirms the person handle resolves the supplied mask while the category handle retains its dotted background.
- The complete alpha gate remains green.

