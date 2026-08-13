# Ship Operational Affordances

**Status:** Approved

**Date:** 2026-08-12

## Purpose

Turn the Ship page from a static vessel profile into a campaign-specific, at-a-glance record of persistent ship condition and a small source of meaningful gameplay mechanics.

V1 will let players understand what is presently wrong with their ship, why it is in that state, what improvement states are possible, what relevant work they have learned about, and how an improved system changes play. All advancement remains narrative-driven through ordinary SillyTavern conversation. The page will not contain a project-selection button, repair minigame, resource economy, percentage meter, or generic upgrade tree.

The design borrows Multihog's useful principle that persistent state must be consumed by gameplay, but it does not copy a model-maintained state memo or numerical skill-check system. Directive will derive ship state from accepted, source-backed evidence and express its benefits as authored causal affordances.

## Cooperative Play Principle

Directive is a SillyTavern extension, not an adversarial game server. A player can edit prose, change prompts, use an accommodating model, or otherwise declare an outcome. V1 will not attempt to detect, prevent, punish, or conceal those choices.

Directive's responsibility is narrower:

- provide coherent rules for players who want to follow them;
- make legitimate progress, constraints, and opportunities understandable;
- prevent Directive's own projections from drifting away from accepted sources;
- preserve consistent consequences through normal swipes, edits, branches, deletions, saves, and reloads; and
- make the intended challenge rewarding without treating the player as an attacker.

Deterministic validation protects internal consistency, not competitive integrity. No anti-cheat system, intent classifier, hostile prompt defense, or post-generation compliance tribunal belongs in this feature.

## Product Decisions

- Keep one universal Ship-page grammar and renderer across campaigns.
- Let each campaign package author its own ship systems, improvement states, work orders, dependencies, and mechanical affordances.
- Ship mechanics change named causal possibilities rather than generic success probability.
- Show the complete major state ladder and its benefits from the beginning so the player can form ambitions.
- Reveal individual work orders and dependency details only when the player's accepted knowledge supports them.
- Let players address Ship work naturally through conversation, exploration, favors, missions, time investment, and shipboard scenes.
- Use accepted-pair evidence as the only path by which narrative work becomes durable progress.
- Derive current Ship state from active, source-backed Story Settlement effects rather than maintaining a parallel mutable Ship tracker.
- Consume Ship state both before narration and after acceptance: the narrator receives its causal rules, and deterministic evidence validation gates authoritative mission results with the same rules.
- Fold Ship-work interpretation into the existing accepted-pair interpretation call. Do not add a Ship model, Director call, repair adjudicator, or second pass over chat.
- Add one dynamic Ship-capability predicate instead of converting the existing mission-entry capability snapshot into a broader ambiguous concept.
- Limit Ashes of Peace V1 to two systems, at most three states per system, and at most two meaningful capability unlocks per system.
- Use monotonic improvement for V1. Do not add recurring damage, degradation, maintenance decay, or repair reversal mechanics.

## Universal Page Grammar, Campaign-Owned Content

Every campaign's Ship page will answer the same questions in the same order:

1. What vessel am I commanding?
2. What is its overall operational posture?
3. Which campaign-relevant systems matter?
4. What state is each system in?
5. Why is it currently in that state?
6. What does that state change mechanically?
7. What improvement states are possible?
8. What relevant work or dependencies has the player learned about?

Core Directive code owns the layout, accessibility, validation, projection shape, state derivation, accepted-pair custody, and mechanics vocabulary. The campaign's Ship dataset owns the authored answers.

This lets a future campaign center different ship mechanics without creating a bespoke UI. Ashes of Peace may focus on refit integration and sensor calibration; another campaign might focus on convoy capacity, diplomatic facilities, experimental propulsion, or a damaged flight wing. Those packages still use the same concepts of system state, known work, capability, constraint, and causal interaction.

## Player-Facing Page Structure

The existing vessel hero remains. Below it, the universal board contains:

### Operational Snapshot

A concise package-authored overall posture and summary. This is not a computed percentage and does not pretend every ship system is modeled.

### System Cards

Each V1 card contains:

- system name;
- current state label;
- a concise explanation of why the system is in that state;
- the active gameplay constraint or capability;
- the visible state ladder, including the benefit of later states;
- known work orders;
- known unmet dependencies; and
- satisfied work recorded as completed evidence rather than progress percentage.

The page may say that a later state requires additional work without revealing an undiscovered person, location, secret part, permission, or hidden story fact. When that information becomes player-known, the specific work order appears.

### No Pursuit Controls

The Ship page is a journal and mechanics reference, not a task launcher. It contains no `Pursue`, `Track`, `Start Repair`, `Spend`, or `Complete` action. A player acts by returning to chat and issuing orders, requesting help, negotiating access, conducting tests, or otherwise engaging with the fiction.

## Authored Definition Model

The campaign Ship dataset will gain a bounded mechanics definition. Exact field names may be refined during implementation, but its semantic shape is:

```json
{
  "systems": [
    {
      "id": "ship-system.sensor-calibration",
      "playerText": {
        "name": "Sensor Calibration",
        "summary": "Post-refit sensor correlation remains provisional."
      },
      "states": [
        {
          "id": "provisional",
          "rank": 0,
          "playerText": {
            "label": "Provisional",
            "mechanicalEffect": "Fine identity or provenance claims require corroboration."
          },
          "capabilities": [],
          "constraints": ["constraint.sensor-corroboration-required"]
        },
        {
          "id": "aligned",
          "rank": 1,
          "playerText": {
            "label": "Aligned",
            "mechanicalEffect": "The ship can distinguish local calibration error from an external anomaly."
          },
          "capabilities": ["ship-capability.calibration-correlation"],
          "constraints": ["constraint.advanced-deception-needs-corroboration"]
        },
        {
          "id": "validated",
          "rank": 2,
          "playerText": {
            "label": "Validated",
            "mechanicalEffect": "Eligible missions can use cross-system reconstruction as a conclusive approach."
          },
          "capabilities": [
            "ship-capability.calibration-correlation",
            "ship-capability.cross-system-reconstruction"
          ],
          "constraints": []
        }
      ],
      "milestones": [],
      "transitions": []
    }
  ]
}
```

Definitions remain deliberately small and closed:

- state ranks are ordered and monotonic;
- transitions name exact required milestone IDs;
- milestones have explicit accepted-evidence policies;
- dependencies use a bounded Boolean grammar rather than free-form inference;
- state capabilities and constraints use stable authored IDs;
- player text is explicit and spoiler-reviewed; and
- package validation rejects duplicate IDs, missing states, broken dependencies, cycles, unreachable transitions, and undeclared capabilities.

No definition may request arbitrary arithmetic, script execution, free-form state patches, model-authored rewards, or unbounded key-value trackers.

## Ship Work and Dependencies

A milestone is one durable, source-backed contribution toward a transition. Examples include:

- a controlled isolation test was completed;
- a clean external calibration baseline was acquired;
- a specialist agreed to assist;
- protected refit logs became available;
- required authorization was granted; or
- the system was validated under operational load.

Milestones are Boolean and idempotent. V1 does not count generic parts, engineering points, labor hours, credits, successful rolls, or repeated mentions.

A transition may require:

- all named milestones;
- any one of several authored alternatives;
- a prior Ship-system state;
- an accepted mission fact or event;
- a player-known fact;
- an eligible relationship or permission receipt; or
- an existing Ship capability.

The dependency grammar must reuse existing stable predicates where their authority is already correct. A new cross-domain dependency should be introduced only when no existing predicate accurately expresses it.

Work-order visibility is separate from satisfaction. The package defines what accepted knowledge reveals a work order. The player can sometimes satisfy an undiscovered requirement organically; if that occurs, the page must avoid exposing the hidden reason until its reveal condition is met, while the underlying source-backed milestone can remain valid.

## Semantic Authority

`campaignState.ship` remains the validated vessel identity and opening operational overview. It does not become an open-ended mutable systems object.

Durable Ship progress is represented by typed, source-backed Story Settlement effects. Each accepted milestone effect contains:

- a stable effect ID;
- the Ship system and milestone IDs;
- its source contribution IDs;
- active or invalidated status;
- player visibility; and
- any bounded dependency effect IDs required for replay.

The current system state is a pure derivation from:

1. the campaign's immutable Ship mechanics definition;
2. active accepted milestone effects;
3. eligible cross-domain accepted facts or receipts; and
4. the current branch's surviving source lineage.

The model never writes a current Ship state. It only selects authored evidence candidates. Deterministic code validates those claims, records eligible milestone effects, and derives the highest satisfied state transition.

This keeps Story Settlement as the durable semantic authority and avoids a second mutable Ship sidecar. Saves persist the evidence needed to rebuild the page rather than a model-maintained summary that can drift.

## Accepted-Pair Interpretation

The existing accepted-pair interpretation request will carry one closed candidate set with domain-qualified candidates:

- mission evidence candidates; and
- Ship-work milestone candidates.

Ship candidates contain the same bounded concepts already used by mission evidence:

- stable candidate ID;
- authorized source slot;
- evidence standard;
- literal guidance;
- explicit exclusions; and
- an optional closed value set only where the authored schema permits it.

The interpreter may select candidates or abstain. It cannot invent a system, milestone, dependency, capability, reward, state, work order, or consequence. The same accepted assistant/player source pair anchors both domains.

After the shared interpretation:

1. deterministic mission validation handles mission claims;
2. deterministic Ship-work validation handles milestone claims;
3. both results reference the same accepted source contributions;
4. the state spine commits their Story Settlement effects atomically; and
5. the next player projection and narration prompt derive from the committed result.

Provider failure, timeout, malformed output, revision conflict, or validation failure commits no unsupported Ship progress. A pair with no Ship evidence still settles normally. Ship interpretation must not prevent mission or time settlement merely because the Ship candidate set is empty.

## Operational Affordances

Ship states do not provide `+1`, `advantage`, a percentage bonus, or an invisible generic increase in success. Each state changes one or more authored causal levers:

1. **Approach availability** — an action becomes genuinely viable.
2. **Information quality** — evidence may narrow, corroborate, or conclusively establish a supported result.
3. **Complication protection** — one named failure mode can be prevented when the capability is properly applied.
4. **Time or effort requirement** — an authored workaround, delay, or additional step is required or removed.
5. **Capacity** — a future package may alter a bounded commitment or simultaneous-operation limit; Ashes V1 does not need this lever.

Every important state defines:

- **constraint:** what cannot presently be assumed;
- **affordance:** what becomes causally possible;
- **protection:** which specific complication it can prevent; and
- **limit:** what it still does not guarantee.

Capabilities never automatically complete an objective, reveal a fact, win a conflict, or act on the player's behalf. The player must recognize the opportunity and invoke a relevant approach in the fiction. Accepted narration must then depict the supported result before its mission evidence can commit.

## Operational Mechanics Packet

Before each bound generation, Directive derives a compact operational mechanics packet from current Ship state and the active mission definition. It contains only currently relevant rules:

- active Ship constraints;
- available Ship capabilities;
- the conditions in which an active mission can consume them;
- the causal result each interaction permits or prevents; and
- explicit limits and exclusions.

The packet is part of Directive's runtime prompt, alongside the existing Ship projection and simulation-mode policy. It is authoritative context, not a request for the narrator to invent mechanics.

Example:

> Cross-system reconstruction is available. If the player orders a comparison between protected Breckenridge calibration and an independent reference, exclusion of the real ship is causally possible. This does not automatically identify an attacker, reveal protected systems, or detect every form of deception.

The packet should include no irrelevant future capability, hidden dependency, raw effect receipt, internal ID without useful guidance, or exhaustive campaign rulebook. Its size is bounded by the two current Ship systems and active mission interactions.

The selected simulation mode still determines the consequence ceiling. Ship capabilities change preparation, resources, and viable approaches inside that causal policy; they do not override Exploration or Command mode.

## Mission Consumption

Mission packages own their local interactions with Ship mechanics. A mission may declare that a specific Ship capability:

- authorizes a favorable evidence policy;
- makes an alternate route available;
- permits a stronger value for an existing outcome;
- blocks one named complication when accepted prose depicts correct use;
- removes an authored corroboration or workaround requirement; or
- changes an optional objective's available or terminal disposition.

V1 will add one predicate with distinct semantics:

```json
{ "shipCapabilityAvailable": "ship-capability.cross-system-reconstruction" }
```

The existing `capabilityAvailable` predicate remains a mission-entry snapshot derived from archived mission outcomes. It must not be silently changed into a dynamic global capability check. The new predicate reads the currently derived Ship state at the accepted-pair revision.

A favorable mission result that depends on Ship capability must satisfy both:

1. the capability was available from accepted Ship state; and
2. the accepted prose depicts its relevant application according to the mission evidence policy.

Capability availability alone is not evidence of use. A model mentioning a capability without depicting its result is not enough. Player prose alone cannot establish world truth or action success under the existing evidence roles.

## Dependency Receipts and Invalidation

Any accepted mission evidence whose precondition consumes a Ship capability records the active Ship effect IDs that proved that capability. Those become explicit dependency receipts.

If a source is later edited, deleted, hidden, replaced by another swipe, or removed by branching:

1. Story Settlement invalidates the affected Ship milestone effect.
2. Ship state is re-derived from surviving active effects.
3. A removed capability invalidates or replays mission evidence that cited its effects.
4. Mission objectives, outcomes, dimensions, transitions, reports, and downstream story effects rebuild from the surviving valid evidence.
5. The Ship page and next narration prompt reflect the reconstructed state.

This dependency is mandatory. Merely checking the capability at initial commitment would leave favorable mission outcomes orphaned after Ship progress is rolled back.

Conversely, removing a mission fact or permission that was a Ship-transition dependency must re-derive the affected Ship state and replay its downstream consumers. Cross-domain dependencies must be acyclic at package-validation time or ordered through explicit authority tiers so replay terminates deterministically.

## Ashes of Peace V1 Systems

### Systems Integration

The refit's components generally function, but their cross-system behavior has not been fully validated under sustained operations.

Proposed states:

1. **Unvalidated** — broad isolation or failover cannot be assumed safe; authored operations may require shutdown, exposure, or a manual workaround.
2. **Segmented** — unlock `ship-capability.segmented-isolation`; an eligible operation can isolate one affected segment without automatically losing every dependent system.
3. **Integrated** — unlock `ship-capability.integrated-failover`; eligible missions can use controlled failover instead of choosing between continued exposure and total shutdown.

Limits remain concrete. Segmented isolation does not repair physical damage or replace missing power. Integrated failover does not erase time, staffing, or established hardware constraints.

### Sensor Calibration

Post-refit correlation is useful but not initially sufficient for fine identity, provenance, or sophisticated deception claims without corroboration.

Proposed states:

1. **Provisional** — Breckenridge data alone cannot conclusively establish eligible fine-grained claims; independent corroboration or physical evidence is required.
2. **Aligned** — unlock `ship-capability.calibration-correlation`; the ship can distinguish local calibration error from an external anomaly and narrow an investigation.
3. **Validated** — unlock `ship-capability.cross-system-reconstruction`; eligible missions can use protected calibration plus independent references as a conclusive authored route.

Validated sensors do not create omniscience, identify an unknown actor automatically, defeat every deception, or reveal evidence the ship cannot physically observe.

Exact milestone wording, dependency sources, and which Ashes missions consume each capability will be finalized in the implementation plan against the authored campaign facts. The implementation must not invent a person, part, permission, or prior event that the campaign package does not support.

## Same-Turn Semantics

Directive settles the previously selected assistant response together with the player's new message before generating the next assistant response. Therefore:

1. the prior response may depict completion of Ship work;
2. the player's next message accepts that response;
3. the shared interpreter recognizes eligible Ship evidence;
4. deterministic state derivation unlocks the capability; and
5. the prompt for the response to the player's new message includes it.

The capability does not need to affect the response in which it was first depicted as completed. It becomes authoritative at the normal accepted-pair boundary, just like other Directive consequences.

## Failure and Compliance Boundaries

