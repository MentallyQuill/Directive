# Player-Facing Information Architecture Design

**Status:** Approved design

**Date:** 2026-07-20

**Scope:** Simplify Directive's player-facing shell into a game companion for reorientation, planning, and recall. Remove redundant operational surfaces, make Mission the unified quest journal, and project useful information into Mission, Crew, and Ship instead of adding Intel or Log drawers.

## Product Identity

Directive is the game screen around the chat, not a second game layered over it. Chat remains the primary play surface. Opening Directive should feel like opening a field guide, quest journal, or Pip-Boy: the player pauses to remember what matters, inspect constraints, choose what to focus on, and return to play.

The primary reference is the clean Field Guide structure of *Hogwarts Legacy*. *Fallout 4*, *Baldur's Gate 3*, and *Red Dead Redemption 2* supply supporting patterns: contextual records, one selected quest, concise relationship and resource views, and selection that changes presentation without changing simulation state.

This design adapts those principles; it does not reproduce another game's visual language.

## Player Jobs

The Directive UI serves six player jobs:

1. Start, continue, branch, or manage a campaign.
2. Reorient around the current quest, objective, urgency, and known facts.
3. Recall evidence, messages, discoveries, and consequential history.
4. Review important people, relationships, and current involvement.
5. Inspect ship capability, condition, restrictions, and meaningful technical history.
6. Change preferences or enter exceptional troubleshooting when something is wrong.

Anything that does not support one of these jobs is not part of the normal player interface.

## Design Principles

### Less is more

Show information only when it changes a decision, explains a constraint, represents a usable resource, records a meaningful consequence, or exposes a necessary command. Raw save mechanics, prompt revisions, tracking counters, provider diagnostics, and internal workflow status dilute attention and belong outside the normal player path.

### One fact, one natural home

A fact may have one canonical record and multiple relations, but the UI presents it where the player will look for it:

- quest evidence and discoveries appear in Mission;
- statements and relationship history appear in Crew;
- technical evidence and damage history appear in Ship.

Cross-links may open the owning record in another route. They do not justify an Intel drawer.

### Selection is presentation only

Selecting a quest changes the expanded details and nothing else. It does not alter the active mission, objectives, prompt context, tracking priority, model inputs, time, narration, mechanics, or campaign revision. The implementation name is `selectedQuestId`; terms such as `foregroundQuestId` are prohibited because they imply game authority.

### Progressive disclosure

The first screen answers "what matters now?" Detail and history are available on demand. Completed, inactive, and stale material stays collapsed or visually quiet. Advanced and recovery controls appear only when requested or required.

### Canonical state remains authoritative

The redesign is a read-model and rendering change. Existing mission, crew, ship, thread, component, and command-history records remain canonical until separately redesigned. Player-facing projection filters and groups them; it does not duplicate them into new durable stores.

## Navigation

The player navigation contains exactly five routes, in this order:

| Route | Player purpose |
| --- | --- |
| Campaign | Continue, create, load, branch, and manage campaigns |
| Mission | Review quests, objectives, urgency, evidence, discoveries, and quest history |
| Crew | Review people, roles, standing, statements, and relationship history |
| Ship | Review capability, condition, restrictions, resources, and technical history |
| Settings | Change player preferences; reveal advanced setup or troubleshooting deliberately |

There is no top-level Log, Intel, Inventory, Map, Open Threads, Open World, Context, Components, or Recovery destination.

When a campaign is active and there is no valid remembered route, open Mission. When no campaign is active, open Campaign. A removed persisted route such as `log` migrates to Mission when a campaign is active and Campaign otherwise.

## Mission

### Unified quest list

Mission uses one list/detail layout. Main, side, crew/relationship, and open-world quests appear in the same list with a restrained category marker. Category is metadata, not another navigation hierarchy.

Ordering is:

1. authoritative active mission;
2. active or available quests, most urgent first;
3. inactive or paused quests;
4. completed or abandoned quests.

Inactive and completed groups are collapsed by default. Empty groups are omitted.

### Quest selection

The most recently selected valid quest remains selected when the drawer reopens or the page reloads. This is the only new persisted UI state in this redesign.

Selection is scoped by campaign and chat. Restore behavior is:

1. use stored `selectedQuestId` when it still exists in the projected list;
2. otherwise select the authoritative active mission;
3. otherwise select the first available quest;
4. otherwise render a concise empty state.

An invalid selection is removed from preferences during the next UI preference write. It never changes canonical campaign state.

Quest index/detail mode is not another preference. Desktop and console retain the persistent list/detail composition. On phones, the selected quest detail is the default surface and a compact selector opens a dedicated quest index in the Mission content area. The Directive header and bottom route bar remain present. Selecting a quest returns to detail; closing the index returns without changing selection. This view mode exists only in the rendered journal and resets to detail after rerender.

### Quest detail

The selected quest detail contains:

- title, status, and restrained category;
- current objective;
- urgency or deadline when actionable;
- one to three highest-value **Known So Far** facts;
- relevant people and location;
- related messages, evidence, discoveries, and history in collapsed sections.

Do not show hidden completion criteria, predicted rewards, raw phase ids, private NPC knowledge, model confidence, or internal state-machine names.

Player-facing time appears here only when it affects a deadline or decision. The existing in-world chat clock may remain where already established, but Mission does not duplicate technical timekeeping status.

### Contextual commands and exceptional states

Pending decisions or provisional outcomes that genuinely require player input appear as a concise contextual banner above the quest list. Recovery appears only when the runtime reports an actionable recovery state and disappears when resolved. It is never a permanent console, tab, or destination.

### Removed Mission surfaces

Remove these from normal player rendering:

- Active, Context, Open Threads, Open World, and Components subtabs;
- Bound Chat and Open Campaign Chat;
- Prompt Context revision, Tracked Turns, Committed Revision, and Turn Route;
- Latest Committed Outcome and Last Outcome summaries;
- the standing Recovery Console;
- duplicated player, ship, campaign, phase, and mode overview cards;
- internal component-management and reconciliation telemetry.

Useful records currently surfaced by Open Threads, Open World, Components, and Command Log are projected into the selected quest's facts and history. Editing or capture tools that remain necessary may be exposed through an explicit contextual action, not a permanent section.

## Crew

Crew is a people and relationship view. Its first level contains:

- name, role, and identity;
- current availability or posture;
- player-facing relationship standing;
- active assignment or involvement;
- one concise recent change when consequential.

Selecting a person opens relevant statements, known facts, relationship history, and quest links. The canonical Command Bearing system may continue to operate, but its evidence ledgers, review queues, reserve accounting, raw tracks, and runtime diagnostics are not normal player panels.

Consolidate or remove the current separate panels for Standing With Senior Staff, Crew Interactions, Perceived Relationship Shifts, Command Posture, Current Pressure, Command Context, Open Work, Recent Command Memory, and Open Threads. Their useful content belongs in the person detail or a collapsed history.

## Ship

Ship is a capability and constraint view. It contains:

- ship identity and class;
- meaningful capabilities and available resources;
- current overall condition;
- active damage, restrictions, or shortages;
- relevant technical discoveries and consequential history.

Zero-count and no-change categories are omitted. Condition must not be repeated across overview cards, folders, counters, and reports. Technical evidence is linked here rather than placed in Intel.

## Campaign

Campaign is a launcher and library, not a second mission dashboard. It provides Continue, create/import, library, save, branch, and records management. Active cards should identify the campaign and the action available; duplicated mission phase, chat binding, ship state, outcome, and tracking status are removed unless required to distinguish saves.

## Settings

The first Settings view contains editable player preferences only. Provider configuration lives under an explicit **Advanced** disclosure because it is operator setup. Model-call diagnostics, prompt revisions, continuity matrices, raw telemetry, storage verification, repair tools, and destructive maintenance actions live under **Developer & Troubleshooting** or appear contextually after a detected fault.

Advanced disclosures do not need persisted open/closed state. This avoids introducing state for every expandable surface.

## Record Projection

The redesign introduces a pure player-facing projection boundary:

```js
buildPlayerFacingInformation({ campaignState, coreProjections, runtimeView }) => ({
  quests,
  crew,
  ship,
  contextualAlerts
})
```

Each projected record carries stable ids and source references, but only player-safe fields:

```js
{
  id: 'quest:hesperus-rescue',
  category: 'main',
  status: 'active',
  title: 'Secure the Hesperus',
  objective: 'Stabilize the reactor and evacuate the passengers.',
  urgency: { label: '41 minutes remaining', remainingMinutes: 41 },
  knownFacts: [{ id: 'fact:reactor', text: 'The reactor is still degrading.' }],
  people: [{ id: 'crew:bronn', label: 'Bronn' }],
  location: { id: 'location:hesperus', label: 'Hesperus' },
  history: [{ id: 'event:12', summary: 'Bronn revised the reactor estimate.' }]
}
```

Projection rules are deterministic. They may rank already known facts by recency, relevance, and explicit linkage, but they do not infer new facts or mutate source records. Hidden, latent, watchlisted, operator-only, and diagnostic records never enter player projections.

## Tracking Consequences

The final UI defines what narrative tracking must serve:

- quest status, objectives, deadlines, evidence, discoveries, messages, and meaningful history;
- people, statements, standing, posture, and relationship changes;
- ship condition, capability, resources, restrictions, and technical history;
- contextual alerts that require player action.

Tracking data that cannot contribute to one of these surfaces should be challenged before it becomes a new player-facing field. The approved post-visible settlement pipeline remains the future automatic tracking boundary, but it should settle these player-value domains rather than preserve every existing panel.

## Accessibility and Responsive Behavior

- Route controls expose accessible names and selected state.
- Quest rows are keyboard operable and use `aria-selected`.
- Collapsed groups and history use native disclosure semantics or correct `aria-expanded`/`aria-controls` wiring.
- List and detail maintain stable dimensions; selecting a quest does not shift the outer shell.
- Desktop and console use two-column list/detail navigation when space permits.
- Phone shows detail first and swaps the Mission content area to a dedicated quest index through an accessible selector; it never stacks the full index above detail.
- The header and bottom route bar remain stable while the phone quest index is open, and the drawer body remains the only scroll owner.
- Directional keys move through quest rows; selection returns phone focus to the selected quest detail control.
- Text never overlaps controls at 390x845, 720x900, 1280x900, or 1440x1000.
- Status never relies on color alone.

## Success Criteria

1. Five top-level routes remain and Log is absent.
2. Mission has one unified quest list and no subtab navigation.
3. Selecting a quest changes only UI preference storage and rendered detail.
4. Useful history is discoverable in Mission, Crew, or Ship without Intel or Log.
5. Recovery and diagnostics are absent until context makes them necessary.
6. An active campaign opens to Mission when no valid route preference exists.
7. Desktop and phone Playwright proofs show no overlap, clipped controls, or competing scroll regions.
8. Existing canonical state and tracking contracts continue to pass after player-facing panels are simplified.

## References

- [Xbox Accessible UI Navigation](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112)
- [Xbox UI Context and Focus](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/114)
- [Hogwarts Legacy Field Guide overview](https://game8.co/games/Hogwarts-Legacy/archives/402519)
- [Fallout 4 Pip-Boy companion features](https://help.bethesda.net/app/answers/detail/a_id/31464/~/what-can-the-fallout-4-pip-boy-app-do%3F)
