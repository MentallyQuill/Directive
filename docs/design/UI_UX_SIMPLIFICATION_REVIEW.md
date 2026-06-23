# UI-UX Simplification Review

## Status

This is a pre-alpha UX audit for the current Directive extension. It is not an implementation plan for preserving old UI behavior. If a surface is low value, redundant, or clearer when rebuilt around a simpler flow, it should be changed in place.

The review is based on:

- the current command-spine UI shown in the reported Campaign screenshot;
- current route panel source under `src/ui/`;
- current shell source under `src/runtime/runtime-shell.js` and `src/ui/directive-command-spine-shell.js`;
- current interface direction in `docs/design/DIRECTIVE_INTERFACE_DESIGN_BIBLE.md`;
- existing visual smoke artifacts under `artifacts/live-smoke/`.

## Simplification Standard

Every visible section should answer at least one player-facing question:

- What am I doing next?
- What changed since I last acted?
- What risk, obligation, or blocker needs attention?
- What record can I inspect, restore, or act on?
- What setting can I deliberately change?

Sections that only say the system is loaded, current, ready, idle, active, or online should be removed or collapsed unless they also explain a meaningful consequence or available action.

## Executive Findings

The extension does not need fewer primary routes yet. Campaign, Mission, Crew, Ship, Log, and Settings still map to distinct player tasks. The clutter is mostly inside routes, where status strips, duplicate metric grids, and developer diagnostics compete with the next useful command.

The most common UX debt is duplicated state. Campaign, save, package, storage, continuity, side-work, and provider-assist state each appear in multiple places with similar wording. This makes the UI look informative while slowing the player's scan.

The highest-impact cleanup is to remove permanent status-only tiles, disabled no-op buttons, raw ids, pseudo-precision meters, and "nothing happened" diagnostics from first viewports. The second pass should convert reference screens into context tools by adding recent, mission-relevant, player-safe cues.

## Remove Or Collapse First

| Priority | Surface | Low-value section | Recommendation |
|---|---|---|---|
| P0 | Campaign > Command | Top overview tiles: `Campaign: Loaded`, `Current Save`, `Packages` | Remove the strip. The snapshot card already names the campaign, save, ship, and mission. `Loaded` is especially low value because it confirms an implementation state, not a player decision. |
| P0 | Campaign > Command | `Refresh Snapshot` footer action | Remove as a visible command or move to a small icon in the drawer header only if manual refresh is still needed. A route-level snapshot should refresh on route open and after actions. |
| P0 | Campaign > Library & Import | Disabled action buttons such as `No Setup Draft` and `No Saves` | Remove disabled absence buttons. Show only actions the user can take. Absence can be reflected in compact metadata, not as a button-shaped dead end. |
| P0 | Campaign > Library & Import | `Import Status: Ready` and `No Import Recorded` diagnostics | Hide import diagnostics until an import has happened or a validation problem exists. A permanently ready import system is not player-relevant. |
| P0 | Mission | Technical strip with raw `Mission`, `Stardate`, and `Autosave` rows | Remove from the primary mission overview. Keep player-readable stardate only if it affects story framing; move raw ids and exact autosave timestamps into a detail drawer or diagnostics. |
| P0 | Mission > Side Work | Both a status grid and a readiness overview that repeat Open Orders, Follow-Ups, Active Scene, and progress | Keep one compact summary. Use the body for actual available work, not a second count display. |
| P0 | Crew | Repeated `Tracked` continuity labels in header, roster rows, detail facts, and continuity note | Collapse to one player-safe continuity line in the selected officer detail. Repeating `Tracked` creates noise without adding understanding. |
| P0 | Crew | Detail facts `Duty Status: Active` and `Record: Package-owned` for every officer | Hide unless non-standard. If everyone is active and package-owned, the facts do not help the user choose an officer. |
| P0 | Ship | Derived percent meters for structural integrity, core systems, validation, and mission configuration | Remove unless backed by real game mechanics. Pseudo-precise percentages imply a simulation model the player can reason about when the current data is count/prose based. |
| P0 | Log | `Index Current` plus overview tiles for Entries, Latest, Assisted, Consequences | Collapse to a small timeline summary or hide entirely for short logs. The latest record and search/filter controls provide more value. |
| P0 | Settings | Overview grid plus second status grid repeating Package, Save, Mode, Storage, Packs, Assist | Keep one overview. Remove the duplicate grid or turn it into alert-only status. |
| P0 | Settings > Safety | Separate `Diagnostics Summary` and `Storage Diagnostics` cards showing the same status, issue, draft, and save counts | Merge into one State Safety card. Diagnostics should be a subsection of the safety workflow, not a second full card. |
| P0 | Settings | Raw active save ids in first-view text | Replace with save name or "Active save mounted". Put ids behind a detail/diagnostics affordance. |
| P1 | Shell header | `DRAWER ONLINE` telemetry | Remove or replace with actual problem state only. The drawer being online is self-evident because the drawer is visible. |
| P1 | Character Creator | Top status grid for Package, Campaign, Draft revision, and Mode | Collapse. Package/campaign are already in the overview; mode is already selected in the command bar; draft revision is developer/admin detail. |
| P1 | Character Creator | Progress grid plus step buttons plus per-section completion badges | Merge completion state into the step buttons. Keep one progress representation. |

