# Ashes of Peace V1 Migration Plan

## Status

Approved architecture-first migration design. This plan defines how Ashes of Peace becomes Directive's sole complete V1-native campaign after target schemas, reducers, and validators are established.

It does not claim that the current bundled package already satisfies the target. Current package files, mission graphs, quests, threads, state tracks, and runtime fixtures are migration inputs.

## Governing Contracts

- [V1 Gameplay Architecture](../architecture/V1_GAMEPLAY_ARCHITECTURE.md)
- [Unified Story Settlement](../superpowers/specs/2026-08-08-unified-story-settlement-design.md)
- [Fair Discovery and Crew Initiative](../superpowers/specs/2026-08-09-fair-discovery-and-crew-initiative-design.md)
- [Mission State and Objective Resolution](../superpowers/specs/2026-08-09-mission-state-and-objective-resolution-design.md)
- [V1 UI and Legacy Retirement](../superpowers/specs/2026-08-09-v1-ui-and-legacy-retirement-design.md)

If legacy Ashes content conflicts with these contracts, content is reauthored. The architecture is not weakened to preserve an old tracker or scripted sequence.

## Migration Outcome

At V1 release:

- Ashes is fully playable from campaign selection through authored campaign conclusion using V1-native contracts;
- every active mission has spoiler-safe objectives, reachable evidence, valid closure, and deterministic transitions;
- Story Settlement is the only semantic story authority;
- Fair Discovery prevents hidden-information grading;
- crew initiative supplies bounded professional findings without solving player decisions;
- Mission, Crew, and Ship projections contain deliberate high-value information rather than tracking spam;
- one neutral Command Bearing reserve has explicit award and spend causes;
- native SillyTavern swipes, edits, deletion, save/reload, and branches reconstruct correctly;
- other campaign cards retain names and images but are greyed, unselectable, and labeled unavailable or coming soon.

## Why Contract First

Migrating content before the target schema would encode current accidents as permanent architecture. Designing indefinitely without a real campaign would leave important contracts untested.

The migration therefore uses a contract-first vertical slice:

1. pin target semantic schemas, validators, reducer interfaces, and UI projection contracts;
2. convert Prelude and Hesperus as the smallest complete slice;
3. revise the contracts only for genuine general-purpose gaps, never to preserve Ashes-specific hacks;
4. convert the remaining Ashes missions against the proven contracts;
5. certify complete campaign traversal;
6. leave non-Ashes gameplay untouched and unavailable for V1.

This resolves the chicken-and-egg problem by making one real story the proving ground after the architectural boundaries are fixed.

## Migration Units and Ownership

| Unit | Migration responsibility | Acceptance evidence |
|---|---|---|
| Campaign metadata | Preserve Ashes identity, player promise, ship, image, availability, package version | schema and catalog fixture |
| Mission graph | Stable missions, phases, objectives, predicates, closure, transitions | graph validation and reachability matrix |
| Player-facing objective copy | Spoiler-safe, concise, no implied order unless real | snapshot and spoiler lint |
| Facts and knowledge | Separate authored truth, player-known facts, clues, and confirmation | reveal-route and source-custody fixtures |
| Outcomes and decisions | Typed effects, fair evaluation, valid mixed results | decision matrices |
| Pressures and fronts | Causal world movement without duplicate semantic events | reducer and Story Settlement projection tests |
| Clocks | Authored start, advance, visibility, expiry, consequence | deadline state matrices |
| Crew initiative | Capability roles, report routes, deduplication, captain fallback | report delivery and omission recovery tests |
| Story Settlement | Episode boundaries, typed effect custody, aggregate projection | scene fixtures and rebuild tests |
| Ship | One operational aggregate with material capabilities, restrictions, risks, and history | anti-spam projection fixtures |
| Crew/relationships | Stable posture and rare significant moments | significance and deduplication fixtures |
| Command Bearing | Neutral reserve, authored informed awards, explicit spends | award/spend contract tests |
| Mission transitions | Terminal dispositions, outcome dimensions, authorized narration, next activation | closure and save/reload tests |
| UI fixtures | Campaign, Mission, Crew, Ship, Settings, chat Duty Report | visual and semantic projection proof |
| Campaign ending | Authored terminal branch, checkpoint policy, final outcome | full-run certification |

## Target Schema Intent

Implementation planning must define versioned records for:

- mission definitions;
- objective definitions and terminal dispositions;
- declarative predicates;
- evidence proposals and validated evidence effects;
- facts, clues, confirmations, and player-visible disclosures;
- mission outcome dimensions;
- clocks and authoritative time effects;
- transition definitions and committed transition receipts;
- authorized narrator packets;
- Story Settlement episode and typed-effect references;
- UI projections;
- catalog availability.

