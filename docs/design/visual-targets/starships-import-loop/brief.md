# Starships Import And Library Brief

Visual Target Unit: Starships Package Library and Import Diagnostics.

Parent Surface: Starships route inside the Directive runtime shell.

Primary user task: import a package archive, understand whether the package library is ready, and review the latest import result without reading raw diagnostics.

Information hierarchy:

1. Library readiness and package/import counts.
2. The Import Package command as the only primary action in this target.
3. Latest import result with status, issue count, and package/source state.
4. Bounded issue details when import diagnostics report problems.

Required controls and states:

- Import Package.
- Hidden package file input owned by the Import Package command.
- Ready state when no latest import result exists.
- Stored/rejected latest import result.
- Issue list capped to a readable number of items.
- Bottom command shelf route navigation.

UX goal: the player should know whether the package library is usable and where to import a package within a few seconds. If the latest import failed, the result should be visible as a bounded diagnostics bay, not a generic metadata stack.

UX failure risks:

- Import Package gets visually buried under package cards or records.
- Diagnostics read as developer-only logs instead of player-safe readiness.
- Decorative LCARS rails look like disabled controls.
- Long package IDs or issue text clip, overlap, or dominate the page.
- Phone width turns the library card into awkward stacked labels.

Saga reference behavior and qualities:

- Compact mobile-first route flow.
- One obvious primary action.
- Dense but readable status rows.
- Route-local content grouping instead of top route navigation.
- Touch-safe controls that do not steal vertical space from the route body.

LCARS visual identity requirements:

- Original LCARS-inspired command-console structure.
- Bottom command shelf remains the route navigation model.
- Dark terminal canvas with amber/orange command accents and lavender/blue system accents.
- Import command framed as a real control, separate from decorative rails.
- Library readiness and diagnostics expressed as structural status blocks.
- Muted red/coral only for issue or rejection states.

Desktop constraints:

- The target sits below package command cards and above records.
- The console must remain compact inside the SillyTavern extension shelf.
- Library and diagnostics may sit side by side when width allows.
- Text must use small modern sizing and stable rows.

Phone constraints:

- First viewport should show package cards first; this target can follow as a compact management console.
- Library readiness, import action, and latest result must stack cleanly.
- Bottom command shelf must not overlap controls.
- Labels and button text must not clip or wrap awkwardly.

Hidden-state and player-safety rules:

- Do not expose hidden campaign truth, raw simulation state, relationship values, or raw JSON.
- Import diagnostics may expose sanitized package status, issue count, and bounded issue messages only.
- Preserve existing import action semantics and package authority.

What must not change:

- Route IDs and bottom command shelf ownership.
- Import Package label and behavior.
- Package start/resume/load behavior.
- Starships package and record data contracts.
- SillyTavern and Lumiverse host-neutral patterns.
