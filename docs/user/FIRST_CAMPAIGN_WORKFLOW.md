# First Campaign Workflow

Use this guide when you want the shortest path from opening Directive to testing the current Breckenridge/Ashes of Peace campaign loop.

Directive is pre-alpha. The workflow below describes the current runtime shell, not a finished public onboarding flow.

## Quick Start

1. Install or load the Directive extension in SillyTavern, then reload the page.
2. Open the SillyTavern extensions menu and choose **Directive**.
3. On **Starships**, open **Library & Import**, select the bundled Breckenridge package, then choose **New Campaign**.
4. Review the campaign briefing, then choose **Create Commander**.
5. Fill the Character Creator setup: identity, service background, personality traits, and dossier notes.
6. Choose `Command` or `Exploration`, then choose **Begin**. New setups default to `Command`; **Save Draft** preserves the selected mode.
7. On **Mission**, write the XO's action in **What does the XO do?** and choose **Preview Outcome**.
8. Review the Command Brief, any Procedure Check, the Provisional Outcome, and any Command Bearing option.
9. Accept the outcome, confirm an informed risk, invoke an eligible point, or discard the preview and revise the order.
10. Use **Save Game** or edit **Save As Name** and choose **Save As** when you want an explicit save slot.

## Starships

The **Starships** tab is the command snapshot, campaign library, import workbench, and save-record starting point.

It is split into three sub-tabs:

- **Command:** shows the current campaign snapshot when a campaign is loaded: campaign, player, ship, stardate, mission, phase, mode, current save, Open Orders, and the latest committed context. Use **Open Mission** to return to active play.
- **Library & Import:** lists installed campaign packages, shows the selected package's story hook, era, opening stardate, expected length, player role, package readiness, and import diagnostics. **New Campaign** opens the full briefing for the selected package.
- **Records:** lists save files and Character Creator setup drafts. Selecting a save opens a details inspector with campaign, player, ship, stardate, mission, phase, mode, revision, snapshot, and **Load Save**.

Current package and record actions:

- **New Campaign** opens the selected package's campaign briefing.
- **Create Commander** creates a Character Creator setup for the selected campaign.
- **Continue Character Setup** reopens an unfinished Character Creator setup.
- **Load Save** restores the selected save and moves to **Mission**.

Package Health is diagnostic. A healthy package can still be incomplete as content because this is pre-alpha, but schema and reference contracts should pass.

Use **Import Package** in **Library & Import** to select a data-only `.directive-starship.zip`. Directive normalizes the archive, rejects unsafe paths and active content, persists the imported package record only after storage succeeds, and shows diagnostics in **Starships**. Imported packages are listed beside bundled packages; **New Campaign** stays disabled for imported packages that do not include the runtime projection and mission-graph assets needed to play.

## Character Creator

The current Character Creator is package-driven. For Ashes of Peace, the package locks the player role to the incoming Starfleet Commander and Executive Officer aboard the U.S.S. Breckenridge.

The setup covers:

- Identity: name, pronouns or address, species, age band, and appearance.
- Service: career background, formative experience, and assignment reason.
- Personality: command traits and flaw.
- Dossier: brief biography and public reputation.

Use **Save Draft** before leaving the creator. Use **Back** to return to Starships without beginning the campaign. Use **Continue Character Setup** from Starships when you want to resume later. Use **Begin** only after the review is ready.

Beginning the campaign projects the package into campaign-owned state and writes the first save. From that point, the campaign save is authoritative over what happened in that playthrough.

## Mission Loop

The **Mission** tab is the current playable loop.

The mission card shows the active player, ship, campaign, mission id, phase, stardate, simulation mode, last outcome, narration status, latest autosave, and a **Save As Name** field for branch saves.

The turn loop is:

1. Write the XO's order in **What does the XO do?**
2. Choose **Preview Outcome**.
3. Read the Command Brief if one appears.
4. Resolve Procedure Checks before accepting risky or authority-sensitive actions.
5. Review the Provisional Outcome and anchored consequences.
6. Accept the outcome or use an eligible Command Bearing point.
7. Let narration generate from the committed outcome packet.

A preview is not committed until accepted or confirmed. Use **Discard Preview** when you want to revise the order.

After Chapter 1 completion, Mission shows a **Chapter 1 Complete** checkpoint once the False Colors handoff is open. The checkpoint explains what the Breckenridge established, what remains unresolved, which pressures carry forward, and why Chapter 2 can open without exposing hidden source truth.

Mission may also show **Follow-Up Opportunities**. These are deterministic, player-safe side-work candidates derived from committed state. Use **Schedule** to add one to **Follow-Up Work**, or **Defer** to suppress it until later Open Orders pacing. Scheduled follow-ups can be opened with **Open Follow-Up**, advanced with **Advance Follow-Up**, and completed with **Resolve Follow-Up** or **Delegate**. Authored Open Orders assignments still use their own **Start** and **Defer** controls.

## Current Campaign Coverage

The current deterministic campaign path is wider than the original narrow Chapter 1 opening slice.

Validated playable coverage now includes:

- Character Creator through first campaign save.
- The full Prelude through final command review.
- Chapter 1 through the Asterion / False Colors handoff.
- Chapter 2 slices through transparency terms, Orison evidence, Aegis medical trust, security access, the joint investigation charter, and the Quiet Channels Open Orders continuation.
- Open Orders I review, assignment scene activation, scene-beat progress, direct or delegated resolution, rewards, interval progress, and save/load preservation for the three authored first-interval assignments, including complete multi-beat MVP coverage for The Long Repair and Borrowed Wings.

For MVP testing, treat the full Prelude and complete Chapter 1 as the required campaign arc. Chapter 2 and Open Orders I are available as current preview/proof surfaces, but they are not the minimum completion target for the first MVP alpha pass.

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
- **Save As** to create a new save branch using the current **Save As Name** field.
- **Load Save** from **Starships > Records** to restore a selected save.
- **Refresh Diagnostics** on Settings to rerun storage checks.
- **Reload Active Save** on Settings to reload the indexed active save from storage.
- **Clear Preview** on Settings to discard an uncommitted provisional outcome without accepting it.
- **Verify Active Save** on Settings to confirm the indexed active save payload is readable.
- **Settle Active State** on Settings to overwrite the active save with current campaign state.
- **Export Active Save** on Settings to prepare passive JSON for backup or inspection.
- **Clean Missing Records** on Settings to remove missing-payload index references while leaving corrupt payloads visible.
- **Rewrite Narration** to retry prose from the same committed mechanics.
- **Rerun Outcome** to preview replacement mechanics from the original pre-outcome snapshot.
- **Delete Outcome** to restore the campaign to before the selected outcome.

Provider narration failure should be retryable without rerolling committed mechanics.

## Current Limits

- The current playable campaign content covers the full Prelude, complete Chapter 1 through the Asterion / False Colors handoff, current Chapter 2 slices through Quiet Channels, and Open Orders I review/scene/resolution behavior.
- The Command Log keeps deterministic committed inputs as the audit trail and can add a fail-soft assisted summary from the active host's utility generation path.
- Package export/delete/update comparison, branch comparison UI, and automatic chat edit/delete event interception remain future work.
- This pre-alpha line does not maintain old storage compatibility when contracts change.