Schema work includes forward validation, package-version binding, stable IDs, unknown-field policy, migration versioning, and diagnostic reason codes. The exact file layout is decided during implementation design, not by copying current JSON shapes unchanged.

## Current-Content Inventory Pass

Before conversion, create a machine-readable and human-reviewed inventory of current Ashes data:

- all campaign, arc, quest, mission, phase, decision, outcome, fact, pressure, clock, thread, crew, ship, and end-condition IDs;
- every runtime writer that currently changes mission, quest, thread, ship, relationship, or Command Bearing state;
- every UI consumer and prompt consumer of those records;
- all Hesperus-specific code, prompt guidance, facts, tests, and display copy;
- all current progression conditions and implicit sequence assumptions;
- all hidden truth accidentally present in player-safe fields;
- all content that can create duplicate rows across mission, thread, ship, log, or character systems.

Each item receives a disposition:

- migrate to authored definition;
- migrate to typed effect;
- derive as projection;
- merge into an aggregate;
- retain as source-only context;
- retire;
- defer beyond V1.

Inventory is evidence for migration, not authority over the target.

## Reference Vertical Slice: Prelude and Hesperus

The first slice must prove a complete loop:

```text
select Ashes
    -> create player character and campaign chat
    -> begin Prelude
    -> pursue command handover in varied order
    -> receive Hesperus diversion
    -> rescue with optional fair discovery
    -> return to handover/readiness
    -> close Prelude
    -> narrate and activate the next mission
    -> save, reload, swipe, edit, delete, and branch safely
```

It must exercise the real Mission and Ship projections, a crew Duty Report, at least one meaningful Story Settlement episode, one no-significance scene receipt, and an eligible Command Bearing award/spend path without requiring the player to take it.

### Current Mission-Transition Boundary

The non-UI V1 runtime now proves exact mission-target activation, durable pending transitions, branch-local journey history, historic source reconstruction, descendant Story rollback, and bounded transition-narration preparation. Prelude, `chapter-1-the-empty-convoy`, and `chapter-2-false-colors` now have exact V1 definitions registered in the pinned Ashes package version.

Prelude's canonical V1 receipt now activates a fresh Chapter 1 state and archives Prelude through the deterministic journey authority. Chapter 1 replaces ten legacy phases and twenty-eight flags with three core objectives, one optional cooperation objective, four dimensions, two causal gating events, three aggregate Duty Reports, and no synthetic clock. The existing mission graph, campaign projection, quest rows, and package records remain migration inputs only; they do not become parallel V1 authority.

Chapter 1's canonical V1 receipt now activates a fresh False Colors state and archives Empty Convoy through the same journey authority. False Colors replaces six phases, twenty-three facts, twenty-five flags, eight pressures, and four hidden risk clocks with three core objectives, one optional partnership objective, four dimensions, two causal evidence events, three aggregate Duty Reports, and no synthetic clock. Its medical, evidence, political, and security work can settle in any causally valid order, and it never requires hidden culprit attribution.

False Colors now activates `open-orders-1-work-worth-doing` through an exact V1 definition without adding a legacy quest-template row. Open Orders I is one interval with one required conclusion, three visible optional assignments, three aggregate assessment reports, four dimensions, explicit direct/delegated/declined choices, and no synthetic clock. Resolving two assignments is a normal load; all three require delegation or record overextension; early departure and informed failure continue forward. Selection and delegation are not success, and decline remains reversible until interval conclusion.

Open Orders I now activates `chapter-3-dead-letters` through an exact V1 definition bound to the existing package quest with its empty legacy mission graph. Dead Letters exposes three spoiler-safe responsibilities, three aggregate discoverable reports, direct and alternate clue routes, separate player-owned physical-system and human-material choices, four outcome dimensions, mixed failure-forward dispositions, and no synthetic clock. Loss before an informed choice records cost rather than player failure, while unsupported controller attribution remains outside mission success.

Dead Letters targets `chapter-4-the-colony-that-stayed`. Chapter 4 remains durably pending because it has no exact V1 definition; legacy package data cannot activate in its place. The later open-world package permits Dead Letters and The Colony That Stayed as sibling opportunities after False Colors, while the current V1 journey remains linear. Campaign-level sibling scheduling must be designed explicitly before open-world certification and must not be simulated through hidden mission state. Archived Prelude, Chapter 1, Chapter 2, Open Orders I, and Dead Letters definitions must remain available at their pinned versions so repaired saves can reconstruct the journey.

## Hesperus Conversion

### Remove the Spoiler

Initial mission summaries and objective projections must not mention fraud, falsified records, corruption, an investigation, a hidden objective count, or “resolve the Hesperus.” The initial frame is a distress diversion and rescue responsibility.

