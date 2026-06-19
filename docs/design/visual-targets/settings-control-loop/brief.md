# Settings Control Loop Brief

Visual Target Unit: Settings and State Safety

Parent Surface: Directive runtime shell

Primary user task: inspect runtime/package health, verify save safety, manage appearance packs, and run provider-assist diagnostics without hunting through a long vertical stack.

Information hierarchy:

- Runtime identity and current status at the top.
- Page-local navigation for Systems, Safety, Packs, and Assist.
- State Safety and storage controls grouped as operator actions, not mixed into passive metadata.
- Theme Pack and Icon Pack previews grouped under appearance.
- Provider Assist diagnostics isolated as an operator diagnostics pane.

Required controls:

- Verify Active Save
- Settle Active State
- Export Active Save
- Clean Missing Records
- Refresh Diagnostics
- Reload Active Save
- Clear Preview when available
- Run Provider Assist when eligible

UX goal:

- Make Settings scan like an operator control board while keeping every actual control obvious, reachable, and touch-safe.
- Reduce phone-width scrolling by using compact status tiles and route-local sub-tabs.
- Preserve bottom route navigation as the runtime shell model.

Failure risks:

- Burying State Safety controls below the fold.
- Creating LCARS decoration that looks clickable but is not.
- Using large labels or dense rows that wrap awkwardly at phone width.
- Moving route navigation back to the top.

Saga reference behavior:

- Compact mobile-first route flow.
- Dense, readable rows.
- Bottom route navigation.
- Sub-tabs for dense feature groups.

LCARS requirements:

- Original UX-first LCARS-inspired command-console design.
- Dark terminal canvas.
- Curved segmented rails and asymmetric panel frames.
- Amber, orange, coral, lavender, and blue accents.
- Real controls distinguished from decorative rails.

Desktop and phone constraints:

- Must work in the fixed SillyTavern extension panel.
- Must preserve the bottom route bar.
- Must fit phone width without clipped labels, squished actions, or overlapping controls.

Hidden-state and player-safety rules:

- Do not expose raw hidden state, hidden values, hidden relationship data, or unrevealed campaign truth.
- Provider diagnostics remain sanitized operator diagnostics, not player-facing mission narration.

What must not change:

- Runtime actions and their behavior.
- Theme Pack and Icon Pack data source.
- State Safety action labels.
- Bottom route navigation.
