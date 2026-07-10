# Command Authority Model Feature Patch

## Status

Proposed feature patch for the pre-alpha campaign runtime.

This document turns the live Ashes/default-user command-routing failure into a campaign-wide design and implementation plan. The observed symptom was that bridge officers repeatedly addressed the player-character XO as if he were the ship's command endpoint even while Captain Whitaker was present and held clear command authority.

The fix is not Ashes-specific. All bundled campaigns have command-role constraints, captain availability, delegation, or succession pressure. Directive needs one cross-campaign command-authority model that separates player agency from in-universe command authority.

## Problem

Directive currently gives the host model strong player-facing instructions:

- identify the player character correctly;
- address the player character by name, rank, and billet;
- yield the playable beat back to the player.

That is necessary for chat-native play, but it creates a prompt ambiguity. The model can treat "yield to the player" as "all crew route formal reports and command decisions through the player." In Ashes of Peace this made Nayar and Bronn repeatedly brief Commander Sam Vickers even while Captain Whitaker was on the bridge and had not yet delegated the conn.

The current package data already contains the missing truth:

- Ashes: Captain Whitaker retains final legal command while present.
- Aster Vale: Captain Kellan remains legal captain but begins ashore under inquiry, giving the player acting command.
- Celandine: Captain Dorel remains legal captain but is medically quarantined, confirming the player as Acting Captain.
- Eudora Vale: Captain Rhee dies in the opening crisis, creating lawful succession.
- Glass Harbor: Captain Rhos disappears, creating succession play.
- Serein: Captain Lorne is injured, creating temporary acting command.

The issue is that these truths are not normalized into a compact runtime prompt and state contract for every turn.

## Goals

- Separate player agency target from in-universe command recipient.
- Normalize package command-role data into a stable runtime command-authority profile.
- Keep formal reports, options, and major command decisions routed to the current command authority.
- Preserve player agency even when the player is not currently the legal or operational commander.
- Support all bundled campaign authority shapes without hardcoding campaign-specific prompt prose.
- Make delegation explicit in prose and state when a captain hands the player a decision, the conn, or acting command.
- Provide tests that catch player-agency and command-recipient conflation.

## Non-Goals

- Do not build a full Starfleet legal simulator.
- Do not remove the player from meaningful decisions when they are an XO.
- Do not make captains block play by default.
- Do not expose hidden command metrics or raw relationship values.
- Do not require legacy compatibility for old pre-alpha saves or packages.
- Do not solve every away-team, civilian, diplomatic, or external-jurisdiction authority edge case in the first patch.

## Core Design Decision

Directive should model three separate concepts:

1. **Player agency target**: the character the user controls and the reply should yield to.
2. **Command recipient**: the officer who should receive formal reports and options in the current scene.
3. **Major decision authority**: the actor whose approval is required for irreversible, strategic, or mission-deviating decisions.

These can be the same actor, but they must not be assumed to be the same actor.

### Ashes Example

Before Whitaker gives Sam the conn:

```text
Player agency target: Commander Sam Vickers.
Command recipient: Captain Mara Whitaker.
Major decision authority: Captain Mara Whitaker.
Player authority mode: Executive Officer under a present commanding officer.
```

Valid prose shape:

```text
"Four life signs, Captain," Nayar said. "One pod is showing amber life-support."

Whitaker's expression tightened. "Options?"

Nayar glanced to Sam's station as she brought up the vector. "The long-range probe can mark them for warp intercept, Commander, but the ship will need your recovery plan."
```

After Whitaker says "Commander, you have the conn":

```text
Player agency target: Commander Sam Vickers.
Command recipient: Commander Sam Vickers.
Major decision authority: Captain Mara Whitaker for major mission deviations, Commander Sam Vickers for routine bridge execution.
Player authority mode: bounded conn delegation.
```

### Acting-Captain Example

After Eudora Vale's opening succession:

```text
Player agency target: Commander [player].
Command recipient: Commander [player], Acting Captain.
Major decision authority: Commander [player], subject to later Starfleet review.
Player authority mode: lawful acting command.
```

Crew should report formal status and options to the player. The former captain may remain emotionally, culturally, or procedurally important, but is no longer the command recipient.

## Runtime Data Model

Add a compact `commandAuthority` projection to campaign state or runtime prompt frame.

Initial shape:

```js
{
  version: 1,
  playerAgencyTargetId: 'player-commander',
  commandRecipientId: 'mara-whitaker',
  majorDecisionAuthorityId: 'mara-whitaker',
  connHolderId: 'mara-whitaker',
  legalCommanderId: 'mara-whitaker',
  operationalCommanderId: 'mara-whitaker',
  delegationSourceId: null,
  delegationScope: 'recommendation',
  playerAuthorityMode: 'xo',
  commanderPresence: 'present',
  commanderStatus: 'active',
  summary: 'Commander Sam Vickers is the Executive Officer under Captain Mara Whitaker, who retains final legal command while present.',
  reportingRule: 'Formal bridge reports go to Captain Mara Whitaker unless she delegates the conn or asks the XO for a bounded decision.',
  majorDecisionRule: 'Major mission deviations require Captain Mara Whitaker approval unless committed campaign state changes command authority.'
}
```

Recommended enum values:

- `playerAuthorityMode`: `xo`, `delegated-xo`, `acting-captain`, `captain`, `mission-commander`, `uncertain`.
- `delegationScope`: `none`, `recommendation`, `routine-execution`, `bounded-decision`, `conn`, `acting-command`, `full-command`.
- `commanderPresence`: `present`, `offscreen`, `absent`, `incapacitated`, `dead`, `missing`, `quarantined`, `under-inquiry`, `unknown`.
- `commanderStatus`: `active`, `limited-duty`, `unavailable`, `relieved`, `deceased`, `missing`, `under-review`, `unknown`.

The projection should be player-safe when inserted into host prompts. Hidden details such as raw trust scores, relationship state, or unrevealed captain motives must not appear in this block.

## Package Normalization

Create a normalizer that reads package and campaign state:

```text
package.characterCreation.lockedRole
package.characterCreation.campaignContext
package.ship.commandStructure
campaignState.player
campaignState.captainState
campaignState.mission
campaignState.commandAuthority
campaignState.runtimeTracking or active scene metadata
```

