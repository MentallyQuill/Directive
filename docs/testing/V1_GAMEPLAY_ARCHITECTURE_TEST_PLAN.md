# V1 Gameplay Architecture Test Plan

## Status

Approved target V1 verification contract. This plan defines the evidence required before Directive may claim that the unified story, mission, fair-discovery, UI, legacy-retirement, and Ashes migration architecture is implemented and working.

It does not claim those proofs currently exist.

## Governing Documents

- [V1 Gameplay Architecture](../architecture/V1_GAMEPLAY_ARCHITECTURE.md)
- [Unified Story Settlement](../superpowers/specs/2026-08-08-unified-story-settlement-design.md)
- [Fair Discovery and Crew Initiative](../superpowers/specs/2026-08-09-fair-discovery-and-crew-initiative-design.md)
- [Mission State and Objective Resolution](../superpowers/specs/2026-08-09-mission-state-and-objective-resolution-design.md)
- [V1 UI and Legacy Retirement](../superpowers/specs/2026-08-09-v1-ui-and-legacy-retirement-design.md)
- [Ashes V1 Migration](../planning/ASHES_V1_MIGRATION_PLAN.md)

## Proof Model

No single test layer certifies this architecture.

| Layer | Proves |
|---|---|
| Schema/static | Packages cannot express missing identities, unsafe references, obvious spoiler leaks, unreachable closure, invalid clocks, or ambiguous transitions |
| Reducer/contract | The same accepted state and evidence always produce the same effects; invalid input cannot mutate state |
| Interpretation conformance | Varied prose can produce bounded proposals without exact phrase dependence; proposals remain untrusted |
| Transaction/integration | Source acceptance, Story Settlement, mission reduction, projections, narration, save, and recovery work together |
| UI semantic | Each page displays only allowed player-safe data and actions |
| Visual/accessibility | Layout, responsive behavior, disabled states, hierarchy, keyboard access, and readable status work in the host |
| Live SillyTavern | Real swipes, edits, generation, provider behavior, chat binding, saves, branches, and player experience match the contracts |
| Operator approval | The complete Ashes campaign feels coherent, fair, clear, non-spammy, and not railroaded |

Deterministic fixtures are baseline evidence. They do not replace live play. A live screenshot is visual evidence. It does not prove the underlying reducer or persisted state.

## Traceability Matrix

