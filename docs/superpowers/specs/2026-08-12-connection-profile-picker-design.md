# Connection Profile Picker Design

## Goal

Replace the browser-native connection-profile `datalist` with a consistent, searchable picker that remains usable with dozens of long profile names and identifiers, especially on mobile Chromium browsers.

## Interaction

- The Connection Profile field is a button that displays the selected profile's friendly label. If its profile is unavailable, it displays the stored profile ID so the missing selection remains visible.
- Activating the field opens a modal picker. It is a centered dialog on larger viewports and a near-full-screen sheet on mobile.
- The picker contains a search field followed by a vertically scrolling list. Search matches profile label, name, model, and ID without case sensitivity.
- Each result shows the friendly profile name as its primary label and useful model or ID details as secondary text. Long values wrap instead of forcing horizontal scrolling.
- Selecting a result saves its profile ID immediately and closes the picker. Directive continues to persist only the profile ID; SillyTavern retains profile, routing, model, preset, and credential custody.
- A clear-selection action saves an empty profile ID and closes the picker.
- The close control, backdrop click, Escape key, and mobile back/cancel behavior close the picker without changing the saved selection.
- Opening the picker focuses the search field. Closing it returns focus to the field button.

## Component Boundaries

The Settings panel owns the field button and the existing provider autosave/status feedback. A focused profile-picker component owns modal creation, filtering, keyboard and pointer interaction, focus restoration, and reporting a selected profile ID or cancellation. It receives normalized read-only profile metadata and does not access provider credentials or SillyTavern services.

The picker is shared across desktop and mobile. CSS changes only its responsive presentation, avoiding separate behavior branches and browser-native `datalist` differences.

## Empty and Error States

- With no matching profiles, the list displays an explicit no-results message while keeping search available.
- With no supported profiles, the dialog explains that SillyTavern has not exposed any supported chat or text profiles.
- A failed save leaves the Settings card visible, reports the existing bounded save error, and does not claim that the provider is ready.
- Canceling never invokes the settings update action.

## Accessibility

- The picker uses dialog semantics with an accessible title.
- Profile choices are real buttons in a labeled results list, usable by keyboard and touch.
- The selected profile is identified in the list.
- Interactive targets are at least 44 CSS pixels tall on mobile.
- Focus is placed predictably on open and restored on close.

## Verification

- Unit-style UI coverage verifies opening, filtering across all searchable fields, immediate selection and save, clear selection, cancellation, missing selections, empty results, and focus restoration.
- CSS/visual conformance coverage verifies the vertical scroll container, wrapped long text, mobile sheet geometry, and touch-target sizing.
- The full Directive test gate must pass before the change is pushed to `main`.
