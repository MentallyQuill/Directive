# Continuity Projection Matrix

Status: pre-alpha design proposal  
Primary owner: Runtime / Context Orchestration  
Related docs: [Director Retrieval And Context Orchestration](../architecture/DIRECTOR_RETRIEVAL_AND_CONTEXT_ORCHESTRATION.md), [Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md), [Target User Flow](TARGET_USER_FLOW.md), [Scene Handshake Protocol](SCENE_HANDSHAKE_PROTOCOL.md), [Outcome Integrity](OUTCOME_INTEGRITY.md)

## Purpose

Directive needs a continuity projection layer that can inject dynamic, revolving layers of continuity into different prompt depths according to relevance, criticality, source authority, visibility, and audience.

The current context builder already creates prompt candidates with placement, depth, role, TTL, priority, salience, source ids, and safety metadata. That is a good base. It is not enough for continuity-critical facts. A fact like "Bronn is not human" or "the Breckenridge has been under warp toward the Asterion Reach for weeks" cannot compete as ordinary scene color. It must be treated as an authoritative continuity constraint with a protected prompt lane, visible audit trail, and contradiction checks.

The larger design goal is that the matrix becomes the campaign's continuity state machine over evolving campaign reality. It starts from authored package truth, but it must also absorb validated player-driven changes to the world, ship, crew, factions, pressures, missions, locations, and campaign arcs. The player should be able to affect the greater campaign. Those effects should stack, supersede older facts, create new facts, retire stale facts, and later return as active continuity when the scene makes them relevant.

The Continuity Projection Matrix is the backend system that decides:

- Which continuity facts are eligible for the current turn.
- Which facts are hard invariants versus soft support.
- Which facts are authored baseline, current reality, past history, superseded, dormant, or rejected.
- Which facts are player-safe, director-only, hidden, or diagnostic-only.
- Which prompt lane and depth each fact receives.
- Which facts rotate in and out as background context.
- Which generated transcript claims are quarantined until validated.
- Which omissions or contradictions should fail tests or trigger regeneration.

## Problem Statement

Directive is trying to run a persistent campaign inside a host chat model. That means every response depends on two different kinds of intelligence:

- Campaign intelligence: what is true, what changed, what is hidden, what the player did, what consequences stacked, which Directors own which domains, and what can happen next.
- Language-model intelligence: how to write the next scene, dialogue, report, or response in a natural way.

The current system has pieces of campaign intelligence, but it does not yet have a single continuity projection layer that resolves those pieces into prompt-ready truth. Continuity is scattered across:

- Bundled campaign package data.
- Campaign projection JSON.
- Live campaign save state.
- Mission graph state.
- World, ship, crew, pressure, thread, relationship, command, and event ledgers.
- Mission Director turn packets.
- Open-world boundary events.
- Sidecar proposals and sidecar journals.
- Scene Handshake settlements.
- Command Log summaries.
- Prompt-context blocks.
- The host chat transcript.
- Reconciliation and edit/retry records.

Those sources do not have equal authority. Package-authored crew identity is not the same kind of evidence as host-generated prose. A committed state delta is not the same kind of evidence as a Command Log summary. A hidden mission fact may be available to a Director but forbidden to the narrator. A stale generated claim may still be present in the transcript but must not become campaign truth.

Today, the prompt builder can assemble useful player-safe blocks, but it is not a campaign continuity state machine. It does not fully track:

- Source authority.
- Fact lifecycle.
- Conflict keys.
- Supersession.
- Branch-local truth.
- Hidden versus narrator-safe audience packets.
- Generated-claim quarantine.
- Hard invariant prompt lanes.
- Cross-domain continuity created by stacked player actions.
- Why a fact was injected, skipped, blocked, compressed, or rejected.

That means the host model can receive a plausible but incomplete context packet. When a fact is missing, weakly phrased, too deep, compressed into vague prose, or contradicted by transcript flavor, the model fills the gap with its own defaults. In Star Trek-shaped prose, those defaults are often wrong: a named officer becomes a generic human, a starship near a major shipyard is assumed to be near Earth, or a route becomes "six days at impulse" because the model is pattern-completing rather than reasoning from authoritative campaign state.

The Directors do not fully solve this by themselves. Mission Director output is turn-local and runs mainly for consequential turns. Sidecar Directors are background proposal workers and explicitly do not inject prompt text. Crew, Ship, Continuity, Relationship, and Command workers can help update state, but only after validation. The narrator and host generation still need a separate system that turns validated state into the right prompt packets at the right depth every turn.

The deeper product problem is that Directive wants campaigns where the player can change the world. The player may affect ship readiness, crew posture, faction trust, open-world availability, regional pressure, mission outcomes, and future options. Those changes stack in unusual ways. Some become current state. Some become history. Some supersede authored setup. Some are branch-local. Some are hidden but still important to Director reasoning. Some become player-known lore later. Without a continuity state machine, those changes either disappear into old summaries or leak into the prompt as unstructured prose.

The system failure is therefore not just "the prompt needs more lore." The failure is that Directive lacks a deterministic service that can answer, for the current turn:

- What is true now?
- What used to be true?
- What changed because of the player?
- What is hidden?
- What is player-known?
- What has been superseded?
- What generated claims are known false?
- What facts are hard invariants?
- Which audience may see each fact?
- Which prompt depth should each fact occupy?
- Which omissions are safe, and which are continuity bugs?

The Continuity Projection Matrix exists to answer those questions before Director reasoning, before host generation, before Directive-owned narration, and after generation for contradiction checks.

The desired result is not a larger static prompt. It is model-adjudicated continuity projection under deterministic authority rails: the Utility provider decides what matters now, while the backend decides what is true, visible, legal, and installable. The model should write freely inside the boundaries of current campaign reality; it should not invent those boundaries.

## Failure Modes This Must Fix

The latest Sam Vickers / Breckenridge campaign exposed two related failures.

First, generated prose described Bronn as "a human male in his early forties." That is a source-authority failure. The prompt did not project Bronn's campaign-owned identity and species facts with enough force, or the generated text was not checked against those facts afterward.

Second, generated prose claimed the ship had been "at impulse for six days since leaving Utopia Planitia." That is a travel-continuity failure. The campaign material indicates a long warp transit, roughly around warp 5.5 for weeks, with the Breckenridge rendezvousing with the player's shuttle near the Asterion Reach. A compact travel block would help, but it would only patch one symptom. The broader issue is that continuity-critical facts are not consistently materialized, ranked, projected, audited, and protected from raw transcript flavor.

The matrix should make these failures hard to produce:

- Crew identity facts should be hard invariants when the crew member is present, referenced, speaking, or likely to be described.
- Travel facts should be hard or scene-critical invariants when location, route, stardate, ship status, mission phase, or rendezvous timing is in scope.
- Generated claims should not become authoritative merely because they appeared in assistant prose.
- Thread summaries should not carry unvalidated prose such as "the ship is at impulse" into future prompts.
- Prompt audit should show whether a required fact was injected, skipped, compressed, hidden, blocked, stale, or contradicted.

## Saga Review Baseline

Saga's injection and Lore Automation systems are the strongest local reference. The design below adapts their useful mechanics while avoiding a direct copy.

### Prompt Injection

Saga installs separate SillyTavern extension prompts rather than building one giant memo:

- `saga_continuity_state`
- `saga_lore_high_relevance`
- `saga_lore_normal_relevance`
- `saga_lore_low_relevance`

The prompt injector builds continuity separately from lore, then injects each lane with configured role, position, and depth. High relevance lore defaults closer to the prompt than normal and low relevance lore. The injection lifecycle clears prompts when the extension is disabled, a chat changes, a generation fails, or prompt sync encounters an error.

Key lesson for Directive: continuity projection should own multiple named prompt lanes. The matrix should not collapse hard identity facts, current scene facts, travel facts, crew color, and background hooks into one undifferentiated block.

### Lore Memo Building

Saga builds direct continuity and relevance-tiered lore. Its lore memo can render direct text or compressed summaries. Compression is cacheable by a source signature that includes the relevant source text, selected entries, compression policy, and template hash.

Key lesson for Directive: compression is useful for broad support layers, but hard constraints must remain direct, short, and source-id backed. A compressed paragraph must not be the only representation of a critical route, identity, status, or hidden-information boundary.

### Relevance And Context Gates

Saga models lore with relevance tiers (`high`, `normal`, `low`), purpose values, context gates, scope matches, temporal windows, present characters, current location, recent text, and current activity. Injection filtering excludes disabled, archived, muted, non-injectable, tier-mismatched, or context-ineligible entries. Pinned or elevated cards can survive ordinary caps, but deterministic gates still apply.

Key lesson for Directive: relevance should be computed from current scene coordinates, not just from static card priority. A low-level crew fact can become a high-priority invariant when that crew member speaks. A distant travel fact can become critical when the model is about to mention where the ship is or how long it has travelled.

### Lore Automation

Saga's automation levels separate authority from assertiveness:

- Off: no automation.
- AR: promote or demote relevance.
- ARMP: relevance plus mute, unmute, pin, and unpin.
- ARMPC: relevance, mute, prominence, and curation.

Style (`careful`, `balanced`, `aggressive`) changes thresholds, not authority. Provider routing (`auto`, `utility`, `reasoning`, `local`) controls whether a local pass, utility model, or reasoning model is used. The system is local-first, uses model adjudication only for bounded candidate packets, records run journals, and disables automation for a card after manual edits so user ownership wins.

Key lesson for Directive: continuity automation should be reversible, audited, and authority-bounded. A model may suggest that a fact should be promoted, muted, or summarized; validation decides whether that operation is legal.

### Audit And Lifecycle

Saga records prompt char counts by tier, selected lore ids, context gate results, skipped reasons, over-cap counts, provider status, model status, and latest run metadata. Its event lifecycle clears stale prompts aggressively on stop, fail, abort, disable, and chat change.

Key lesson for Directive: the matrix must produce a prompt projection audit every turn. When a hallucination happens, the audit should answer whether the source fact was missing, blocked, compressed too weakly, contradicted by a generated-prose summary, or present but ignored by the model.