### Primary Objectives

Author the smallest set of rescue-relevant required objectives. Candidate semantics are:

- establish the distressed vessel's condition and immediate risk;
- protect or recover its crew;
- resolve the immediate hazard sufficiently to withdraw or hand it off safely;
- return to the larger command-handover mission with material consequences recorded.

These are not necessarily four UI rows. The final content pass should combine them when the player can understand the job with less.

### Routine Competence and Evidence

Routine professional behavior may:

- log and preserve the distress transmission;
- obtain and reconcile the crew manifest;
- preserve service and inspection records;
- compare records with observed condition;
- run authorized diagnostics;
- alert the relevant operations, engineering, medical, or security officer.

These actions occur when safe and relevant without requiring exact player phrasing. They do not themselves prove fraud or make the rescue succeed.

### Discovery Ladder

Use distinct stable facts for:

1. an observable inconsistency;
2. a material inspection-record discrepancy;
3. grounded confirmation of falsification;
4. any actor attribution that the evidence actually supports.

The player-facing projection reveals only the highest settled, player-known level. Suspicion does not become confirmation through suggestive narration.

### Crew and Whitaker Routes

The mission defines capability-based reporter roles and Ashes-preferred characters. A relevant officer normally delivers the finding. Captain Whitaker is the fallback for a missing required report, serious known risk, or captain-owned authority.

Whitaker may ask a pointed question, state a constraint, or provide experienced context. She does not act as a glowing quest marker, reveal unsupported director truth, or choose the player's accountability response.

### Conditional Accountability Objective

No accountability objective exists in the player projection before sufficient knowledge settles.

After a discrepancy is known, a spoiler-safe review objective may appear. After falsification is confirmed, an optional objective may ask the player to address or preserve the matter. Supported dispositions should include proportionate action, evidence-preserving handoff, knowing declination, waiver through higher authority, and informed failure where the authored situation supports it.

The branch never blocks rescue completion. Undiscovered fraud is absent, not failed.

### Hesperus Outcome Matrix

At minimum, fixtures cover:

| Rescue result | Knowledge | Player action | Mission consequence |
|---|---|---|---|
| clean success | no discrepancy discovered | rescue and depart | full primary success; fraud continues causally; no blame |
| success with cost | no discrepancy discovered | rescue under material cost | primary success with cost; no fraud judgment |
| clean success | discrepancy suspected | preserve and hand off | full primary success; optional prudent follow-up |
| clean success | fraud confirmed | proportionate action | full primary success; optional accountability result |
| clean success | fraud confirmed | knowing inaction | full primary success; authored informed consequence |
| rescue failure | adequate risks disclosed | informed poor judgment | mixed or failed primary disposition supported by evidence |
| rescue failure | material report omitted | player lacked needed knowledge | no negligence judgment; recovery or causal consequence only |

This matrix proves that primary rescue quality and optional accountability are separate dimensions.

## Remaining Ashes Conversion

After the reference slice passes, convert each remaining mission as its own reviewed unit:

1. define player promise and spoiler boundary;
2. identify authored truth, player-safe facts, clues, and confirmations;
3. define the minimal required objectives;
4. define optional and conditional objectives;
5. define valid non-linear orders and dependencies;
6. define routine competence and report routes;
7. define outcome dimensions and Command Bearing eligibility;
8. author only real clocks with fair visibility;
9. define closure and exactly one deterministic transition per terminal case;
10. map durable meaning into Story Settlement effects and domain aggregates;
11. build fixtures before retiring the legacy path;
12. certify the mission in live SillyTavern play.

Do not bulk-convert missions by mechanically translating current quest arrays. Each mission receives a content review for spoilers, redundant trackers, unfair hidden gates, accidental linearity, and false urgency.

## Story and Projection Cleanup

Migration consolidates legacy outputs:

- multiple per-turn log/thread/quest records from one encounter become one episode with typed effects;
- repeated ship observations become one current operational aggregate;
- ordinary crew interaction remains in chat or the episode rather than a relationship record;
- only lasting character moments project into Crew;
- unresolved emergent developments stay episode-owned unless the player selects one as Focus;
- a fact appears in one natural UI home and is linked elsewhere only when context demands it.

Existing records are not deleted from source history during planning. Their conversion rules are fixture-tested before writer removal.

## Catalog Teaser Migration

V1 retains the existing non-Ashes campaign identity cards using only catalog-safe metadata:

- stable package or teaser ID;
- campaign title;
- ship or campaign subtitle where approved;
- image asset and accessible alternative text;
- short non-spoiler premise;
- explicit `comingSoon` or equivalent unavailable state.

The UI renders these cards greyed and unselectable. Keyboard, pointer, and assistive-technology interaction must all treat selection as disabled. The card may explain that Ashes of Peace is the playable V1 campaign.

