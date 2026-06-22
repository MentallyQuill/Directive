# Directive Operator Manual

This is the current surface-by-surface guide for Directive's pre-alpha runtime shell.

## Runtime Shell

Open Directive from the SillyTavern extensions menu by choosing **Directive**. On desktop and tablet, Directive appears as a narrow LCARS command spine on the left with six routes:

- **Campaign**
- **Mission**
- **Crew**
- **Ship**
- **Log**
- **Settings**

Select a route to open its drawer. Only one drawer is open at a time; selecting the active route again collapses it. Use the arrows at the bottom of the spine to show or hide route labels, and use the adjacent Close control to hide Directive.

The drawer opens at roughly half the viewport by default. Drag the handle at the drawer's bottom-left corner to resize it; Directive remembers the drawer size and spine density locally. The expand control in the drawer header opens a temporary full-screen workspace. Character Creator enters that workspace automatically and restores the drawer when the creator closes. At phone width, Directive uses a full-screen shell with bottom route navigation instead of the command spine.

The shell owns navigation and delegates each route to a focused panel. It should not be treated as the source of campaign truth; campaign state and transaction records are authoritative.

## Campaign

Use **Campaign** to inspect the current campaign snapshot, choose or import a campaign package, resume unfinished Character Creator setup, or load a save.

The bundled package is the U.S.S. Breckenridge package for Ashes of Peace. The tab shows package health diagnostics so schema, package/projection, crew dataset, mission graph, and active-save mismatch issues are visible before campaign play.

Campaign is split into three sub-tabs:

- **Command:** current campaign snapshot, including campaign, player, ship, stardate, mission, phase, mode, current save, Open Orders, and the latest committed context. **Open Mission** returns to active play because the campaign continues in the chat and Mission route, not inside a separate Campaign state machine.
- **Library & Import:** campaign package library, selected-package details, campaign briefing, package readiness, unfinished Character Creator setup continuation, and `.directive-starship.zip` import diagnostics. **New Campaign** opens the selected campaign briefing, then **Create Commander** opens Character Creator.
- **Records:** save-file library and selected-save inspector. **Load Save** restores the selected save and moves to Mission.

Expected actions:

- **New Campaign:** open a selected package's campaign briefing.
- **Create Commander:** create a package-owned Character Creator setup.
- **Continue Character Setup:** reopen an unfinished setup.
- **Load Save:** restore a selected campaign save and move to Mission.

## Character Creator

The Character Creator opens inside the Campaign tab while a draft is active.

The current Ashes of Peace package defines:

- Locked role: incoming Commander/XO.
- Allowed species and age bands.
- Career background options.
- Formative experience options.
- Assignment reason options.
- Command trait and flaw options.
- Dossier fields.

Save drafts before leaving the creator. Beginning a campaign accepts the draft, projects package data into campaign state, and writes the first save.

## Mission

Use **Mission** for the active play loop.

The current panel can show:

- Active campaign, ship, mission, phase, stardate, and mode.
- Latest outcome and narration state.
- Latest autosave.
- Active pressure summaries.
- Chapter 1 completion checkpoint after the False Colors handoff.
- Save Game and Save As controls.
- Command Briefs.
- Procedure Checks.
- Provisional and Final Outcomes.
- Command Bearing intervention options.
- Open Orders review, scene beats, direct resolution, and delegation controls.
- post-Chapter-1 Follow-Up Opportunities and Follow-Up Work controls.
- Last Outcome controls.
- Formal Objectives and Active Directives.

Use **Preview Outcome** before committing a turn. The preview path is intentional: it lets Directive show competence context, warnings, anchored consequences, and eligible point spends before state is written.

Use **Schedule** or **Defer** when the Mission panel offers a Follow-Up Opportunity. Scheduled follow-ups move into **Follow-Up Work**, where **Open Follow-Up**, **Advance Follow-Up**, **Resolve Follow-Up**, and **Delegate** keep the work campaign-owned and player-safe.

## Crew

Use **Crew** to inspect senior staff and current continuity summaries.

Crew relationship and development values remain hidden simulation state. The player-facing panel should summarize known continuity and relationship texture without exposing raw numeric scores or director-only future revelations.

## Ship

Use **Ship** to inspect the current ship state.

The panel combines package template information with campaign-owned state. Package data describes the Breckenridge baseline; campaign state records current condition, technical debt, damage, and continuity from play.

## Log

Use **Log** to inspect Command Log entries and recent turn continuity.

The Command Log is player-facing support, not the source of truth. It summarizes committed outcomes, known consequences, active obligations, and narration status. State changes must come from validated outcome packets and state deltas.

## Settings

Use **Settings** to inspect runtime and campaign configuration.

The current panel can show:

- Active package and package version.
- Active save id.
- Simulation mode and allowed modes.
- Consequence policy.
- Storage mode.
- Command Bearing rank, marks, points, and shared reserve.
- Storage diagnostics.
- State Safety controls for active-save verification, active-state settle, active-save export, and missing-record cleanup.

Provider configuration is intentionally narrow in the current runtime. Narration currently routes through the available SillyTavern generation surface.

## Simulation Modes

Directive supports exactly:

- `Command`: full deterministic consequences when risk is established.
- `Exploration`: softer consequence policy that can cap severe outcomes without forcing success or erasing hidden truth.

The mode affects consequence handling and narration constraints. It is not a difficulty score and does not replace mission logic.

## Operator Rules

- Treat previews as advisory until accepted.
- Treat saves as campaign-owned state, not package data.
- Use Rewrite Narration for prose retries.
- Use Rerun Outcome only when mechanics should be re-resolved.
- Use Delete Outcome only when restoring to the pre-outcome snapshot is intended.
- Do not rely on chat prose alone to establish mechanical rewards, state repair, crew death, hidden facts, or mission completion.

## Current Limits

- Directive has no screenshot-backed public manual yet.
- Phone-width shell behavior has live in-app browser smoke coverage and opt-in repeatable screenshot smoke; dedicated mobile documentation is still planned.
- Starship package import is enabled for data-only `.directive-starship.zip` records; export, delete, and update comparison workflows remain planned.
- Settings now exposes diagnostics, active-save verification, active-state settle, active-save export, missing-record cleanup, reload, and stale-preview cleanup.