### Saga Lore Automation Lessons For Directive

Saga's Lore Automation is useful as reference architecture, not as a direct blueprint. Saga manages lore-card relevance and visibility. Directive's matrix must manage campaign reality: authored facts, player-driven world changes, Director outputs, sidecar-applied state, hidden facts, rejected generated claims, and prompt projection.

The useful Saga patterns:

- Tiered injection: Saga's high, normal, and low relevance lanes map to Directive's hard invariant, scene-critical, relevant-support, and revolving-background layers.
- Context gates first: deterministic eligibility should run before model relevance judgment. If a fact is hidden, stale, wrong-branch, wrong-location, or outside the current temporal window, model enthusiasm should not matter.
- Automation modes: Saga's AR / ARMP / ARMPC progression maps to Directive's promote, promote-pin-mute, and curate modes. Each mode expands what automation may suggest; it does not erase deterministic validation.
- Style is not authority: careful, balanced, and aggressive should change thresholds, candidate caps, and confidence requirements, not what the system is allowed to mutate.
- Local-first, model-assisted: deterministic scoring should be the default. Models may adjudicate bounded candidate packets, but validation owns acceptance.
- Run journals and audits: every projection run should explain selected facts, skipped facts, hidden blocks, context-gate failures, over-budget omissions, provider status, and prompt hashes.
- Manual ownership wins: authored facts, committed outcomes, user-approved corrections, and manually pinned/muted continuity should beat automation.
- Prompt lifecycle safety: named prompt lanes must be cleared or rebuilt on chat change, generation stop/fail/abort, disable, save load, branch switch, and prompt sync failure.

The important caution:

Directive must not reduce the matrix to "Saga lorecards with a new name." Lore Automation manages entries. The Continuity Projection Matrix manages state-derived truth. That requires stronger authority ranking, conflict keys, lifecycle states, branch identity, generated-claim quarantine, Director cooperation, and contradiction guards than Saga needed.

The design rule is:

```text
Use Saga for relevance automation mechanics.
Use Directive state and Director contracts for truth authority.
```

## Design Goals

- Project authoritative continuity into the prompt at the right depth every turn.
- Treat hard facts as constraints, not flavor.
- Keep hidden and player-safe facts separated by audience.
- Treat player-driven world changes as durable campaign reality after validation.
- Preserve active, historical, dormant, superseded, branch-local, hidden, and rejected continuity as distinct lifecycle states.
- Make background continuity rotate without displacing critical facts.
- Prevent raw generated prose from becoming source authority.
- Produce an inspectable audit for every projection run.
- Make Utility planning the standard dynamic relevance layer for projection, while keeping truth, visibility, authority, prompt installation, and state mutation deterministic.
- Keep the system package-agnostic so every campaign benefits.

## Non-Goals

- This is not a general lorebook replacement. It is a continuity projection and prompt-safety layer.
- This does not let the narrator mutate campaign state.
- This does not make hidden truths visible just because they are relevant.
- This does not replace the Mission, Crew, Ship, Command, or Narrative Thread Directors. It feeds them, receives validated results from them, and projects their committed effects.
- This does not preserve legacy prompt behavior. Directive is pre-alpha, so the prompt stack can be revised in place.
- This does not require every fact to be injected every turn.
- This does not make the matrix a second canon store. Canon remains in package data, campaign state, owned ledgers, and validated state deltas; matrix storage is for projection hints, rejected/candidate claims, accepted non-derivable facts, caches, overrides, and audits.

## Core Model

The matrix has six conceptual layers:

1. Campaign Baseline: immutable package truth, hidden setup, authored constraints, starting world, crew identity, and possible arcs.
2. Campaign Event Ledger: validated player-driven events, Director outcomes, sidecar-applied state deltas, Scene Handshake settlements, accepted reconciliation, branch events, and explicit user decisions.
3. Materialized Campaign Reality: the current resolved state produced by applying events and reducers to the baseline and the active save branch.
4. Materialized Fact Index: source-backed continuity records rebuilt from baseline, current reality, historical events, derived summaries, rejected claims, and hidden state. This is an addressable view, not an independent canon.
5. Utility Projection Plan: a bounded model-adjudicated plan that selects from candidate fact ids, assigns lane/force/guard focus, and recommends compression or cooldown. It cannot create truth, prompt prose for hard facts, or state mutations.
6. Projection Run: deterministic validation, prompt rendering, prompt installation, contradiction guard input, adaptive hints, and audit output.

The baseline answers "what was authored." The event ledger answers "what happened and why." Materialized campaign reality answers "what is true now." The materialized fact index answers "which truths, histories, and rejected claims are addressable by continuity." The Utility plan answers "which of the supplied candidates matter now." The validated projection run answers "which facts are legally visible, where they install, how they are guarded, and why."

```text
campaign package baseline
+ campaign projection
+ validated player actions
+ Director outcomes
+ world/ship/crew/faction/mission state deltas
+ accepted Scene Handshake and reconciliation facts
+ save branch events
-> materialized campaign reality
-> continuity fact index
-> Utility projection plan
-> prompt lanes + contradiction guard + audit
```

## Operating Thesis

The matrix is a two-layer system.

Deterministic substrate owns:

- Source materialization.
- Fact identity and provenance.
- Visibility gating.
- Authority ranking.
- Conflict-key enforcement.
- Branch and swipe isolation.
- Prompt-key installation and clearing.
- State mutation boundaries.
- Post-generation enforcement actions.
- Audit records.

Utility planning owns:

- Contextual relevance.
- Prompt force.
- Lane assignment recommendations.
- Negative-constraint use.
- Guard focus.
- Compression grouping.
- Adaptive boosts and cooldowns.
- Undershoot and overshoot diagnosis.
- High-risk generated-claim extraction.

The contract is:

```text
The Utility provider decides what matters now.
The backend decides what is true, visible, legal, and installable.
```

This prevents two opposite failures:

- Undershoot: deterministic triggers miss a fact that matters, so the narrator fills the gap with a false default.
- Overshoot: deterministic triggers inject too many stale facts, so the prompt bloats and the model loses the current scene.

Deterministic code should over-recall safe, source-backed candidates. The Utility planner should select, demote, promote, compress, or route those candidates to guard-only. The validator then rejects or corrects illegal output before prompt blocks, Director packets, guard inputs, or audits are produced.

## Evolving Campaign Reality

The matrix must not treat authored campaign data as truth forever. Authored data is the starting reality and possibility space. Live campaign reality is the accumulated result of validated play.

Example:

```text
Player diverts power to keep a hospital ship alive.
```

That can create durable continuity across several domains:

- Ship: reserve power drops and engineering stress rises.
- Crew: the engineer's visible posture toward the XO shifts.
- Region: survivors and local institutions remember the intervention.
- Faction: regional trust rises, but Starfleet scrutiny may also rise.
- Mission: one future option opens while another closes.
- Lore: "the hospital ship was saved by the Breckenridge's intervention" becomes true in this branch.
- Prompt: the fact may be immediate, historical, dormant, or background depending on the scene.

The matrix should represent these changes as world deltas and derived facts, not as loose prose. A world delta records the transactional change. A fact records the continuity-facing truth that can later be projected.

```json
{
  "id": "world-delta.asterion-hospital-ship-survives",
  "causedByTurnId": "turn-18",
  "sourceOutcomeId": "outcome.turn-18",
  "domain": "regional",
  "subjectId": "asterion-refugee-network",
  "operation": "upsert",
  "field": "breckenridgeReliefCredibility",
  "value": "proven",
  "durability": "campaign",
  "visibility": "playerKnown",
  "conflictKey": "asterion.refugeeNetwork.reliefCredibility",
  "provenance": "validatedOutcome"
}
```

The materializer can then derive a promptable continuity fact:

```text
The Asterion refugee network treats the Breckenridge as a proven relief actor because the crew protected the hospital ship during the convoy crisis.
```

That fact is emergent campaign lore. It was not authored in the package, and it was not invented by narration. It was created by validated player action and stored in campaign reality.

The matrix should track lifecycle states:

| Lifecycle State | Meaning |
| --- | --- |
| `authoredBaseline` | Starting package truth or authored constraint. |
| `initialized` | Package truth projected into a specific campaign save. |
| `active` | Currently true and scene-relevant. |
| `committed` | Created by a validated outcome, state delta, Scene Handshake, or reconciliation. |
| `historical` | True past event, not current state. |
| `dormant` | True but not currently relevant. |
| `superseded` | Replaced by a later committed fact. |
| `branchLocal` | True only in this save branch. |
| `hidden` | True but barred from narrator projection until revealed. |
| `candidate` | Suggested by model or transcript, awaiting validation. |
| `rejected` | Known false, contradicted, stale, or user-rejected. |

This gives the matrix enough structure to track active and past lore without becoming one giant mutable lore blob.

## Fact Record

Every continuity item that can affect generation should be represented as a fact record or derived from one.

```json
{
  "id": "ashes.travel.breck-to-asterion-route",
  "text": "The U.S.S. Breckenridge has been travelling at warp toward the Asterion Reach for weeks and is rendezvousing with the player's shuttle roughly a week from arrival.",
  "factType": "travel_status",
  "sourceType": "package_projection",
  "sourceId": "breckenridge/ashes-of-peace.campaign-projection.json#startingFrame.travel",
  "authority": "hard",
  "visibility": "playerKnown",
  "audiences": ["narrator", "missionDirector", "shipDirector", "contradictionGuard"],
  "criticality": "hardInvariant",
  "scope": {
    "campaignId": "ashes-of-peace",
    "shipIds": ["breckenridge"],
    "locations": ["utopia-planitia", "asterion-reach"],
    "topics": ["travel", "route", "arrival", "rendezvous"]
  },
  "ttl": "mission",
  "conflictKey": "ship.currentTransit",
  "validFrom": "campaignStart",
  "validTo": "asterionArrival",
  "derivedFrom": [],
  "confidence": 1
}
```

Required fields:

- `id`: stable, package/save-safe id.
- `text`: direct projection text, written as an instruction-safe factual sentence.
- `factType`: identity, species, travel status, location, mission objective, ship condition, relationship state, hidden truth, active pressure, event outcome, etc.
- `sourceType`: package, campaign state, campaign event, world delta, outcome packet, command log, scene snapshot, derived projection, generated candidate, user edit, or diagnostic.
- `sourceId`: resolvable pointer for audit.
- `authority`: hard, committed, derived, soft, candidate, or rejected.
- `visibility`: public package, player known, player discoverable, director only, locked hidden, diagnostic only.
- `audiences`: the consumers allowed to receive the fact.
- `criticality`: hard invariant, contradiction guard, scene critical, relevant support, soft color, background, diagnostic.
- `scope`: scene and retrieval coordinates.
- `ttl`: turn, scene, location, mission, chapter, campaign, branch, save.
- `conflictKey`: optional key used to suppress mutually exclusive claims.
- `confidence`: `1` for authored or committed facts, lower for model-suggested candidates.

## Projection Candidate

A projection candidate is the per-turn prompt form of a fact or fact group.

```json
{
  "id": "projection.travel.current-transit",
  "factIds": ["ashes.travel.breck-to-asterion-route"],
  "title": "Current Transit",
  "content": "- The Breckenridge is under warp toward the Asterion Reach, not at impulse near Earth.\n- It has been underway for weeks and is near enough for XO shuttle rendezvous roughly a week out from arrival.",
  "audience": "narrator",
  "promptKey": "directive_continuity_invariants",
  "role": "system",
  "placement": "inPrompt",
  "depth": 1,
  "criticality": "hardInvariant",
  "relevance": "immediate",
  "ttl": "scene",
  "mustInclude": true,
  "tokenEstimate": 49,
  "reason": "Ship location, elapsed travel, and route are likely to be mentioned in the active scene."
}
```

Candidates can group multiple facts when their conflict keys and audiences are compatible. Hard facts should remain direct. Soft background can be compressed.

## Matrix Dimensions

### Source Authority

| Authority | Meaning | Prompt Treatment |
| --- | --- | --- |
| `hard` | Authored package or campaign projection fact that must not be contradicted. | Direct, near-front system lane when relevant. |
| `committed` | Accepted outcome packet, state delta, or Command Log fact. | Direct or compact, depending on criticality. |
| `derived` | Deterministic projection from hard or committed state. | Direct if critical; compact if supportive. |
| `soft` | Atmosphere, tone, optional hooks, ordinary background. | Rotating or compressed. |
| `candidate` | Generated or model-suggested fact not yet validated. | Not injected as authority. May enter review/audit. |
| `rejected` | Contradicted, stale, superseded, or user-rejected claim. | Never injected except as diagnostic or contradiction guard. |

Generated transcript prose starts as `candidate`, not `committed`. It can become committed only through Scene Handshake, outcome validation, explicit state delta, or user-approved reconciliation.

### Visibility

| Visibility | Meaning | Narrator Eligible |
| --- | --- | --- |
| `publicPackage` | Safe public campaign premise. | Yes. |
| `playerKnown` | Established to the player or their role. | Yes. |
| `playerDiscoverable` | Can be surfaced if the scene earns it. | Conditional. |
| `directorOnly` | Can inform Director logic, not narration. | No. |
| `lockedHidden` | Hidden truth locked behind reveal gates. | No. |
| `diagnosticOnly` | For inspector and tests only. | No. |

Visibility is independent from relevance. A hidden fact can be very relevant and still be barred from the narrator lane.

### Criticality

| Criticality | Meaning | Default Depth |
| --- | --- | --- |
| `hardInvariant` | Contradiction would break campaign reality. | System, depth 0-1. |
| `contradictionGuard` | Usually phrased as a negative constraint. | System, depth 1-2. |
| `sceneCritical` | Needed to answer the current turn correctly. | System, depth 2-3. |
| `relevantSupport` | Helps maintain continuity but omission is tolerable. | System, depth 4-5. |
| `softColor` | Improves flavor, mood, or voice. | System or user, depth 7-9. |
| `background` | Long-range orientation. | Rotating, depth 8-10. |
| `diagnostic` | Inspector, tests, or guardrails only. | Not injected. |

Criticality caps relevance. A hard invariant cannot be demoted below the protected lane just because it was injected recently.

### Relevance

| Relevance | Trigger Examples |
| --- | --- |
| `immediate` | Referenced by the player, present speaker, current location, route, current problem, active mission phase. |
| `active` | Causally affects the scene but is not directly named. |
| `nearby` | Could become relevant if the scene moves one step. |
| `background` | Useful orientation, not currently causal. |
| `suppressed` | Muted, superseded, stale, hidden from this audience, or over cap. |

Relevance is recalculated every projection run from scene snapshot, recent player text, current command intent, present characters, active pressures, mission phase, location, ship state, elapsed time, and retrieval coordinates.

### TTL

| TTL | Meaning |
| --- | --- |
| `turn` | Only this generation. |
| `scene` | Until scene, speaker set, foreground question, or location changes. |
| `location` | While the current place or ship zone remains operative. |
| `mission` | While the current mission or assignment remains active. |
| `chapter` | Current chapter/arc frame. |
| `campaign` | Stable campaign fact. |
| `branch` | Save-branch-specific fact. |
| `save` | Explicitly persisted save-local fact. |

TTL controls rotation and invalidation, not truth. A campaign fact can be true but not injected when irrelevant.

### Audience

The same fact may project differently by audience:

- `narrator`: player-safe prompt context for visible generated prose.
- `missionDirector`: mission logic, clues, outcomes, hidden clocks.
- `crewDirector`: crew behavior, private motives, relationship state.
- `shipDirector`: ship systems, travel, damage, constraints.
- `commandDirector`: command mechanics, competence hints, Bearing records.
- `commandLog`: committed recap generation.
- `contradictionGuard`: post-generation validation and retry guidance.
- `diagnostic`: inspector, tests, and prompt audit.

Audience filtering happens before relevance scoring. A hidden fact should never rely on low relevance to stay out of the narrator prompt.

## Prompt Layers

Directive should use multiple named extension prompt keys, with all injected content role `system` unless a specific host contract requires otherwise.

| Layer | Prompt Key | Default Placement | Default Depth | Content |
| --- | --- | --- | --- | --- |
| L0 | `directive_contract` | `inPrompt` | 0 | Directive role, player authority, hidden-info boundaries, no state invention. |
| L1 | `directive_continuity_invariants` | `inPrompt` | 1 | Current hard invariants: identity, species, role, route, location, time, ship state, active mission boundaries. |
| L2 | `directive_active_scene` | `inChat` | 2 | Present scene, foreground question, present actors, immediate stakes. |
| L3 | `directive_domain_continuity` | `inChat` | 3-5 | Crew, ship, world, mission, pressure, and command facts that actively shape this turn. |
| L4 | `directive_committed_recap` | `inChat` | 5 | Recent committed outcomes only. No raw transcript claims. |
| L5 | `directive_revolving_context` | `inChat` | 7-9 | Rotating nearby opportunities, soft color, background orientation, long-range hooks. |
| L6 | `directive_diagnostics_shadow` | not injected | n/a | Hidden audit, blocked facts, rejected facts, contradiction guard inputs. |

The existing context-orchestrator candidates can migrate into these lanes. The important change is that L1 and the contradiction guard become first-class and source-backed, not just high-salience ordinary candidates.

## Revolving Context

Revolving context is for background and soft support only. It should not rotate out hard constraints.

The rotation policy:

- Reserve protected token budget for L0-L3 before considering L5.
- Give each soft/background fact a cooldown after injection.
- Prefer facts with nearby relevance, recent user interest, active location, or active pressure links.
- Keep a small exploration slot for low-frequency facts so the campaign world remains rich.
- Never rotate hidden facts into narrator context.
- Never rotate rejected or candidate facts as authority.
- Keep source ids and skip reasons for every omitted fact.

This gives the model a changing periphery without sacrificing continuity.

## Selection Pipeline

```text
campaign package + campaign state + scene snapshot + recent input
-> fact materialization
-> authority and conflict resolution
-> audience and visibility gates
-> deterministic hard gates
-> deterministic broad recall
-> Utility projection planner request
-> Utility projection plan
-> deterministic plan validation
-> prompt lane rendering and token budgeting
-> extension prompt sync
-> projection audit
-> post-generation contradiction scan
-> generated-claim quarantine and projection-hint update
```

### 1. Fact Materialization

The matrix should materialize facts from:

- Campaign projection: player role, ship, crew, starting route, active mission, campaign tracks.
- Package datasets: crew records, locations, factions, ship specs, mission templates, authored constraints.
- Campaign event ledger: validated player-caused events, branch events, quest boundaries, world boundary events, and accepted reconciliation.
- Materialized world state: current actors, fronts, factions, locations, clocks, assets, routes, open quests, and active pressures after reducers apply stacked events.
- Campaign state: current location, ship status, mission phase, pressure ledger, thread ledger, relationship state, revealed facts.
- Outcome packets: committed events, costs, consequences, obligations, Command Bearing evidence.
- Command Log: concise committed summaries, never raw unvalidated prose.
- Scene snapshot: present actors, foreground question, active orders, active location, recent player intent.
- Scene Handshake: accepted generated prose that was validated into state.

This is also where package schema gaps become visible. If a campaign has travel status only as prose in an authoring note, the projection step should convert it into structured facts.

### 2. Audience And Visibility Gates

Before scoring, each fact is filtered by audience:

- Narrator cannot see `directorOnly`, `lockedHidden`, or `diagnosticOnly`.
- Crew Director can receive private crew facts, but narrator receives only safe behavior-facing summaries.
- Mission Director can receive hidden mission truth, but Command Log receives only committed visible results.
- Contradiction Guard can receive hidden facts only if the guard result does not reveal them in the generated retry prompt.

This is the strongest safety boundary in the system.

### 3. Deterministic Hard Gates

Hard gates decide eligibility:

- Current campaign/package id.
- Current save branch.
- Active chapter, mission, phase, quest, and scene.
- Present or mentioned characters.
- Current location and nearby locations.
- Current ship state and travel route.
- Player knowledge and reveal state.
- Valid-from / valid-to anchors.
- Conflict keys and supersession records.
- User or system mute/pin decisions.

Facts that fail hard gates are not injected even if a model says they are relevant.

### 4. Deterministic Broad Recall

Recall should be broad so the system does not miss subtle continuity. Its job is not to answer "should this fact be injected now?" Its job is to answer "could this fact plausibly matter for this turn, and is it safe to show to this audience?"

- Direct id matches from scene snapshot.
- Speaker and mentioned-character lanes.
- Location and route lanes.
- Ship status and travel lanes.
- Active mission and open order lanes.
- Active pressure and obligation lanes.
- Recent committed outcome lanes.
- Player text topic extraction.
- Current command intent and competence domain.
- Pinned/elevated continuity lanes.
- Rotating background exploration lane.
- Optional model-expanded needs lane, bounded and validated.
- Recent rejected-claim lanes.
- Facts recently omitted before a guard violation.
- Facts with active projection hints.

The travel miss should be caught by several lanes: current ship lane, route lane, active mission lane, starting-frame lane, and contradiction guard lane.

Broad recall should return both hard floors and candidates:

```js
{
  hardFloor: [
    {
      factId: 'ship.uss-breckenridge.currentTransit',
      minimumLane: 'L1',
      minimumForce: 'sceneCritical',
      reason: 'Current transit and location are active for this scene.'
    }
  ],
  candidates: [
    {
      factId: 'crew.hadrik-bronn.species',
      localSignals: {
        entityMentioned: true,
        presentActor: true,
        likelyDescriptionRisk: true,
        recentContradiction: true
      },
      localSuggestedLane: 'L1',
      localReason: 'Bronn is present or likely to be described.'
    }
  ]
}
```

Recommended pre-planner limits:

- `maxCandidateFactsBeforeUtility`: 80
- `maxFactsInUtilityRequest`: 48
- `maxHardFloorFacts`: 12
- `maxRejectedClaimsInUtilityRequest`: 12
- `maxRecentMessagesForPlanner`: 8

If recall exceeds caps, deterministic pre-pruning should prefer hard authority, current-scene matches, player mentions, present actors, active mission/location/ship state, recent contradictions, active projection hints, and Director-route matches.

### 5. Utility Projection Planner

The Utility planner is the dynamic intelligence layer for projection. It receives an audience-filtered candidate packet and returns operations by fact id only. It does not author hard fact prose, invent facts, reveal hidden facts, mutate state, or install prompt keys.

Role contract:

```js
continuityProjectionPlanner: {
  id: 'continuityProjectionPlanner',
  label: 'Continuity Projection Planner',
  providerKind: 'utility',
  blocking: true,
  output: 'structured-json',
  timeoutMs: 15000,
  structuredOutput: true,
  mayProposeState: false,
  mayInjectPrompt: false,
  allowedRoots: [],
  fallback: 'last-good-then-deterministic'
}
```

Planner prompt contract:

```text
You are Directive Continuity Utility.

You do not decide campaign truth.
You do not invent facts.
You do not reveal hidden facts.
You do not write narration.
You select from supplied fact ids only.

Task:
For the next generation, decide which supplied continuity facts should be projected, at what force, in which lane, and whether they should be checked after generation.

Return strict JSON only.
```

The planner controls relevance, lane recommendation, prompt force, guard focus, negative-constraint use, compression grouping, and adaptive diagnosis. The backend validates every operation before it becomes prompt text, a Director packet, guard input, or a projection hint.

Example planner response:

```json
{
  "kind": "directive.continuityProjectionPlan.v1",
  "confidence": 0.91,
  "operations": [
    {
      "factId": "crew.hadrik-bronn.species",
      "action": "select",
      "lane": "L1",
      "force": "hardInvariant",
      "ttl": "turn",
      "reason": "Bronn is directly requested and may speak or be described.",
      "confidence": 0.96
    },
    {
      "factId": "ship.uss-breckenridge.currentTransit",
      "action": "select",
      "lane": "L1",
      "force": "sceneCritical",
      "ttl": "turn",
      "reason": "The reply may reference route, timing, or current ship posture.",
      "confidence": 0.92
    }
  ],
  "guardFocus": [
    {
      "factId": "crew.hadrik-bronn.species",
      "severity": "repairOrRetry",
      "reason": "Recent false claim risk: Bronn described as human."
    }
  ],
  "compressionGroups": [
    {
      "lane": "L3",
      "title": "Bronn tactical support",
      "factIds": ["crew.hadrik-bronn.publicProfile"],
      "compressionGoal": "Keep role and command-style support concise; introduce no new facts."
    }
  ]
}
```

### 6. Projection Plan Validator

The validator is mandatory because the Utility provider is not trusted for truth, visibility, authority, or state mutation. Reject or alter provider output when:

- `factId` is not in the candidate set or hard floor.
- Selected fact is not visible to the requested audience.
- Selected fact is inactive unless historical context is permitted.
- Selected fact lost conflict resolution.
- Hidden fact would enter narrator/player prompt.
- The model invented a fact id.
- The model rewrote a fact value.
- The model attempted to create prompt prose for a hard fact.
- The model attempted to demote a hard-floor fact below its minimum lane or force.
- Lane budget would be exceeded.
- TTL is invalid.
- Force is invalid for the fact authority.
- Compression group contains unknown or hidden facts.

Hard-floor facts are not optional. If a required floor fact is missing from the Utility plan, the validator inserts it. Utility omission does not remove required continuity; Utility selection does not bypass visibility.

### 7. Scoring

Local scoring still matters. It feeds broad recall, pre-pruning, Utility request context, deterministic fallback, and audit. It should not be the only decision layer for prompt selection.

```text
projectionScore =
  sourceAuthorityWeight
  + criticalityWeight
  + audienceFitWeight
  + sceneMatchWeight
  + recencyWeight
  + playerMentionWeight
  + activePressureWeight
  + missionPhaseWeight
  + pinWeight
  - hiddenOrBlockedPenalty
  - staleOrSupersededPenalty
  - recentSoftInjectionCooldown
```

Criticality can override ordinary score. For example:

- Present crew species and role: hard invariant.
- Current ship travel status: hard invariant when route, arrival, ship status, or location is in scope.
- Active mission objective: scene critical.
- Crew private anxiety: crewDirector support, narrator hidden unless behavior-facing.
- Regional background: rotating context unless active pressure pulls it forward.

### 8. Conflict Resolution

Facts with the same `conflictKey` cannot all project as truth.

Resolution order:

1. Hard package projection or campaign state.
2. Committed outcome packet.
3. Deterministic derived fact.
4. User-approved reconciliation.
5. Soft package context.
6. Generated candidate.

If a generated candidate conflicts with a hard or committed fact, it should be marked rejected or contradiction-only. It should never be summarized into future continuity as truth.

### 9. Lane Assignment

Lane assignment maps selected candidates to prompt keys:

- Hard invariants go to L1.
- Scene-critical facts go to L2.
- Domain continuity goes to L3.
- Recent committed outcomes go to L4.
- Soft background goes to L5.
- Hidden and blocked facts go to L6 audit only.

L1 should be small and direct. Its job is not richness; its job is preventing false facts.

### 10. Compression

Compression policy:

- Never compress hard invariants into vague prose.
- Never compress facts across incompatible audiences.
- Never merge hidden and player-safe facts.
- Never let compression introduce new claims.
- Include source signatures, compression profile, selected fact ids, and prompt template hash in the cache key.
- Treat compressed output as presentation, not authority.

Good compression target:

```text
Nearby regional context: Pale Lantern tensions are rising around relief access, but the current scene is still the Breckenridge XO rendezvous.
```

Bad compression target:

```text
The Breckenridge has been travelling from Earth for a while.
```

The second is too vague to protect against "six days at impulse."

### 11. Extension Prompt Sync

The runtime should sync named prompt keys every time the active prompt context changes:

- Campaign activation.
- Save load or save branch switch.
- Chat binding change.
- Scene change.
- Player message classification.
- Director outcome commit.
- Scene Handshake commit.
- Generation stop, fail, abort, or retry.
- Extension disable.

On error or disable, the sync layer should clear all Directive prompt keys. No stale prompt should survive a failed run or chat switch.

## Generated-Prose Quarantine

Generated assistant prose is presentation until accepted by a state path.

Rules:

- Raw assistant text cannot directly enter L1-L3.
- Thread summaries may only use committed outcome packets, validated Scene Handshake facts, or Command Log records.
- A sidecar may extract candidate facts from prose, but they remain `authority: candidate`.
- Candidate facts need validation against source authority, conflict keys, visibility, and user/player knowledge.
- Contradictory candidates are recorded as rejected and can feed guardrails or retry prompts.
- Accepted candidates must store provenance: source message id, validator, accepted at, conflict keys checked, resulting state delta or fact id.

This prevents phrases like "ship at impulse underneath everything" from contaminating future prompts after a single bad response.

Initial extraction should be narrow. Do not extract every claim from prose. Start with high-risk claim classes:

- Crew identity, species, rank, billet, and relationships.
- Current location, route, travel mode, elapsed time, and remaining time.
- Ship damage, restrictions, readiness, and operational posture.
- Mission phase, objective completion, and obligation state.
- Deaths, injuries, casualties, promotions, removals, or transfers.
- Hidden reveals.
- Faction, regional, or world-state changes.
- Command-log-worthy commitments and irreversible player decisions.

Claim adjudication rules:

- If the claim conflicts with a hard or committed fact, reject it and use it as a guard signal.
- If the claim is plausible but not authoritative, quarantine it as a candidate.
- If the claim is accepted by Scene Handshake, Director validation, user confirmation, or a state-gateway operation, convert it through the owned state path.
- The extractor may identify candidate claims; it does not mutate state.

## Contradiction Guard

The matrix should feed a post-generation guard with the L1 invariants, high-risk L2 facts, and rejected conflict claims.