The normalizer must prefer committed campaign state over package defaults.

Default resolution rules:

- If committed `commandAuthority` exists, use it as the base and fill missing display labels from package data.
- If package says the player is Acting Captain at start or after the prelude, resolve `playerAuthorityMode` from committed mission/succession state, not from title text alone.
- If captain retains final authority and is present/active, default command recipient and major decision authority to the captain.
- If captain is absent, dead, missing, quarantined, incapacitated, or under inquiry and the package grants acting command, default command recipient to the player.
- If command status is ambiguous, preserve player agency but emit a conservative reporting rule that requires explicit authority in prose before irreversible command action.

## Prompt Contract

Add a new mandatory prompt block:

```text
directive.campaign.command-authority
```

The block should sit near `directive.campaign.player-character` and `directive.campaign.turn-yield`, with a compact priority high enough that it survives prompt-budget pressure.

Example content:

```text
Command authority:
- Player agency target: Commander Sam Vickers, Executive Officer.
- Command recipient: Captain Mara Whitaker while she is present and active.
- Major decision authority: Captain Mara Whitaker.
- Crew may answer the player character's direct questions, but formal bridge reports and major options go to the command recipient.
- A captain may delegate a bounded decision, the conn, or acting command; make the delegation explicit in prose.
- Do not treat player agency as automatic command authority.
```

For acting-captain campaigns:

```text
Command authority:
- Player agency target: Commander [name], Acting Captain.
- Command recipient: Commander [name].
- Major decision authority: Commander [name], subject to lawful review or campaign-specific constraints.
- Crew reports formal status and options to the player unless committed state establishes a temporary substitute.
- Former, absent, injured, quarantined, missing, or deceased captains may affect culture, legitimacy, grief, review, or constraints, but do not silently receive command traffic.
```

### Turn-Yield Wording Change

Change the existing turn-yield line from:

```text
Yield target: Commander Sam Vickers.
```

to:

```text
Player agency target: Commander Sam Vickers.
```

Add:

```text
This is who the reply yields playable agency to; it is not necessarily the current command recipient.
```

This preserves the intended playable pause while removing the misleading chain-of-command implication.

## State Updates And Delegation

The first patch can derive command authority from package defaults and scene context. The durable version should also let committed outcomes update `commandAuthority`.

State transitions to support:

- Captain gives the conn.
- Captain takes back the conn.
- Captain delegates a bounded decision.
- Captain leaves the bridge but remains available.
- Captain becomes unavailable, injured, quarantined, missing, dead, relieved, or under inquiry.
- Player becomes Acting Captain by ordinary succession.
- Player appoints or confirms an acting XO or second officer.
- Starfleet confirms, challenges, or reviews acting authority.

Only committed state should change durable authority. Host prose alone can suggest a delegation, but Scene Handshake or Director settlement must validate it before it becomes campaign state.

## Mission Director And Outcome Behavior

Mission Director should consume `commandAuthority` for authority and capability checks.

Examples:

- The player asks a department head for data: valid as XO in most shipboard contexts.
- The player orders a routine scan or probe while captain is present: valid when reversible, routine, or explicitly delegated.
- The player commits the ship to a major route deviation while captain is present: requires captain approval, counteroffer, or serious command conflict.
- The player is Acting Captain after lawful succession: crew should treat the player as command recipient, while review and legitimacy may remain story pressure.
- A former or unavailable captain returns: do not silently remove player agency; resolve the command relationship through committed play and campaign rules.

The Director should not use command authority to block normal play. It should use it to make consequences, support, refusal, approval, delegation, and friction coherent.

## Files To Modify

Primary implementation files:

- `src/context/command-authority-guidance.mjs`: new normalizer and prompt-line builder.
- `src/context/scene-pacing-guidance.mjs`: rename turn-yield wording to player-agency wording.
- `src/context/context-orchestrator.mjs`: add `directive.campaign.command-authority` block.
- `src/runtime/lens-prompt-scheduler.mjs`: protect the new prompt block in scheduler priorities and prompt-budget tests.
- `src/runtime/state-delta-gateway.mjs`: allow validated command-authority updates when Director or settlement commits them.
- `src/runtime/turn-commit-coordinator.mjs`: include command-authority dirty-domain handling if needed.
- `src/mission/director.mjs` and `src/adjudication/capability-validator.mjs`: consume command authority in decision checks.
- `src/runtime/source-settlement-latest-pair-validation.mjs`: detect accepted explicit delegation or conn handoff from prior prose.
- `src/runtime/source-settlement-latest-pair-owner.mjs`: allow `commandAuthority` operations from validated latest-pair settlement.

Likely tests:

- `tools/scripts/test-command-authority-guidance.mjs`
- `tools/scripts/test-command-authority-state-delta.mjs`
- `tools/scripts/test-command-authority-mission-director.mjs`
- `tools/scripts/test-scene-handshake-settler.mjs`
- `tools/scripts/test-chat-native-runtime-flow.mjs`
- `tools/scripts/test-open-world-context-budget.mjs`
- `tools/scripts/test-prompt-dirty-domains.mjs`
- `tests/fixtures/mission/*` authority fixtures where relevant.

Docs to update after implementation:

- `docs/design/MISSION_DIRECTOR_MODEL.md`
- `docs/technical/PLAYER_TURN_SEQUENCE.md`
- `docs/packages/CAMPAIGN_PACKAGE_MODEL.md`
- `docs/testing/TESTING_STRATEGY.md`

## Implementation Plan

### Phase 1: Command Authority Normalizer

Add `src/context/command-authority-guidance.mjs`.

Exports:

```js
export function commandAuthorityProfile({ campaignState, packageData, scene } = {}) {}
export function commandAuthorityPromptLines(input = {}) {}
export function commandAuthorityPromptBlock(input = {}) {}
```

As-built prompt block shape:

```js
{
  id: 'command-authority',
  title: 'Command Authority',
  mustInclude: true,
  priority: 997,
  lensPromptBudgetLane: 'activeScene',
  reason: 'Separates player agency from in-universe command recipient and decision authority.',
  content: commandAuthorityPromptLines(input).map((line) => `- ${line}`).join('\n')
}
```

