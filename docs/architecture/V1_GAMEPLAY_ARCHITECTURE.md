# V1 Gameplay Architecture

## Status

Approved target architecture and canonical entry point for Directive V1 gameplay systems.

This document defines ownership, precedence, and cross-system flow. Focused companion documents define the detailed contracts. Documents describing the current runtime remain useful implementation evidence, but they do not override this target.

## V1 Product Outcome

Directive V1 turns a SillyTavern campaign chat into a coherent, inspectable command-roleplaying game without converting every sentence into a tracker.

The player should experience:

- chat as the primary place where play happens;
- a clean Directive interface containing only high-value state;
- spoiler-safe, non-linear mission objectives with reliable completion;
- fair consequences based on what the player could reasonably know;
- competent, autonomous crew who report material findings;
- one current operational picture of the ship;
- a small number of meaningful story and relationship records;
- one neutral Command Bearing reserve;
- native SillyTavern swipes and edits without anti-cheating friction;
- saves and branches that can reconstruct exactly why state exists.

Ashes of Peace is the only campaign required to be fully V1-native. Other campaign names and images may remain in the library as greyed, unselectable previews. Their legacy gameplay structures do not constrain V1.

## Architectural Thesis

Directive observes many details but records few durable story objects.

Freeform play requires model interpretation, but model interpretation is not durable state authority. A bounded model pass may propose what a scene means and cite the source that supports it. Deterministic code validates identifiers, evidence, predicates, allowed transitions, current revision, and branch ownership before committing anything.

The result is a hybrid architecture:

```text
freeform chat
    -> bounded interpretation and evidence proposal
    -> deterministic validation and reduction
    -> one Story Settlement episode plus typed effects
    -> rebuildable mission, crew, ship, Campaign, and prompt projections
    -> concise player-facing UI
```

The system is deterministic about custody and transitions, not about recognizing every possible phrase. It does not depend on exact player wording, and it does not trust a model to mutate campaign state directly.

## Authority Chain

The following order is normative:

1. Campaign package data owns authored truth, stable identities, predicates, reveal routes, objective definitions, clocks, and valid transitions.
2. The accepted SillyTavern source branch owns what the player and narrator actually said.
3. The Mission Director and bounded interpretation passes may propose evidence and narration intent.
4. Deterministic validators decide whether proposed evidence is supported and current.
5. Deterministic reducers commit facts, objective states, deadlines, mission transitions, and other typed effects.
6. Story Settlement owns semantic episode custody and source provenance for those accepted effects.
7. Domain projections render the current mission, crew, ship, Campaign, and prompt views.
8. The narrator receives an authorized packet and expresses the committed result; it does not originate the result.

No UI card, sidecar, narrator sentence, summary, or legacy tracker may bypass this chain.

## Canonical Companion Contracts

| Contract | Owns | Does not own |
|---|---|---|
| [Unified Story Settlement and Episode Tracking](../superpowers/specs/2026-08-08-unified-story-settlement-design.md) | Accepted-pair settlement, episode boundaries, semantic provenance, typed-effect custody, aggregate-first projection, Focus | Mission rules, authored truth, UI route layout |
| [Fair Discovery and Crew Initiative](../superpowers/specs/2026-08-09-fair-discovery-and-crew-initiative-design.md) | Knowledge fairness, disclosure proof, Duty Reports, captain fallback | A new knowledge ledger, mission closure, a hint score |
| [Mission State and Objective Resolution](../superpowers/specs/2026-08-09-mission-state-and-objective-resolution-design.md) | Objective schema, evidence validation, mission reducer, deadlines, closure, transition packets | Semantic episode duplication, narration authority |
| [V1 UI and Legacy Retirement](../superpowers/specs/2026-08-09-v1-ui-and-legacy-retirement-design.md) | Launcher behavior, one-home UI projection, Command Bearing display, legacy interaction disposition | Gameplay truth or a parallel player-facing ledger |
| [Ashes V1 Migration Plan](../planning/ASHES_V1_MIGRATION_PLAN.md) | Contract-first conversion of Ashes content and Hesperus reference behavior | Changes to the target architecture to accommodate legacy content |
| [V1 Gameplay Architecture Test Plan](../testing/V1_GAMEPLAY_ARCHITECTURE_TEST_PLAN.md) | Cross-system proof and Ashes release gates | Product behavior not established by the contracts above |