Guard outputs:

- `ok`: no continuity conflict.
- `warn`: minor soft mismatch, log only.
- `retry`: generated text contradicts a hard or scene-critical fact.
- `repair`: deterministic text repair is possible without rerunning the model.
- `review`: contradiction involves hidden facts or ambiguous state.

Example guard check:

```json
{
  "generatedClaim": "The ship has been at impulse for six days since leaving Utopia Planitia.",
  "conflictKey": "ship.currentTransit",
  "conflictsWith": ["ashes.travel.breck-to-asterion-route"],
  "severity": "retry",
  "reason": "Current transit is a hard invariant: weeks at warp toward the Asterion Reach, not six days at impulse near Earth."
}
```

The guard has two layers:

1. Deterministic guard: entity aliases, predicate-specific forbidden patterns, known false claim checks, and conflict-key checks.
2. Utility contradiction reviewer: semantic contradiction review for uncertain or high-risk cases. It receives selected guard facts only and cannot mutate state or introduce new facts.

Repair is allowed only when all are true:

- The violation is local and narrow.
- The replacement is player-safe.
- The replacement does not require hidden facts.
- The replacement does not change causal structure.
- The source fact has hard or committed authority.

`Bronn is human` can often be repaired to a Tellarite-safe description. Travel, location, and elapsed-time contradictions usually require retry because they can affect framing, timing, and causality.

Retry instructions should quote only player-safe facts. Hidden facts should be converted into safe negative constraints or route through review.

## Audit Record

Every projection run should produce an audit record:

```json
{
  "runId": "cpm-2026-06-26T18:44:19.120Z",
  "campaignId": "ashes-of-peace",
  "saveId": "save-1782436863102-3-2571043d",
  "chatId": "sam-vickers-latest",
  "sceneHash": "sha256:...",
  "promptRevision": 42,
  "counts": {
    "factsConsidered": 214,
    "factsInjected": 28,
    "hardInjected": 7,
    "blockedHidden": 31,
    "blockedContext": 44,
    "overCap": 18,
    "rejectedConflicts": 3
  },
  "lanes": {
    "directive_continuity_invariants": {
      "chars": 812,
      "factIds": ["ashes.travel.breck-to-asterion-route", "crew.bronn.identity"]
    }
  },
  "decisions": [
    {
      "factId": "ashes.travel.breck-to-asterion-route",
      "decision": "injected",
      "lane": "directive_continuity_invariants",
      "depth": 1,
      "reason": "current ship route is scene-critical"
    }
  ]
}
```

The inspector should answer:

- Why was this fact injected?
- Why was this fact skipped?
- Which hidden facts were blocked?
- Which soft facts rotated out?
- Which generated claims were rejected?
- Which prompt keys were installed, with roles, positions, depths, and hashes?
- Which contradiction guard checks ran?

## Travel Continuity Block

A compact travel block should be the first concrete application, but it should be generated by the matrix, not hand-written into one campaign prompt.

Required travel facts:

- Departure origin.
- Current route.
- Long-haul propulsion regime.
- Local maneuver regime.
- Elapsed travel.
- Remaining travel or rendezvous distance/time.
- Current operational location relative to major anchors.
- Mission reason for route.
- Explicit negative constraints when a common false claim is likely.

Example L1 output:

```text
Current Transit:
- The Breckenridge is in its final approach toward the Asterion Reach after weeks of post-Utopia transit; it is not newly departed from Utopia Planitia or still near Earth.
- The long-haul transit has been around warp 5.5, with the player's shuttle rendezvous roughly a week out from the Asterion Reach.
- The ship may use impulse for local shuttle-rendezvous maneuvers. Do not frame the whole post-Utopia transit as six days at impulse unless campaign state has changed.
```

The negative line is acceptable because the previous false claim is now a known high-risk contradiction. Negative constraints should be targeted and rare.

Suggested structured state for Ashes/Breckenridge:

```js
ship: {
  navigation: {
    currentTransit: {
      id: 'transit.utopia-to-asterion.final-approach',
      originLocationId: 'utopia-planitia',
      currentLocationId: 'breckenridge-in-transit',
      destinationLocationId: 'asterion-reach',
      elapsedSummary: 'The senior staff has already spent several weeks together after departure from Utopia Planitia.',
      remainingSummary: 'The shuttle rendezvous is roughly a week out from the Asterion Reach.',
      longHaulRegime: 'warp-5.5-approx',
      localManeuverRegime: 'impulse-at-transfer-waypoint',
      activePhaseId: 'shuttle-rendezvous',
      playerSafeSummary: 'The Breckenridge is in final approach toward the Asterion Reach and may drop to impulse only for local rendezvous maneuvers.'
    }
  }
}
```

If a package does not yet encode warp speed as structured state, the matrix should mark speed as `derived` or omit it from L1 until encoded. It should not convert an author note into a hard invariant without a source path.

## Crew Identity Block

Crew identity should be similarly source-backed.

Required identity facts when a crew member is present, speaking, described, or referenced:

- Name and role.
- Species or non-human identity when relevant.
- Pronouns.
- Approximate age only if package-owned and safe.
- Rank or chain-of-command relation.
- Do-not-say constraints for common incorrect defaults.

Example L1 output:

```text
Crew Identity Invariants:
- Lt. Cmdr. Hadrik Bronn is Tellarite, not human.
- Bronn is the Breckenridge's Chief Tactical and Security Officer.
```

The actual implementation should render species, rank, role, aliases, and do-not-say constraints from package/campaign state. In crowded scenes, L1 should include a compact identity table for every present, speaking, or mentioned named crew member. Richer L3 profile text should be reserved for active speakers or causally relevant officers.

## Saga-To-Directive Mapping

| Saga Mechanic | Directive Matrix Equivalent |
| --- | --- |
| `saga_continuity_state` | L1/L2 continuity invariants and active scene. |
| High/normal/low lore prompts | Criticality/relevance prompt lanes. |
| Lore context gates | Audience, visibility, scene, mission, location, route, and reveal gates. |
| Lore relevance tiers | Relevance plus criticality, separated so hard facts cannot be demoted. |
| Lore Automation AR/ARMP/ARMPC | Continuity automation promote/demote, mute/pin, curation/reconciliation. |
| Automation style | Projection assertiveness and sidecar threshold profile. |
| Provider routing | Local-first selector, optional utility/reasoning adjudication. |
| Lore injection audit | Projection audit with prompt keys, fact ids, skip reasons, and guard results. |
| Manual edit ownership | User-approved fact/reconciliation ownership beats automation. |
| Clear prompts on lifecycle events | Clear all Directive prompt keys on disable, chat switch, abort, fail, and stale sync. |

## Matrix Versus Directors

The matrix is not another Director. It is the continuity substrate and projection layer that Directors and narrator prompts depend on.

Current Directive architecture already has several Director-shaped components:

- Mission Director: adjudicates consequential turns, mission bounds, authority, capability, result bands, and state deltas.
- Open-world coordinator: resolves quest/world boundaries and materializes broad campaign-domain changes after a committed event.
- Crew Director sidecar: proposes crew-domain updates after a turn.
- Ship Director sidecar: proposes ship-domain updates after a turn.
- Continuity Tracker sidecar: proposes continuity and mission cleanup after a turn.
- Narrative Thread Director: processes post-commit conversation into thread signals.
- Command Director / Command Bearing evaluators: record and validate command-behavior evidence.

Those systems decide, evaluate, or propose changes. The matrix decides what campaign reality is visible to a specific consumer at a specific time and prompt depth.

| Concern | Directors | Continuity Projection Matrix |
| --- | --- | --- |
| Primary job | Adjudicate, evaluate, or propose changes. | Materialize, reconcile, select, and project continuity. |
| Time horizon | Usually current turn or post-turn sidecar. | Whole save branch: baseline, current state, history, dormant facts, superseded facts, rejected claims. |
| Authority | Can produce validated packets or allowed state proposals. | Does not decide outcomes by itself; projects validated reality and guardrails. |
| Prompt role | May produce narrator packets or sidecar records. | Owns prompt lane policy, depth, rotation, and projection audit. |
| Memory model | Domain-specific ledgers and packets. | Cross-domain fact registry and lifecycle state. |
| Failure mode if missing | Outcomes may still commit, but prompts forget or contradict world truth. | Prompt knows what matters now and what must not be contradicted. |

The reason the existing Directors do not already solve the Bronn/travel class of bugs is architectural:

1. Consequential Director turns are not every turn. Routine, counsel, scene color, and many scene-navigation posts can sync prompt context and hand generation back to the host. In those paths, the host model depends on installed prompt context, not on a newly run Mission Director packet.
2. The sidecar Directors are background workers. They run after visible turn work and are configured as state proposal jobs, not prompt injectors. Their policy is `mayProposeState: true` and `mayInjectPrompt: false`.
3. The model-call authority table says `crewDirector`, `shipDirector`, and `continuityTracker` may write only allowed state roots and have no direct player-visible output. That is correct for safety, but it means they do not directly steer the next host generation unless their accepted state later gets projected.
4. The current prompt builder is a player-safe block builder, not a fact registry. It reads selected state surfaces and emits blocks, but it does not yet track conflict keys, lifecycle states, rejected generated claims, hard invariant lanes, or cross-domain continuity facts.
5. Mission Director narrator packets are turn-local. They constrain Directive-owned narration after mechanics commit. They are not a durable, rotating campaign-memory layer for every future host-native generation.
6. Director outputs can update state, but there is no single continuity materializer that turns all those updates into source-backed prompt facts with priority, depth, audience, and contradiction guard coverage.

So the matrix should sit between state mutation and prompt generation:

```text
Directors and sidecars
-> validated state deltas / events / ledgers
-> materialized campaign reality
-> Continuity Projection Matrix
-> Director packets, narrator prompt lanes, contradiction guard, audit
```

Directors should become consumers and producers around the matrix. They produce validated changes that the matrix materializes. They consume matrix packets so their own reasoning starts from the same campaign reality the narrator will later see.

