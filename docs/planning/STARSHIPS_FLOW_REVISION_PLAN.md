# Starships Flow Revision Plan

## Status

Implemented in the current pre-alpha runtime.

## Revision Goal

Redesign the Starships route around a clear user flow:

- **Command** is the current campaign snapshot and entry back to Mission.
- **Library & Import** is the campaign/package browser and import workbench.
- **Campaign Briefing** is the commitment step between selecting a package and entering Character Creator.
- **Records** is the save-file library with a selected-save inspector and Load Save action.

Directive is a SillyTavern extension, not a standalone game shell. The route should manage campaign packages, structured state, and save selection; live play continues in SillyTavern chat through the Mission route.

## Current Problems

- The current Command subtab behaves like a package home page, not a campaign status surface.
- **Continue Campaign** implies a standalone game-session launch even though SillyTavern chat is the active play space.
- **Resume Draft** is exposed beside save loading, making an unfinished Character Creator draft look like an in-progress campaign.
- Library, import, records, and character setup controls all compete for primary action weight.
- Records includes package-import controls even though import belongs to package management.

## Target Flow

### First-Time Flow

1. Open **Starships**.
2. Choose **Library & Import**.
3. Select a campaign package from the library list.
4. Review the package details inspector.
5. Choose **New Campaign** to reveal the campaign briefing.
6. Review the story hook, ship, senior staff, player role, era, stardate, and expected length.
7. Choose **Create Commander** to enter Character Creator.
8. Complete Character Creator and choose **Begin**.
9. Directive creates the first save and opens **Mission**.

### Returning Flow

1. Open **Starships**.
2. Review **Command** for the active campaign snapshot.
3. Choose **Open Mission** to return to the Mission route and continue through SillyTavern chat.

### Load Flow

1. Open **Starships**.
2. Choose **Records**.
3. Select a save file.
4. Review the save inspector.
5. Choose **Load Save**.
6. Directive loads the structured campaign state and opens **Mission**.

## UI Requirements

### Command

- Show active campaign, ship, player, stardate, mission, phase, save, and last known outcome when a campaign is loaded.
- Show active Open Orders or current obligations if available.
- Use **Open Mission**, not **Continue Campaign**.
- If no campaign is loaded, show a true empty state with **Choose Campaign** and **Load Save** actions.

### Library & Import

- Show packages as a library list with selected-state styling.
- Show a details inspector for the selected package.
- Include story hook, era label, opening stardate, expected length, player role, ship class, package readiness, runtime assets, draft count, and save count.
- Keep import controls and latest import diagnostics in this subtab.
- Gate new-campaign setup when runtime projection or mission graph assets are missing.
- Rename draft continuation to **Continue Character Setup**.

### Campaign Briefing

- Reveal after **New Campaign** from the selected package inspector.
- Include a larger campaign hook, ship readiness context, player role, simulation modes, and senior staff roster.
- Primary action is **Create Commander**.
- This is still package setup, not campaign play.

### Records

- Show save files as the primary list.
- Show a selected-save inspector with campaign title, player, ship, stardate, mission, phase, simulation mode, slot type, revision, last update, and summary.
- Primary action is **Load Save**.
- Creator drafts do not appear in Records; unfinished setup is resumed from **Library & Import**.
- Package import controls must not appear in Records.

## Data Requirements

Expose package preview metadata through the Starships view model instead of hardcoding the bundled package:

- `campaign.highConcept`
- `campaign.structure.expectedLength`
- `campaign.structure.mainChapterCount`
- `campaign.structure.openOrdersCount`
- `campaign.structure.designedSideAssignmentCount`
- `campaign.eraLabel` from package `characterCreation.campaignContext.eraLabel` or canon guardrails
- `ship.openingCondition`
- senior crew preview excluding `player-commander`

Save inspectors should use existing save metadata and avoid reading hidden campaign internals from payloads.

## Implementation Plan

1. Add package preview fields to `createStarshipPackageSummary(...)`.
2. Rewrite `src/ui/starships-panel.js` sections around Command snapshot, Library package list/detail/briefing, and Records save inspector.
3. Add or adapt Starships CSS for library rows, details panels, briefing roster, and records inspector.
4. Update rendered-flow tests for **New Campaign**, **Continue Character Setup**, **Create Commander**, and **Load Save**.
5. Update user docs and the documentation index.
6. Run focused package/context, visual-system, shell flow, structure, and alpha-gate checks.

## Acceptance Criteria

- No Starships UI text uses **Continue Campaign**.
- **Resume Draft** is replaced with **Continue Character Setup** in player-facing Starships UI.
- Command no longer renders the package home as its main content.
- Library has a package list and selected-package details inspector.
- New campaign setup requires a campaign briefing step before Character Creator.
- Records has a selected-save inspector and no package import or setup-draft panel.
- Docs describe the revised flow.
- Focused tests and the alpha gate pass, or any remaining failure is documented with a precise blocker.

## Verification

Completed:

- `node tools\scripts\test-starship-package-context.mjs`
- `node tools\scripts\test-visual-system-foundation.mjs`
- `node tools\scripts\test-runtime-shell-creator-flow.mjs`
- `node tools\scripts\test-runtime-campaign-start-controller.mjs`
- `node tools\scripts\test-extension-shell.mjs`
- `node tools\scripts\test-package-update-diagnostics.mjs`
- `node tools\scripts\test-campaign-start-and-save.mjs`
- `node tools\scripts\test-campaign-start-service.mjs`
- `node tools\scripts\test-starship-package-importer.mjs`
- `node tools\scripts\verify-repo-structure.mjs`
- `node tools\scripts\run-alpha-gate.mjs`

Not available in this repository:

- `node tools\scripts\test-manifest-alpha.mjs`