Where focused documents overlap, the narrower contract controls its subject while preserving this authority chain.

## Runtime Domains

### Story Settlement

Story Settlement is the sole semantic story authority. It normally produces zero or one episode for a completed foreground scene, regardless of how many facts or effects occurred. A scene with no lasting significance produces a processing receipt, not a story entry.

Mission updates, fact reveals, relationship evidence, and ship consequences may be typed effects within that episode. They are not separate narrative events merely because different UI pages consume them.

### Mission State

Mission state is a deterministic projection from authored definitions and committed evidence. Objectives may be required, optional, or conditional; may be available in parallel; and may depend on facts, events, outcomes, clocks, or other objective states.

Player wording expresses intent and attempted action. It cannot prove success. A model may recognize that unusual prose could satisfy an objective, but code validates the cited evidence and applies only an authored transition.

A mission closes when its required closure predicate reaches an authored terminal disposition. Optional or undiscovered conditional content cannot silently block it. Code then emits an authorized transition packet for narration and deterministic activation of the next phase or mission.

### Fair Discovery and Crew Initiative

Hidden information may cause events in the world. It cannot justify evaluative punishment, objective failure, Command Bearing judgment, or character blame before the player has received enough visible information to make an informed choice.

Routine professional work happens without micromanagement. Material findings arrive through one bounded Duty Report from a relevant officer, with the captain as a limited fallback. Crew provide facts, uncertainty, constraints, and warranted recommendations; they do not reveal unsupported truth or choose the player's answer.

### Ship State

The Ship page owns one current operational aggregate. Brief observations such as a flickering corridor light, a new-ship smell, or an untested subsystem do not each become permanent operational issues.

The aggregate is updated only when accepted evidence changes present capability, restriction, risk, maintenance posture, or technical history at a level that affects future play. Supporting details may remain inside the current aggregate or originating episode without becoming rows.

### Crew and Relationships

Crew projections show stable identity, current role, material condition, relationship posture, and rare lasting moments. Ordinary conversation, politeness, transient emotion, and repeated restatements remain in chat or the containing episode.

Relationship systems may consume accepted evidence, but they may not create a second story chronology. A lasting character moment must meet explicit significance criteria and is capped within its containing episode.

### Emergent Gameplay and Focus

Emergent developments remain unresolved consequences inside the episode that created them unless an authored system adopts them. V1 does not automatically generate quests, popups, rewards, or separate trackers for every interesting detail.

The player may explicitly select at most one unresolved consequence as Focus. Focus changes attention and retrieval, not truth, objectives, or rewards.

### Command Bearing

V1 retains Command Bearing as one neutral reserve representing hard-earned command leverage. Inspiration, Resolve, Marks, Bearing Ranks, per-turn evidence mining, and inferred objective-completion awards are not V1 authority.

Authored decisions may explicitly award Command Bearing when the player acts on adequately disclosed stakes and demonstrates meaningful command judgment. Routine competence and simple objective completion do not automatically award it. Spending remains an explicit mechanic with deterministic eligibility and effect.

### Authored Campaign Conclusion

A terminal mission may end the campaign only through an authored phase target carrying explicit campaign-conclusion metadata. The referenced package end condition must exist exactly once and identify an authored completion. Runtime activation commits one immutable receipt bound to package, branch, source mission run and revision, terminal disposition, transition, journey revision, and completion time.

The receipt proves that one exact terminal transition was consumed. It does not rewrite legacy quest status, attention flags, generic conclusion state, or end-condition ledgers, and it does not ask a model whether the campaign is complete. Repeated activation is a no-op. Any accepted-source reconstruction that can change the terminal record clears the receipt and requires closure to be proven again.

