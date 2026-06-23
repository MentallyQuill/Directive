# Directive Operator Manual

This manual describes Directive's implemented pre-alpha chat-native runtime. It is written as the practical operator guide: what each control surface is for, what its sub-elements mean, and what to do when the campaign needs recovery.

This is a pre-render draft. Visual slots are marked as `Render needed:` and should be filled from [Documentation Render Capture Plan](../planning/DOCUMENTATION_RENDER_CAPTURE_PLAN.md) during the render phase.

For implementation detail, see [Directive Technical Manual](../technical/DIRECTIVE_TECHNICAL_MANUAL.md).

## Before You Start

Directive is pre-alpha. The current primary host is SillyTavern. Lumiverse uses the shared engine through a separate Spindle adapter and is documented where host behavior differs.

Before running a campaign:

1. Install or refresh Directive in the host.
2. In SillyTavern, install or update the [Directive preset](SILLYTAVERN_PRESET.md).
3. Select the character or group that should own the campaign chat.
4. Open Directive.
5. Configure Utility and Reasoning providers under **Settings > Providers** if the current host model should not handle every role.
6. Choose or import a campaign package.
7. Create the player officer.
8. Start the campaign and play in the fresh campaign chat Directive creates.

Render needed: SillyTavern Extensions menu with Directive launcher.

## Runtime Shell

### Purpose

The runtime shell is the operator console. It is not the source of campaign truth. It displays and controls the current save, package library, mission state, crew, ship, log, and settings.

### Desktop And Tablet Layout

Desktop and tablet use a left command spine with six routes:

| Route | Shelf Label | Use It For |
| --- | --- | --- |
| Campaign | Library & Records | Package selection, active campaign sessions, saves, branches, import, recovery, conclusion. |
| Mission | Command & Context | Active mission support, pending reviews, committed outcomes, Open Threads, Open World work. |
| Crew | Roster & Roles | Senior staff, public crew state, relationships, crew-linked threads. |
| Ship | Status & Systems | Ship baseline, condition, damage, restrictions, technical debt, active advisories. |
| Log | Index & Recall | Player-facing command history, consequences, committed inputs, assisted summaries. |
| Settings | Providers & Controls | Runtime controls, providers, model routing, prompt/preset controls, state safety. |

### Phone Layout

Phone width uses a full-screen shell with bottom navigation. The same six routes exist, but dense route content may stack into mobile-specific layouts.

### Shell Controls

The shell owns:

- opening and closing the command drawer;
- route switching;
- drawer width;
- fullscreen/workspace escalation for dense workflows;
- Reset Window behavior;
- mobile bottom navigation;
- persisted UI geometry.

### Reset Window

Use **Reset Window** when shell geometry or route-local UI state becomes awkward. It resets transient UI state such as drawer geometry and route-local selections. It does not delete packages, saves, campaign state, provider settings, or host chat content.

Render needed: desktop command spine closed, open, fullscreen/workspace, reset default, and phone shell.

## Campaign Route

Campaign is the library, session index, package import, and save-record surface. Normal play continues in the bound campaign chat and Mission route; Campaign is for setup and campaign records.

Campaign has three subtabs:

1. **Command**
2. **Library & Import**
3. **Records**

### Campaign Command

Use **Command** as the active campaign/session overview.

When no campaign is loaded, Command tells you to choose a campaign package or load a save.

When a campaign is loaded, Command can show:

- campaign title;
- active player officer;
- ship;
- mission and phase;
- stardate;
- simulation mode;
- bound chat identity;
- prompt-context revision;
- latest committed moment;
- current save;
- Open Orders status;
- recovery actions.

Common actions:

| Action | Meaning |
| --- | --- |
| Open Campaign Chat | Opens the host chat bound to the loaded save. Use this to return to play. |
| Rebind Chat | Recovery/admin action. Binds the loaded save to the currently open host chat and rebuilds prompt context. |
| Finish Chat Setup | Continues an interrupted campaign activation from the last successful journaled step. |
| Retry Chat Setup | Retries a failed activation step. |
| Conclude Campaign | Begins recoverable campaign conclusion. |
| Retry Conclusion | Continues a failed conclusion. |
| Archive Campaign | Marks a completed campaign inactive while preserving final save state. |

Rebind Chat is not the normal first-start path. New campaigns create a fresh campaign chat during activation.

Render needed: Campaign Command with no campaign, active campaign, interrupted activation, Rebind Chat, conclusion, and archive states.