Behavior:

- Read player identity from `campaignState.player` and package locked role.
- Resolve captain identity from `lockedRole.captainId`, `ship.commandStructure.commandingOfficer`, `ship.commandStructure.captainId`, or senior crew with `Commanding Officer` billet.
- Resolve player authority from committed `campaignState.commandAuthority`, then package `lockedRole.commandAuthority`, then `ship.commandStructure.playerRole`.
- Resolve captain boundary from committed state, then `lockedRole.captainAuthorityBoundary`, then `ship.commandStructure.captainRetainsFinalAuthority`.
- Emit a compact, player-safe profile.

Acceptance criteria:

- All bundled campaign packages produce a non-empty profile.
- Ashes resolves to present-captain/XO unless state says otherwise.
- Aster Vale resolves to acting-command when Kellan is ashore under inquiry.
- Celandine resolves to acting-command when Dorel is quarantined.
- Eudora resolves to acting-command after Rhee death/succession state.
- Glass Harbor resolves to acting-command after Rhos disappearance state.
- Serein resolves to acting-command after Lorne injury/unavailability state.

### Phase 2: Prompt Contract Integration

Update `scene-pacing-guidance.mjs`:

- replace `Yield target:` with `Player agency target:`;
- add the clarification that agency target is not necessarily command recipient.

Update `context-orchestrator.mjs`:

- import `commandAuthorityPromptBlock`;
- add normalized candidate `id: 'command-authority'`;
- set prompt key to `directive.campaign.command-authority`;
- mark it `mustInclude: true` for campaign turns;
- place it near player-character and turn-yield.

Update scheduler prompt-key handling if required.

Acceptance criteria:

- Prompt inspection for Ashes includes `directive.campaign.command-authority`.
- Prompt inspection for all bundled packages includes a compact command-authority block.
- The turn-yield block no longer implies command recipient.
- Mandatory block budgets do not evict normal scene continuity.

### Phase 3: State And Dirty-Domain Support

Add `commandAuthority` as an allowed campaign-state root or runtime projection root.

Minimum durable fields:

```js
{
  version: 1,
  connHolderId,
  commandRecipientId,
  majorDecisionAuthorityId,
  delegationSourceId,
  delegationScope,
  playerAuthorityMode,
  commanderPresence,
  commanderStatus,
  lastUpdatedAt,
  sourceOutcomeId
}
```

Validation:

- IDs must be known actor IDs or `player-commander`.
- `delegationScope`, `playerAuthorityMode`, `commanderPresence`, and `commanderStatus` must be known enum values.
- Updates must come from Director settlement, validated Scene Handshake, package activation, or deterministic campaign-start logic.
- Model narration cannot directly mutate command authority.

Acceptance criteria:

- State delta validation accepts valid command-authority updates.
- Invalid enum values or unknown actor IDs are rejected.
- Prompt dirty domains rebuild when command authority changes.

### Phase 4: Mission Director Consumption

Wire command authority into authority/capability checks.

As-built contract:

```js
export function checkAuthorityAndCapability(input = {}) {
  return withCommandAuthorityContext(checkAuthorityAndCapabilityCore(input), input.campaignState);
}
```

When `campaignState.commandAuthority` exists, authority checks append a compact `commandAuthorityContext` and add basis lines such as:

```js
Command-authority state delegates current execution to the player character,
but major decisions remain with mara-whitaker.
```

Rules:

- XO can gather data, coordinate staff, request reports, make recommendations, and execute routine delegated operations.
- Major mission deviation requires current major decision authority unless emergency conditions provide a clear lawful basis.
- Acting Captain can receive reports and make operational decisions by default.
- Returning or partially available captains must create explicit command-status play instead of silently overriding the player.

Acceptance criteria:

- Existing authority-note fixtures continue to pass.
- New fixtures distinguish XO recommendation from Acting Captain command.
- Mission Director can produce approval, refusal, counteroffer, or delegation without breaking player agency.

### Phase 5: Scene Handshake Delegation Detection

Add a narrow settlement path for explicit command handoffs in accepted prior prose.

Examples:

- "Commander, you have the conn."
- "Take the bridge."
- "This one is your call."
- "You are Acting Captain until I am cleared."
- "I am relieving myself; command passes to..."

Validation:

- Speaker must have authority to delegate.
- Scope must be bounded unless the package state supports full succession.
- Player acceptance or subsequent player action must treat the handoff as real.
- Ambiguous encouragement should not become durable command transfer.

As-built deterministic detector lives in `source-settlement-latest-pair-validation.mjs` and emits a validated state operation only for accepted latest-pair source:

```js
{ op: 'replace', path: 'commandAuthority', value: nextCommandAuthority }
```

Supported deterministic phrase classes:

- `you have the conn`, `take the conn`, `you have the bridge`, `take the bridge`: `delegationScope: 'conn'`.
- `this decision is your call`, `your call, Commander`: `delegationScope: 'bounded-decision'`.
- `you are Acting Captain`, `command passes to you`: `delegationScope: 'acting-command'`.

Explicit recommendation-seeking such as `What do you think, Commander?` must not emit `commandAuthority`.

Acceptance criteria:

- Ashes row-shape "Commander, you have the conn" can become bounded conn delegation.
- "What do you think, Commander?" stays recommendation-seeking, not conn transfer.
- "Your call, Commander" becomes bounded-decision delegation only when the surrounding scene supports it.

### Phase 6: Tests And Live Verification

Focused tests:

```powershell
node tools/scripts/test-command-authority-guidance.mjs
node tools/scripts/test-command-authority-state-delta.mjs
node tools/scripts/test-command-authority-mission-director.mjs
node tools/scripts/test-scene-handshake-settler.mjs
node tools/scripts/test-open-world-context-budget.mjs
node tools/scripts/test-prompt-dirty-domains.mjs
node tools/scripts/test-chat-native-runtime-flow.mjs
```

Live verification:

- Use the default-user Ashes save/chat.
- Verify installed SillyTavern extension copy is fresh if live browser proof matters.
- Generate a bridge beat before Whitaker gives the conn.
- Confirm formal reports route to Whitaker while the reply still yields a playable decision to Sam.
- Generate or inspect a beat after explicit conn delegation.
- Confirm reports can then route to Sam.