### Time and Urgency

Only an authored clock tied to an objective or mission consequence may create a deadline or countdown. Narrative urgency may influence prose and crew behavior without producing timer UI.

The mission reducer owns clock start, pause, advance, expiry, and consequences. A hidden clock is never rendered to the player. A displayed countdown must have a known basis, stable unit, authoritative current value, and stated player-safe consequence.

## Source Acceptance, Swipes, and Edits

An assistant response remains provisional while the player can select another swipe. When the player sends the next message from the selected response, Directive treats that response/player pair as accepted and may settle its supported meaning.

Directive preserves native SillyTavern editing, deletion, swiping, branching, and Save As. It does not attempt to prevent cheating or intercept ordinary editing. Passive source-mutation detection compares stored identities and hashes, invalidates dependent projections, and uses exact CORE, SRE, and REPAIR paths to rebuild from the surviving source branch.

No player-facing Scene Reconciliation workflow is required for V1.

## Player-Facing Projection

Chat is the primary play surface. The send-tray ship icon opens Directive.

Directive uses five high-value routes:

| Route | Natural home |
|---|---|
| Campaign | Campaign library, availability, saves, and completed-campaign record |
| Mission | Active mission, spoiler-safe objectives, true deadlines, known facts/evidence, history, and Focus |
| Crew | Crew identity, current status, relationship posture, and meaningful moments |
| Ship | One current operational aggregate and material capability constraints |
| Settings | Preferences and deliberately disclosed diagnostics/troubleshooting |

A fact appears in one natural home. Other pages may link or show a brief contextual projection but may not recreate a competing record.

Duty Reports attach to the assistant chat row that delivered them. Mission may mirror a still-relevant finding, but it is not the delivery authority. Directive Assist is not required for V1 and cannot own the launcher.

## Current Runtime Versus Target V1

The repository contains substantial working pre-alpha behavior built under older assumptions. Documentation therefore uses two explicit labels:

- **Current/as-coded** describes what the runtime does now and is evidence for migration and regression safety.
- **Target V1** describes the approved destination and controls new architecture and content work.

A target document does not imply its behavior has already shipped. An as-coded document does not make its current behavior the desired V1 design.

### Current Non-UI Ashes Checkpoint

As of 2026-08-09, all thirteen Ashes entries from Prelude through The Terms We Keep have V1 definitions, deterministic accepted-evidence reduction, exact mission-journey activation, source reconstruction, and a narrow authored campaign-conclusion receipt. The repository alpha gate passes 310 checks.

This is an implementation checkpoint, not V1 release certification. The current player UI does not yet render the complete V1 projections, narrator prompts do not yet consume the V1 authority packets, legacy writers are not yet retired for V1-native scope, package-level sibling scheduling remains separate work, and live SillyTavern semantic and pacing gates remain open.

## Supersession Register

| Document or family | V1 status | Retained authority |
|---|---|---|
| Unified Story Settlement | Target V1 authority | Sole semantic settlement and episode custody |
| Fair Discovery and Crew Initiative | Target V1 authority | Knowledge fairness, reports, captain fallback |
| Mission State and Objective Resolution | Target V1 authority | Objectives, evidence reduction, clocks, closure, transitions |
| V1 UI and Legacy Retirement | Target V1 authority | Player-facing projection and legacy disposition |
| Ashes V1 Migration Plan | Target V1 execution authority | Ashes conversion sequence and certification |
| Player-Facing Information Architecture, July 2026 | Partially retained | Five routes, progressive disclosure, one fact/one home; old canonical-tracker assumptions are superseded |
| Directive Assist | Deferred post-V1 | Optional writing aid only; no launcher or required gameplay authority |
| Scene Handshake Protocol | Superseded for V1 | Accepted-next-player-message insight is absorbed into Story Settlement |
| Scene Reconciliation Plan and UI | Superseded for V1 | Passive mutation detection and recovery remain; player review workflow does not |
| Outcome Integrity protected editing | Superseded for V1 | Provenance and recovery remain; edit restriction and anti-cheating posture do not |
| Mission Components | Deferred/partially retained | Explicit player Focus remains; generalized capture and duplicate component ledger do not |
| Narrative Thread Engine | Superseded as semantic authority | Useful authoring ideas may project from episodes; no competing thread chronology |
| Command Bearing System tracks/ranks | Superseded for V1 | One neutral reserve and explicit spend effects remain |
| Legacy quest/progression trackers | Current/historical until migration | Evidence for compatibility only; no authority over V1 mission semantics |
| Mission Director As-Coded | Current/as-coded | Implementation map and regression evidence; target transitions come from the mission contract |