### Campaign Library & Import

Use **Library & Import** to browse campaign packages and import `.directive-campaign.zip` packages.

Package browsing does not create campaign state and does not install prompt context.

Package detail can include:

- package title and status;
- premise and player role;
- ship context;
- campaign hook;
- tone and expected length;
- chapter/quest summary;
- package health;
- package image or fallback;
- available records;
- package actions.

Common actions:

| Action | Meaning |
| --- | --- |
| New Campaign | Opens Character Creator for the selected package. |
| Load Save | Loads the latest matching campaign save when available. |
| Choose File | Selects a `.directive-campaign.zip` package to import. |
| Drop Zone | Imports a dropped package archive. |

Import diagnostics can report invalid transport extension, unsafe archive paths, active content rejection, invalid JSON, missing or ambiguous package JSON, package id mismatch, or schema/package health issues.

Render needed: package library, package detail, long metadata label, successful import, and import diagnostics with at least one error.

### Campaign Records

Use **Records** to inspect, load, branch, and delete campaign saves.

Records groups saves by campaign folder. Each group can be expanded or collapsed. Each save row shows whether it is active, stored, user-created, or an autosave.

Save selection supports:

- single click for detail selection;
- Shift-click for a range;
- Ctrl-click or Command-click for multi-select;
- bulk delete for selected saves.

The save inspector can show:

- campaign;
- stardate;
- active mission;
- phase;
- simulation mode;
- summary;
- active save guard status;
- save actions.

Common actions:

| Action | Meaning |
| --- | --- |
| Save Game | Overwrites the active save if the active host chat matches the loaded save binding. |
| Save Game As... | Creates a named save branch from the active campaign state. |
| Load Save | Loads the selected save and opens Mission. |
| Delete Save | Deletes the selected save payload. |
| Delete Selected | Deletes multiple selected saves. |
| Open Campaign Chat | Recovery action shown when the save guard can open the correct bound chat. |

### Active-Chat Save Guard

Manual save is chat-affine. Save Game and Save Game As are disabled when Directive cannot confirm that the active host chat belongs to the loaded save. The guard protects against accidentally overwriting one campaign with another chat's state.

Blocked save cases include:

- active host chat is missing;
- selected chat belongs to another save branch;
- selected chat belongs to another Directive campaign;
- selected chat has conflicting Directive metadata;
- host cannot report enough chat identity to prove safety.

Render needed: Records empty, grouped saves, selected save, multi-select, active-chat guard ok, active-chat guard blocked, Save Game As dialog, branch metadata, and delete confirmation.

## Character Creator

Character Creator creates the player officer before campaign state exists. The package owns the available choices and role framing.

### Draft Lifecycle

| State | Meaning |
| --- | --- |
| New Draft | No meaningful player-officer setup has been saved. |
| Resume Draft | A meaningful draft exists for the package. |
| Save Draft | Preserves setup without creating campaign state. |
| Discard Character | Clears the draft after confirmation. |
| Start Campaign | Accepts the reviewed officer and begins campaign activation. |

### Step Navigation

The current guided creator uses package-owned steps:

1. Identity
2. Service
3. Personality
4. Review

Step controls can appear active, complete, locked, or needing attention.

### Identity

Identity fields include:

- Given Name;
- Family Name;
- Species;
- Age Band;
- Appearance.

These fields define visible identity and play context. They should not create hidden campaign state.

### Service

Service fields include:

- Career Background;
- Formative Experience;
- Assignment Reason.

These fields shape command profile, competence cues, and player-facing dossier copy.

### Personality

Personality fields include:

- Insight;
- Connection;
- Execution;
- Flaw.

These are characterization controls, not a visible XP system. They help the runtime frame the officer and support role-aware assistance.

### Review

Review shows the assembled dossier and readiness state. Validation failures should tell the operator which required setup is missing.

### Player Portrait

Portrait controls may include:

- Import;
- Change;
- Remove;
- unsupported-state messaging when the host cannot store portraits.

Player portrait assets are user-owned campaign setup data, not package-owned crew art.

### Section Wand Assistance

Creator assistance can draft or revise sections. It uses the `characterCreatorSectionDraft` role and should produce editable text, not hidden campaign outcomes.

Expected sub-elements:

- section assist command;
- preview;
- apply;
- regenerate;
- dismiss;
- provider failure fallback;
- validation warning if output is incomplete.