Full gate:

```powershell
node tools/scripts/run-alpha-gate.mjs
```

## Implementation Components

This section gives the concrete code-shaped pieces the implementation should start from. These snippets are intentionally close to the current codebase patterns in `src/context/context-orchestrator.mjs`, `src/context/scene-pacing-guidance.mjs`, `src/runtime/lens-prompt-scheduler.mjs`, and `src/runtime/state-delta-gateway.mjs`.

### Component 1: `src/context/command-authority-guidance.mjs`

Create a small context helper. Keep this file focused on normalization and prompt text. It should not mutate campaign state or run Director logic.

```js
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compact(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

const PLAYER_AUTHORITY_MODES = new Set([
  'xo',
  'delegated-xo',
  'mission-commander',
  'acting-captain',
  'captain',
  'uncertain'
]);

const DELEGATION_SCOPES = new Set([
  'none',
  'recommendation',
  'routine-execution',
  'bounded-decision',
  'conn',
  'acting-command',
  'full-command'
]);

const COMMANDER_PRESENCE_VALUES = new Set([
  'present',
  'offscreen',
  'absent',
  'incapacitated',
  'dead',
  'missing',
  'quarantined',
  'under-inquiry',
  'unknown'
]);

const COMMANDER_STATUS_VALUES = new Set([
  'active',
  'limited-duty',
  'unavailable',
  'relieved',
  'deceased',
  'missing',
  'under-review',
  'unknown'
]);

function enumValue(value, allowed, fallback) {
  const normalized = compact(value);
  return allowed.has(normalized) ? normalized : fallback;
}

function actorLabel(actor = {}, fallback = '') {
  const rank = compact(actor.rank);
  const name = compact(actor.name || actor.characterName || actor.id || fallback);
  if (!name) return fallback;
  if (rank && !name.toLowerCase().startsWith(`${rank.toLowerCase()} `)) return `${rank} ${name}`;
  return name;
}

function playerProfile(campaignState = {}, packageData = {}) {
  const player = campaignState.player || {};
  const lockedRole = packageData.characterCreation?.lockedRole || {};
  const commandStructure = packageData.ship?.commandStructure || {};
  return {
    id: compact(player.id || 'player-commander'),
    name: compact(player.name || player.characterName || 'the player character'),
    rank: compact(player.rank || lockedRole.rank || commandStructure.playerRank || 'Commander'),
    billet: compact(player.billet || lockedRole.billet || commandStructure.playerBillet || 'Executive Officer')
  };
}

function captainProfile(packageData = {}) {
  const lockedRole = packageData.characterCreation?.lockedRole || {};
  const commandStructure = packageData.ship?.commandStructure || {};
  const captainId = compact(
    lockedRole.captainId
    || commandStructure.commandingOfficer
    || commandStructure.captainId
  );
  const seniorCrew = asArray(packageData.crew?.senior);
  const captain = seniorCrew.find((crew) => compact(crew.id) === captainId)
    || seniorCrew.find((crew) => /commanding officer/i.test(compact(crew.billet)));
  return {
    id: compact(captain?.id || captainId || 'captain'),
    name: compact(captain?.name || lockedRole.captainName || 'the commanding officer').replace(/^Captain\s+/i, ''),
    rank: compact(captain?.rank || 'Captain'),
    billet: compact(captain?.billet || 'Commanding Officer')
  };
}

function commandStructureSignals({ campaignState = {}, packageData = {}, scene = {} } = {}) {
  const committed = campaignState.commandAuthority || {};
  const lockedRole = packageData.characterCreation?.lockedRole || {};
  const commandStructure = packageData.ship?.commandStructure || {};
  const packageBoundary = compact(lockedRole.captainAuthorityBoundary);
  const captainStatusText = compact(commandStructure.captainStatus || committed.commanderStatusText || '');
  const openingCondition = compact(packageData.ship?.openingCondition || '');
  const combinedText = `${packageBoundary} ${captainStatusText} ${openingCondition}`.toLowerCase();
  const actingCaptainHint = commandStructure.actingCaptainAfterPrelude === true
    || /acting captain/i.test(compact(lockedRole.roleLabel))
    || /acting command|acting captain|lawful succession/i.test(compact(lockedRole.commandAuthority));

  if (committed.playerAuthorityMode) {
    return {
      playerAuthorityMode: enumValue(committed.playerAuthorityMode, PLAYER_AUTHORITY_MODES, 'uncertain'),
      delegationScope: enumValue(committed.delegationScope, DELEGATION_SCOPES, 'none'),
      commanderPresence: enumValue(committed.commanderPresence, COMMANDER_PRESENCE_VALUES, 'unknown'),
      commanderStatus: enumValue(committed.commanderStatus, COMMANDER_STATUS_VALUES, 'unknown')
    };
  }

  if (/dead|death|dies|deceased/.test(combinedText)) {
    return { playerAuthorityMode: 'acting-captain', delegationScope: 'acting-command', commanderPresence: 'dead', commanderStatus: 'deceased' };
  }
  if (/missing|disappear/.test(combinedText)) {
    return { playerAuthorityMode: 'acting-captain', delegationScope: 'acting-command', commanderPresence: 'missing', commanderStatus: 'missing' };
  }
  if (/quarantine|medically unfit|injured|incapacitated|surgery/.test(combinedText)) {
    return { playerAuthorityMode: 'acting-captain', delegationScope: 'acting-command', commanderPresence: 'incapacitated', commanderStatus: 'unavailable' };
  }
  if (/ashore under inquiry|under inquiry|under review/.test(combinedText)) {
    return { playerAuthorityMode: 'acting-captain', delegationScope: 'acting-command', commanderPresence: 'under-inquiry', commanderStatus: 'under-review' };
  }
  if (actingCaptainHint && scene?.captainUnavailable === true) {
    return { playerAuthorityMode: 'acting-captain', delegationScope: 'acting-command', commanderPresence: 'absent', commanderStatus: 'unavailable' };
  }
  return { playerAuthorityMode: 'xo', delegationScope: 'recommendation', commanderPresence: 'present', commanderStatus: 'active' };
}

export function commandAuthorityProfile({ campaignState = {}, packageData = {}, scene = {} } = {}) {
  const player = playerProfile(campaignState, packageData);
  const captain = captainProfile(packageData);
  const committed = campaignState.commandAuthority || {};
  const signals = commandStructureSignals({ campaignState, packageData, scene });
  const playerLabel = actorLabel(player, 'the player character');
  const captainLabel = actorLabel(captain, 'the commanding officer');
  const captainActive = signals.commanderStatus === 'active'
    && ['present', 'offscreen'].includes(signals.commanderPresence)
    && signals.playerAuthorityMode !== 'acting-captain'
    && signals.playerAuthorityMode !== 'captain';
  const commandRecipientId = compact(committed.commandRecipientId)
    || (captainActive ? captain.id : player.id);
  const majorDecisionAuthorityId = compact(committed.majorDecisionAuthorityId)
    || (captainActive ? captain.id : player.id);
  const connHolderId = compact(committed.connHolderId)
    || (captainActive ? captain.id : player.id);
  const commandRecipientLabel = commandRecipientId === player.id ? playerLabel : captainLabel;
  const majorDecisionAuthorityLabel = majorDecisionAuthorityId === player.id ? playerLabel : captainLabel;

  return {
    version: 1,
    player,
    captain,
    playerAgencyTargetId: player.id,
    playerAgencyTargetLabel: playerLabel,
    commandRecipientId,
    commandRecipientLabel,
    majorDecisionAuthorityId,
    majorDecisionAuthorityLabel,
    connHolderId,
    legalCommanderId: compact(committed.legalCommanderId || captain.id),
    operationalCommanderId: compact(committed.operationalCommanderId || commandRecipientId),
    delegationSourceId: compact(committed.delegationSourceId || null) || null,
    delegationScope: enumValue(committed.delegationScope || signals.delegationScope, DELEGATION_SCOPES, 'none'),
    playerAuthorityMode: enumValue(committed.playerAuthorityMode || signals.playerAuthorityMode, PLAYER_AUTHORITY_MODES, 'uncertain'),
    commanderPresence: enumValue(committed.commanderPresence || signals.commanderPresence, COMMANDER_PRESENCE_VALUES, 'unknown'),
    commanderStatus: enumValue(committed.commanderStatus || signals.commanderStatus, COMMANDER_STATUS_VALUES, 'unknown'),
    captainAuthorityBoundary: compact(
      committed.captainAuthorityBoundary
      || packageData.characterCreation?.lockedRole?.captainAuthorityBoundary
      || (packageData.ship?.commandStructure?.captainRetainsFinalAuthority ? 'The commanding officer retains final legal command.' : '')
    ),
    playerAuthoritySummary: compact(
      committed.playerAuthoritySummary
      || campaignState.player?.role
      || packageData.characterCreation?.lockedRole?.commandAuthority
      || packageData.ship?.commandStructure?.playerRole
      || ''
    )
  };
}

export function commandAuthorityPromptLines(input = {}) {
  const profile = commandAuthorityProfile(input);
  const playerIsRecipient = profile.commandRecipientId === profile.playerAgencyTargetId;
  return [
    `Player agency target: ${profile.playerAgencyTargetLabel}, ${profile.player.billet}.`,
    `Command recipient: ${profile.commandRecipientLabel}.`,
    `Major decision authority: ${profile.majorDecisionAuthorityLabel}.`,
    `Player authority mode: ${profile.playerAuthorityMode}; delegation scope: ${profile.delegationScope}.`,
    profile.captainAuthorityBoundary ? `Captain authority boundary: ${profile.captainAuthorityBoundary}` : null,
    playerIsRecipient
      ? 'Crew may route formal status reports and command options to the player unless committed state establishes a temporary substitute.'
      : 'Crew may answer the player character\'s direct questions, but formal bridge reports and major options go to the command recipient.',
    'A captain or lawful commander may delegate a bounded decision, the conn, or acting command; make the delegation explicit in prose.',
    'Do not treat player agency as automatic command authority.'
  ].filter(Boolean);
}

export function commandAuthorityPromptBlock(input = {}) {
  const lines = commandAuthorityPromptLines(input);
  return {
    id: 'command-authority',
    title: 'Command Authority',
    mustInclude: true,
    salienceScore: 100,
    placement: 'inPrompt',
    depth: 0,
    ttl: 'turn',
    priority: 997,
    lensPromptBudgetLane: 'activeScene',
    reason: 'Separates player agency from in-universe command recipient and decision authority.',
    sourceIds: ['command-authority', input.campaignState?.player?.id].filter(Boolean),
    content: lines.map((line) => `- ${line}`).join('\n')
  };
}

export const __commandAuthorityGuidanceTestHooks = Object.freeze({
  PLAYER_AUTHORITY_MODES,
  DELEGATION_SCOPES,
  COMMANDER_PRESENCE_VALUES,
  COMMANDER_STATUS_VALUES,
  commandStructureSignals
});
```