## Migration Direction

Architecture is fixed before content migration. Validators and target schemas are established first; Prelude and Hesperus become the reference vertical slice; then the rest of Ashes is converted and certified. Non-Ashes campaigns do not become V1 blockers and do not receive partial compatibility shims that weaken the new contract.

Pre-V1 and unstamped saves are unsupported. Directive does not retain a second gameplay runtime or silently reinterpret old state. Any future importer would be a separate, explicit transformation into a valid V1-native save and is outside V1 scope.

## Robustness Boundaries

The design is intentionally strict at mutation boundaries and flexible at interpretation boundaries.

It is robust when:

- model output is treated as an untrusted proposal;
- every proposal cites current source evidence;
- reducers accept only known identifiers and allowed transitions;
- operations are idempotent and revision-bound;
- projections can be rebuilt from authoritative source and effects;
- hidden and player-visible state are structurally separated;
- objective closure is tested as a state matrix rather than a preferred prose path;
- omitted or malformed narration cannot silently mutate state;
- duplicate reports and repeated facts collapse to stable identities;
- Ashes fixtures test many player phrasings and action orders.

Likely breakpoints include over-eager interpretation, under-authored predicates, unreachable reveals, stale asynchronous results, false source acceptance after a swipe, ambiguous time advancement, projection duplication, and legacy consumers continuing to write independently. Each focused contract defines rejection, recovery, and test behavior for its domain.

## V1 Non-Goals

V1 does not require:

- perfect extraction of every fact from every turn;
- a universal knowledge graph;
- per-conversation, per-fact, or per-character model calls;
- automatic quest generation from emergent details;
- a generalized player commitment approval popup;
- anti-cheating controls;
- Inspiration and Resolve tracks, Marks, or ranks;
- fake countdowns for narrative tone;
- migration of every bundled campaign;
- a model-authored mission close or next-mission activation;
- replication of Summaryception, VectFox, CharMemory, or Multihog as dependencies.

Borrowed behavior must remain pinned to the inspected extension revision and documented as provenance. Directive may reproduce the smallest behavior needed under its own contracts; later redesign requires explicit evidence and review.

## Architectural Acceptance Criteria

The V1 architecture is ready for implementation only when:

- every durable gameplay datum has one owner;
- Story Settlement is the only semantic chronology;
- mission objectives can complete in valid non-linear orders;
- optional undiscovered content cannot block or downgrade primary success;
- hidden knowledge cannot produce evaluative punishment;
- a selected swipe is settled only after the next player message accepts it;
- source mutation can invalidate and reconstruct derived state without a player reconciliation screen;
- the Mission UI can explain every displayed state from committed evidence;
- the Ship UI cannot expand a single conversation into issue spam;
- Command Bearing has one reserve and explicit award/spend causes;
- only true authored deadlines display time;
- Ashes can be fully certified while other campaign cards remain unavailable previews;
- all older conflicting documents visibly defer to this packet.

## Final Rule

Directive may interpret the story broadly, but it records and changes the game narrowly: one accepted source history, one semantic episode authority, deterministic state transitions, and deliberate player-facing projections.
