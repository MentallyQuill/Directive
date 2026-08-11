# Crew Portrait Icon Controls Design

## Correction

The current Crew player portrait controls are large text buttons in the identity column. That presentation is incorrect. This design supersedes only the control presentation and confirmation flow from `2026-08-10-crew-player-portrait-controls-design.md`; the existing active-campaign portrait storage and custody behavior remains authoritative.

## Approved presentation

- Place one compact attached two-button group over the upper-right corner of the player's portrait box.
- Use the supplied `uploadpcimage.svg` shape for add and replace.
- Use the supplied `removepcimage.svg` shape for removal.
- Render no visible `Add image`, `Replace image`, or `Remove image` text.
- Preserve accessible names and tooltips that explain each icon.
- Render the same overlay on desktop and mobile player portrait boxes, and never on NPC portraits.
- When no player portrait exists, keep the upload control available and show the remove control disabled.

## Removal confirmation

Clicking the remove icon must not open a browser confirmation dialog. It replaces both normal controls in place with two attached confirmation controls:

- a red check that commits removal;
- a grey X that cancels and restores the upload/remove pair.

The confirmation state is local to the displayed portrait control. Cancel performs no runtime action. Confirm calls the existing `removeCampaignPlayerPortrait()` action and refreshes only after the action succeeds.

## Assets and implementation boundary

Copy the supplied SVGs into `assets/icons/` without changing their path geometry. Use them as CSS masks so the controls inherit the current theme color while preserving the supplied shapes. The interaction remains owned by `createPlayerPortraitActions()` in `src/ui/people-journal.js`; runtime portrait persistence is unchanged.

## Verification

- DOM tests assert the overlay is a child of the player portrait, uses the upload/remove icon classes, has no visible text labels, and never appears for NPCs.
- DOM tests cover remove-to-confirm, cancel-to-normal, and confirm-to-runtime-action transitions.
- Browser conformance measures the attached placement at desktop and mobile sizes and verifies the group stays within the portrait bounds.
- The complete alpha gate must remain green before and after merging to `main`.