Implementation notes:

- The `scene?.captainUnavailable` hint is deliberately optional. It gives future scene snapshots a way to override package defaults without parsing prose.
- The initial normalizer can use package opening text as a fallback, but committed `campaignState.commandAuthority` must win whenever present.
- Keep the prompt lines compact. This block is a high-priority guard, not a character bible.

### Component 2: Turn-Yield Wording Patch

Modify `turnYieldGuidance(...)` in `src/context/scene-pacing-guidance.mjs`.

Replace:

```js
`Yield target: ${addressedPlayer}.`,
```

with:

```js
`Player agency target: ${addressedPlayer}.`,
'This is who the reply yields playable agency to; it is not necessarily the current command recipient.',
```

The surrounding return should become:

```js
return {
  id: 'turn-yield',
  title: 'Turn Yield Contract',
  lines: [
    ...turnYieldContractLines(),
    `Player agency target: ${addressedPlayer}.`,
    'This is who the reply yields playable agency to; it is not necessarily the current command recipient.',
    lastAction ? `Player's latest action: ${lastAction}` : null,
    lastAction && /\?/.test(lastAction)
      ? 'If the player asked a direct question, answer that question briefly, then yield.'
      : 'If the player made a command or approach, show the immediate response to that action, then yield.',
    isAshesOfPeace(packageData) && activeMissionId(campaignState, scene) === 'prelude-a-ship-underway'
      ? 'For Ashes of Peace opening play, do not compress arrival, Bronn handoff, Whitaker handoff, and Reach strategy into one reply.'
      : null
  ].filter(Boolean)
};
```

### Component 3: Context Orchestrator Integration

Add the import in `src/context/context-orchestrator.mjs`:

```js
import { commandAuthorityPromptBlock } from './command-authority-guidance.mjs';
```

Build the block near the existing reply header, pacing, and yield guidance setup:

```js
const replyHeaderBlock = createCampaignReplyHeaderPromptBlock(state);
const commandAuthorityBlock = commandAuthorityPromptBlock({
  campaignState: state,
  packageData,
  scene
});
const pacing = scenePacingGuidance({ campaignState: state, packageData, scene });
```

Insert the normalized candidate immediately after `player-character` and before `turn-yield`:

```js
normalizeCandidate(state, {
  id: 'player-character',
  title: 'Player Character',
  mustInclude: true,
  salienceScore: 100,
  placement: 'inPrompt',
  depth: 0,
  ttl: 'campaign',
  priority: 999,
  reason: 'The host model must address and frame the user-made player character correctly.',
  sourceIds: [state?.player?.id || 'player-character'].filter(Boolean),
  content: [
    `Player character: ${playerIdentityLine(state?.player || {})}`,
    'Address and refer to the player character using this identity. Do not invent a different name, rank, billet, or callsign.'
  ].join('\n')
}),
normalizeCandidate(state, commandAuthorityBlock),
normalizeCandidate(state, {
  id: 'turn-yield',
  title: 'Turn Yield Contract',
  mustInclude: true,
  salienceScore: 100,
  placement: 'inPrompt',
  depth: 0,
  ttl: 'turn',
  priority: 996,
  lensPromptBudgetLane: 'activeScene',
  reason: 'The host model must stop after one playable beat and yield agency back to the player.',
  content: list(yieldGuidance.lines)
}),
```

The current `promptKeyForCandidateId(...)` turns `id: 'command-authority'` into `directive.campaign.command-authority`, so no custom prompt-key plumbing is needed in `normalizeCandidate(...)`.

### Component 4: Scheduler Required Keys And Dirty Domains

Update `src/runtime/lens-prompt-scheduler.mjs`:

```js
export const PROMPT_DIRTY_DOMAIN_ALIASES = Object.freeze({
  threadLedger: 'missionQuestThread',
  questLedger: 'missionQuestThread',
  mission: 'missionQuestThread',
  missionThread: 'missionQuestThread',
  narrativeThread: 'missionQuestThread',
  commandAuthority: 'command',
  commandBearing: 'command',
  commandCulture: 'command',
  commandCompetence: 'command',
  commandLog: 'command',
  relationships: 'crewShipRelationship',
  relationship: 'crewShipRelationship',
  crew: 'crewShipRelationship',
  ship: 'crewShipRelationship',
  factIndex: 'continuity',
  sceneHandshake: 'continuity',
  sceneReconciliation: 'continuity',
  sourceFrame: 'sourceBinding',
  sourceSettlement: 'sourceBinding',
  terminalCheckpoint: 'terminalRecovery'
});

