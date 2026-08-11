# Coming-Later Campaign Teasers Design

## Goal

Keep unavailable campaign packages selectable as presentation-only teasers while visually distinguishing them from the playable Ashes of Peace package.

## Approved Contract

- A campaign package with `data-campaign-availability="coming-later"` remains a real button in the master list.
- Pointer, keyboard, and assistive selection continue to open that package's teaser detail.
- The unavailable row's artwork is fully grayscale.
- The unavailable row's title and summary are dimmed but remain readable.
- Selection, hover, and focus treatment remain available so the row does not appear inert.
- In the selected detail, only the hero artwork remains grayscale and subdued.
- Detail status, title, teaser copy, and the disabled `New campaign` action retain their current contrast and behavior.
- Ashes of Peace and saved/current campaign rows remain unchanged.

## Approach

Use the availability attribute already emitted by `campaign-panel.js` as the styling boundary. Add narrow descendant rules in `styles/directive.css` for the coming-later row's media frame and copy. Keep the existing `.campaign-library-hero.is-coming-later .campaign-hero-media` detail rule.

This avoids introducing duplicate state classes, changing the view model, or coupling presentation to package IDs. It also keeps availability guards and teaser selection behavior independent: the row selects a preview, while the detail action remains disabled.

## Alternatives Considered

1. **Availability-attribute descendant styling — selected.** Smallest change, reuses the semantic hook, and can dim image and text independently.
2. **Apply opacity and grayscale to the whole row.** Shorter CSS, but it also weakens focus/selection backgrounds and makes the interactive teaser appear disabled.
3. **Add renderer-specific modifier classes.** Explicit, but duplicates information already present in `data-campaign-availability` and expands JavaScript for a CSS-only concern.

## Testing

Update the Playwright-backed campaign presentation check first so it fails against the old full-color row. At desktop, compact, and phone widths it will assert:

- the coming-later row itself stays at full opacity and remains selectable;
- row artwork computes to `grayscale(1)`;
- row title and summary compute to reduced opacity;
- detail artwork remains grayscale and subdued;
- detail copy remains at full opacity;
- the unavailable action remains disabled;
- layout and horizontal-overflow assertions continue to pass.

Run the focused campaign presentation and certified panel checks, then the complete alpha gate.

## Non-Goals

- Making preview campaigns playable.
- Disabling or removing teaser selection.
- Dimming the detail copy.
- Changing campaign data, descriptions, images, or availability state.
- Changing saved/current campaign rows.