- Narrator omits a relevant capability: the state remains valid; the player may invoke it explicitly or the next prompt may continue to carry it.
- Narrator depicts success that violates a Ship constraint: unsupported favorable mission evidence is rejected and does not become authoritative state.
- Narrator repeatedly contradicts the mechanics: this is a model or prompt-compliance limitation, not evidence that Directive should add an anti-cheat or rewrite layer.
- Player deliberately declares an unsupported result or changes the prompt: Directive does not police the player. Its own accepted projections continue to follow validated evidence where possible.
- Shared interpretation call fails: fail closed for new Ship and mission evidence, preserving the prior authoritative state.
- Package contains broken Ship mechanics: reject the package definition rather than improvise a runtime repair.
- A system has no active mission interaction: its state remains useful as a journal record but supplies no generic bonus.

V1 will not add a post-generation judge, hidden difficulty adjustment, forced regeneration, prose censor, or corrective message insertion. Such systems would add latency and brittleness while conflicting with cooperative-play assumptions.

## Save and Compatibility Boundary

Existing saves already contain immutable Ship identity, Story Settlement, mission authority, and accepted source lineage. Because Ship state is derived from package definitions plus accepted effects, the feature should avoid converting the existing `ship` record into a large mutable schema.

For saves created before Ship mechanics exist:

- package-defined opening states apply;
- no historical chat is retroactively scanned for repair progress;
- future accepted pairs can earn milestones normally;
- existing accepted mission outcomes may count only through explicit deterministic package dependencies, never a free-form history reinterpretation; and
- absence of Ship milestone effects remains valid.

Package version and definition identity participate in validation. A package update must not silently reinterpret an accepted milestone under materially different rules without an explicit compatible migration or a new definition version.

## Verification

Focused automated coverage will prove:

- Ship mechanics definitions reject invalid IDs, cycles, unreachable states, undeclared capabilities, broken milestone policies, and spoiler-unsafe missing player text;
- opening Ship states derive correctly with no milestone effects;
- accepted Ship-work candidates commit only from authorized accepted source roles;
- repeated interpretation is idempotent;
- unknown, known, satisfied, and hidden work-order projection states remain distinct;
- the page exposes major state ladders while withholding undiscovered dependency details;
- no Ship-page control initiates or mutates a project;
- operational mechanics packets include current relevant constraints and capabilities but exclude hidden or irrelevant rules;
- `shipCapabilityAvailable` is dynamic while existing `capabilityAvailable` retains mission-entry semantics;
- a capability does not automatically create mission evidence without depicted application;
- eligible use changes objective, outcome, route, or complication behavior exactly as authored;
- unavailable capabilities cannot authorize favorable dependent evidence;
- source edit, deletion, swipe replacement, and branch reconstruction remove Ship effects and replay dependent mission evidence;
- removing a mission dependency re-derives Ship state safely;
- save, reload, and accepted-pair replay produce the same Ship projection;
- provider failure and schema failure preserve prior Ship state;
- Exploration and Command policies continue to own consequence severity;
- existing saves load into package-defined opening states without retroactive prose inference; and
- Ship mechanics work with the bundled preset absent or replaced, subject to ordinary model compliance limits.

After focused tests, run the existing V1 gate and browser-rendered desktop and mobile Ship-page checks. Live SillyTavern verification should demonstrate at least one work-order completion, one newly viable approach, one prevented named complication or removed requirement, save/reload persistence, and one source invalidation rollback.

## Non-Goals

- No anti-cheat system or attempt to infer whether a player is playing honestly.
- No generic rolls, target numbers, skill checks, advantage, success percentages, or numerical modifiers.
- No repair points, currencies, parts inventory, crafting quantities, labor pool, or upgrade purchase screen.
- No `Pursue Project`, `Track`, `Start`, `Complete`, or similar Ship-page action.
- No automatic selection of player goals or insertion of Ship work into the Mission page.
- No second model call, Ship agent, repair adjudicator, or standalone Director service.
- No model-written Ship state, arbitrary state patch, or parallel Ship tracker.
- No recurring damage model, degradation clock, maintenance decay, random failure table, or system-by-system combat simulation.
- No guarantee that a hostile prompt, permissive model, or deliberate player declaration will obey the intended rules.
- No universal capability that generically improves every mission.
- No campaign-specific Ship-page code path or bespoke renderer.
- No retroactive mining of old chat prose for newly introduced milestones.
- No promise that every future campaign must use Ship mechanics; a package may supply only the universal identity and operational snapshot.