| V1 invariant | Schema/static | Reducer/contract | Integration/UI | Live proof |
|---|---|---|---|---|
| Story Settlement is the sole semantic chronology | reject competing V1 record roots | one accepted scene yields zero/one episode | all routes project from episode effects and domain authority | inspect a multi-effect scene across chat, save, and UI |
| One scene does not create tracking spam | significance and aggregate policies validate | repeated details deduplicate or aggregate | Ship/Crew/Mission show concise result | replay the observed Breckenridge issue-spam scene |
| Assistant response settles on next player ingress | accepted-pair contract validates | unaccepted swipe has no committed response-derived effects | selected response becomes authoritative only after next player send | swipe several generations, then continue from one |
| Native source mutation reconstructs exactly | source references required | invalidation removes descendants by provenance | UI refreshes without permanent reconciliation screen | edit, delete, regenerate, branch, and reload in host |
| Objectives are evidence-backed | objectives reference valid effect/predicate vocabulary | unsupported claims and player self-certification reject | objective explanation cites safe committed evidence | complete equivalent action with varied prose |
| Objectives are non-linear | dependency graph validates and rejects accidental cycles | valid orders converge on same terminal state | UI avoids step numbering for parallel work | play alternate objective orders |
| Hidden objectives are spoiler-safe | player text and visible counts lint | visibility derives from player knowledge | hidden rows/counts/gaps absent | run Hesperus without discovering fraud |
| Optional discovery cannot block primary success | closure excludes unactivated optional work | rescue closes with optional branch absent | completion summary omits undiscovered branch | rescue and depart without investigating |
| Hidden facts cannot grade the player | fairness contracts validate for consequential gates | negative evaluation requires settled knowledge evidence | no failed row, blame, or lost reward before disclosure | deliberately miss a hidden discovery |
| Crew initiative reports facts, not answers | reporter roles and reveal routes validate | report deduplicates and cannot mutate unsupported truth | report attaches to correct assistant row | request nothing explicit and observe routine report route |
| Captain fallback is bounded | captain role and authority route validate | fallback triggers only for authored conditions | Whitaker provides constraint or question, not quest solution | omit a material officer report before a decision |
| Mission closure is deterministic | terminal and transition graph validates | exactly one terminal disposition and next target commit | completion state survives narrator failure | close, reload, retry narration, and verify one next mission |
| Deadlines are real | start/advance/visibility/expiry/consequence required | only authoritative time effects advance | no urgency block without visible clock | play a timed and untimed mission state |
| Command Bearing is one neutral reserve | old track/rank fields prohibited from V1 schema | explicit award/spend only; idempotent | one count with clear cause/effect | earn and spend through an informed authored decision |
| Emergent Focus is attention only | at most one reference, no duplicate payload | only explicit player action sets/replaces it | Mission shows one Focus without reward promise | focus then replace an episode consequence |
| Crew moments are rare and grounded | significance annotations bounded | repeated conversation does not create records | Crew shows only lasting moments | conduct routine and consequential conversations |
| Ship is one current aggregate | materiality and stable issue identity validate | observations merge or remain scene-local | no issue-per-mention rows | repeat flicker, odor, calibration, and real damage scenarios |
| Ashes is sole V1 campaign | catalog availability validates | unavailable packages cannot activate | teaser cards are greyed and disabled | keyboard/pointer test every campaign card |
| Narrator cannot mutate state | packet schema contains authorized state only | unrecognized narrated result has no effect | UI reflects reducer state, not prose claim | provoke omission and contradictory narration |
| Projection is rebuildable | player-safe field policy validates | pure projection is deterministic | route reload shows same data without writes | compare fresh render, save/reload, and branch render |

## Schema and Static Validation

### Identity and Cross-References

Validate:

- unique IDs for package, campaign, mission, phase, objective, fact, event, decision, outcome, clock, and transition;
- all referenced IDs exist in the pinned package version;
- target mission and phase transitions are reachable;
- objective predicates reference allowed committed state;
- model proposal schemas cannot carry executable predicate code;
- package updates cannot silently reinterpret persisted identifiers.

### Objective Graph

Reject:

- objectives without required/optional/conditional class;
- missing visibility rules;
- missing supported terminal dispositions;
- dependency on array position;
- cycles without approved convergence semantics;
- required objectives with no satisfying path;
- conditional-required objectives with an optional or hidden-only reveal route;
- optional objectives that accidentally block primary closure;
- several terminal transitions eligible at the same priority.

### Spoiler and Fairness Lint

Scan initial and intermediate player-safe fields for:

- hidden fact names and aliases;
- objective text that asserts an unrevealed culprit or cause;
- hidden objective totals or numbering gaps;
- failure copy based on undisclosed facts;
- deadline language whose clock is hidden;
- reward previews for undiscovered branches;
- private NPC knowledge.

Static text scan must be paired with human content review because spoilers may be semantic rather than keyword-identical.

### Clock Validation

Every displayed deadline has:

- start predicate;
- authoritative advancement source and unit;
- visibility predicate;
- expiry predicate;
- deterministic consequence;
- player-safe current and terminal copy.

Reject a generic urgency field with no clock definition.

### Catalog Validation

Validate that Ashes alone is playable. Other campaign records expose catalog-safe metadata only to the V1 selection projection and cannot reach campaign creation or activation.

## Reducer and Contract Tests

### Evidence Validation

Cover:

- known supported identifier;
- unknown or hallucinated identifier;
- allowed and disallowed effect type;
- source message missing;
- wrong role as evidence source;
- selected-swipe mismatch;
- text-hash mismatch;
- wrong branch or mission;
- stale base revision;
- duplicate proposal;
- valid and invalid claims in one proposal;
- high model confidence with unsupported evidence;
- player assertion of successful outcome;
- narrator assertion that contradicts committed result.

Expected behavior is deterministic rejection or acceptance with reason codes. No fallback guesses mutate state.

### Objective Reduction

For each mission, generate a state matrix covering:

- every valid objective activation;
- every supported terminal disposition;
- parallel objective orders;
- compound actions in one accepted pair;
- revisiting and repeating completed work;
- handoff, waiver, knowing decline, and informed failure;
- optional branch never activated;
- conditional branch activated late;
- closure-ready state with one required condition missing;
- closure reached through each authored permitted route.

### Mission Transitions

Prove:

- closure commits once;
- exactly one next target activates;
- retry and save/reload do not duplicate activation;
- narrator timeout does not undo commitment;
- narrator cannot select a different target;
- source invalidation removes closure and descendant activation before reconstruction;
- a reconstructed closure creates one replacement transition.

### Story Settlement

Cover:

- no-significance scene produces only a receipt;
- one meaningful conversation produces one episode;
- many typed effects remain attached to one episode;
- long scene reaches deterministic boundary behavior without per-turn fragmentation;
- repeated report/fact/objective/ship detail deduplicates;
- episode sealing produces a concise summary and unresolved consequences;
- one Focus reference targets a valid unresolved consequence;
- projection rebuild does not write new episodes.

### Command Bearing

Cover:

- routine objective completion yields no automatic point;
- hidden information yields no award or denial;
- authored informed judgment can award one neutral point;
- repeated source/retry cannot award twice;
- explicit spend validates availability, cost, and allowed effect;
- provider failure after committed spend preserves or deterministically refunds according to the spend transaction contract;
- no Inspiration, Resolve, Marks, rank, or review-queue state appears in V1-native data.

## Interpretation Conformance

Use recorded and synthetic Ashes scenes to express semantically equivalent actions as:

- a terse direct order;
- a polite request;
- dialogue embedded in narrative prose;
- delegation to a role rather than a named officer;
- technical or setting-specific vocabulary;
- indirect intent with clear conditions;
- several actions in one message;
- a conditional action whose premise proves false;
- a vague attempt needing narration before success;
- a metagame assertion of hidden truth.

Measure:

- supported evidence recall;
- unsupported evidence acceptance;
- duplicate claims;
- invented identifiers;
- confidence calibration;
- proposal size;
- convergence on the same authored effect type.

The desired behavior is not perfect recall. It is high precision for durable changes, safe no-op behavior under uncertainty, and later recovery when stronger evidence arrives.

Borrowed scene-boundary, retrieval, or character-moment behavior must be tested against fixtures derived from the pinned inspected extension revision. Tests protect the borrowed behavior before Directive-specific adaptation; they do not require those extensions to run beside Directive.

## Fair Discovery Scenarios

### Optional Discovery Omitted

Complete Hesperus rescue without requesting records or investigating fraud. Verify:

- routine competence may preserve records without forcing a reveal;
- no fraud objective, hidden count, missed marker, penalty, blame, or reward denial appears;
- rescue can receive full primary success;
- fraud may continue as a causal world fact only.

### Suspicion Without Confirmation

Reveal only the record discrepancy. Verify that Mission and crew language preserve uncertainty and no confirmed-fraud judgment occurs.

### Confirmation and Player Choice

Confirm fraud through grounded evidence, then test proportionate action, handoff, knowing inaction, and unconventional but informed choices. Verify primary rescue and optional accountability remain separate outcome dimensions.

### Required Disclosure Omitted

Cause the narrator to omit a material report before a consequential choice. Verify player knowledge does not commit, evaluation is held, one bounded recovery route is scheduled, repeated report spam does not occur, and Whitaker intervenes only within her fallback rules.