Opening, creating, importing, or activating legacy gameplay from those teaser cards is prohibited. Their full legacy package records do not need to load into the V1 runtime path.

## Save Migration Policy

Before V1-native Ashes replaces the current path, choose and document one explicit legacy-save policy:

- validated conversion from supported current saves;
- labeled legacy playback separated from V1-native campaigns;
- no legacy-save import for the initial V1-native release.

Whichever policy is chosen must preserve source data and fail visibly. It must not partially map old tracker rows into new authority, fabricate evidence, expose hidden facts, or claim a save is V1-native when validation is incomplete.

Fresh V1-native Ashes campaigns are the required release path. Legacy conversion is not allowed to delay the architecture unless product requirements explicitly promote it into scope.

## Implementation Sequence and Gates

### Gate 0: Architecture Freeze

- companion contracts approved;
- no unresolved ownership conflicts;
- status banners identify stale documents;
- target test matrix exists.

### Gate 1: Schema and Validator Spine

- versioned target schemas exist;
- stable IDs and cross-references validate;
- spoiler, reachability, clock, and transition linting run;
- malformed model evidence is rejected;
- reducers are deterministic and idempotent.

### Gate 2: Shadow Interpretation

- V1 interpretation runs against recorded Ashes scenes without mutating saves;
- differences from current trackers are reviewed;
- false positives, fragmentation, and missed high-value changes are measured;
- borrowed extension behavior remains pinned to its inspected provenance.

### Gate 3: Prelude/Hesperus Vertical Slice

- new reducers own the slice;
- Story Settlement and UI projections are active;
- legacy writers are disabled for the slice;
- every Hesperus outcome matrix case passes;
- closure activates the next mission exactly once.

### Gate 4: Remaining Ashes Missions

- mission-by-mission conversion and review;
- graph reachability and spoiler lints pass;
- live play confirms multiple styles and orderings;
- legacy writers are retired only after parity for required behavior.

### Gate 5: Full Ashes Certification

- complete new campaign from fresh start to terminal outcome;
- exercise alternate objectives, missed discoveries, informed declines, clocks, failure-forward outcomes, and Command Bearing;
- test save/reload, branch, swipe, edit, deletion, provider failure, and narrator omission;
- inspect all five UI routes for high-value, nonredundant projections;
- operator approval confirms the story feels coherent and not mechanically railroaded.

### Gate 6: V1 Catalog Lock

- Ashes is selectable and marked playable;
- all non-Ashes campaigns are greyed and unselectable;
- no teaser can enter a legacy runtime path;
- release documentation names Ashes as the sole complete V1-native campaign.

## Fixture Requirements

Each migrated mission includes:

- valid and invalid schema fixtures;
- predicate truth tables;
- graph reachability fixtures;
- spoiler-safe projection snapshots at each knowledge level;
- objective closure and disposition matrices;
- model evidence proposals from varied prose;
- unsupported player assertion cases;
- duplicate, stale, malformed, and hallucinated evidence cases;
- Duty Report selection, deduplication, omission, and captain fallback;
- real deadline lifecycle where applicable;
- Story Settlement zero/one-episode behavior;
- Ship and Crew anti-spam projection;
- transition and narration fallback;
- swipe/edit/delete and branch reconstruction;
- save/reload idempotency.

## Certification Play Styles

Full Ashes testing includes at least:

- direct command style;
- conversational leadership;
- terse or incomplete orders;
- highly detailed technical prose;
- delegation-heavy play;
- cautious investigation;
- mission-focused play that skips optional discovery;
- non-linear objective ordering;
- morally unconventional but informed choices;
- metagame assertions that the player character could not know.

Success means the system recognizes supported play without demanding author-expected phrasing, while refusing unsupported self-declared outcomes.

## Exit Criteria

Ashes migration is complete only when:

- all playable Ashes missions use V1-native schemas and reducers;
- no active legacy tracker can independently mutate the same semantic fact;
- Hesperus never exposes fraud before discovery and never penalizes its absence;
- every mission has reachable required closure and deterministic next activation;
- optional branches produce mixed outcomes without collapsing primary success;
- every displayed timer represents an authored visible deadline;
- ship and relationship projections resist mention-level spam;
- every visible state can be traced to accepted evidence;
- full campaign certification passes in the actual SillyTavern host;
- non-Ashes cards remain safe unavailable teasers;
- documentation and current/as-coded notes are updated to reflect the implemented boundary.

## Final Migration Rule

Build the general V1 contracts, prove them against Prelude and Hesperus, then reform Ashes to tell its story through those contracts. Do not preserve legacy bloat by teaching the new architecture to imitate it.
