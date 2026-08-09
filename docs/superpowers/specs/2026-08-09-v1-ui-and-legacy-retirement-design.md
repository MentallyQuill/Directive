# V1 UI and Legacy Retirement Design

## Status

Approved target V1 contract for the player-facing Directive shell, chat integration, route ownership, objective presentation, Command Bearing, and retirement of brittle legacy interactions.

This design binds [V1 Gameplay Architecture](../../architecture/V1_GAMEPLAY_ARCHITECTURE.md), [Mission State and Objective Resolution](2026-08-09-mission-state-and-objective-resolution-design.md), [Unified Story Settlement](2026-08-08-unified-story-settlement-design.md), and [Fair Discovery and Crew Initiative](2026-08-09-fair-discovery-and-crew-initiative-design.md) into one player-facing information architecture.

The visual system and expanded-interface contract continue to govern appearance and responsive composition. This document governs what gameplay information exists, where it appears, and which older interactions leave the V1 path.

## Product Outcome

Chat is where the player acts and experiences the story. Directive is the concise game companion they open to reorient, understand objectives, inspect meaningful consequences, manage a campaign, or change preferences.

Every page and element must answer a player question. No page exists to expose that a background subsystem ran. No source fact receives several player-facing records merely because several systems consumed it.

## Principles

### High Value Only

Display information when it changes a decision, explains a constraint, represents a usable resource, records a meaningful consequence, or exposes a necessary action.

Transient color, incidental dialogue, model diagnostics, processing state, duplicate summaries, empty categories, and mention-level observations do not qualify.

### One Datum, One Natural Home

Each durable player-facing datum has one primary route. Contextual links and compact mirrors are allowed when they help a current decision. A mirror does not become another editable or historical record.

### Projection, Not Authority

The UI renders player-safe projections from committed state. Clicking a card, changing selection, expanding detail, or opening a route does not change gameplay truth unless the control is explicitly a gameplay action such as spending Command Bearing or choosing Focus.

### Progressive Disclosure

The first view answers “what matters now?” Detail, evidence, and history open on demand. Advanced setup and diagnostics remain behind deliberate disclosure or appear after a detected problem.

### Native Host First

Directive cooperates with SillyTavern's ordinary editing, swiping, deletion, regeneration, and branching. It does not replace them with a protected transcript or police player behavior.

## Launcher and Chat Relationship

The small ship icon in SillyTavern's send-message tray remains. In V1, its sole primary action is to open or close the Directive UI at the last valid route.

Launcher rules:

- it is available wherever the extension shell is available;
- it has an accessible name such as “Open Directive”;
- it reflects open state without becoming a status dashboard;
- it does not open Directive Assist;
- it does not intercept message sending;
- it does not indicate tracking count, reconciliation count, or reward opportunities;
- when no campaign is active, Directive opens to Campaign;
- when a campaign is active and no valid route is remembered, it opens to Mission.

Directive Assist may return after V1 as an optional writing tool. It cannot own the ship icon, source acceptance, mission interpretation, or any required gameplay path.

### Duty Reports in Chat

A required Duty Report attaches to the assistant message row that visibly delivered it. The attachment is concise, identifies the reporter and professional domain, and allows the player to distinguish a material report from ordinary prose without opening Directive.

The Mission page may mirror a still-relevant known finding under evidence or known facts after the response settles. Chat remains the delivery authority. The mirror must not imply delivery before accepted-pair settlement.

The report affordance must not become a popup queue. One finding does not generate separate notifications for the report, fact, objective activation, episode, relationship reaction, and mission update.

## Route Ownership

V1 has exactly five top-level routes in this order:

| Route | Owns | Excludes |
|---|---|---|
| Campaign | Library, availability, new/continue, save records, branch management, completed-campaign record | Active mission dashboard duplication, legacy tracker health |
| Mission | Active mission, spoiler-safe objectives, real deadlines, known facts/evidence, concise mission history, player Focus | Hidden objectives, generic progress percentage, permanent reconciliation/recovery console |
| Crew | Crew identity, role, availability, material posture, relationship standing, rare meaningful moments | Per-conversation transcript, inferred private thoughts, mention-level sentiment |
| Ship | Ship identity, meaningful capability/resources, one current operational aggregate, material restrictions, consequential technical history | One issue row per observation, raw technicalDebt, repeated condition summaries |
| Settings | Player preferences, explicit advanced provider setup, deliberately disclosed troubleshooting | Routine gameplay state, permanent model telemetry |