### Player Claims Hidden Knowledge

Have the player assert the fraud without evidence. Verify the statement is recorded as intent or allegation, not confirmed truth or objective completion.

## Deadline Scenarios

For each authored Ashes clock, test:

- inactive and invisible;
- started but not yet player-visible when causal-only;
- visible running with correct unit and consequence;
- paused and resumed through authored conditions;
- multiple authoritative advancements;
- invalid or duplicated time effect;
- resolution before expiry;
- expiry after a known deadline;
- hidden causal expiry without evaluative blame;
- save/reload and branch at every state;
- source invalidation across start and expiry.

An untimed urgent scene must render no deadline panel and never fall back to zero minutes.

## UI Semantic and Visual Tests

### Launcher and Routes

- ship icon opens/closes Directive;
- Assist is not required or opened by the launcher;
- no campaign opens Campaign; active campaign defaults to Mission;
- only Campaign, Mission, Crew, Ship, and Settings appear;
- removed routes and permanent consoles are absent;
- keyboard, pointer, touch, and screen-reader names work.

### Campaign

- Ashes is actionable;
- all non-Ashes campaign cards preserve approved names and images;
- teaser cards are greyed, legible, labeled unavailable, and unselectable;
- no disabled card can create or activate gameplay through alternate input;
- save cards do not duplicate active mission or ship dashboards.

### Mission

- objective grouping communicates required and optional work;
- parallel work does not look sequential;
- hidden objectives do not affect rows, counts, spacing, or completion copy;
- objective state cannot be changed by clicking a checkbox;
- evidence expands from player-known committed source;
- mixed mission outcomes remain concise;
- Focus is one explicit attention reference;
- urgency appears only for a valid visible clock.

### Crew

- routine conversations create no lasting moment card;
- one consequential encounter creates at most one relevant moment per affected recurring character;
- repeated fact/report wording does not duplicate relationship history;
- hidden private thoughts and raw mechanics never render.

### Ship

Reproduce the issue-spam case containing refit smell, sensor calibration concern, flickering corridor light, and systems not yet stressed together. Verify these details remain within one operational aggregate unless later evidence creates a material persistent restriction.

Also test actual damage, repair, shortage, capability loss, and resolved history so anti-spam behavior does not suppress important state.

### Command Bearing

- one neutral reserve renders;
- valid spend shows cost and effect before confirmation;
- award reason is concise and source-backed;
- Inspiration, Resolve, Marks, ranks, evidence ledgers, and review queues do not render.

## Source Mutation and Recovery Matrix

For every source-dependent effect type, test:

| Mutation | Required proof |
|---|---|
| choose another assistant swipe before next player send | provisional effects from abandoned swipe never commit |
| choose swipe after prior settlement through source edit/branch | dependent effects invalidate and reconstruct under source policy |
| edit player message | intent/evidence descendants update from surviving branch |
| edit assistant message | response-derived knowledge and outcomes invalidate when hash changes |
| delete one message | dependency chain is removed without unrelated loss |
| delete a range | closure and later activations reconstruct from the valid prefix |
| regenerate narration | committed mechanics do not reroll |
| Save As / branch | parent state copies once and future effects remain branch-local |
| stale provider response after mutation | response is discarded by revision/source check |
| projection failure during recovery | authority remains intact and UI does not invent fallback state |

No case requires the player to approve a Scene Reconciliation proposal. A contextual error may ask for intervention only when exact automatic recovery is impossible.

## Failure and Abuse Cases

Explicitly cover:

- malformed JSON;
- provider timeout;
- provider returns prose instead of typed output;
- model cites a nonexistent source;
- model invents a fact or objective ID;
- model emits too many low-value claims;
- narrator omits required disclosure;
- narrator reveals hidden truth;
- narrator declares mission success early;
- repeated Duty Report for the same fact;
- report assigned to an unavailable or unqualified officer;
- Whitaker solves the player's choice;
- hidden deadline and surprise evaluation;
- mission closes before required evidence;
- two next missions become eligible;
- completion narration fails;
- player denies all optional work;
- player attempts to farm Command Bearing;
- player self-declares repair, rescue, discovery, or completion;
- incidental ship description produces issue spam;
- ordinary friendly exchange produces character-memory spam;
- long scene never reaches a natural boundary;
- background analysis returns after branch change;
- legacy record reaches a V1 projection unexpectedly.

Every failure has an expected safe behavior, diagnostic reason, and recovery path. “The model should handle it” is not an acceptance condition.

## Ashes Release Gate

### Reference Slice Gate

Prelude/Hesperus passes only after:

- all Hesperus outcome matrix cases pass deterministically;
- at least six substantially different prose styles complete the rescue;
- at least three valid objective orders complete Prelude;
- rescue succeeds with fraud undiscovered;
- suspicion and confirmation remain distinct;
- Duty Report and Whitaker fallback behave correctly;
- mission closure activates the next phase exactly once;
- Story Settlement and every UI route show nonduplicated state;
- full source mutation and save/reload matrix passes in SillyTavern.

### Complete Campaign Gate

The complete Ashes campaign requires multiple end-to-end traversals covering:

- mission-focused play;
- investigation-heavy play;
- delegation-heavy play;
- terse and prose-heavy command styles;
- non-linear objective order;
- optional branches completed, handed off, declined, and undiscovered;
- informed good, costly, and poor judgments;
- every authored deadline path;
- Command Bearing award and spend opportunities without farming;
- ship and crew consequences;
- save/reload and at least one branch;
- provider failure and narration fallback;
- authored campaign conclusion and final projection.

### Live Artifact Requirements

For each certification run retain:

- campaign/save identity and package version;
- host chat source or a sanitized reproducible fixture;
- provider/model configuration and contract versions;
- state transaction and Story Settlement diagnostics;
- objective, deadline, transition, and Command Bearing projections;
- screenshots of all five routes at representative states;
- source mutation evidence;
- final outcome and operator notes;
- unresolved defects and their severity.

### Operator Approval

At least one complete live Ashes run must receive explicit operator approval for:

- clarity without spoilers;
- freedom of approach;
- fair consequence framing;
- crew competence without unwanted handholding;
- low tracking noise;
- meaningful but restrained Command Bearing;
- mission closure and campaign pacing;
- UI information value.

Deterministic and automated gates may pass while operator approval remains open. In that state the V1 gameplay architecture is not release-certified.

## Regression Boundary

Retiring old writers and UI must not regress:

- campaign chat creation and binding;
- prompt injection isolation;
- committed mechanics surviving narration retry;
- transaction durability;
- save and branch safety;
- provider diagnostics needed by operators;
- package validation and import safety;
- accessibility and responsive shell behavior.

Legacy tests that assert removed V1 behavior should be reclassified as historical/current-runtime characterization before deletion. New target tests must be green before the old writer or UI path is removed.

## Completion Criteria

V1 gameplay architecture verification is complete only when:

- every invariant in the traceability matrix has named evidence at every applicable layer;
- all schema, reducer, integration, semantic UI, visual, and accessibility gates pass;
- interpretation conformance shows safe varied-prose behavior;
- failure and abuse cases fail safely;
- Hesperus and every remaining Ashes mission satisfy closure and fairness matrices;
- native SillyTavern source mutation reconstructs exact state;
- all non-Ashes cards remain unselectable;
- the complete Ashes live campaign gate passes;
- operator approval is recorded;
- current/as-coded documentation is updated to match the implemented boundary;
- no removed tracker retains independent V1 write authority.

## Final Test Rule

Directive V1 is proven only when the same accepted story source produces explainable deterministic state, a concise player-facing game, and a complete fair Ashes campaign in the real host.
