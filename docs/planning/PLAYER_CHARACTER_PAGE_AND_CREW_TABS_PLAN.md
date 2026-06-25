# Player Character Page And Crew Tabs Plan

## Status

This is the companion implementation plan for the player-facing Character page inside the Crew drawer.

It depends on [Command Bearing User-Facing System Plan](COMMAND_BEARING_USER_FACING_SYSTEM_PLAN.md), [Command Bearing Backend Development Plan](COMMAND_BEARING_BACKEND_DEVELOPMENT_PLAN.md), [Command Bearing System](../design/COMMAND_BEARING_SYSTEM.md), [Character Creator Model](../design/CHARACTER_CREATOR_MODEL.md), and [Crew And Relationship Model](../design/CREW_AND_RELATIONSHIP_MODEL.md).

The phased multi-agent build plan for this Character/Crew work and its Command Bearing dependencies is [Command Bearing Agent Execution Plan](COMMAND_BEARING_AGENT_EXECUTION_PLAN.md).

Directive is pre-alpha, so the Crew drawer should be updated in place. Do not preserve the old single-view Crew drawer if the new Character/Crew split is clearer.

## Goal

The Crew drawer should become a two-tab personnel surface:

- `Character`: the player character record, portrait, command stats, Command Bearing record, and player-facing interaction history.
- `Crew`: the existing senior staff roster and Duty Roster inspector.

This gives the player one obvious place to answer:

- Who is my character?
- What command resources do I currently have?
- How has my command style developed?
- Which crew interactions changed how people see me?
- Where do I inspect the senior staff?

The Character page should not become a tabletop character sheet, a hidden-stat dashboard, or a relationship-meter screen.

## Core Decisions

### Add Local Tabs Inside The Crew Drawer

Create local Crew drawer tabs:

```text
[Character] [Crew]
```

The tabs are local to the Crew drawer. They should not add top-level shell routes.

Implementation expectations:

- tab switching should update only the content below the Crew header;
- switching tabs should not snap the drawer/page scroll to the top;
- the active subtab should be reset by the existing runtime reset behavior;
- tab state may be remembered during the current drawer session but should not become campaign state;
- mobile layout should keep the tabs compact and reachable above the content.

### Character Owns The Player Record

The Character tab owns the player character's public and player-facing record.

It should show:

- player name;
- rank;
- billet;
- species;
- pronouns or form of address where available;
- current ship/posting;
- imported player portrait or fallback portrait;
- creator dossier summary;
- service background and formative experience;
- selected traits and flaw;
- personal values when available;
- command authority lane;
- Command Bearing rank/marks/points;
- banked Inspiration and Resolve points;
- recent Command Bearing marks, spends, and recovery records;
- recent player-facing crew interaction history.

This page is for inspection and orientation. It should not include the pre-send `Ready Inspiration` / `Ready Resolve` controls; those belong in Assist because they are composer-adjacent actions.

### Crew Keeps The Senior Staff Roster

The Crew tab should preserve the existing Senior Staff Roster page and Duty Roster behavior.

It should continue to show:

- senior staff roster rows;
- division/rank treatment;
- selected officer dossier;
- public biography;
- visible relationship posture;
- current pressure;
- open work;
- recent command memory;
- open threads;
- existing More/Less disclosure for long text.

The first implementation may keep the player commander row in the Duty Roster if current state still includes it. The target direction is that the full player record lives in `Character`, while `Crew` focuses on non-player senior staff and their current relationship to command.

## Character Tab Content

### Header

The first viewport should make the player character immediately recognizable.

Recommended header:

```text
Player Character

[portrait]
Commander Talia Serrin
Executive Officer, U.S.S. Breckenridge
Vulcan / she-her
```

The portrait area should reuse existing player portrait support:

- show imported portrait when `state.player.portrait` exists;
- show the established comm-badge/fallback portrait when no import exists;
- expose Import/Change/Remove only where the host supports player portrait storage;
- keep portrait controls compact and clearly attached to the portrait.

### Command Bearing Summary