Render needed: empty draft, resume draft, each step active/locked/complete, portrait absent/present/unsupported, wand preview/apply/regenerate/dismiss, validation failure, ready Start Campaign, and discard confirmation.

## Campaign Activation

### Purpose

Activation turns an accepted creator draft into a playable campaign save and chat.

### Activation Steps

Directive activation is journaled and idempotent. It can resume after a partial failure.

The expected sequence:

1. accept the creator draft;
2. create the first save;
3. require a selected SillyTavern character or group when creating a fresh chat;
4. create a fresh campaign chat;
5. bind campaign/save/chat metadata;
6. generate or compose the intro;
7. post the intro once;
8. install player-safe prompt context;
9. mark activation active/complete;
10. open the campaign chat.

### Activation Recovery

If activation is interrupted, use **Finish Chat Setup**. If a step fails, use **Retry Chat Setup**. Recovery resumes journaled steps instead of repeating already-completed actions.

Render needed: start progress, fresh chat opened, first intro visible, prompt context installed, failed activation, and retry.

## Mission Route

Mission is the campaign support surface. It is not the default text entry surface; ordinary play continues in the bound campaign chat.

Mission has four subtabs:

1. **Active**
2. **Context**
3. **Open Threads**
4. **Open World**

### Mission Active

Use Active to see play status and recovery controls.

It can show:

- active campaign and mission;
- bound chat state;
- prompt context revision;
- committed revision;
- next suggested operator action;
- last outcome;
- pending interactions;
- committed outcome preview;
- recovery console.

Common actions:

| Action | Meaning |
| --- | --- |
| Open Campaign Chat | Returns to the bound host chat. |
| Finish/Retry Chat Setup | Continues activation recovery. |
| Confirm Risk | Confirms a serious-risk order and allows resolution. |
| Revise Order | Returns the player to chat to change the order. |
| Request Counsel | Asks for player-safe professional counsel. |
| Accept Outcome | Accepts a pending outcome or replacement. |
| Discard Preview | Drops an uncommitted preview. |
| Rewrite Narration | Regenerates prose without rerolling mechanics. |
| Rerun Outcome | Reruns mechanics from the retained pre-outcome snapshot where allowed. |
| Delete Outcome | Restores the campaign to the pre-outcome snapshot for the last outcome. |
| Retry Chat Response | Reposts a failed Directive-owned chat response. |
| Retry Narration | Retries narration for the same committed outcome id. |

### Pending Interactions

Mission can pause for:

- clarification;
- serious-risk confirmation;
- authority review;
- Command Bearing choice;
- outcome replacement review;
- recovery decision.

Pending interactions should be player-safe and specific about the decision required.

### Mission Context

Context shows player-safe operational situation:

- current objectives;
- active directives;
- established facts;
- uncertainties;
- pressure;
- chapter checkpoint;
- safe alpha actions where relevant.

Context is for orientation; it should not reveal hidden Director-only truth.

### Open Threads

Open Threads are player-visible ongoing concerns. They can be story, crew, ship, or operational threads.

Each visible thread can show:

- shape;
- title;
- status;
- summary;
- source;
- stakes;
- linked crew or ship systems;
- last engaged information;
- More/Less disclosure for long copy.

Hidden, latent, and watchlisted threads remain out of this view until runtime state makes them visible.

### Open World

Open World shows side work and quest opportunities.

Possible sub-elements:

- available opportunities;
- active side work;
- focus action;
- delegate action;
- pause action;
- abandon action;
- progress and scene beats;
- empty state when no visible open-world work is active.

### Recovery Console

Recovery tools are grouped away from normal command play. Use them when a response, narration, reconciliation, or outcome state needs repair.

Render needed: active bound chat, no-bound-chat guard, clarification, risk confirmation, Command Bearing choice, committed outcome, narration recovery, populated/empty Open Threads, populated/empty Open World, and pending reconciliation.

## Crew Route

Crew presents player-safe senior staff context. It does not expose raw hidden metrics.

### Duty Roster

The roster lists known officers and roles. It can include:

- player commander;
- senior staff;
- division/rank indicators;
- billet;
- portrait or fallback;
- selection state.

### Officer Dossier

The selected officer can show:

- name, rank, billet;
- public profile;
- biography with More/Less disclosure;
- public relationship posture;
- current pressure;
- open work;
- recent command memory;
- Open Threads;
- portrait controls where allowed.