export const REQUIRED_HOST_CONTINUE_PROMPT_KEYS = Object.freeze([
  'directive.contract',
  'directive.campaign.player-character',
  'directive.campaign.command-authority',
  'directive.campaign.turn-yield'
]);
```

Update `promptBlockBudgetLane(...)` if direct key matching is needed:

```js
if (/^directive\.campaign\.command-authority$/i.test(key)) return 'activeScene';
```

Place that before the broader `directive.command` or `directive.lens` checks so the block stays in the intended lane.

### Component 5: Mutable State Root And Checkpoint Roots

If durable command authority lands in campaign state, update `src/runtime/state-delta-gateway.mjs`:

```js
export const DIRECTIVE_MUTABLE_STATE_DOMAINS = Object.freeze([
  'campaign',
  'player',
  'crew',
  'ship',
  'mission',
  'worldState',
  'timeLedger',
  'storyArcLedger',
  'questLedger',
  'dynamicQuestCatalog',
  'knowledgeLedger',
  'threadLedger',
  'eventLedger',
  'endConditionLedger',
  'attentionState',
  'pressureLedger',
  'relationships',
  'commandCulture',
  'commandAuthority',
  'commandBearing',
  'commandCompetence',
  'values',
  'directives',
  'campaignTracks',
  'campaignAssets',
  'turnLedger',
  'commandLog',
  'captainState',
  'campaignChatBinding',
  'activationJournal',
  'conclusion',
  'continuity',
  'sceneReconciliation',
  'sceneHandshake',
  'runtimeTracking'
]);
```

Update `src/runtime/turn-commit-coordinator.mjs`:

```js
const MECHANICS_DOMAINS = Object.freeze([
  'campaign', 'crew', 'ship', 'mission', 'worldState', 'timeLedger', 'storyArcLedger',
  'questLedger', 'dynamicQuestCatalog', 'knowledgeLedger', 'threadLedger',
  'eventLedger', 'attentionState', 'pressureLedger',
  'relationships', 'commandCulture', 'commandAuthority', 'commandBearing', 'commandCompetence', 'values',
  'directives', 'campaignTracks', 'campaignAssets', 'turnLedger', 'commandLog',
  'captainState'
]);