Command Bearing should be visible enough that the player understands their current command resources without opening Assist.

Recommended compact card:

```text
Command Bearing
Reserve 1 / 2

Inspiration  Proven      Marks 5 / 9    Points 1
Resolve      Established Marks 2 / 5    Points 0
```

Fields:

- track name;
- rank title;
- current rank number if useful;
- current marks;
- next-rank threshold;
- banked points;
- track point cap;
- shared reserve capacity;
- last recovery status if player-facing.

Do not show hidden eligibility, hidden award potential, model scores, or raw evaluator output.

### Command Bearing Evidence

Add a visible evidence section that shows meaningful decisions and actions that may support future Command Marks.

This should not be labeled as XP in the player UI. Use Command Bearing language:

```text
Command Bearing Evidence

Resolve evidence
Accepted the cost of delaying launch after Cross identified a power-grid risk.
Consequence: Lost time, preserved ship capability.
Status: May support a future Resolve Mark.

Inspiration evidence
Invited Saye to challenge the sensor assumptions in front of the staff.
Consequence: Improved confidence in the final plan.
Status: Supporting evidence.
```

Evidence display rules:

- show the player-facing action summary;
- show the visible consequence or cost;
- show the likely track signal only when player-safe;
- show whether the evidence is open, supporting, reviewed, or part of an awarded Mark;
- link to the source Command Log or outcome when available;
- keep weak evidence de-emphasized so the page does not become a feed of minor posts.

Evidence is not a Mark. The UI should make that distinction clear:

- `Evidence`: a remembered action that may matter later.
- `Mark Review`: an arc-end or chapter-end check that decides whether a Mark is awarded.
- `Command Mark`: the actual permanent progression unit.

Do not show model scores, hidden eligibility notes, hidden award potential, or unreviewed Director reasoning.

### Command Bearing History

Add a concise history section:

```text
Recent Command Bearing

Resolve evidence: Accepted the cost of delaying launch to protect the power grid.
Resolve Mark earned: Held the evacuation line under political pressure.
Inspiration spent: Failure -> Partial Success during the Hesperus hearing.
Recovery: Safe transit restored 1 Inspiration point.
```

History should include:

- recent evidence;
- arc-end Mark Reviews;
- recent marks earned;
- recent readied-point spends;
- recent recovery events;
- result-band improvements;
- visible rationale;
- outcome or Command Log references when available.

Keep it short by default. Use `More` / `Less` disclosure or a `View older records` affordance if the history grows.

### Player Dossier

The Character tab should reuse Character Creator output:

- public biography;
- public reputation;
- identity summary;
- service summary;
- career background;
- formative experience;
- assignment reason;
- traits;
- flaw;
- player-entered personal values.

This section should read like a service record, not a build sheet. Keep it compact and collapsible.

### Personal Interactions And Standing

Add a player-facing interaction log that summarizes notable personal interactions with crew and how they affected visible standing.

This should not be a raw relationship score table.

Recommended copy shape:

```text
Crew Interactions

Mara Whitaker - Professional confidence improved
She remembers that Serrin accepted responsibility for the Hesperus delay.

Imani Cross - Integrity trust improved
She remembers that Serrin accepted her warning about the power grid.

Kieran Vale - Confidence strained
He remembers being overruled during the pursuit.
```

Each entry should include:

- crew member name;
- visible dimension or category when safe, such as `professional confidence`, `integrity trust`, or `personal rapport`;
- direction, such as `improved`, `strained`, `mixed`, `steady`, or `unresolved`;
- one player-safe memory summary;
- optional source outcome or Command Log title;
- stardate or chapter if available.

Do not show:

- numeric relationship values;
- hidden relationship deltas;
- private NPC secrets;
- raw evaluator output;
- unrevealed red lines;
- hidden motivations;
- source JSON.

If a relationship memory is hidden, latent, or Director-only, it should not appear here.

### Player-Perceived Relationship Changes

Relationship changes shown on the Character page should be phrased as what the player character could plausibly perceive, not omniscient access to another character's internal state.

Use a player-facing impact ladder:

- `Great Strain`
- `Strain`
- `Slight Strain`
- `No Clear Change`
- `Slight Improvement`
- `Improvement`
- `Great Improvement`

Use `Mixed` or `Unclear` when the scene cuts in multiple directions or when the player character could not reasonably read the result.

Recommended copy shape:

```text
Mara Whitaker - Professional confidence slightly strained
What Serrin noticed: Whitaker accepted the order, but stopped defending it once Bronn challenged the timeline.
Visible consequence: Future staff briefings may require clearer operational grounding.
```

The source model call should output both the underlying hidden relationship update and a separate player-safe perception record. The Character page should render only the perception record.

Perception entries may be attached to Command Bearing evidence when the relationship effect is part of the action's cost or consequence.

### Current Standing Summary

The Character page may show a qualitative standing overview across senior staff:

```text
Standing With Senior Staff

Strong professional confidence: Cross, Sato
Still evaluating: Whitaker, Bronn
Strained confidence: Vale
```

This should be derived from player-safe relationship bands and visible memory, not raw values.

Avoid one-number approval meters. A visible summary should help the player remember the story, not optimize hidden affection.

## Data Sources

Use existing authoritative state where possible:

- `state.player` for identity, rank, billet, species, portrait, dossier, traits, service background, personal values, and authority profile;
- `state.commandBearing` target model, or current pre-alpha `state.commandStyle` until renamed, for Command Bearing ranks, marks, points, reserve, recovery, and spend ledgers;
- `state.commandBearing.evidenceLedger` for player-facing evidence records;
- `state.commandBearing.reviewLedger` for arc-end Mark Review records;
- `state.relationships.seniorCrew` for qualitative current posture only after player-safe projection;
- `state.relationships.memoryLedger` for player-safe interaction memories;
- `state.relationships.perceptionLedger` or equivalent projection for what the player character could plausibly perceive from relationship changes;
- `state.commandLog.entries` for source titles, outcome references, and visible consequence summaries;
- `state.turnLedger.entries` for committed outcome ids and Command Bearing spend references;
- package crew data for senior staff names, rank, billet, and portrait references.

If the current state shape cannot safely produce a player-facing interaction log, add a normalized projection helper rather than reading raw ledgers directly in UI code.

Recommended projection shape:

```text
playerCharacterView:
  identity
  portrait
  dossier
  serviceRecord
  commandBearingSummary
  commandBearingEvidence[]
  commandBearingReviews[]
  commandBearingHistory[]
  currentStandingSummary[]
  crewInteractionLog[]
  relationshipPerceptions[]
  guards
```

The UI should render this projection instead of assembling hidden-state filters inline.

## Relationship To Command Bearing Plan

The Command Bearing user-facing system has two surfaces:

- Assist owns near-composer point counts, pre-send checks, and ready controls.
- Character owns the durable Command Bearing record.

The Character tab should therefore link conceptually to the Assist controls without duplicating them:

- show banked Inspiration and Resolve points;
- show rank/marks/progression;
- show open Command Bearing evidence and reviewed evidence;
- show arc-end Mark Review results;
- show recent marks/spends/recovery;
- explain that points are readied from Assist near the chat composer;
- avoid adding `Ready Inspiration` / `Ready Resolve` buttons here.

When the Command Bearing plan renames `commandStyle` to `commandBearing`, this Character page should update at the same time.

## UI Ownership And Layout

### Drawer Header

The Crew drawer header should be neutral enough to cover both subtabs.

Suggested text:

```text
Personnel
Review your command record and the senior staff roster.
```

Avoid making the header a status dashboard.

### Character Layout

Recommended content order:

1. Player identity and portrait.
2. Command Bearing summary.
3. Command Bearing evidence and recent reviews.
4. Current standing summary.
5. Recent crew interactions.
6. Service record / dossier.
7. Command Bearing history.

This order puts current-play value before long biography.

### Crew Layout

The Crew tab can keep the current structure:

1. Senior Staff Roster header.
2. Readiness/status blocks only when meaningful.
3. Duty Roster.
4. Selected officer dossier.