## Redundant Clusters

### Campaign State

Campaign state is repeated across Campaign Command, Mission overview, Settings overview, and save inspectors. Mission should own active play state. Campaign should only show enough campaign state to resume or manage records. Settings should show only configuration and safety state.

Recommended ownership:

- Mission: active mission, phase, objective, last outcome, preview/commit controls.
- Campaign: package selection, campaign creation, save loading.
- Records: restore-point details.
- Settings: storage and safety operations.

### Save State

Save state appears as Campaign Command `Current Save`, Campaign Records inspector, and Settings active-save diagnostics. This makes a single save feel like three separate concepts.

Recommended ownership:

- Records owns save names, Save Game, Save Game As..., load/restore, revision, and snapshot details.
- Mission should avoid standing save actions; play continues through the bound chat while save management stays in Campaign Records.
- Settings owns verification/export/repair, but only under State Safety.
- Campaign Command should not repeat save metadata beyond "active save mounted" if the Command subtab remains.

### Package Health

Package health appears in package rows, package detail readiness, Library Health, import diagnostics, Settings Runtime, and Settings Packs. Package health belongs in Campaign Library. Settings should not repeat normal package health unless the setting is configurable or broken.

Recommended ownership:

- Campaign Library: package readiness and missing package assets.
- Import diagnostics: only latest import attempt or errors.
- Settings Packs: only user-selectable theme/icon/package customization once it exists.

### Continuity

Crew continuity appears as route-level status, roster row status, detail fact, and prose note. The repeated word `Tracked` is technically true but not meaningful after the first time.

Recommended ownership:

- Roster rows: selected state, billet, and public identity.
- Detail panel: one short player-safe continuity summary.
- Mission and Log: recent relevant continuity moments when they affect current play.

### Side Work

Side Work currently summarizes the queue twice before showing actual assignments. Counts should not outrank actionable cards.

Recommended ownership:

- Header: one line showing whether optional work is available.
- Body: available Open Orders, follow-ups, active scenes, and review decisions.
- Empty state: one concise message that tells the player when new side work appears or sends them back to Command.

### Settings Diagnostics

Settings repeats status across the overview, Safety, Storage Diagnostics, and Assist. Diagnostics should be alert driven. A clean state should be quiet.

Recommended ownership:

- Safety: verify, settle, export, repair, reload.
- Systems: runtime facts only when needed for troubleshooting.
- Packs: customization, not token counts.
- Assist: visible only when ready, recently run, failed, or has eligible candidates.

## Route-by-Route Review

### Shell And Navigation

Keep the six-route command spine. It is a valuable persistent map and reduces the need for intra-route "return to X" buttons.

Remove or reduce:

- `DRAWER ONLINE`, unless it becomes an actual alert channel.
- repeated route names when the drawer header, section title, and subtab title stack without adding hierarchy;
- any decorative LCARS segment that looks clickable but has no action.

Improve:

- Use the drawer header status area only for host/runtime problems, unsaved state, or an active warning.
- Prefer one route title and one local task title per viewport.
- Treat `Open Mission` buttons as optional shortcuts, not required navigation, because the spine already contains Mission.

### Campaign

Campaign is the most cluttered route because it mixes campaign launch, active campaign snapshot, package diagnostics, import, and records.

Strong removal candidate:

- Retire the current `Command` subtab as a full surface, or reduce it to one compact "Active campaign" strip with `Open Mission` and `Load Save`. With the command spine present, Campaign no longer needs to be a campaign dashboard. Mission already owns active play.

If `Command` stays:

- Remove the `Campaign: Loaded` overview strip.
- Keep only campaign title, player/ship, active mission/phase, last outcome, and one primary action.
- Do not repeat package count or save name unless it changes the available action.
- Show Open Orders only when available or active.

Library & Import should keep:

- package list;
- selected package details;
- New Campaign/Create Commander path;
- import control;
- import failure/warning diagnostics.

Library & Import should remove/collapse:

- `Library Health` as a permanent dashboard;
- `Import Status: Ready`;
- `Imported Packages: 0`;
- `No Setup Draft`;
- `No Saves`;
- latest import diagnostics when there is no latest import.

Records should keep:

- save list;
- current save marker;
- selected-save inspector;
- Load Save action.

Records should simplify:

- primary inspector should show save name, last update, campaign, mission/phase, mode, and snapshot;
- revision, raw ids, ship/player restatements, and technical metadata should move to details;
- if only one save exists, do not force a table-like "Record/Action" framing.

Potential augmentation:

- Add "Last playable moment" and "Next mission action" to save records if the data is available.
- Add a package-readiness problem summary that only appears when a package is not playable.

### Character Creator

The creator flow is fundamentally valuable. The clutter comes from multiple progress systems competing with the form.

Remove or merge:

- top Package/Campaign/Draft/Mode status grid;
- separate progress grid;
- per-section `Incomplete` badges when the active step already makes this clear.

Keep:

- ship/campaign context strip;
- step buttons;
- command bar with Save Draft, Begin, and a return/cancel action;
- field validation.

Improve:

- Put completion state directly on the step buttons.
- Rename `Back` if it discards or cancels the draft. A destructive or state-changing return action should not read as passive navigation.
- Add concise field-level reasons when Begin is disabled instead of another global progress strip.

### Mission

Mission is the core play loop, so its overview can be dense. The current layout still gives technical telemetry too much prominence.

Keep:

- mission title and objective;
- phase/mode when meaningful;
- latest outcome;
- pending outcome controls;
- clear return path to the bound campaign chat;
- Command Brief, Procedure Check, and Command Bearing intervention cards;
- Recovery controls when there is something to recover.

Remove or collapse:

- raw mission id in the primary technical strip;
- exact autosave timestamp in the primary overview;
- always-visible narration status when it is simply ready/complete;
- duplicate `Command` heading after selecting the Command subtab;
- the old Mission-drawer player intent input and preview button.

Side Work:

- Remove either the status grid or the readiness overview.
- Empty state should be one card, not a console plus readiness section.
- Show actual Open Orders or follow-ups before counts.

Recovery:

- Keep because it protects player state and supports pre-alpha testing.
- Hide the recovery status grid when there is no pending narration issue, committed outcome, branch, or save operation to review.
- Keep destructive actions separated in the red/coral risk zone.

Potential augmentation:

- Add one "next valid action" line at the top of Mission: continue in chat, resolve procedure check, accept/discard preview, repair narration, or save.
- Add recent relevant crew/ship context only when the current objective names it.

### Crew

Crew has a clear roster/detail model and should stay. The current first viewport spends too much space proving that the roster is initialized.

Remove or collapse:

- route-level readiness grid when all values are nominal;
- `Roster ready`;
- repeated `Tracked` labels;
- `Duty Status: Active`;
- `Record: Package-owned`.

Keep:

- roster list;
- portrait, rank, name, and billet;
- selected officer detail;
- one player-safe continuity note.

Improve:

- Turn the selected officer detail into a current-play reference: command relevance, recent public continuity, current mission usefulness, and available counsel angle.
- Show casualties, reassignments, or unusual duty state only when non-zero.
- Add search/filter only after roster size grows beyond the current senior-staff set.

### Ship

Ship has a strong identity surface when it uses package art and current condition. The lower-value pieces are repeated facts and pseudo-metrics.

Remove or collapse:

- Class and Registry status tiles because the hero already shows them;
- pseudo-percent readiness meters unless a real readiness model exists;
- `Prior Acting XO` unless it matters to the current state;
- completed refit work when there are no live caveats.

Keep:

- ship hero;
- condition/advisory state;
- active damage, restrictions, and technical debt;
- command authority if it changes player authority or available action.

Improve:

- Replace derived meters with "mission-impacting advisories": what can the player not do, what is risky, what needs attention.
- Group technical debt by effect rather than by count.
- Link relevant ship caveats to Mission when they affect a Procedure Check or Command Brief.

### Log

Log is valuable as a recall surface, but its overview currently acts like a diagnostics dashboard.

Remove or collapse:

- `Index Current`;
- overview metric grid for short logs;
- provider/source metadata in the card header;
- visible record ids by default.

Keep:

- latest record emphasis;
- timeline;
- detail expansion;
- search/filter once entries exceed a useful threshold;
- visible consequences and committed inputs, but not both expanded by default for every record.

Improve:

- Default entry body should show summary and state-changing consequences.
- Put committed inputs and raw record id behind details.
- Add chips for "new obligation", "ship state changed", "crew continuity changed", or "mission phase changed" if the log data can support it.

### Settings

Settings should become a quiet control plane. It currently repeats normal state and exposes developer-oriented facts as if they were user choices.

Remove or collapse:

- duplicate overview/status grids;
- raw active save id from the first viewport;
- `Storage Mode: Package only` from user-facing Systems;
- theme token role counts, icon slot counts, and fallback slot counts;
- Provider Assist idle strip when there are no candidates, failures, or recent runs.

Merge:

