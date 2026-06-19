# First Campaign Workflow

Use this guide when you want the shortest path from opening Directive to testing the current Breckinridge/Ashes of Peace campaign loop.

Directive is pre-alpha. The workflow below describes the current runtime shell, not a finished public onboarding flow.

## Quick Start

1. Install or load the Directive extension in SillyTavern, then reload the page.
2. Open the SillyTavern extensions menu and choose **Directive**.
3. On **Starships**, choose **Start Campaign** for the bundled Breckinridge package.
4. Fill the Character Creator draft: identity, service background, personality traits, and dossier notes.
5. Choose `Command` or `Exploration`, then choose **Begin**.
6. On **Mission**, write the XO's action in **What does the XO do?** and choose **Preview Outcome**.
7. Review the Command Brief, any Procedure Check, the Provisional Outcome, and any Command Bearing option.
8. Accept the outcome, confirm an informed risk, invoke an eligible point, or discard the preview and revise the order.
9. Use **Save Game** or **Save As** when you want an explicit save slot.

## Starships

The **Starships** tab is the package and save starting point.

It shows:

- Bundled package title and ship.
- Campaign title and player role.
- Package Health and issue count.
- Creator draft count.
- Save count.

Current package actions:

- **Start Campaign** creates a Character Creator draft for the selected starship package.
- **Resume Draft** reopens the latest incomplete draft.
- **Load Save** restores the latest save for the package and moves to **Mission**.

Package Health is diagnostic. A healthy package can still be incomplete as content because this is pre-alpha, but schema and reference contracts should pass.

## Character Creator

The current Character Creator is package-driven. For Ashes of Peace, the package locks the player role to the incoming Starfleet Commander and Executive Officer aboard the U.S.S. Breckinridge.

The draft covers:

- Identity: name, pronouns or address, species, age band, and appearance.
- Service: career background, formative experience, and assignment reason.
- Personality: command traits and flaw.
- Dossier: brief biography and public reputation.

Use **Save Draft** before leaving the creator. Use **Back** to return to Starships without beginning the campaign. Use **Begin** only after the review is ready.

Beginning the campaign projects the package into campaign-owned state and writes the first save. From that point, the campaign save is authoritative over what happened in that playthrough.

## Mission Loop

The **Mission** tab is the current playable loop.

The mission card shows the active player, ship, campaign, mission id, phase, stardate, simulation mode, last outcome, narration status, and latest autosave.

The turn loop is:

1. Write the XO's order in **What does the XO do?**
2. Choose **Preview Outcome**.
3. Read the Command Brief if one appears.
4. Resolve Procedure Checks before accepting risky or authority-sensitive actions.
5. Review the Provisional Outcome and anchored consequences.
6. Accept the outcome or use an eligible Command Bearing point.
7. Let narration generate from the committed outcome packet.

A preview is not committed until accepted or confirmed. Use **Discard Preview** when you want to revise the order.

## Command Briefs And Counsel

Directive supplies professional competence so the player does not have to type every routine Starfleet step.

Command Briefs may include:

- Routine response.
- Known facts.
- Uncertainty.
- Operational pressure.
- Command question.
- Officer reports.

The brief should not label a correct answer. It exists to make the trained XO role legible while leaving judgment to the player.

You can ask for counsel in ordinary prose:

```text
Recommendations? What am I overlooking?
Doctor, what is the medical risk?
Captain, where does my authority end?
```

The current runtime can select compact Domain Reports for the Chapter 1 opening frame.

## Procedure Checks

Directive raises a **Procedure Check** when the player's intended action creates a serious foreseeable procedural, legal, medical, tactical, or authority risk that the player character would likely recognize.

You can:

- **Confirm Risk** to proceed with informed intent.
- **Revise Order** to discard the preview.
- **Request Counsel** to ask officers for compact advice before deciding.

Procedure Checks are not hard blocks. They record that the risk was communicated before consequences were committed.

## Command Bearing

Command Bearing is Directive's limited intervention system.

The current tracks are:

- `Inspiration`: trust, shared purpose, transparency, dignity, and voluntary cooperation.
- `Resolve`: commitment, discipline, credible authority, preparedness, boundaries, and accepted responsibility.

When an outcome is eligible and a point is available, Directive may offer an intervention such as improving a Provisional Outcome by two tiers. Anchored Consequences remain in force.

## Saves And Recovery

Use:

- **Save Game** to overwrite the active save slot.
- **Save As** to create a new save branch.
- **Load Save** from Starships to restore a save.
- **Rewrite Narration** to retry prose from the same committed mechanics.
- **Rerun Outcome** to preview replacement mechanics from the original pre-outcome snapshot.
- **Delete Outcome** to restore the campaign to before the selected outcome.

Provider narration failure should be retryable without rerolling committed mechanics.

## Current Limits

- The current playable campaign content covers the Prelude, Chapter 1 activation, and the first Chapter 1 response slice.
- The Command Log keeps deterministic committed inputs as the audit trail and can add a fail-soft assisted summary from the active host's utility generation path.
- Full player-facing package import, branch comparison UI, and automatic chat edit/delete event interception remain future work.
- This pre-alpha line does not maintain old storage compatibility when contracts change.
