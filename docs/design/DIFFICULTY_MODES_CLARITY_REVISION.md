# Difficulty Modes Clarity Revision

## Status

Proposed pre-alpha design revision.

This document defines how Directive should make `Exploration` and `Command` clear as campaign difficulty modes during campaign creation, and how a player can change that choice later at the campaign level without using global Settings.

Related docs:

- [Command And Morality Model](COMMAND_AND_MORALITY_MODEL.md)
- [Character Creator Guided Flow Improvement](CHARACTER_CREATOR_GUIDED_FLOW_IMPROVEMENT.md)
- [Current Chat Campaign Scope Revision](CURRENT_CHAT_CAMPAIGN_SCOPE_REVISION.md)
- [Target User Flow](TARGET_USER_FLOW.md)
- [Storage And State Safety](../user/STORAGE_AND_STATE_SAFETY.md)

## Problem

The active implementation treats `Exploration` and `Command` as simulation modes. That is correct internally, but the current Character Creator review step presents them as a small `Simulation Mode` selector with only tooltip-level explanation. A new player can easily miss that this is the campaign's difficulty/consequence contract.

The current runtime also shows the selected mode as campaign and mission status, but there is no campaign-level control for changing it once play has started. Changing consequence severity during play should not be a global Settings preference. It belongs to the campaign being played, because it affects that campaign's Director outcomes, narrator constraints, prompt context, save metadata, and future risk posture.

## Decision

Player-facing UI should frame `Exploration` and `Command` as **Campaign Difficulty**.

The approved mode labels remain:

- `Exploration`
- `Command`

The visible control label should be:

```text
Campaign Difficulty
```

The supporting copy may use `difficulty mode`, `consequence style`, or `campaign difficulty`, but should avoid presenting the choice as a technical `simulationMode` or global application setting.

During campaign creation, the player should see the two modes as explicit choices with an adjacent summary panel that updates when the selected mode changes.

During play, the player should be able to change the mode from the campaign surface, primarily Campaign Command. Settings should not own this control.

## Player-Facing Mode Copy

Mode copy should be centralized in the simulation mode policy layer and reused by Character Creator, Campaign Command, Mission status, tests, and docs.

### Exploration

Short label:

```text
Story-forward
```

Summary:

```text
Consequences still matter, but Directive softens the worst outcomes. Injury, delay, damaged trust, lost readiness, or lost position can happen; player and senior staff deaths are blocked.
```

Best fit:

```text
Choose this for a campaign that prioritizes continuity, recovery paths, and softer worst-case outcomes.
```

### Command

Short label:

```text
Full simulation
```

Summary:

```text
Directive preserves full causal severity. Serious failure can include severe or fatal outcomes when the risk is established, but the system must stay fair and cannot invent unsupported harm.
```

Best fit:

```text
Choose this for the complete command simulation, where serious risk can produce serious consequences.
```

## Campaign Creation UX

The Character Creator review step should replace the compact select control with a difficulty selector and a summary box.

Desktop shape:

```text
Campaign Difficulty

[ Exploration ] [ Command ]    Selected Mode Summary
                               Story-forward
                               Consequences still matter...
                               Best for...
```

Phone-width shape:

```text
Campaign Difficulty
[ Exploration ]
Selected Mode Summary...
[ Command ]
```

The selected option should be visibly active, keyboard reachable, and screen-reader clear. The summary box should not depend on hover.

The selector should live near `Start Campaign`, because this is part of final campaign acceptance. It should still save into the creator draft input so draft resume preserves the player's choice.

The review step should avoid the word `Settings` here. The user is not configuring the extension; they are choosing the campaign's consequence style.

## Default Mode Direction

The implementation should stop relying on "first allowed mode that includes Command" as a hidden product decision.

Preferred direction:

1. Campaign packages may declare a default difficulty mode.
2. Character Creator uses the package default when the draft has no saved mode.
3. If a package has no default, fall back to a product default chosen explicitly in code.
4. The fallback should be covered by tests so it is a deliberate product choice.

For Ashes of Peace, the default should be chosen intentionally:

- `Exploration` is better for first-run approachability.
- `Command` is better if the package promise is explicitly the full starship command simulation.

Either can be correct, but the choice should not be an accidental side effect of array order or legacy fallback code.

## In-Play Change UX

The primary in-play control should live in **Campaign Command**.

Campaign Command already owns campaign inventory, active session routing, recovery, and high-level campaign state. It is the right place for a campaign-level difficulty control.

Recommended active campaign card treatment:

```text
Campaign Difficulty
Command
Full simulation
[ Change ]
```

The existing Mission overview may continue to show the current difficulty as compact status. If a secondary affordance is needed there, it should open the same Campaign Difficulty sheet rather than introduce a separate Mission-specific mode setting.