- State Safety and Storage Diagnostics into one Safety workflow.
- Reload Active Save and Clear Preview should live near the relevant problem state, not as general settings clutter.

Keep:

- Verify Active Save;
- Settle Active State;
- Export Active Save;
- Clean Missing Records, visually separated as repair/risk;
- provider assist diagnostics when there is an eligible run, recent result, or failure;
- appearance controls once the user can actually choose packs.

Improve:

- Default Settings to a task-based layout: Safety, Appearance, Provider Assist, Systems.
- Show clean states as one small line. Spend vertical space only on warnings, repairs, or controls.
- Use plain-language outcomes for safety actions: "save is readable", "state was written", "backup prepared", "missing index records removed".

## Whole Sections That May Be Redundant

### Campaign Command

`Campaign > Command` is the strongest whole-section removal candidate. In the current command-spine shell, the user already has a direct Mission route. A Campaign campaign snapshot plus an `Open Mission` action duplicates Mission's purpose and adds a second place for active play state to drift.

Recommended decision:

- If Campaign is for package and save management, remove the Command subtab and make the default surface conditional:
  - no active campaign: Library & Import;
  - active campaign: Records plus a compact active-save strip;
  - package problem: Library & Import with the problem highlighted.
- If a home snapshot is still desired, make it a compact top strip, not a full subtab.

### Settings Packs

`Settings > Packs` is redundant until the user can actually switch Theme Pack or Icon Pack. A read-only pack inventory belongs in diagnostics or development docs, not primary settings.

Recommended decision:

- Hide Packs until selectable appearance controls exist, or rename to Appearance and show only user-selectable controls.

### Settings Assist

`Settings > Assist` is redundant when provider assist is idle and no candidates exist.

Recommended decision:

- Hide the tab until it has one of: eligible candidates, runnable action, recent success, recent rejection, or failure.

### Mission Side Work Empty Console

An empty Side Work console plus readiness counts is redundant. It takes space to say there is nothing to do.

Recommended decision:

- Show one concise empty state with a return-to-Command affordance, or hide the subtab until side work exists if that does not make upcoming functionality undiscoverable.

## Sections To Improve Rather Than Remove

| Surface | Keep because | Improve by adding |
|---|---|---|
| Mission overview | It orients active play. | One next-action line and alert-only telemetry. |
| Command Brief | It teaches Starfleet competence without requiring perfect player knowledge. | Stronger grouping by "routine", "risk", "uncertainty", and "officer counsel"; hide empty categories. |
| Campaign Records | Save loading is a real workflow. | Restore-point language, last playable moment, and action-oriented save summaries. |
| Crew detail | Crew identity is core to the fantasy. | Recent player-safe continuity, mission relevance, and counsel hooks. |
| Ship condition | Ship state can shape choices. | Mission-impacting advisories instead of static readiness percentages. |
| Log timeline | Recall is useful during long campaigns. | Consequence-first summaries, obligation/change chips, details collapsed by default. |
| Settings Safety | Pre-alpha needs state repair controls. | Plain-language result feedback and risk grouping. |

## Recommended Cleanup Sequence

### Phase 1: Fast De-Clutter

1. Remove Campaign Command overview tiles.
2. Remove disabled no-op buttons and permanent empty diagnostics in Campaign Library.
3. Merge Settings overview/status grids and Safety/Storage diagnostics.
4. Remove Crew repeated continuity/status labels.
5. Remove Mission technical strip and duplicate input labels.
6. Remove Ship pseudo-percent meters.
7. Collapse Log overview for short logs.

### Phase 2: Ownership Pass

1. Make Mission the only active-play dashboard.
2. Make Campaign the package/save management route.
3. Make Settings an alert-driven control plane.
4. Make Crew and Ship reference surfaces that prioritize current-play relevance.
5. Make Log consequence-first rather than index-status-first.

### Phase 3: Add Value Back Sparingly

1. Add "next valid action" summaries where a route has real branching state.
2. Add mission-relevant Crew and Ship cues only when data supports them.
3. Add expandable details for raw ids, revisions, diagnostics, provider metadata, and package internals.
4. Add visual tests for removed clutter so low-value strips do not return.

## Acceptance Criteria For The Cleanup

- First viewport of every route has one dominant task.
- No visible tile says only `Loaded`, `Ready`, `Current`, `Online`, `Idle`, or `None` unless paired with a meaningful consequence or action.
- No disabled button exists solely to announce that an action is absent.
- Raw ids are hidden from primary player views.
- Clean diagnostics are quiet; warnings and failures are visible.
- Mission owns active play state; Campaign owns package/save management; Settings owns safety/configuration.
- Current desktop and phone screenshots show less vertical status scaffolding and a clearer next action.
- Focused route tests and `node tools/scripts/run-alpha-gate.mjs` pass after implementation.