const MECHANICS_CHECKPOINT_STATE_ROOTS = Object.freeze([
  'activeCampaignPackage',
  'attentionState',
  'campaign',
  'campaignAssets',
  'campaignChatBinding',
  'campaignTracks',
  'canon',
  'captainState',
  'commandAuthority',
  'commandBearing',
  'commandCompetence',
  'commandCulture',
  'commandLog',
  'continuity',
  'crew',
  'directives',
  'dynamicQuestCatalog',
  'eventLedger',
  'flags',
  'knowledgeLedger',
  'mission',
  'player',
  'pressureLedger',
  'questLedger',
  'relationships',
  'runtimeResume',
  'sceneReconciliation',
  'settings',
  'ship',
  'storyArcLedger',
  'threadLedger',
  'timeLedger',
  'turnLedger',
  'ui',
  'values',
  'worldState'
]);
```

### Component 6: Command Authority Validation

Add validation close to the existing state-delta gateway helpers. The exact hook can be either:

- a domain-specific validator inside `applyStateDeltaOperations(...)`; or
- a small normalizer called before command-authority patches are accepted.

Implementation shape:

```js
const COMMAND_AUTHORITY_ENUMS = Object.freeze({
  delegationScope: new Set(['none', 'recommendation', 'routine-execution', 'bounded-decision', 'conn', 'acting-command', 'full-command']),
  playerAuthorityMode: new Set(['xo', 'delegated-xo', 'mission-commander', 'acting-captain', 'captain', 'uncertain']),
  commanderPresence: new Set(['present', 'offscreen', 'absent', 'incapacitated', 'dead', 'missing', 'quarantined', 'under-inquiry', 'unknown']),
  commanderStatus: new Set(['active', 'limited-duty', 'unavailable', 'relieved', 'deceased', 'missing', 'under-review', 'unknown'])
});

function knownCommandActorIds(campaignState = {}) {
  return new Set([
    'player-commander',
    campaignState.player?.id,
    campaignState.commandAuthority?.legalCommanderId,
    campaignState.commandAuthority?.operationalCommanderId,
    campaignState.commandAuthority?.commandRecipientId,
    campaignState.commandAuthority?.majorDecisionAuthorityId,
    campaignState.captainState?.crewId,
    ...asArray(campaignState.crew?.seniorCrewIds)
  ].map(compact).filter(Boolean));
}

function validateCommandAuthorityState(value = {}, campaignState = {}) {
  if (!isObject(value)) {
    const error = new Error('commandAuthority must be an object.');
    error.code = 'DIRECTIVE_COMMAND_AUTHORITY_INVALID';
    throw error;
  }
  for (const [field, allowed] of Object.entries(COMMAND_AUTHORITY_ENUMS)) {
    if (value[field] === undefined) continue;
    if (!allowed.has(compact(value[field]))) {
      const error = new Error(`commandAuthority.${field} has invalid value "${value[field]}".`);
      error.code = 'DIRECTIVE_COMMAND_AUTHORITY_ENUM_INVALID';
      error.details = { field, allowed: [...allowed] };
      throw error;
    }
  }
  const knownActorIds = knownCommandActorIds(campaignState);
  for (const field of ['connHolderId', 'commandRecipientId', 'majorDecisionAuthorityId', 'legalCommanderId', 'operationalCommanderId', 'delegationSourceId']) {
    const actorId = compact(value[field]);
    if (!actorId) continue;
    if (!knownActorIds.has(actorId)) {
      const error = new Error(`commandAuthority.${field} references unknown actor "${actorId}".`);
      error.code = 'DIRECTIVE_COMMAND_AUTHORITY_ACTOR_UNKNOWN';
      error.details = { field, actorId, knownActorIds: [...knownActorIds] };
      throw error;
    }
  }
  return {
    version: 1,
    ...cloneJson(value),
    lastUpdatedAt: value.lastUpdatedAt || timestamp(),
    sourceOutcomeId: compact(value.sourceOutcomeId || value.outcomeId || '') || null
  };
}
```

Acceptance tests should cover all four error paths:

- non-object `commandAuthority`;
- invalid enum;
- unknown actor id;
- valid bounded conn delegation.

### Component 7: Test Script Skeleton

Add `tools/scripts/test-command-authority-guidance.mjs`.

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  commandAuthorityProfile,
  commandAuthorityPromptLines,
  commandAuthorityPromptBlock
} from '../../src/context/command-authority-guidance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const bundledRoot = path.join(repoRoot, 'packages', 'bundled');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function packageJson(relativePath) {
  return readJson(path.join(repoRoot, relativePath));
}

function baseState(packageData, overrides = {}) {
  const lockedRole = packageData.characterCreation?.lockedRole || {};
  return {
    campaign: { id: packageData.storyArcs?.campaign?.id || packageData.manifest?.slug || 'campaign' },
    player: {
      id: 'player-commander',
      name: 'Test Commander',
      rank: lockedRole.rank || 'Commander',
      billet: lockedRole.billet || 'Executive Officer',
      role: lockedRole.commandAuthority || ''
    },
    crew: {
      seniorCrewIds: (packageData.crew?.senior || []).map((crew) => crew.id).filter(Boolean)
    },
    captainState: {
      crewId: lockedRole.captainId || packageData.ship?.commandStructure?.commandingOfficer || packageData.ship?.commandStructure?.captainId || null
    },
    ...overrides
  };
}

function assertPromptContains(lines, pattern, message) {
  assert.match(lines.join('\n'), pattern, message);
}

const ashes = packageJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const ashesProfile = commandAuthorityProfile({ campaignState: baseState(ashes), packageData: ashes });
assert.equal(ashesProfile.playerAuthorityMode, 'xo');
assert.notEqual(ashesProfile.commandRecipientId, ashesProfile.playerAgencyTargetId);
assertPromptContains(commandAuthorityPromptLines({ campaignState: baseState(ashes), packageData: ashes }), /Do not treat player agency as automatic command authority/);

const ashesConnProfile = commandAuthorityProfile({
  campaignState: baseState(ashes, {
    commandAuthority: {
      playerAuthorityMode: 'delegated-xo',
      delegationScope: 'conn',
      commandRecipientId: 'player-commander',
      majorDecisionAuthorityId: 'mara-whitaker',
      connHolderId: 'player-commander',
      commanderPresence: 'offscreen',
      commanderStatus: 'active'
    }
  }),
  packageData: ashes
});
assert.equal(ashesConnProfile.commandRecipientId, 'player-commander');
assert.equal(ashesConnProfile.majorDecisionAuthorityId, 'mara-whitaker');

const actingPackages = [
  ['Aster Vale', 'packages/bundled/aster-vale/unseen-border.campaign-package.json'],
  ['Celandine', 'packages/bundled/celandine/enemys-garden.campaign-package.json'],
  ['Eudora Vale', 'packages/bundled/eudora-vale/broken-accord.campaign-package.json'],
  ['Glass Harbor', 'packages/bundled/glass-harbor/drowned-constellation.campaign-package.json'],
  ['Serein', 'packages/bundled/serein/black-current.campaign-package.json']
];

for (const [label, relativePath] of actingPackages) {
  const packageData = packageJson(relativePath);
  const profile = commandAuthorityProfile({ campaignState: baseState(packageData), packageData });
  assert.equal(profile.commandRecipientId, 'player-commander', `${label}: player should be command recipient`);
  assert.ok(['acting-captain', 'captain'].includes(profile.playerAuthorityMode), `${label}: player should have acting/captain mode`);
  const block = commandAuthorityPromptBlock({ campaignState: baseState(packageData), packageData });
  assert.equal(block.id, 'command-authority');
  assert.match(block.content, /Command recipient:/);
}

console.log('Command authority guidance tests passed.');
```