The change flow should use a modal or drawer sheet:

```text
Change Campaign Difficulty

Applies to future outcomes only. Existing Command Log entries and committed consequences are not rewritten.

[ Exploration ]  Story-forward
[ Command ]      Full simulation

[Cancel] [Apply]
```

Switching from `Exploration` to `Command` should require confirmation because it increases maximum consequence severity.

Confirmation copy:

```text
Switch to Command difficulty? Future outcomes may use full causal severity, including severe or fatal consequences when clearly established.
```

Switching from `Command` to `Exploration` may apply directly, because it softens future outcomes.

After apply, show a visible confirmation:

```text
Campaign difficulty changed to Exploration. Future outcomes use story-forward guardrails.
```

or:

```text
Campaign difficulty changed to Command. Future outcomes use full causal severity.
```

## Rules And State Contract

The authoritative campaign value remains:

```js
campaignState.settings.simulationMode
```

That field is campaign state, not global Settings UI state. The visible UI should call it Campaign Difficulty.

Changing difficulty:

- affects future Director turns, narrator constraints, chat-turn classification context, and prompt context;
- does not rewrite existing turn ledger entries;
- does not rewrite existing Command Log entries;
- does not mutate hidden truth to make old outcomes easier or harder;
- does not rerun pending mechanics automatically;
- should persist with the campaign save and save metadata;
- should rebuild player-safe prompt context for the bound campaign chat when a binding exists.

The runtime should reject or defer the change when a provisional Director outcome or outcome replacement is pending. The player should resolve, discard, or rerun the pending item first so the pending mechanics cannot silently change policy under the preview.

Suggested user-facing blocked copy:

```text
Resolve or discard the pending outcome before changing campaign difficulty.
```

## Source Ownership

The mode definitions should have one source of truth.

Recommended code direction:

- Keep deterministic consequence behavior in `src/simulation/simulation-mode-policy.mjs`.
- Export a UI-safe mode description list from the same module, such as `simulationModeDifficultyOptions()`.
- Retire or rename `simulationModeSettingsRows()` because the player-facing control is no longer a Settings row.
- Keep mode normalization in that module and reuse it in runtime actions, creator UI, tests, and host bridges.

The exported option shape should support UI without duplicating policy copy:

```js
{
  id: 'Exploration',
  label: 'Exploration',
  difficultyLabel: 'Story-forward',
  summary: 'Consequences still matter...',
  bestFit: 'Choose this for...',
  fatalityPolicy: 'No player or senior staff death',
  requiresEscalationConfirmation: false
}
```

## Implementation Plan

### Phase 1: Centralize Difficulty Metadata

Update `src/simulation/simulation-mode-policy.mjs`.

Tasks:

- Add exported mode metadata for `Exploration` and `Command`.
- Include player-facing labels, summaries, best-fit text, and escalation-confirmation metadata.
- Rename or replace settings-specific helper names with campaign-difficulty language.
- Keep existing policy behavior for outcome severity and narrator constraints.
- Update `tools/scripts/test-simulation-mode-policy.mjs` to assert difficulty copy does not contain retired rank-style labels.

Acceptance:

- Mode copy has one source.
- Tests prove `Exploration` and `Command` remain the only public labels.
- Tests prove retired `Ensign`, `Lieutenant`, and `Commander` difficulty labels do not reappear.

### Phase 2: Revise Character Creator Review

Update `src/ui/character-creator-panel.js` and supporting CSS.

Tasks:

- Replace the `Simulation Mode` select with a `Campaign Difficulty` selector.
- Render the allowed package modes as selectable cards or segmented buttons.
- Render an adjacent selected-mode summary panel.
- Preserve the selected value in `settings.simulationMode`.
- Save the chosen mode into draft state during normal draft save and step navigation.
- Use package default mode if present; otherwise use explicit product fallback.
- Keep the selector near `Start Campaign` in the review step.

Acceptance:

- Player can understand the difference without hover.
- Selection state is visible on desktop and phone-width layouts.
- Draft resume preserves the selected difficulty.
- `Start Campaign` passes the selected mode to campaign creation.

### Phase 3: Add Campaign-Level Runtime Action

Update `src/runtime/runtime-app.mjs`.

Add a public runtime action:

```js
updateCampaignDifficulty({ simulationMode, reason })
```

Tasks:

- Require active campaign state.
- Normalize and validate the requested mode.
- Check the mode is allowed by package or campaign state.
- Reject the change when a provisional Director turn or pending outcome replacement exists.
- No-op cleanly when the requested mode already matches.
- Clone and update `campaignState.settings.simulationMode`.
- Record a lightweight campaign journal event with previous mode, next mode, timestamp, and reason.
- Persist campaign state.
- Rebuild prompt context for the bound campaign chat when available.
- Refresh campaign/current-chat view state.