## Director Cooperation Contract

The cooperation rule is:

```text
Directors decide and validate.
The matrix remembers, reconciles, and projects.
Narration expresses.
```

The matrix must be a shared continuity service, not a new authority layer over the Directors.

### Authority Boundaries

| System | Owns | Does Not Own |
| --- | --- | --- |
| Mission Director | Mission feasibility, authority/capability checks, outcome bands, costs, mission state deltas. | Long-term prompt memory, crew/ship/faction truth outside committed deltas. |
| Open-World Coordinator | Quest/world boundaries, available work changes, broad campaign-domain transitions. | Prompt lane selection or hidden-info projection. |
| Crew Director | Crew-domain proposals, assignments, condition, posture, relationship-facing annotations. | Narrator prompt injection or mission-result adjudication. |
| Ship Director | Ship-domain proposals, condition, restrictions, readiness, technical debt. | Mission success/failure, crew psychology, or broad continuity truth. |
| Continuity Tracker | Continuity and known-fact cleanup proposals. | Direct prompt injection, outcome decisions, or hidden reveal decisions. |
| Narrative Thread Director | Thread signals, B-plot continuity, player-engaged thread summaries. | Hard campaign invariants or current mission feasibility. |
| Command Director / Command Bearing | Command evidence, review proposals, awards, spends, command-culture observations. | World-state truth generally. |
| Continuity Projection Matrix | Fact lifecycle, conflict keys, materialization, prompt packets, contradiction guard, projection audit. | Outcome decisions, state-domain adjudication, direct mutation of Director-owned roots. |

### Read And Write Rules

- The matrix may read broadly from package data, campaign state, ledgers, Director packets, sidecar journals, Scene Handshake settlements, and branch metadata.
- The matrix may write only matrix-owned domains: continuity fact registry, projection cache, projection audit, rejected/candidate claim registry, and source-link metadata.
- The matrix must not directly patch `mission`, `ship`, `crew`, `relationships`, `commandBearing`, `pressureLedger`, `questLedger`, `worldState`, or `commandLog`.
- Director-owned roots must still change through their existing owner path: Mission Director transaction, open-world coordinator, sidecar proposal plus state gateway, Scene Handshake validator, reconciliation validator, or explicit user-approved operation.
- Model output cannot cross boundaries by role name. The model-call authority matrix and state-delta gateway remain the enforcement points for `mayProposeState`, `mayInjectPrompt`, allowed roots, revision checks, and operation limits.

### Packet Exchange

The matrix should expose explicit packets rather than hidden ambient state:

```text
Matrix -> Mission Director Packet
Matrix -> Crew Director Packet
Matrix -> Ship Director Packet
Matrix -> Command Director Packet
Matrix -> Narrative Thread Packet
Matrix -> Narrator Prompt Packet
Matrix -> Contradiction Guard Packet
Matrix -> Projection Audit
```

Directors return validated events or proposals:

```text
Mission Director -> outcome packet + state delta + event
Open-World Coordinator -> world/quest boundary events
Crew Director -> crew proposal through state gateway
Ship Director -> ship proposal through state gateway
Continuity Tracker -> continuity/mission proposal through state gateway
Narrative Thread Director -> thread signal proposal or committed thread event
Scene Handshake -> accepted fact proposal after deterministic validation
Reconciliation -> accepted correction or rejected claim
```

The matrix may consume only accepted outputs as authority. Unaccepted outputs remain candidates or diagnostics.

### Turn Lifecycle Contract

```text
1. Build or refresh matrix facts from current committed campaign reality.
2. Produce Director-specific packets for the current turn.
3. Directors adjudicate or propose changes using those packets.
4. Existing validators commit accepted deltas/events through their owning paths.
5. Matrix materializes new or changed facts from committed state.
6. Matrix produces narrator prompt lanes and contradiction guard input.
7. Narration or host generation runs.
8. Contradiction guard checks generated prose against hard facts.
9. Candidate/generated claims enter quarantine until accepted, rejected, or left dormant.
10. Projection audit records what happened.
```

Routine or host-native turns may skip Director adjudication, but they must not skip matrix projection before host generation.

### Safety Invariants

- A Director packet may include hidden facts only when the receiving Director is authorized for that audience.
- A narrator prompt packet must include only player-safe facts.
- A hidden fact may affect Director reasoning without becoming narrator text.
- A generated claim cannot become campaign reality without validation.
- A sidecar proposal cannot write outside its allowed roots.
- A prompt builder cannot mutate campaign reality.
- A contradiction guard can force retry/repair/review, but it cannot silently rewrite committed mechanics.
- A matrix projection audit must identify every hard fact that was injected, skipped, blocked, superseded, or contradicted.
- If a Director and a prompt packet disagree, committed state plus conflict keys win; the audit must record the disagreement.

### Existing Enforcement Points

The contract should reuse current enforcement:

- `src/generation/model-call-authority-matrix.mjs` already defines `mayProposeState`, `mayInjectPrompt`, owning module, player-visible output, and allowed roots per model role.
- `src/runtime/state-delta-gateway.mjs` already enforces mutable domains, base revision checks, allowed roots, operation limits, and journaled commits.
- `src/campaign/transaction-state.mjs` already applies Mission Director turn packets and records turn/Command Log ledgers.
- `src/jobs/campaign-sidecar-scheduler.mjs` already schedules Crew, Ship, Continuity, Relationship, and Command Bearing sidecars as proposal-only workers.
- `src/generation/player-safe-prompt-context-builder.mjs` and `src/context/context-orchestrator.mjs` already form the current prompt packet seam.
- `src/hosts/sillytavern/prompt-adapter.mjs` already owns host extension prompt installation and clearing.

## Backend Mechanics

The matrix should be implemented as a small public service facade over deterministic modules. Callers should not reach into scorers, gates, or fact registries directly.

### Public Service API

Primary API:

```js
buildContinuityProjection({
  campaignState,
  packageData,
  crewDataset,
  scene,
  audience,
  purpose,
  recentMessages,
  playerMessage,
  turnClassification,
  directorRoute,
  policy,
  providers,
  now,
  includeDiagnostics = false
})
```

`audience` should be one of:

- `missionDirector`
- `crewDirector`
- `shipDirector`
- `commandDirector`
- `narrativeThreadDirector`
- `narrator`
- `contradictionGuard`
- `diagnostic`

`purpose` should describe when the packet is being built:

- `preDirector`
- `postDirectorCommit`
- `preNarration`
- `hostPrompt`
- `postGenerationGuard`
- `manualInspect`

The return shape should be explicit:

```js
{
  kind: 'directive.continuityProjection',
  schemaVersion: 1,
  runId,
  sourceHash,
  audience,
  purpose,
  revision,
  packet,
  promptBlocks,
  guardInput,
  auditSummary,
  cache,
  diagnostic // only when explicitly requested
}
```

Rules:

- `packet` is the audience-specific projection requested by the caller.
- `promptBlocks` are host-safe blocks ready for the existing prompt adapter.
- `guardInput` contains hard invariants and high-risk conflict keys for post-generation checks.
- `auditSummary` records selected, skipped, blocked, superseded, rejected, and over-budget facts.
- `diagnostic` may include normalized facts, rejected Utility operations, blocked hidden counts, and internal hashes, but only when explicitly requested.
- `cache` contains hashes and source signatures only; it must not be a second source of truth.

Secondary APIs:

```js
buildSourceFrame({ campaignState, packageData, crewDataset, scene, recentMessages, playerMessage, now })
materializeContinuityFacts({ campaignState, packageData, crewDataset, scene, now })
recallContinuityCandidates({ facts, sourceFrame, audience, purpose, policy })
planContinuityProjection({ candidates, sourceFrame, audience, purpose, policy, providers })
validateContinuityProjectionPlan({ plan, candidates, hardFloor, audience, policy })
buildContinuityPromptBlocks({ projection, policy })
checkContinuityContradictions({ generatedText, guardInput, campaignState })
quarantineGeneratedContinuityClaims({ generatedText, sourceMessage, projection, campaignState })
updateProjectionHintsFromAudit({ campaignState, audit, guardResult })
recordContinuityProjectionAudit({ campaignState, audit, promptInstallResult })
```

The facade can call these internally. Tests may use the lower-level functions through explicit test hooks.

### Data Flow

```text
campaign package + campaign projection
+ current campaign save
+ turn ledger / command log / event ledger
+ sidecar journal / scene handshake / reconciliation records
+ scene snapshot + recent player text
-> materializeContinuityFacts
-> resolveFactConflicts
-> visibility gates
-> deterministic broad recall
-> Utility projection planner
-> projection plan validator
-> lifecycle assignment
-> audience packet assembly
-> prompt block rendering / guard input / audit
```

The matrix should rebuild from committed state every run. Cached projections can accelerate repeated calls, but rebuilding must be deterministic from current inputs.

### Source Frame

The source frame captures current campaign reality for projection purposes. It is internal input to deterministic materializers and planners; it is not handed wholesale to a model.

```js
{
  campaignId,
  saveId,
  branchId,
  chatId,
  revision,
  sourceHash,

  packageData,
  campaignState,
  crewDataset,
  currentScene,
  activeMission,
  activeMissionPhase,
  activeLocation,
  activeActors,
  currentShipState,
  recentMessages,
  playerMessage,
  turnClassification,
  directorRoute,
  projectionHints,
  rejectedClaims,
  factUseStats
}
```

The Utility provider receives only bounded, audience-filtered candidates derived from this frame. Narrator/player-safe planning must never receive hidden raw source text and rely on instructions to ignore it.

### Fact Materialization

Materializers should be domain-specific and pure:

```text
packageFacts(packageData, projection, crewDataset)
campaignIdentityFacts(campaignState)
worldStateFacts(campaignState)
shipFacts(campaignState, packageData)
crewFacts(campaignState, packageData, crewDataset)
missionFacts(campaignState, packageData)
pressureFacts(campaignState)
threadFacts(campaignState)
commandLogFacts(campaignState)
turnLedgerFacts(campaignState)
sceneHandshakeFacts(campaignState)
reconciliationFacts(campaignState)
rejectedClaimFacts(campaignState)
```