### Component 8: Existing Test Updates

Update `tools/scripts/test-chat-native-runtime-flow.mjs` near the activation prompt assertions:

```js
assert.equal(
  host.prompt.inspect().blocks.some((block) => block.promptKey === 'directive.campaign.command-authority'),
  true,
  'Activation prompt should include command-authority contract.'
);
assert.equal(
  host.prompt.inspect().blocks.some((block) => /Yield target:/i.test(block.content || block.text || '')),
  false,
  'Prompt should no longer use yield-target wording that implies command recipient.'
);
assert.equal(
  host.prompt.inspect().blocks.some((block) => /Player agency target:/i.test(block.content || block.text || '')),
  true,
  'Prompt should name player agency target separately from command recipient.'
);
```

Raise the prompt block cap only if the new block makes the existing cap fail. The preferred fix is to keep the command block compact and keep mandatory blocks outside ordinary scene-content budget.

Update prompt-key assertions in any scheduler tests:

```js
assert.equal(
  missingRequiredPromptKeys([
    'directive.contract',
    'directive.campaign.player-character',
    'directive.campaign.command-authority',
    'directive.campaign.turn-yield'
  ]).length,
  0
);
```

### Component 9: Prompt Shape Regression Fixture

Add a fixture-style assertion to prevent the original Ashes failure from returning:

```js
const captainPresentLines = commandAuthorityPromptLines({
  packageData: ashes,
  campaignState: baseState(ashes, {
    commandAuthority: {
      playerAuthorityMode: 'xo',
      delegationScope: 'recommendation',
      commandRecipientId: 'mara-whitaker',
      majorDecisionAuthorityId: 'mara-whitaker',
      connHolderId: 'mara-whitaker',
      commanderPresence: 'present',
      commanderStatus: 'active'
    }
  })
});

assertPromptContains(captainPresentLines, /Player agency target: Commander Test Commander/);
assertPromptContains(captainPresentLines, /Command recipient: Captain Mara Whitaker/);
assertPromptContains(captainPresentLines, /Crew may answer the player character's direct questions/);
assertPromptContains(captainPresentLines, /formal bridge reports and major options go to the command recipient/);
```

Add the inverse for acting command:

```js
const actingLines = commandAuthorityPromptLines({
  packageData: eudora,
  campaignState: baseState(eudora, {
    commandAuthority: {
      playerAuthorityMode: 'acting-captain',
      delegationScope: 'acting-command',
      commandRecipientId: 'player-commander',
      majorDecisionAuthorityId: 'player-commander',
      connHolderId: 'player-commander',
      commanderPresence: 'dead',
      commanderStatus: 'deceased'
    }
  })
});

assertPromptContains(actingLines, /Command recipient: Commander Test Commander/);
assertPromptContains(actingLines, /Crew may route formal status reports and command options to the player/);
```

## Regression Scenarios

### Captain Present, XO Player

Input state:

- player is XO;
- captain is present and active;
- no conn delegation.

Expected:

- formal bridge report goes to captain;
- player receives playable opportunity as recommendation, question, or delegated action;
- major route deviation requires captain approval.

### Captain Present, Bounded Delegation

Input state:

- captain is present;
- captain explicitly says "Your call, Commander";
- scope is probe launch or routine response posture.

Expected:

- crew can report execution details to player for that bounded decision;
- captain remains major decision authority.

### Conn Delegated

Input state:

- captain leaves bridge and says player has the conn.

Expected:

- bridge status reports route to player;
- irreversible mission deviation still checks major-decision authority unless state grants broader command.

### Acting Captain After Succession

Input state:

- captain dead, missing, injured, quarantined, or ashore under inquiry;
- package or committed state grants acting command.

Expected:

- crew reports to player;
- former captain affects culture, review, grief, or legitimacy, not live report routing.

### Ambiguous Command Status

Input state:

- package says captain retains final authority;
- scene does not say whether captain is present;
- player attempts irreversible action.

Expected:

- prompt asks prose to make authority explicit;
- Director can pause, counteroffer, or route approval through the appropriate actor.

## Acceptance Criteria

The patch is complete when:

- The host prompt always distinguishes player agency target from command recipient.
- Every bundled campaign resolves a command-authority profile.
- Ashes no longer makes bridge officers route all formal decisions through the XO while Whitaker is present.
- Acting-captain campaigns still route reports and options to the player.
- Delegation is explicit and bounded unless committed state grants broader command.
- Mission Director authority checks consume the profile.
- Prompt-budget tests prove the block is present without evicting required continuity.
- Live default-user Ashes verification demonstrates captain-present and conn-delegated behavior.

## Risks

- Overcorrection could make captains too dominant and reduce player agency.
- Prompt bloat could crowd out scene continuity if the block is too verbose.
- Package text may be inconsistent across draft campaigns; the normalizer must fail gracefully.
- Scene Handshake delegation detection could overcommit casual phrasing if the validator is too loose.
- Acting-captain campaigns could regress if captain-boundary text is treated as active command authority after succession.

## Mitigations

- Keep the prompt block compact and rule-based.
- Use committed state over package defaults.
- Treat "player agency target" as always active even when the captain holds command.
- Require explicit authority or validated succession for durable command transfers.
- Test every bundled campaign authority shape.
- Verify with live Ashes because that is the observed failure case.