Acceptance:

- Future Director turns use the new mode.
- Existing turn ledger and Command Log entries remain unchanged.
- Prompt context reflects the new mode after the change.
- Save metadata records the new mode on the next save/autosave path.

### Phase 4: Expose The In-Play Control

Update Campaign Command UI first.

Likely files:

- `src/ui/campaign-panel.js`
- `src/ui/mission-panel.js`
- `src/runtime/runtime-shell.js`
- `src/hosts/lumiverse/frontend.js`
- `src/hosts/lumiverse/runtime-bridge.mjs`

Tasks:

- Add `Change` affordance to the active Campaign Command mode/difficulty block.
- Open a modal or drawer sheet with the same two-option selector and summary panel.
- Use confirmation only when switching from `Exploration` to `Command`.
- Show blocked copy when a pending outcome prevents changing.
- Add `updateCampaignDifficulty` to runtime shell actions.
- Add the same action to Lumiverse proxied/direct runtime action lists.
- Keep Settings out of the primary flow.

Acceptance:

- Player can change difficulty from Campaign Command.
- Settings does not become the owner of campaign difficulty.
- Mission may show current difficulty but does not duplicate the main control surface.
- The same runtime action works in SillyTavern and Lumiverse.

### Phase 5: Verification And Docs

Focused tests should be added or updated before broad gate verification.

Recommended focused tests:

- `tools/scripts/test-simulation-mode-policy.mjs`
- `tools/scripts/test-runtime-campaign-start-controller.mjs`
- `tools/scripts/test-campaign-start-and-save.mjs`
- a new `tools/scripts/test-campaign-difficulty-runtime.mjs`
- a UI smoke/assertion covering Character Creator difficulty summary copy

Test cases:

- Character Creator shows Campaign Difficulty metadata.
- Draft save/resume preserves difficulty.
- Start Campaign stores selected mode in campaign state.
- Runtime difficulty change updates campaign state.
- Runtime difficulty change rebuilds prompt context when bound.
- Runtime difficulty change is blocked while a provisional outcome is pending.
- Exploration-to-Command change requires confirmation in UI.
- Previous turn ledger and Command Log entries are unchanged.
- Future Director turns use the new mode policy.

After focused tests pass, run:

```text
node tools\scripts\run-alpha-gate.mjs
```

Documentation updates:

- Update [First Campaign Workflow](../user/FIRST_CAMPAIGN_WORKFLOW.md) to say `Campaign Difficulty`.
- Update [Directive Operator Manual](../user/DIRECTIVE_OPERATOR_MANUAL.md) for creation and in-play changes.
- Update [Command And Morality Model](COMMAND_AND_MORALITY_MODEL.md) only if public wording or default selection changes.
- Update [Documentation Index](../DOCUMENTATION_INDEX.md) with this revision document.

Render updates:

<!-- directive-render id="docs-directive-campaign-difficulty-creator" status="needed" source="fixture" asset="assets/documentation/renders/docs-directive-campaign-difficulty-creator.png" tracking="../testing/DOCUMENTATION_RENDER_TRACKING.md" -->
Render needed: Character Creator review step after the `Campaign Difficulty` selector and selected-mode summary land.

<!-- directive-render id="docs-directive-campaign-difficulty-command" status="needed" source="fixture" asset="assets/documentation/renders/docs-directive-campaign-difficulty-command.png" tracking="../testing/DOCUMENTATION_RENDER_TRACKING.md" -->
Render needed: Campaign Command in-play difficulty block and change sheet.

<!-- directive-render id="docs-directive-campaign-difficulty-confirm" status="needed" source="fixture" asset="assets/documentation/renders/docs-directive-campaign-difficulty-confirm.png" tracking="../testing/DOCUMENTATION_RENDER_TRACKING.md" -->
Render needed: Exploration-to-Command confirmation and pending-outcome blocked state.

## Non-Goals

- No global Settings owner for campaign difficulty.
- No old `Ensign`, `Lieutenant`, or `Commander` difficulty labels.
- No rewriting committed outcomes when difficulty changes.
- No automatic rerun of pending or committed mechanics.
- No separate SillyTavern-only or Lumiverse-only behavior.
- No hidden difficulty change without visible player confirmation.

## Open Decisions

- Whether Ashes of Peace should default to `Exploration` for first-run approachability or `Command` for full-simulation identity.
- Whether package schemas should store default difficulty as a top-level field or inside campaign setup metadata.
- Whether the mode-change journal should live under `runtimeTracking`, `campaign`, or a dedicated campaign settings history field.
- Whether Mission should include a secondary Change affordance or only link the player back to Campaign Command.