There is no top-level Log, Intel, Assist, Reconciliation, Components, Open Threads, Open World, or Recovery route.

## Campaign

Campaign is a launcher and save library.

### V1 Availability

Ashes of Peace is the only selectable complete V1-native campaign. Its card may offer New Campaign or Continue as state permits.

Other approved campaign names and images remain visible as previews. Their cards are:

- visually greyed without losing legibility;
- explicitly labeled “Coming soon” or equivalent;
- absent from keyboard selection order for activation, or exposed as disabled using correct accessible semantics;
- unselectable by pointer, keyboard, or assistive technology;
- unable to create, load, import, or bind legacy gameplay state.

The teaser does not expose unfinished mission counts, compatibility warnings, or internal package status.

### Save Information

Save cards show only what distinguishes a playable record: campaign, player identity, meaningful current location or mission label, last played time, and whether the save is complete or legacy when relevant.

Campaign does not repeat ship condition, objective lists, Command Bearing history, prompt revision, or tracker counts.

## Mission

Mission answers:

- what is the current assignment;
- what outcomes are presently available to pursue;
- what is required for primary completion;
- what optional work is known;
- what facts or constraints matter;
- whether a real deadline exists;
- what meaningful result has already occurred.

### Mission Header

The header contains:

- spoiler-safe mission title and concise purpose;
- current player-safe status;
- no generic “0 of N complete” indicator unless the mission authors a meaningful counted quantity;
- no hidden total that changes when a secret objective activates.

If a concise progress statement helps, it describes state, such as “Rescue operations underway,” “Ready for command review,” or “Primary assignment complete.” It does not pretend a complex mission is a percentage.

### Objective Presentation

Visible objectives are grouped by role, not by forced sequence:

- **Primary** for required work;
- **Optional** for known optional work;
- contextual headings only when a mission has enough parallel work to need them.

Conditional objectives are absent until their player-visibility predicate is true. The page never renders “Secret objective,” blank slots, redacted lines, hidden counts, or plot-revealing completion text.

List order communicates current relevance and readable grouping, not mechanical dependency. When an objective truly depends on another, its player-safe state explains why it is unavailable or waits to render until available. Numbering such as “Step 2 of 5” is reserved for genuinely ordered procedures.

Each visible objective may show:

- player-safe objective text;
- required or optional label;
- available, in-progress, or resolved state;
- a concise known blocker or dependency;
- a true deadline tied to that objective;
- an expandable evidence/result explanation.

Objective rows are not player checkboxes. Completion is reduced from accepted evidence. Interactive checkbox styling must not imply that the player can self-certify success.

### Evidence and Known Facts

Mission shows a small ranked set of player-known facts that affect current decisions. Expanded evidence may cite the relevant chat moment, report, record, person, or outcome.

Evidence display is explanatory, not a raw ledger. It excludes model confidence, internal IDs, hidden truth, rejected proposals, duplicate excerpts, and every intermediate operation.

### Mission Completion

After closure, Mission displays:

- primary disposition in plain language;
- important cost or compromise;
- resolved optional outcomes that the player knows;
- known work that was handed off;
- the next authorized assignment or interlude when activated.

An undiscovered optional branch is not listed as missed. Mixed optional results do not relabel a successful primary mission as failure.

### Deadlines

Mission renders urgency only when an authored, player-visible clock is running or its resolved/expired result remains important.

A deadline display includes:

- remaining time or explicit due time;
- the affected objective;
- the known consequence or reason the deadline matters;
- paused, expired, or resolved state when applicable.

Narrative urgency without a clock has no urgency panel. Missing clock data produces no “0 minutes remaining” fallback.

### Focus