Existing Crew roster overflow, More/Less disclosure, division bars, and player-safe hidden-value rules still apply.

## Implementation Slices

### Slice 1: Planning And Cross-Links

- Add this plan.
- Link it from [Command Bearing User-Facing System Plan](COMMAND_BEARING_USER_FACING_SYSTEM_PLAN.md).
- Add the plan to [Documentation Index](../DOCUMENTATION_INDEX.md).

### Slice 2: Crew Drawer Local Tabs

- Add `Character` and `Crew` local tabs to `src/ui/crew-panel.js`.
- Preserve local scroll behavior when switching tabs.
- Add reset behavior for active Crew subtab.
- Keep existing Senior Staff Roster content under the `Crew` tab.

### Slice 3: Player Character Projection

- Add a player-safe projection helper for the Character tab.
- Normalize Command Bearing summary and history.
- Normalize Command Bearing evidence and Mark Review records.
- Normalize crew interaction memories without leaking raw relationship values.
- Normalize player-perceived relationship changes without exposing hidden deltas or private NPC thoughts.
- Add empty/guard states for no active campaign, wrong chat, and missing player state.

### Slice 4: Character Tab UI

- Render player identity, rank, billet, portrait, and dossier summary.
- Render Command Bearing rank/marks/points/reserve.
- Render Command Bearing evidence and reviewed Mark awards.
- Render current standing summary and recent interaction log.
- Render player-perceived relationship changes using qualitative impact labels.
- Render service record details with disclosure for long copy.
- Reuse existing portrait import/change/remove support.

### Slice 5: Docs, Tips, And Visual Targets

- Update Operator Manual Crew Route section from single roster page to Character/Crew subtabs.
- Update Directive Tips anchors for player character, Command Bearing record, and crew interaction log.
- Add or update documentation render tracking for Character tab desktop and mobile states.
- Consider a visual target brief for the new Character tab if implementation needs layout iteration.

### Slice 6: Tests And Verification

- Extend shell/UI tests to assert both local tabs render.
- Assert the Crew tab still renders the existing Duty Roster.
- Assert the Character tab shows player identity and portrait fallback.
- Assert Command Bearing points/ranks render from authoritative state.
- Assert Command Bearing evidence renders separately from actual earned Marks.
- Assert arc-end Mark Review entries render with awarded track or no-award summary.
- Assert relationship perception entries render without exposing hidden deltas or private NPC thoughts.
- Assert raw relationship values and hidden memories do not appear.
- Assert long interaction/dossier copy uses existing disclosure behavior.
- Run the established Crew/Mission UI proof path and alpha gate after implementation.

## Acceptance Criteria

The Character/Crew tab split is ready when:

- the Crew drawer has `Character` and `Crew` local tabs;
- `Character` shows the player character name, rank, billet, portrait/fallback, and service record;
- `Character` shows Command Bearing ranks, marks, banked points, reserve capacity, and recent history;
- `Character` shows Command Bearing evidence without presenting it as automatic XP or an earned Mark;
- `Character` shows arc-end Mark Review results separately from open evidence;
- `Character` shows player-safe crew interaction memories and qualitative standing changes;
- `Character` phrases relationship shifts as player-perceived cues and qualitative impact labels;
- `Character` never exposes raw relationship numbers, hidden deltas, hidden memories, or evaluator output;
- `Crew` preserves the existing Senior Staff Roster and Duty Roster inspector;
- local tab switching does not snap the drawer scroll or refresh the whole route;
- portrait import/change/remove still works for the player character where supported;
- wrong-chat/no-campaign guards follow existing Crew/Mission guard patterns;
- docs and visual render tracking describe the new two-tab Crew drawer.

## Non-Goals

This pass should not add:

- a point-buy character sheet;
- generic attributes or skills unrelated to active Directive systems;
- visible relationship meters;
- per-message XP feeds;
- hidden-value dashboards;
- editable Command Bearing totals;
- crew affection optimization UI;
- pre-send Command Bearing ready buttons outside Assist;
- a new top-level `Character` route.