### Relationship And Development Display

Crew relationship and development are qualitative. The UI should avoid raw hidden numbers and reveal only player-safe posture.

### Portrait Controls

Depending on the selected record and host support, Crew can expose:

- Import;
- Change;
- Remove.

Package-owned crew portraits and user-owned player portrait imports are different asset categories.

Render needed: full roster, player commander selected, senior officer selected, long bio collapsed/expanded, portrait import/change/remove, linked pressure/work/memory/thread present, and empty states.

## Ship Route

Ship presents the current player-safe vessel state.

### Hero And Identity

The route can show:

- ship image or fallback;
- ship name;
- class;
- registry when known;
- affiliation or mission profile;
- active advisory count.

### Runtime Asset Status

Status folders and tiles can show:

- advisories;
- damage;
- restrictions;
- repairs;
- technical debt;
- clean/empty states.

### Engineering Report

The engineering report summarizes current ship condition from campaign-owned state and package baseline.

Render needed: clean baseline, active damage, active restriction, known technical debt, and all readiness folders expanded.

## Log Route

Log is the player-facing campaign memory index.

### Command History

Log shows committed outcomes from newest to oldest. Each record can include:

- chronological marker;
- latest-record marker;
- stardate;
- summary;
- visible consequences count;
- committed player input;
- details toggle.

### Details

Expanded details can include:

- player-facing summary;
- visible consequences;
- committed input;
- assisted summary when available;
- source or outcome metadata that is safe to show.

### Filters

Where exposed, filters/search should help find command history without changing campaign state.

Render needed: empty/new campaign, latest entry, expanded detail, summary filter, consequences filter, assisted summary success/failure.

## Directive Assist

Directive Assist is the SillyTavern input-side helper. It is pre-send assistance, not an automatic campaign-state mutator.

### Actions

| Action | Use |
| --- | --- |
| Draft In Character | Turns rough intent into editable player-character wording. |
| Brief Me | Produces a player-safe brief with knowns, uncertainties, routine context, pressures, and decision focus. |
| Frame as Order | Rewrites rough text as a command/order. |
| Frame as Report | Rewrites rough text as a report. |
| Reconcile Marked Passage | Starts reconciliation for selected/marked chat passage. |
| Open Pending Reconciliation | Opens Mission to the pending reconciliation card. |

### Result Controls

Assist result modals can include:

- Apply to Chat;
- Replace Selection;
- Insert Summary;
- Restore Rough Text;
- Try Again;
- Cancel.

Provider fallback should warn the operator when output was recovered, replaced, or rejected.

Render needed: assist menu open, Brief Me result, order/report draft, Apply to Chat before/after, provider parse failure/fallback, disabled/no active campaign.

## Settings Route

Settings has three subtabs:

1. **Systems**
2. **Providers**
3. **Safety**

### Systems

Systems shows runtime controls and host state. It can include:

- active save status;
- runtime history/autosave settings;
- interface hints;
- Reset Window related expectations;
- storage or host capability summaries.

### Providers

Providers controls:

- Directive Preset status;
- Utility Provider;
- Reasoning Provider;
- model-call role routing;
- provider tests;
- model-call diagnostics.

#### Directive Preset

The preset card can show missing, current, update available, unknown, newer installed, or legacy-name states. Actions include Install/Reinstall/Update and Refresh Status.

#### Provider Lanes

Each lane can use:

- Current Host Model;
- Host Connection Profile;
- OpenAI-Compatible Endpoint.

Each lane can configure:

- source;
- connection profile;
- base URL;
- model id;
- session API key;
- temperature;
- top-p;
- maximum tokens;
- Save Provider;
- Test Provider;
- Clear Session Key where available.

Direct endpoint keys are session-only. Persisted settings only record whether a key is present.

#### Model-Call Routing

Routing folders group roles by meaning:

- Story Output;
- Turn Reading;
- World Structure;
- State Sidecars;
- Context & Summaries;
- Authoring Helpers;
- Other Calls.

Each role shows label, role id, output type, fallback, default lane, current lane, and override state. Changing a route affects which provider lane handles the call; it does not change the role's authority.

### Safety

Safety exposes state and storage diagnostics:

- Verify Active Save;
- Settle Active State;
- Export Active Save;
- Refresh Storage;
- Clean Missing Records;
- stale preview cleanup if available;
- last safety result;
- storage counts and issue summaries.