Mission may offer **Focus** on one player-known unresolved consequence from Story Settlement. Focus is explicit and optional.

The UI explains that Focus helps keep one emergent concern visible. It does not promise a quest, reward, objective, model-determined completion, or Command Bearing. Replacing Focus updates only the single branch-scoped reference.

## Crew

Crew's first level shows identity, role, current availability/posture, material relationship standing, and active mission involvement.

Person detail may show:

- player-known background and role context;
- current player-facing relationship posture;
- rare meaningful moments sourced from settled episodes;
- relevant statements or Duty Reports;
- current mission link.

The page omits routine conversation logs, every mood change, hidden relationship dimensions, private thoughts, evidence-mining queues, and repeated summaries of the same interaction.

A relationship change that matters mechanically may update immediately through a typed effect. A prose memory normally waits until the containing episode is sealed so the whole encounter is judged together.

## Ship

Ship presents one operational picture, not a defect inbox.

The primary aggregate answers:

- what the ship can currently do;
- what materially limits it;
- which resources or systems affect current decisions;
- what serious risk or maintenance posture persists;
- what consequential technical history explains the current state.

A short-lived observation such as flickering lighting, a smell after refit, a momentary calibration concern, or an isolated officer comment remains inside the scene or aggregate narrative unless validated evidence makes it a persistent capability, restriction, risk, or maintenance concern.

Several details from one scene normally update a single ship aggregate. A separate issue row is exceptional and requires an independently actionable, persistent technical concern with a stable identity and future gameplay effect. It must not exist merely because extraction found another noun phrase.

The page avoids duplicated overall condition, issue counts, summary cards, and technical history cards that restate one another.

## Settings

Settings begins with player preferences. Provider configuration and other operator setup live under Advanced. Diagnostics and repair controls live under Developer & Troubleshooting or appear contextually after a detected fault.

The normal route does not show prompt revisions, model-call counts, source hashes, reconciliation state, sidecar queues, or raw state transactions.

## Command Bearing

V1 displays one neutral **Command Bearing** reserve.

The player-facing surface may show:

- current available points;
- the maximum if the mechanic defines one;
- whether a currently offered spend is eligible;
- clear cost and effect before confirmation;
- a concise reason for a newly awarded point when an authored judgment grants one.

The UI does not show Inspiration, Resolve, Marks, Bearing Ranks, track evidence, review queues, per-turn award mining, or inferred objective reward previews.

Completing an objective does not inherently award Command Bearing. An authored decision may award it when stakes were fairly disclosed and the player's command judgment meets the stated mechanic. The player should not be encouraged to accept every popup or optimize dialogue for point extraction.

V1 does not require a generic commitment acceptance popup. Ordinary spoken commitments remain story meaning inside the settled episode. Any future explicit commitment mechanic must provide a real choice with consequences beyond a reward prompt and requires separate approval.

## Native Swipes, Edits, Deletions, and Branches

Assistant prose is provisional while the player can choose another swipe. Directive commits response-derived knowledge and effects when the next player message proceeds from the selected response under the accepted-pair contract.

The player may use native SillyTavern controls to:

- select another swipe;
- edit a message;
- delete messages;
- regenerate;
- create a branch or Save As.

Directive does not add a protected edit mode, disable those controls, shame the player, or attempt to make cheating impossible.

Passive source-mutation detection remains required. When authoritative source changes, CORE/SRE/REPAIR invalidates and reconstructs dependent Story Settlement effects and domain projections. The UI may show a temporary nontechnical recovery state only when reconstruction cannot proceed automatically.

## Legacy Feature Disposition