Each materializer returns fact records with source ids and conflict keys. It should not perform prompt budgeting. It should not call a model. It should not mutate state.

Example materializer output:

```js
{
  id: 'crew.bronn.species',
  text: 'Lieutenant Commander Hadrik Bronn is Tellarite.',
  factType: 'crew_identity',
  sourceType: 'package',
  sourceId: 'crew.officers[hadrik-bronn].species',
  authority: 'hard',
  visibility: 'playerKnown',
  audiences: ['narrator', 'crewDirector', 'contradictionGuard'],
  criticality: 'hardInvariant',
  lifecycle: 'active',
  conflictKey: 'crew.hadrik-bronn.species',
  scope: {
    crewIds: ['hadrik-bronn'],
    topics: ['identity', 'species']
  },
  confidence: 1
}
```

### Packet Assembly

Projection assembly should happen after fact selection, not inside each Director.

```text
selected facts
-> audience filter
-> packet renderer
-> packet-specific safety check
```

Packet examples:

- Mission Director packet: hidden mission constraints, active objectives, player-known facts, current route constraints, relevant pressure facts.
- Crew Director packet: crew identity, visible posture, private crew facts allowed for crew reasoning, recent crew-related events, hidden values only when authorized.
- Ship Director packet: ship identity, location, route, damage, restrictions, readiness, technical debt, travel invariants.
- Narrator packet: player-safe facts only, prompt depth metadata, no hidden values, no raw Director-only notes.
- Contradiction Guard packet: hard invariants, conflict keys, accepted negative constraints, rejected generated claims.

The packet renderer should not decide whether a fact is true. It should only express selected facts for the requested audience.

### Runtime Integration

Pre-Director path:

```text
chat-turn-orchestrator
-> buildOpenWorldSceneSnapshot
-> buildContinuityProjection({ audience: 'missionDirector', purpose: 'preDirector' })
-> Director runtime receives scene snapshot + matrix packet
-> Director produces turn packet
```

Post-commit path:

```text
commitProvisionalDirectorTurnRuntime
-> transaction-state commits outcome/state delta
-> state-delta-gateway records revision
-> buildContinuityProjection({ audience: 'diagnostic', purpose: 'postDirectorCommit' })
-> projection audit records changed facts and prompt-relevant invalidations
```

Host prompt path:

```text
synchronizeActivePrompt
-> buildContinuityProjection({ audience: 'narrator', purpose: 'hostPrompt' })
-> player-safe-prompt-context-builder consumes projection.promptBlocks
-> prompt-adapter installs named extension prompts
-> recordPromptContextRevision stores prompt hash/revision
```

Directive-owned narration path:

```text
commit mechanics
-> buildContinuityProjection({ audience: 'narrator', purpose: 'preNarration' })
-> narration receives committed narrator packet + matrix narrator packet
-> generated prose is checked by contradiction guard
```

Post-generation path:

```text
generated assistant text
-> checkContinuityContradictions
-> ok / warn / retry / repair / review
-> quarantineGeneratedContinuityClaims
-> Scene Handshake or reconciliation may later validate selected candidates
```

Sidecar path:

```text
sidecar worker receives matrix packet for its domain
-> sidecar proposes allowed-root state delta
-> sidecar-output-contracts parses proposal
-> state-delta-gateway checks revision, roots, operations, and domains
-> accepted state delta becomes committed campaign reality
-> matrix materializes updated facts on the next projection run
```

### Storage

The matrix should store durable data under a dedicated `continuity` root:

```json
{
  "continuity": {
    "schemaVersion": 1,
    "facts": [],
    "factIndex": {},
    "rejectedClaims": [],
    "candidateClaims": [],
    "projectionHints": [],
    "factUseStats": {},
    "automationLocks": {},
    "projectionCache": {
      "lastRunId": "",
      "lastSourceHash": "",
      "lastPromptHash": ""
    },
    "projectionAudits": []
  }
}
```

Storage rules:

- `facts` may store accepted non-derivable facts or durable continuity facts that cannot be cheaply reconstructed from owned state. Most facts should be rebuilt from package data, campaign state, ledgers, and Director-owned roots every run.
- `factIndex` is optional acceleration data and must be rebuildable.
- `rejectedClaims` and `candidateClaims` are continuity safety records, not campaign truth.
- `projectionHints` are leased recommendations, not truth.
- `factUseStats` is projection-control telemetry, not canon.
- `automationLocks` protect user/operator ownership.
- `projectionCache` is disposable.
- `projectionAudits` should be bounded like other runtime journals.
- Prompt text itself should not be the source of truth.

Durable state-domain changes still belong to their owner roots. For example, a ship readiness change belongs under `ship`; the matrix may derive a ship readiness fact from it, but should not own the readiness state.

### Adaptive Projection Control State

Adaptive control state helps the matrix respond to recent successes and failures without turning the matrix into a canon store.

Projection hints are leased boosts, floors, cooldowns, guard requests, pins, or mutes:

```js
{
  id: 'hint.crew.hadrik-bronn.species.recentFalseHuman',
  factId: 'crew.hadrik-bronn.species',
  conflictKey: 'crew:hadrik-bronn:species',
  hintType: 'boostAndGuard',
  boost: 30,
  minimumForce: 'hardInvariant',
  minimumLane: 'L1',
  reason: 'recentRejectedClaim',
  sourceRunId: 'cpm-run-123',
  createdAtRevision: 42,
  expiresAtRevision: 48,
  refreshOnViolation: true,
  owner: 'automation'
}
```

Fact-use stats track whether projection is working:

```js
{
  'crew.hadrik-bronn.species': {
    selectedCount: 12,
    selectedCountRecent: 3,
    guardViolationCount: 1,
    guardViolationCountRecent: 1,
    lastSelectedRevision: 47,
    lastViolationRevision: 44,
    lastLane: 'L1',
    lastForce: 'hardInvariant',
    cooldownUntilRevision: null
  }
}
```

Undershoot response:

1. Record the rejected generated claim.
2. Boost the correct fact.
3. Add guard focus.
4. Temporarily raise minimum lane and force.
5. Repair or retry the current output.
6. Log the omitted fact and guard violation in the audit.

Overshoot response:

1. Reduce boost or demote lane.
2. Move contradiction-sensitive facts to guard-only when prompt injection is unnecessary.
3. Cool down soft/background facts until scene change.
4. Leave hard facts available for guard even when not injected.

Hard facts may cool down from prompt injection only when they are not currently relevant and not recently violated. They should remain available to the contradiction guard.

### Caching And Fallback

Projection caching should key off the real decision inputs:

```js
const projectionInputHash = hash({
  audience,
  purpose,
  campaignRevision,
  branchId,
  sceneHash,
  playerTextHash,
  turnClassificationHash,
  directorRouteHash,
  candidateFactIds,
  rejectedClaimIds,
  projectionHintIds,
  budgetPolicyHash
});
```

Cache policy:

1. Use a cached validated plan only when `projectionInputHash` matches.
2. Use the Utility planner when candidate facts, scene, player text, route, hints, or policy change.
3. Use the last-good validated plan if the provider fails and the source hash remains compatible.
4. Use the deterministic fallback floor if no valid plan exists.

The deterministic fallback floor should include:

- Hidden-information contract.
- Current location or transit when scene-relevant.
- Active mission phase.
- Present named crew compact identity table.
- Recent rejected-claim guard facts.

The fallback floor is not the primary intelligence layer. It is the emergency continuity baseline that prevents the worst hallucinations when Utility planning is unavailable.

### Validation And Enforcement

The matrix arrangement should be enforced by tests and runtime checks:

- Matrix write attempts outside `continuity` and `runtimeTracking.promptContext` should fail.
- Director-owned sidecar proposals must still use `allowedRootsForModelRole(roleId)`.
- `promptContextBuilder` can have `mayInjectPrompt: true`; Crew/Ship/Continuity sidecars should keep `mayInjectPrompt: false`.
- `buildContinuityProjection({ audience: 'narrator' })` must reject hidden or Director-only facts.
- `buildContinuityProjection({ audience: 'crewDirector' })` may include authorized private crew facts but must tag them as non-narrator-safe.
- Contradiction guard cannot mutate mechanics or state roots; it can return retry/repair/review instructions and quarantine records.
- Projection audit should include enough source ids for debugging without exposing hidden details in player-facing surfaces.

## Backend Modules

Proposed module boundaries:

```text
src/continuity/
  index.mjs
  continuity-projection-service.mjs
  source-frame.mjs
  fact-schema.mjs
  fact-index.mjs
  conflict-resolver.mjs
  audience-gates.mjs
  recall-frame.mjs
  broad-recall.mjs
  projection-planner-prompt.mjs
  projection-planner-client.mjs
  projection-plan-validator.mjs
  projection-planner-fallback.mjs
  prompt-lanes.mjs
  prompt-renderers.mjs
  director-packets.mjs
  contradiction-guard.mjs
  contradiction-reviewer-prompt.mjs
  generated-claim-extractor.mjs
  generated-claim-adjudicator.mjs
  projection-hints.mjs
  projection-audit.mjs
  projection-cache.mjs
  settings.mjs

src/continuity/materializers/
  package-facts.mjs
  campaign-state-facts.mjs
  crew-identity-facts.mjs
  ship-travel-facts.mjs
  mission-facts.mjs
  command-log-facts.mjs
  ledger-facts.mjs
  rejected-claim-facts.mjs
```

Integration points:

- `src/context/context-orchestrator.mjs` should become a consumer of matrix projection blocks or be refactored into the planner.
- `src/retrieval/*` should provide Director-card packets but not own prompt lane projection.
- `src/directors/*` should consume matrix packets and emit validated events or state deltas back into campaign reality.
- `src/campaign/transaction-state.mjs` should remain the transactional commit path, while the matrix materializes promptable facts from committed domains.
- `src/runtime/chat-turn-orchestrator.mjs` should request a projection before generation and run the contradiction guard after generation.
- `src/runtime/outcome-integrity.mjs` should use generated-fact quarantine for edit/swipe/retry safety.
- `src/hosts/sillytavern/*` should own named extension prompt installation and clearing.
- `src/jobs/*` sidecars may suggest candidate facts but cannot promote them without validation.