Use Safety to diagnose storage problems, not to invent missing campaign state.

Render needed: Systems default, Providers with preset missing/current/behind, Utility/Reasoning config, routing folders expanded, provider test success/failure, model-call diagnostics populated/empty, Safety clean, Safety with issue, and each action result.

## Saves, Transactions, And Recovery

### Operator Rule

If an action changes campaign truth, Directive should either commit it through tracked state or refuse and ask for review. Chat prose and Command Log text are presentation; structured campaign state is authoritative.

### Stable Turn Behavior

Directive commits mechanics before narration. Narration retry uses the same outcome and cannot reroll mechanics. Autosaves are created after stable narration.

### Branch Behavior

Use Save Game As to create a named branch. The branch becomes the active save branch and updates chat binding metadata so future manual saves target the branch.

### Edit/Delete Recovery

If the player edits or deletes a message that affected committed outcomes, Directive uses retained snapshots where possible. If dependent committed turns make the change unsafe, Directive marks the situation for review instead of silently corrupting continuity.

For deeper detail, see [State Transactions And Recovery](../technical/STATE_TRANSACTIONS_AND_RECOVERY.md).

## SillyTavern Host Controls

SillyTavern-specific controls include:

- Extensions menu launcher;
- Directive enable/disable lifecycle;
- command-spine shell mount;
- Reset Window;
- Directive Assist button beside host input controls;
- message actions overflow;
- Reconcile This Message;
- Set Reconciliation Start;
- Set Reconciliation End;
- Reconcile From Here;
- Directive preset install/status card;
- `/user/files` storage-backed package/save records.

Render needed: Extensions menu, Reset Window result, Assist beside host controls, message actions overflow with Directive menu, preset status card, and live `/send` row before message-action capture.

## Lumiverse Differences

Lumiverse uses the shared engine through Spindle, but its host surface differs:

- app-overlay shell mount;
- drawer-tab launcher;
- Spindle permissions;
- user-scoped storage;
- Lumiverse generation connection;
- prompt blocks rather than SillyTavern `setExtensionPrompt`;
- runtime bridge actions;
- no SillyTavern extension menu or message-action UI.

See [Lumiverse Installation And Smoke Testing](LUMIVERSE_INSTALLATION.md) and [Host Integration Manual](../technical/HOST_INTEGRATION_MANUAL.md).

Render needed: Lumiverse app overlay, launcher tab, permission/status view, prompt dry-run or interceptor proof, and storage diagnostics if documenting host differences.

## Troubleshooting

| Problem | First Check |
| --- | --- |
| Directive opens with no campaign | Campaign > Library & Import, then choose a package or load Records. |
| New Campaign is disabled | Package diagnostics may be failing or runtime assets may be incomplete. |
| Start Campaign fails | Confirm a SillyTavern character/group is selected and retry chat setup. |
| Prompt context is suspended | Open the bound campaign chat or use Open Campaign Chat from Campaign/Mission. |
| Save Game is disabled | Records save guard probably cannot prove the active chat matches the loaded save. |
| Provider actions fail | Settings > Providers, then test Utility and Reasoning lanes. |
| Assist returns odd output | Check provider failure warning; use Restore Rough Text or Try Again. |
| Narration fails after outcome | Use Mission recovery; retry narration without rerolling mechanics. |
| Message edit/delete caused recovery | Open Mission and review the pending reconciliation/recovery state. |
| Package import fails | Check import diagnostics for unsafe path, active content, missing package JSON, or schema errors. |
| Storage reports missing files | Settings > Safety, Verify Active Save, then use cleanup only for stale records. |
| Lumiverse generation fails | Check Lumiverse generation connection outside Directive first. |

## Verification

Operator-manual claims should be checked against:

```powershell
node tools\scripts\verify-repo-structure.mjs
node tools\scripts\test-runtime-shell-creator-flow.mjs
node tools\scripts\test-chat-native-activation-conclusion.mjs
node tools\scripts\test-chat-turn-orchestrator.mjs
node tools\scripts\test-directive-provider-routing.mjs
node tools\scripts\test-directive-storage-repository.mjs
node tools\scripts\test-sillytavern-message-actions.mjs
node tools\scripts\run-alpha-gate.mjs
```

Live screenshots should be captured through [Documentation Render Capture Plan](../planning/DOCUMENTATION_RENDER_CAPTURE_PLAN.md) before finalizing this manual.