| Legacy feature | V1 disposition | Retained behavior |
|---|---|---|
| Directive Assist | Deferred post-V1 | May later return as optional writing help; no launcher or gameplay authority |
| Scene Handshake | Superseded | Accepted-next-player-message settlement retained inside Story Settlement |
| Scene Reconciliation player UI | Retired from V1 | Passive mutation detection and exact reconstruction retained |
| Protected editing / Outcome Integrity editor | Retired from V1 | Provenance, validation, and rollback retained |
| Mission Components capture system | Deferred/trimmed | One explicit Focus reference retained; no duplicate component chronology |
| Open Threads / Narrative Thread UI | Retired as a route | High-value unresolved consequences project into Mission or the containing episode |
| Tracking review panels | Retired | Deliberate projections and developer-only diagnostics retained |
| Command Bearing Marks/ranks/tracks | Superseded | One neutral reserve and explicit spend effect retained |
| Permanent Recovery Console | Retired | Contextual recovery only after an actionable fault |
| Log as top-level route | Retired | Concise relevant history appears in its natural Mission, Crew, Ship, or Campaign home |

Retirement is a target. Existing code and documents remain current/as-coded until implementation removes or disconnects them. Removal work must preserve source safety, save behavior, and diagnostics before deleting UI or state writers.

## Projection Contract

The conceptual player-facing projection is:

```js
buildV1PlayerProjection({
  campaignCatalog,
  campaignState,
  storySettlement,
  missionState,
  knowledgeState,
  commandBearing,
  runtimeHealth,
}) => ({
  campaign,
  mission,
  crew,
  ship,
  settings,
  chatAttachments,
  contextualRecovery,
})
```

Projection is pure and deterministic. It may rank committed player-known records by relevance and recency. It cannot infer facts, mutate source state, call a model, or store a second copy of gameplay truth.

Every projected record carries stable source references for internal explanation and recovery. Player output includes only safe fields.

## Responsive and Accessible Behavior

- The ship launcher has an accessible name, keyboard operation, and visible focus.
- All five routes expose current selection without relying on color.
- Disabled campaign teasers use semantic disabled behavior and legible contrast.
- Objective class and state use text or icon plus text, not color alone.
- Required and optional groups remain understandable without list numbering.
- Deadlines announce their objective and remaining time without live-region spam.
- Duty Report attachments are associated with the correct assistant message.
- Focus controls state their effect and current selection.
- Phone layouts keep the route shelf and selected detail stable, with one scroll owner.
- Advanced diagnostics do not appear in ordinary focus order while collapsed.

## Failure Handling

### Missing Projection Data

Omit the affected optional element or show a concise unavailable state. Do not render zero values that imply real gameplay state.

### Stale Async Result

Discard it. The UI remains on the last committed projection and refreshes from the current revision.

### Report Generated but Not Delivered

Do not attach a report or reveal its fact. Required disclosure recovery follows Fair Discovery.

### Source Mutation During UI Use

Selection and open route may remain when still valid. Gameplay cards refresh from reconstructed state. A selected item that no longer exists falls back deterministically.

### Legacy Record Without V1 Projection

Never dump the raw record into the UI. Label a legacy save or show a deliberately bounded compatibility state according to the selected save policy.

## Acceptance Criteria

- The send-tray ship icon opens Directive and never requires Assist.
- Chat remains the primary play surface.
- Campaign, Mission, Crew, Ship, and Settings are the only top-level routes.
- Ashes is selectable; non-Ashes campaigns are greyed and unselectable teasers.
- Every gameplay datum has one natural route owner.
- Mission objectives are spoiler-safe and do not imply order unless authored dependency requires it.
- Required and optional objectives are clear without hidden counts or generic percentage progress.
- Objective rows cannot be manually checked to declare success.
- Only true visible deadlines render urgency.
- Duty Reports visibly attach to their source assistant row and settle with that source.
- Crew shows rare meaningful moments rather than conversation spam.
- Ship shows one operational aggregate rather than mention-level issue spam.
- Command Bearing appears as one neutral reserve with explicit awards and spends.
- Inspiration, Resolve, Marks, ranks, reconciliation review, protected editing, and tracking-review surfaces are absent from the V1 path.
- Native SillyTavern swipes, edits, deletion, regeneration, and branching remain available.
- Passive source mutation can reconstruct projections without a required player reconciliation screen.
- Projection failure cannot fabricate progress, hidden facts, deadlines, or zero-value urgency.

## Final UI Rule

If information does not help the player decide, understand, remember, or act, it does not deserve permanent space in Directive V1.