## Settings And Policy

This should not become a bulky user-facing Settings feature. Policy should live in package/campaign/runtime defaults with a compact diagnostic inspector.

Internal policy fields:

```json
{
  "continuityProjection": {
    "enabled": true,
    "plannerMode": "utilityPrimary",
    "automationMode": "select",
    "automationStyle": "balanced",
    "fallback": "lastGoodThenFloor",
    "maxCandidateFacts": 80,
    "maxPlannerFacts": 48,
    "budgets": {
      "L1": 900,
      "L2": 1200,
      "L3": 1600,
      "L4": 800,
      "L5": 700
    },
    "guard": {
      "mode": "hardAndSceneCritical",
      "providerReview": "uncertainOnly",
      "repairLocalContradictions": true,
      "retryOnTravelOrCausalContradiction": true
    },
    "generatedClaimExtraction": {
      "enabled": true,
      "mode": "highRiskOnly",
      "blocking": false
    },
    "audit": {
      "retainRuns": 50,
      "includeModelReasons": true,
      "includeHiddenCountsOnlyForNarrator": true
    }
  }
}
```

Possible automation modes:

- `off`: deterministic projection only.
- `select`: Utility may select, demote, promote, route to guard-only, and recommend lane/force within validation rails.
- `selectPinMute`: select plus runtime pin, mute, suppress, or elevate recommendations, still subject to validation and user ownership.
- `curateCandidates`: can suggest generated candidates, derived candidates, or retirement of automation-owned hints, subject to validation.

Planner modes:

- `localOnly`: no provider; deterministic broad recall and fallback floor only.
- `utilityAssisted`: deterministic plan primary; Utility may promote or demote soft facts.
- `utilityPrimary`: Utility planner owns selection, lane, force, guard focus, and compression grouping within validation rails.
- `reasoningEscalated`: use a stronger reasoning provider only for complex conflict or reconciliation cases.

Default recommendation: `utilityPrimary`. As in Saga, mode controls authority and style controls assertiveness.

## Implementation Phases

### Phase 0: Source Normalization And Rails

- Add static Matrix prompt keys and clear-all behavior for static and dynamic Directive prompts.
- Add source-frame builder, fact schema helpers, conflict-key derivation helpers, and stable crew alias builder.
- Add location rendering fallback: `name || title || label || id`.
- Add initial `ship.navigation.currentTransit` state/projection for Ashes if needed.
- Add initial campaign-event/world-delta shape for player-driven changes that create or supersede continuity facts.
- Add role definitions for `continuityProjectionPlanner`, `continuityContradictionReviewer`, `continuityClaimExtractor`, and `continuityProjectionCompressor` with no state authority.

### Phase 1: Utility-Primary Narrator Projection

- Add crew identity, ship current-transit, active mission phase, rejected-claim, and committed Command Log materializers.
- Add deterministic broad recall.
- Add Utility planner request/response schema and prompt contract.
- Add projection plan validator.
- Add L0/L1/L2/L3 renderers and static prompt lane installation.
- Add basic projection audit.
- Regression fixtures:
  - Player asks Bronn for tactical counsel.
  - Player asks about rendezvous/travel timing.
  - Utility omits a hard-floor fact.
  - Utility returns unknown fact id.
  - Utility tries to select a hidden narrator-blocked fact.

Expected results:

- Bronn species and billet project when relevant.
- Transit projects with the local-impulse distinction.
- Unknown fact ids are rejected.
- Hidden facts are blocked.
- Required floor facts are inserted even if Utility omits them.

### Phase 2: Audit, Budget, And Fallback Hardening

- Add full projection audit record, source hash, policy hash, skip reasons, over-budget tracking, and conflict winner/loser records.
- Add projection cache and last-good fallback.
- Fail tests for hard fact omissions unless the reason is `blockedHiddenForNarrator` or `notInAudience`.
- Route over-budget support facts to guard-only or audit-only instead of silently dropping them.
- Snapshot prompt matrix output for all bundled campaign starts.

### Phase 3: Contradiction Guard Feedback

- Add deterministic guard for identity and travel facts.
- Add Utility contradiction reviewer for uncertain or high-risk cases.
- Add repair/retry/review policy.
- Record rejected claims.
- Update projection hints and fact-use stats after guard violations.
- Add regression fixtures for known false claims:
  - Bronn described as human.
  - Breckenridge described as six days at impulse from Utopia Planitia.
  - Hidden facts leaking into narrator context.
  - Stale generated prose entering prompt as committed continuity.

### Phase 4: Director Packets

- Add `missionDirector`, `crewDirector`, `shipDirector`, `commandDirector`, `narrativeThreadDirector`, and `continuityTracker` audience gates.
- Add `buildContinuityDirectorPacket()`.
- Integrate Matrix packets before Director and sidecar calls.
- Audit Director packet selection separately from narrator prompt selection.

### Phase 5: Generated-Claim Quarantine

- Add high-risk claim extraction schema and `continuityClaimExtractor` role.
- Add generated-claim adjudicator with accepted/candidate/rejected status.
- Track branch, swipe, source message, source hash, and conflict keys.
- Integrate Scene Handshake and reconciliation validation before any generated claim becomes state.

### Phase 6: Automation And Product Hardening

- Add projection hint leases, cooldowns for overshot background facts, user/operator pin and mute controls, and automation locks.
- Add a compact projection audit inspector.
- Add live SillyTavern canaries for bundled campaign starts.
- Add import/export of projection diagnostics.
- Add alpha gate coverage for projection lifecycle clearing on stop, fail, abort, chat switch, save load, branch switch, and extension disable.

## Testing Strategy

Unit tests:

- Campaign event/world-delta materialization into current and historical facts.
- Fact materialization from package and campaign state.
- Visibility gates by audience.
- Broad recall candidate construction and pre-pruning.
- Utility planner request construction with audience-filtered facts only.
- Projection plan validation for unknown ids, hidden facts, conflict losers, invalid lanes, invalid TTLs, and hard-floor omission.
- Relevance and criticality scoring for fallback and audit.
- Conflict resolution by authority.
- Lane assignment and prompt key output.
- Compression cache signatures.
- Generated-fact quarantine acceptance and rejection.
- Projection hint leases, expiration, boost application, cooldown, and automation locks.

Snapshot tests:

- Fresh campaign prompt matrix for every bundled campaign.
- Ashes of Peace Sam Vickers start with Bronn and travel facts.
- A player-caused world change that later projects as emergent campaign lore.
- Branch/save load with branch-specific facts.
- Utility provider failure with last-good and deterministic-floor fallback.

Lifecycle tests:

- Prompt keys clear on disable, chat switch, failed generation, aborted generation, and stale sync.
- Prompt revision increments after Scene Handshake commit and outcome commit.
- No stale prompt survives active-save switch.
- Static Matrix prompt keys and dynamic Directive prompt keys clear together.

Contradiction tests:

- Hard identity contradiction triggers retry or repair.
- Hard travel contradiction triggers retry or repair.
- Hidden-truth contradiction does not leak hidden facts in retry instructions.
- Soft-color mismatch logs warning but does not force retry.
- A rejected generated claim raises temporary force and guard focus for the correct fact.
- Repeated irrelevant background projection cools down without suppressing hard-floor facts.

Live tests:

- Start latest Ashes/Breckenridge campaign in SillyTavern.
- Inspect installed prompt keys and depths.
- Generate a scene where Bronn speaks and verify identity invariants are present.
- Generate a travel/location answer and verify the ship is not placed near Earth at impulse.
- Confirm projection audit explains selected and skipped continuity.

## Policy Decisions And Remaining Questions

Resolved policy:

- L1 should include compact identity rows for present, speaking, or mentioned named crew. Richer profile support belongs in L3.
- Automatic repair is allowed only for narrow, player-safe, local contradictions. Travel, timing, location, causal, or hidden-fact contradictions should usually retry or review.
- Negative constraints may come from authored guardrails and rejected generated claims, but rejected-claim negative constraints must be leased and expire after stability.
- Conflict keys should be derived by default from subject, predicate, and single-active-value semantics, with package-authored overrides for special cases.
- Generated prose never creates committed facts directly. It creates candidates that become accepted only through Scene Handshake, Director validation, user confirmation, or state-gateway operations.
- The Utility provider cannot mutate projection hints directly. It may recommend boost, cooldown, guard-only, or audit-only; the backend converts legal recommendations into leased hints.

Remaining questions:

- How much of the matrix audit should be visible in the operator UI versus developer diagnostics?
- How should branch-local and swipe-local facts be represented when a SillyTavern native branch is later adopted?
- Which bundled campaigns need source normalization before they can produce hard travel/location facts without relying on author-note prose?

## Acceptance Criteria

The matrix is working when:

- Every generated reply has a projection audit tied to the prompt revision.
- Hard identity and travel facts for active scenes are directly visible in protected system lanes.
- Background continuity rotates without displacing hard invariants.
- Generated prose cannot become prompt authority without validation.
- The Bronn identity and Breckenridge travel falsehoods are caught by tests and, in live play, either avoided or rejected by the contradiction guard.
- The Utility planner selects fewer, higher-value facts than broad recall, while hard floors survive Utility omission.
- Recent contradictions temporarily raise force and guard focus.
- Repeated unused soft facts cool down without suppressing guard coverage.
- Unknown Utility fact ids, hidden narrator-blocked facts, conflict losers, invalid TTLs, and invalid lanes are rejected by validation.
- Prompt static keys clear reliably on disable, error, unload, chat switch, save load, and branch switch.
- Projection cache invalidates on source hash, input hash, or policy hash change.
- Audits explain selected, skipped, blocked, over-budget, guarded, and rejected facts without leaking hidden details to player-facing surfaces.
- Fallback produces a safe deterministic floor when the Utility provider fails.
