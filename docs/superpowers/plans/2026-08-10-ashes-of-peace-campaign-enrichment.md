# Ashes of Peace Campaign Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich all thirteen Ashes of Peace missions with grounded characters, fair hooks, materially different approaches, deterministic completion, specific payoffs, and downstream acknowledgement while remaining entirely inside the existing V1 campaign-data architecture.

**Architecture:** Do not add runtime or schema behavior. Express all changes through existing mission V1 facts, evidence policies, report routes, events, outcomes, objectives, Command Bearing awards, outcome dimensions, clocks, terminal dispositions, transitions, and entry capabilities. Keep the Markdown campaign source synchronized with the bundled JSON, and prove each mission through authored scenario fixtures before proceeding.

**Tech Stack:** JSON campaign packages and mission definitions, JSON authored scenario fixtures, Markdown campaign source, Node.js assertion scripts, PowerShell commands on Windows.

## Global Constraints

- Keep all content grounded in Star Trek's 2376 post-Dominion War setting; Voyager remains in the Delta Quadrant and does not intersect the campaign.
- Campaign chapter order remains linear, but individual missions may use linear, branching, hub, or parallel-front story shapes according to dramatic need.
- Mermaid remains an authoring aid only. Do not add literal story-graph data or a new graph consumer.
- Do not modify `schemas/`, `src/`, UI files, storage, runtime behavior, or campaign-save architecture.
- The only non-content test-harness edit allowed is `tools/scripts/test-ashes-v1-campaign.mjs`, to assert authored Command Bearing eligibility when an expectation explicitly supplies award IDs.
- Preserve existing mission IDs, package binding, sequence, player role, Captain Whitaker's final authority, and established facts unless this plan explicitly names a revision.
- Keep Hesperus independent of Pale Lantern and of the redline diversion.
- Redline is an unsafe Valorous-era field-compounded stimulant made from individually legitimate medical components; Commander Sato recognizes its composition promptly only after receiving a sample or symptomatic patient.
- Rhee is not at poker. Kieran invites the player; Lysa Chen raises the inconsistent explanations after ordinary play and directly asks the player only if the hook is missed.
- Rhee attribution requires two independent evidence classes from access/opportunity, material linkage, and human evidence. Confession requires corroboration.
- Award one Command Bearing point only after Rhee is actually secured in lawful custody personally or through an executed security order.
- The Prelude intentionally permits up to two Command Bearing points: one for Hesperus accountability and one for Rhee's lawful apprehension. A first playthrough may surface only one.
- Command Bearing remains scarce elsewhere and recognizes exceptional optional command decisions, not routine mission completion.
- Most payoffs use named capabilities, preserved evidence, trust, authority, protected lives, accepted obligations, and later acknowledgement.
- Important discoverable information needs more than one fair delivery route. Undiscovered optional content cannot silently penalize the player or block mission closure.
- Costly success, responsible handoff, informed failure, and clean success must remain distinct in objective text, terminal text, transition narration, and fixtures.
- Add no global relationship meter, morality score, or generic reward field.
- Preserve unrelated dirty work, especially the in-progress player-identity files and `tools/scripts/run-alpha-gate.mjs`.
- Use Red/Green/Refactor: add or strengthen fixture expectations first, observe failure, make the smallest mission-data change, and rerun the focused campaign gate.

---

### Task 1: Reward-Aware Ashes Scenario Contract

**Files:**
- Modify: `tools/scripts/test-ashes-v1-campaign.mjs`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Consumes: existing mission definitions and each scenario's `expected` object.
- Produces: optional `expected.commandBearingAwardIds: string[]` coverage without changing scenarios that omit the field.

- [x] **Step 1: Add the failing explicit-award assertion**

Import `eligibleMissionCommandBearingAwards` from `src/mission/v1/mission-reducer.mjs`. In `assertScenarioResult`, add:

```js
if (Object.hasOwn(expected, 'commandBearingAwardIds')) {
  assert.deepEqual(
    eligibleMissionCommandBearingAwards(definition, result.state).map((award) => award.id),
    expected.commandBearingAwardIds,
    `${label}: Command Bearing awards`
  );
}
```

Temporarily add `"commandBearingAwardIds": ["award.prelude.missing-proof"]` to one terminal Prelude scenario.

- [x] **Step 2: Run the campaign gate and observe the expected mismatch**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: FAIL on the temporary Prelude Command Bearing award expectation.

- [x] **Step 3: Replace the temporary value with the existing Hesperus award**

Use the exact existing ID:

```json
"commandBearingAwardIds": ["award.prelude.hesperus-accountability"]
```

- [x] **Step 4: Re-run the campaign gate**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: PASS with 13 mission contracts and the current authored-scenario count.

- [x] **Step 5: Commit the reward-aware test contract**

```powershell
git add tools/scripts/test-ashes-v1-campaign.mjs tests/fixtures/mission/v1/prelude-hesperus-scenarios.fixture.json
git commit -m "test: assert Ashes mission rewards"
```

---

### Task 2: Three-Day Prelude, Poker Hook, And Redline Investigation

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- Modify: `packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/prelude-hesperus-scenarios.fixture.json`
- Modify: `tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json`
- Modify: `docs/authoring/ASHES_OF_PEACE_ENRICHMENT.md`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`
- Test: `tools/scripts/test-v1-command-bearing.mjs`

**Interfaces:**
- Produces: optional objective `objective.prelude.rhee-apprehension`, award `award.prelude.rhee-apprehension`, outcome dimension `dimension.prelude.redline`, and an unchanged required Prelude closure boundary.
- Consumes: existing Hesperus rescue/accountability objectives, existing Command Bearing award processing, and Chapter 1 transition.

- [x] **Step 1: Add failing Prelude route and reward scenarios**

Add scenarios with these exact IDs and expectations:

```json
[
  "poker-chen-medical-audit-lawful-custody",
  "sato-inventory-access-audit-lawful-custody",
  "hesperus-shortage-human-evidence-lawful-custody",
  "single-evidence-class-no-apprehension-award",
  "unsupported-accusation-no-apprehension-award",
  "wrong-person-custody-no-apprehension-award",
  "rhee-medical-amnesty-without-custody-no-award",
  "rhee-case-handed-off-without-custody-no-award",
  "both-prelude-command-bearing-awards"
]
```

The final scenario must expect both IDs, in authored order:

```json
"commandBearingAwardIds": [
  "award.prelude.hesperus-accountability",
  "award.prelude.rhee-apprehension"
]
```

- [x] **Step 2: Run the Prelude gate and observe missing policies and IDs**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: FAIL because the redline facts, events, outcomes, objective, and award are not authored.

- [x] **Step 3: Compress the Prelude chronology to three days**

Update the source and all player-facing mission copy to this sequence:

```text
Day 0: arrival, handover, optional poker, optional Sickbay visit
Day 1: readiness work and Hesperus distress
Day 2: rescue aftermath and redline investigation
Day 3: final review, arrival in the Reach, Relief Convoy Twelve distress
```

Keep the Hesperus thirty-hour safe-response clock. Remove references that require Days 4–10; do not alter the campaign's opening year, player billet, or mission order.

- [x] **Step 4: Author the three redline entry hooks and evidence classes**

Add facts and report routes using these stable IDs:

```json
[
  "fact.prelude.redline.conflicting-explanations",
  "fact.prelude.redline.inventory-drift",
  "fact.prelude.redline.shortage-consequence",
  "fact.prelude.redline.composition-confirmed",
  "fact.prelude.redline.distribution-confirmed",
  "fact.prelude.redline.access-evidence",
  "fact.prelude.redline.material-evidence",
  "fact.prelude.redline.human-evidence"
]
```

Use Chen's poker conversation, Sato's inventory concern, and Hesperus medical staging as independent entry routes. Sato's required report language must describe changing inventory without naming redline. Do not use Rhee's poker absence as evidence.

- [x] **Step 5: Author lawful attribution and disposition data**

Add outcomes for evidence sufficiency, distribution containment, Rhee's disposition, and Daro's care. Add `objective.prelude.rhee-apprehension` as conditional-optional. Its `completed` predicate must require both:

```json
{
  "all": [
    { "outcomeIs": { "id": "outcome.prelude.redline-evidence", "equals": "twoIndependentClasses" } },
    { "outcomeIs": { "id": "outcome.prelude.rhee-disposition", "equals": "lawfulCustodyExecuted" } }
  ]
}
```

Support non-awarding terminal dispositions for responsible handoff, treatment/amnesty without custody, unresolved inquiry, escape, and unsupported or wrongful custody. Keep this optional objective out of `closeWhen`.

- [x] **Step 6: Add the independent Rhee award and redline outcome dimension**

Author:

```json
{
  "id": "award.prelude.rhee-apprehension",
  "sourceObjectiveId": "objective.prelude.rhee-apprehension",
  "eligibleDispositions": ["completed"],
  "reason": "You established the shipboard distribution case and placed the responsible crew member in lawful custody."
}
```

Add `dimension.prelude.redline` values for `contained-lawful-custody`, `contained-treatment-handoff`, `contained-with-evidence-cost`, `unresolved-carried-forward`, and `mishandled`. Preserve the separate Hesperus accountability dimension and award.

- [x] **Step 7: Synchronize character and scene authority in the source**

Add bounded profiles for Ensign Lysa Chen, Petty Officer First Class Anika Rhee, and Crewman Daro Tem. Record Kieran's invitation, ordinary poker conversation before Chen raises the concern, Sato's confidentiality and knowledge boundary, Rhee's Valorous-era rationale, Daro's insomnia and duty-fitness fear, and Bronn's lawful-custody role. Do not add these transient characters to the senior-staff dataset.

- [x] **Step 8: Run focused Prelude and reward verification**

Run:

```powershell
node tools/scripts/test-ashes-v1-campaign.mjs
node tools/scripts/test-v1-command-bearing.mjs
node tools/scripts/test-v1-mission-reducer.mjs
```

Expected: PASS; the campaign scenario count increases by at least nine, both Prelude awards are independently and jointly reachable, and no unsupported custody route awards a point.

- [ ] **Step 9: Commit the Prelude enrichment**

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md docs/authoring/ASHES_OF_PEACE_ENRICHMENT.md packages/bundled/breckenridge/ashes-of-peace.campaign-package.json packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json tests/fixtures/mission/v1/prelude-hesperus-scenarios.fixture.json tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json
git commit -m "feat: enrich Ashes Prelude investigation"
```

---

### Task 3: Empty Convoy Human Routes And Shared-Record Payoff

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/v1/chapter-1-the-empty-convoy.mission-v1.json`
- Modify: `packages/bundled/breckenridge/v1/chapter-2-false-colors.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/chapter-1-empty-convoy-scenarios.fixture.json`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Produces: two fair routes to `fact.chapter1.recovery-authentication-picture` and entry capability `capability.chapter2.shared-convoy-record`.
- Consumes: existing relief, authority, hardware, and shared-record dispositions.

- [x] **Step 1: Add failing scenarios for alternate discovery and approach order**

Add `ivers-testimony-before-hardware`, `survivor-manifest-before-authority`, `compact-custody-first`, and `shared-record-imports-to-false-colors`. The first three must reach existing terminal dispositions through different evidence orderings; the fourth must establish `dimension.chapter1.cooperation=joint-record`.

- [x] **Step 2: Run the campaign gate and observe missing route evidence**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: FAIL on the new Chapter 1 fragments or the new Chapter 2 entry capability.

- [x] **Step 3: Add embodied convoy evidence**

Establish Captain Nella Ivers as the convoy commander and recurring witness. Add Dr. Samira Nadi as the relief physician protecting incomplete patient manifests, and Olan Brin as the cargo custodian responsible for emergency-hardware custody. Give each a limited knowledge boundary. Add separate facts for Ivers's testimony and the survivor/cargo manifest; either route may corroborate the false order's authentic code fragments.

- [x] **Step 4: Preserve the existing closure contract while expanding methods**

Do not add another required objective. Add evidence policies for rescue-first, authority-first, hardware-first, independent sensor reconstruction, witness testimony, and responsible handoff. Each method must resolve into the existing relief, authority, hardware, and incident-record outcomes.

- [x] **Step 5: Persist the shared-record accomplishment into Chapter 2**

Add to Chapter 2:

```json
{
  "id": "capability.chapter2.shared-convoy-record",
  "source": {
    "definitionId": "mission.chapter-1-the-empty-convoy",
    "definitionVersion": "1.0.0",
    "requirements": [{
      "dimensionId": "dimension.chapter1.cooperation",
      "in": ["joint-record"]
    }]
  },
  "playerText": {
    "label": "Shared Convoy Record",
    "summary": "Compact and Starfleet participants already possess one jointly authenticated incident record and a tested chain for comparing disputed evidence."
  }
}
```

Mention this capability in Chapter 2's joint-investigation path as leverage, never as automatic vindication.

- [ ] **Step 6: Verify and commit Chapter 1**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: PASS with all four original Chapter 1 terminal dispositions still covered and the new capability source validated.

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md packages/bundled/breckenridge/v1/chapter-1-the-empty-convoy.mission-v1.json packages/bundled/breckenridge/v1/chapter-2-false-colors.mission-v1.json tests/fixtures/mission/v1/chapter-1-empty-convoy-scenarios.fixture.json
git commit -m "feat: deepen Empty Convoy routes"
```

---

### Task 4: False Colors Witnesses And Verification Methods

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/v1/chapter-2-false-colors.mission-v1.json`
- Modify: `packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/chapter-2-false-colors-scenarios.fixture.json`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Produces: distinct medical, flight-profile, systems-baseline, and joint-witness routes plus `capability.open-orders1.compact-verification-framework`.
- Consumes: the optional shared-convoy-record capability when earned.

- [x] **Step 1: Add failing route scenarios**

Add `medical-testimony-first`, `kieran-flight-profile-first`, `independent-baseline-without-joint-access`, `joint-witness-framework`, and `partial-evidence-managed-ambiguity`. Assert that partial evidence still reaches Hecate without being upgraded to vindication.

- [x] **Step 2: Add named Aegis Two witnesses and bounded knowledge**

Author Lieutenant Tov Saren as the injured patrol commander who distrusts Breckenridge telemetry but accepts neutral medical care, and Specialist Jexa Renn as the systems operator who remembers timing but not attacker identity. Keep Kessler's verification demand and Holt's access pressure distinct.

- [x] **Step 3: Add materially different verification methods**

Provide four evidence routes: Sato's neutral medical timeline, Kieran's maneuver-envelope reconstruction, Imani and Rowan's independent systems baseline, and a Compact-Starfleet witness/evidence session. Preserve the choice between bounded access, broad access, refusal with an alternative, and refusal without one.

- [x] **Step 4: Persist the joint framework into Open Orders I**

Add `capability.open-orders1.compact-verification-framework`, sourced from `dimension.chapter2.partnership=joint-framework`. Its summary must promise a functioning joint verification channel, not Compact trust or agreement.

- [ ] **Step 5: Verify and commit Chapter 2**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: PASS with all four terminal dispositions covered and the Hecate transition preserved.

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md packages/bundled/breckenridge/v1/chapter-2-false-colors.mission-v1.json packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json tests/fixtures/mission/v1/chapter-2-false-colors-scenarios.fixture.json
git commit -m "feat: enrich False Colors evidence routes"
```

---

### Task 5: Open Orders I As Three Compact Episodes

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/open-orders-1-scenarios.fixture.json`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Produces: opening, complication, and resolution evidence for Long Repair, Borrowed Wings, and Quiet Channels.
- Consumes: existing optional objectives, three Command Bearing awards, three outcome dimensions, and optional Compact verification capability.

- [x] **Step 1: Add failing three-beat assignment scenarios**

Add `long-repair-limit-before-plan`, `borrowed-wings-ors-self-disclosure`, `quiet-channels-redline-echo`, and `all-three-delegated-without-overextension`. Each selected assignment must require an opening fact and a complication event before its result is accepted.

- [x] **Step 2: Expand Long Repair**

Use Helix Yard engineer Dev Adebayo to present a combined-load risk that is individually within certification but unsafe in combination. Allow a joint stabilization plan, a bounded deferral, direct overreach, or responsible delegation. The Helix capability remains earned only by a durable cooperative plan.

- [x] **Step 3: Expand Borrowed Wings**

Preserve Lena Ors's agency. Let her disclose the sensor-triggered trauma response, be observed under controlled conditions, or have the issue surface during training. Kieran must learn to build a capable wing rather than personally rescue the exercise. Certification, restriction, retraining, or reassignment remain defensible according to evidence.

- [x] **Step 4: Expand Quiet Channels**

Give Priya's civilian contacts an accountable spokesperson, Mara Venn. If `dimension.prelude.redline` records a handled case, let that history change why informal supply favors are scrutinized; do not imply the network supplied redline. Support formalization, bounded continuation, shutdown, or responsible handoff.

- [x] **Step 5: Prove assignment rewards remain scarce and idempotent**

Add explicit `commandBearingAwardIds` expectations to one success and one failure scenario for each assignment. Assert that resolving all three through delegation may make three awards eligible, while the reserve's capacity behavior remains governed by the existing Command Bearing system.

- [x] **Step 6: Verify and commit Open Orders I**

Run:

```powershell
node tools/scripts/test-ashes-v1-campaign.mjs
node tools/scripts/test-v1-command-bearing.mjs
```

Expected: PASS.

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json tests/fixtures/mission/v1/open-orders-1-scenarios.fixture.json
git commit -m "feat: expand Open Orders I episodes"
```

---

### Task 6: Dead Letters Human Archive And Clue Resilience

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/v1/chapter-3-dead-letters.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/chapter-3-dead-letters-scenarios.fixture.json`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Produces: human owners for fabricated private messages and alternate Demeris corroboration when physical evidence is lost.
- Consumes: existing access, evidence, relay, archive outcomes and preserved-relay Chapter 8 capability.

- [x] **Step 1: Add failing human-archive and lost-evidence scenarios**

Add `message-owner-consent-before-relay-custody`, `restricted-family-disclosure`, `relay-destroyed-demeris-corroboration`, and `archive-not-recovered-alternate-lead`.

- [x] **Step 2: Author affected message owners**

Use known regional figures Nella Ivers, Nia Kessler, and Asha Prel as three owners whose fabricated messages would create different harms. Ivers permits operational use but not broad publication; Kessler demands independent custody; Prel protects relief recipients named in the traffic.

- [x] **Step 3: Separate evidence routes and custody decisions**

Make relay architecture, access history, message authenticity, and Demeris routing independently discoverable. Preserve privacy-protective destruction, restricted custody, controlled observation, and responsible withdrawal without erasing the next lead.

- [x] **Step 4: Verify and commit Dead Letters**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: PASS with all six terminal dispositions and both direct and alternate evidence routes covered.

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md packages/bundled/breckenridge/v1/chapter-3-dead-letters.mission-v1.json tests/fixtures/mission/v1/chapter-3-dead-letters-scenarios.fixture.json
git commit -m "feat: humanize Dead Letters archive"
```

---

### Task 7: Demeris Witness Agency And Process-Dependent Truth

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/v1/chapter-4-the-colony-that-stayed.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/chapter-4-colony-that-stayed-scenarios.fixture.json`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Produces: separate Marr, Solenn, beneficiary, and harmed-witness routes.
- Consumes: existing process, evidence, Solenn, and interface dispositions plus Demeris Archive Chapter 8 capability.

- [x] **Step 1: Add failing process-dependent testimony scenarios**

Add `local-process-beneficiary-testifies`, `shared-inquiry-harmed-witness-testifies`, `starfleet-seizure-witness-silence`, `solenn-cooperates-interface-local`, and `covert-route-evidence-with-trust-cost`.

- [x] **Step 2: Give Marr and Solenn independent goals**

Marr protects Demeris jurisdiction and the survival record. Solenn wants the interface prevented from harming anyone else but refuses to let Starfleet erase why she used it. Neither may speak for the other.

- [x] **Step 3: Add two bounded witnesses**

Author Tamas Rell as a colonist whose family survived because Solenn falsified clearance, and Jo Meran as a dock coordinator harmed when the same access displaced another evacuation group. The chosen process controls who will testify and what custody they accept; it does not change what happened.

- [x] **Step 4: Verify and commit Chapter 4**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: PASS with all six terminal dispositions covered and no process automatically producing the strongest truth result.

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md packages/bundled/breckenridge/v1/chapter-4-the-colony-that-stayed.mission-v1.json tests/fixtures/mission/v1/chapter-4-colony-that-stayed-scenarios.fixture.json
git commit -m "feat: deepen Demeris witness agency"
```

---

### Task 8: Old Lessons Human Stakes And Confirmed Payoff Repair

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/v1/chapter-5-old-lessons.mission-v1.json`
- Modify: `packages/bundled/breckenridge/v1/open-orders-2-what-survives.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/chapter-5-old-lessons-scenarios.fixture.json`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Produces: distinct civilian command choices and `capability.open-orders2.orison-authentication-record`.
- Consumes: existing Orison, authentication, operator, evidence-route, and command dimensions.

- [x] **Step 1: Add failing multi-captain and payoff scenarios**

Add `ivers-evacuates-ren-tal-holds`, `shala-venn-refuses-network-orders`, `holt-intent-before-autonomous-escalation`, `bronn-kieran-tested-alternative`, and `authentication-record-imports-to-open-orders2`.

- [x] **Step 2: Put people on the traffic and defense fronts**

Use Nella Ivers as the relief captain who prioritizes vulnerable ships, Captain Ren Tal as a freighter master unwilling to abandon cargo needed by a colony, and Captain Shala Venn as a passenger captain who distrusts all network orders after the false-colors incident. Give each a rational response that can help or complicate different plans.

- [x] **Step 3: Separate Holt's act from Pale Lantern escalation**

Author independent facts for Holt initiating the diversion to test or secure Orison and for Pale Lantern autonomously exploiting it beyond his plan. Capturing Holt's intent does not prove the autonomous control chain; establishing the control chain does not erase Holt's responsibility.

- [x] **Step 4: Make Bronn and Kieran useful in different ways**

Bronn supplies conservative authentication and fire-control contingencies. Kieran supplies traffic geometry and a rapid manual corridor. Record whether the player tests, combines, rejects, or humiliates their advice through the existing command-posture outcome.

- [x] **Step 5: Add the Chapter 5 payoff to Open Orders II**

Author:

```json
{
  "id": "capability.open-orders2.orison-authentication-record",
  "source": {
    "definitionId": "mission.chapter-5-old-lessons",
    "definitionVersion": "1.0.0",
    "requirements": [{
      "dimensionId": "dimension.chapter5.authentication",
      "in": ["secured", "destroyed-with-record"]
    }]
  },
  "playerText": {
    "label": "Orison Authentication Record",
    "summary": "A verified record of the Sigma-4 authentication path is available for defense transition, evidence review, and controlled deactivation work."
  }
}
```

This capability supplies leverage in The Last Watch but does not make Varrik Tonn consent or automatically earn Orison Defense Codes.

- [x] **Step 6: Verify and commit Chapter 5**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: PASS with the prior six terminal dispositions intact and the new Open Orders II capability validated.

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md packages/bundled/breckenridge/v1/chapter-5-old-lessons.mission-v1.json packages/bundled/breckenridge/v1/open-orders-2-what-survives.mission-v1.json tests/fixtures/mission/v1/chapter-5-old-lessons-scenarios.fixture.json
git commit -m "feat: enrich Old Lessons payoff"
```

---

### Task 9: Open Orders II Recovery Episodes And Prelude Echo

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/v1/open-orders-2-what-survives.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/open-orders-2-scenarios.fixture.json`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Produces: three scene-complete recovery assignments and optional `capability.open-orders2.medical-supply-safeguards` sourced from the Prelude.
- Consumes: existing three assignment awards/assets, credential-path convergence, and Orison authentication capability.

- [x] **Step 1: Add failing recovery and continuity scenarios**

Add `last-watch-record-without-consent`, `second-opinion-patient-refusal`, `second-opinion-redline-trust-echo`, `unwelcome-result-independent-owner`, and `credential-report-after-delegated-two`.

- [x] **Step 2: Expand The Last Watch**

Give Varrik Tonn a constituency of platform crews and settlements that survived because the platforms remained active. Let the Orison record establish technical facts without deciding whether deactivation, shared control, conversion, or bounded retention is legitimate.

- [x] **Step 3: Expand Second Opinion**

Use Doctor Eren Vos, patient Aven Ril, and essential worker Marta Keene. Ril values relief but fears losing the emotions that anchor memory; Keene wants treatment but fears duty and employment consequences. Preserve consent, duty fitness, treatment access, and workforce pressure as separate concerns.

- [x] **Step 4: Persist responsible Prelude handling without making redline causal**

Add `capability.open-orders2.medical-supply-safeguards`, sourced from `dimension.prelude.redline=contained-lawful-custody` or `contained-treatment-handoff`. Its summary states that Sato has a trusted chain for reconciling inventory, confidentiality, and duty-fitness concerns. It changes who volunteers information; it does not change treatment efficacy or imply Vos's therapy is redline.

- [x] **Step 5: Expand An Unwelcome Result**

Give Rowan at least two evidence owners: a civilian observatory that wants immediate publication and a Compact planner who fears panic from an uncertain forecast. Allow correction, independent review, bounded warning, suppression, or responsible handoff to produce distinct costs.

- [x] **Step 6: Verify and commit Open Orders II**

Run:

```powershell
node tools/scripts/test-ashes-v1-campaign.mjs
node tools/scripts/test-v1-command-bearing.mjs
```

Expected: PASS with three independent award paths and the credential report still required for closure.

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md packages/bundled/breckenridge/v1/open-orders-2-what-survives.mission-v1.json tests/fixtures/mission/v1/open-orders-2-scenarios.fixture.json
git commit -m "feat: expand Open Orders II recovery"
```

---

### Task 10: Cost Of Knowing Operational Discoveries

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/v1/chapter-6-the-cost-of-knowing.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/chapter-6-cost-of-knowing-scenarios.fixture.json`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Produces: multiple operational evidence routes to the existing Farwatch account and Nightfall risk.
- Consumes: existing network, evidence, information, and Rourke outcome dimensions and Farwatch Evidence Package capability.

- [x] **Step 1: Add failing discovery-order scenarios**

Add `lacuna-telemetry-before-rourke-boundary`, `rourke-choice-reveals-constraint`, `tolland-delay-crosses-concealment-line`, `analyst-corroboration-without-archive`, and `evidence-owner-refuses-public-release`.

- [x] **Step 2: Split the single crisis event into operational beats**

Add events for Lacuna access, false recall activation, command-network containment, archive recovery or loss, and independent corroboration. Do not make each event a required checklist item; they are alternate or parallel evidence sources for the existing three required objectives.

- [x] **Step 3: Establish Rourke and Tolland through constrained actions**

Rourke may disclose a risk, protect a source, attempt to enforce the recall, or accept a safeguard. Tolland may permit bounded disclosure, delay for operational protection, or continue delay after it no longer protects an active operation. Preserve Farwatch's genuine wartime value alongside imposed regional risk.

- [x] **Step 4: Add independent evidence owners**

Author Analyst Keva Lir as a Farwatch analyst who preserved a signed methodology record and Lieutenant Bram Edden as a communications officer whose credentials were used without informed consent. Neither holds the complete truth; together or with Lacuna telemetry they can corroborate it.

- [x] **Step 5: Verify and commit Chapter 6**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: PASS with all six terminal dispositions reachable through more than one evidence order and the Farwatch package still awarded only by `dimension.chapter6.evidence=farwatch-evidence-package`.

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md packages/bundled/breckenridge/v1/chapter-6-the-cost-of-knowing.mission-v1.json tests/fixtures/mission/v1/chapter-6-cost-of-knowing-scenarios.fixture.json
git commit -m "feat: deepen Cost of Knowing operation"
```

---

### Task 11: Peace Of Their Own Lived Standoff And Enforceable Settlement

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/v1/chapter-7-a-peace-of-their-own.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/chapter-7-peace-of-their-own-scenarios.fixture.json`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Produces: civilian, Compact security, and Starfleet pressure events that converge on existing settlement outcomes.
- Consumes: existing standoff, interface/truth, and settlement objectives plus the task-group clock and provisional-accord capability.

- [x] **Step 1: Add failing lived-standoff scenarios**

Add `civilian-corridor-before-constitutional-talks`, `compact-security-refusal-opens-channel`, `mercer-demonstration-changes-leverage`, `settlement-without-enforcement-fails-forward`, and `armed-stand-down-with-verification-cell`.

- [x] **Step 2: Add civilian needs independent of faction leaders**

Author an Annex Six medical corridor, separated families, and workers trapped behind security controls. Nia Kessler cannot waive their needs; Darius Holt cannot claim their unanimous support.

- [x] **Step 3: Add named security and Starfleet acts**

Use Captain Joelle Mercer as a lawful but escalating task-group commander. Add Compact security lieutenant Teren Vahl, who will defend Annex Six but refuses an unauthenticated firing order. Their choices create leverage and danger without deciding the settlement.

- [x] **Step 4: Require enforceable settlement machinery**

A settlement result must record at least one implementation mechanism: shared verification cell, authenticated stand-down sequence, civilian oversight and review date, bounded Starfleet restoration procedure, bounded Compact control procedure, or named responsible handoff. A declared preference without a mechanism resolves as fragmented authority or open conflict according to accepted consequences.

- [x] **Step 5: Verify and commit Chapter 7**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: PASS with all seven terminal dispositions and the task-group deadline preserved.

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md packages/bundled/breckenridge/v1/chapter-7-a-peace-of-their-own.mission-v1.json tests/fixtures/mission/v1/chapter-7-peace-of-their-own-scenarios.fixture.json
git commit -m "feat: deepen Annex Six settlement"
```

---

### Task 12: Open Orders III Personal Closure And Preparation

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/v1/open-orders-3-before-the-lamps-go-out.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/open-orders-3-scenarios.fixture.json`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Produces: scene-complete memorial, relay, and legal-identity assignments while preserving three awards and four Chapter 8 capabilities.
- Consumes: prior command outcomes as tone and access, never as predetermined success.

- [x] **Step 1: Add failing preparation scenarios**

Add `survivors-redesign-memorial`, `crew-only-remembrance`, `beacon-recovery-before-schedule`, `relay-clean-room-after-contamination`, `imani-independent-signature`, and `emergency-use-with-bounded-consent`.

- [x] **Step 2: Expand The Name on the Hull**

Give ceremony organizer Alia Mbeki and Reach survivor Corin Hale distinct positions. Support the original ceremony, shared redesign, ship presence without command speeches, separate crew remembrance, or refusal. Memorial Goodwill requires credible shared ownership, not mere attendance.

- [x] **Step 3: Expand A Signal Toward Home**

Keep the experiment hopeful and explicitly short of Pathfinder's decisive Voyager contact. Use three calibration beacons, a subspace eddy, a possible contaminated path, and Priya's undeliverable personal messages. The relay window requires disciplined collaboration rather than a dramatic breakthrough.

- [x] **Step 4: Expand Two Signatures**

Keep the decision with Imani. Record duty time, independent counsel, emergency-use terms, privacy, and whether both Cross signatures are treated as independently necessary. The Cross Isolation Protocol requires documented independent consent or a narrowly bounded emergency agreement, never the player's declaration about Imani's identity.

- [x] **Step 5: Verify and commit Open Orders III**

Run:

```powershell
node tools/scripts/test-ashes-v1-campaign.mjs
node tools/scripts/test-v1-command-bearing.mjs
node tools/scripts/test-v1-mission-entry-capabilities.mjs
```

Expected: PASS.

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md packages/bundled/breckenridge/v1/open-orders-3-before-the-lamps-go-out.mission-v1.json tests/fixtures/mission/v1/open-orders-3-scenarios.fixture.json
git commit -m "feat: expand Open Orders III closure"
```

---

### Task 13: Last Directive Human-Legible Five-Front Finale

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/v1/chapter-8-the-last-directive.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/chapter-8-last-directive-scenarios.fixture.json`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Produces: named actors, cross-front resource choices, and explicit accepted use routes for existing entry capabilities.
- Consumes: fourteen existing Chapter 8 entry capabilities plus the enriched earlier mission history.

- [x] **Step 1: Add failing cross-front and capability-use scenarios**

Add `medical-cooperative-frees-command-mesh`, `relay-window-confirms-mercer-order`, `defense-codes-preserve-platform`, `cross-isolation-protects-core-path`, `quorum-broken-core-escapes`, and `civilians-protected-command-fractures`.

- [x] **Step 2: Assign named owners to all five fronts**

Use Whitaker, Kessler, Mercer, Holt, Prel, Ivers, Sato, Bronn, Priya, Rowan, Kieran, and Imani according to established roles. Each front must contain at least one regional actor with authority to cooperate, refuse, or impose a cost; no front is resolved solely by a senior officer reporting a result.

- [x] **Step 3: Make cross-front costs explicit**

Author events for shifting shuttle capacity, trusted channels, engineering attention, medical support, and weapons-control personnel. Moving support may improve one front while recording a cost or delayed response on another; it must not silently rewrite an already accepted result.

- [x] **Step 4: Distinguish available capability from depicted use**

For each capability-use scenario, require an accepted event or outcome depicting its use before transition narration may credit it. Preserve the current rule that entry capability availability alone is not use.

- [x] **Step 5: Verify and commit Chapter 8**

Run:

```powershell
node tools/scripts/test-ashes-v1-campaign.mjs
node tools/scripts/test-v1-mission-entry-capabilities.mjs
node tools/scripts/test-v1-mission-transition-narration.mjs
```

Expected: PASS with all five terminal dispositions and the three-path quorum behavior intact.

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md packages/bundled/breckenridge/v1/chapter-8-the-last-directive.mission-v1.json tests/fixtures/mission/v1/chapter-8-last-directive-scenarios.fixture.json
git commit -m "feat: humanize Last Directive finale"
```

---

### Task 14: Terms We Keep Personal Codas And Earned Conclusion

**Files:**
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`
- Modify: `packages/bundled/breckenridge/v1/epilogue-the-terms-we-keep.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/epilogue-terms-we-keep-scenarios.fixture.json`
- Test: `tools/scripts/test-ashes-v1-campaign.mjs`
- Test: `tools/scripts/test-v1-campaign-conclusion.mjs`

**Interfaces:**
- Produces: supported crew and regional codas selected from accepted outcome dimensions and available entry capabilities.
- Consumes: Chapter 8 aftermath, Farwatch evidence, provisional accord, all seven epilogue outcome dimensions, and final command review.

- [ ] **Step 1: Add failing coda combinations**

Add `accountable-peace-personal-codas`, `managed-settlement-unresolved-obligations`, `contested-aftermath-no-invented-reconciliation`, `rhee-custody-coda`, `rhee-treatment-handoff-coda`, and `daro-care-coda`.

- [ ] **Step 2: Author bounded coda facts and events**

Add coda routes for Whitaker, Bronn, Sato, Imani, Rowan, Kieran, Priya, Chen, Rhee, Daro, Tolland, Rourke, Kessler, Holt, Marr, Solenn, Prel, Ivers, Tonn, Vos, and Mercer. A coda may appear only when its required accepted outcome or capability is present. If no future was established, preserve uncertainty rather than inventing promotion, imprisonment, romance, reconciliation, or death.

- [ ] **Step 3: Make institutional and personal resolution coexist**

Keep the existing four required epilogue objectives. The aftermath, authority, accountability, and command decisions remain the closure boundary. Coda facts enrich the final scene but cannot block campaign conclusion.

- [ ] **Step 4: Preserve all three ending tones**

`accountablePeace` receives earned repair and continued-duty images without declaring perfection. `managedSettlement` shows institutions functioning under unresolved limits. `contestedAftermath` ends with concrete responsibility and survival without falsely reconciling divided parties.

- [ ] **Step 5: Verify and commit the epilogue**

Run:

```powershell
node tools/scripts/test-ashes-v1-campaign.mjs
node tools/scripts/test-v1-campaign-conclusion.mjs
node tools/scripts/test-v1-mission-transition-narration.mjs
```

Expected: PASS with all three terminal dispositions and the exact authored campaign-conclusion receipt.

```powershell
git add docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md packages/bundled/breckenridge/v1/epilogue-the-terms-we-keep.mission-v1.json tests/fixtures/mission/v1/epilogue-terms-we-keep-scenarios.fixture.json
git commit -m "feat: enrich Ashes epilogue codas"
```

---

### Task 15: Campaign-Wide Data Certification And Enrichment Record

**Files:**
- Modify: `docs/authoring/ASHES_OF_PEACE_ENRICHMENT.md`
- Verify: `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- Verify: `packages/bundled/breckenridge/v1/*.mission-v1.json`
- Verify: `tests/fixtures/mission/v1/*-scenarios.fixture.json`
- Test: existing V1 mission and campaign scripts only

**Interfaces:**
- Consumes: all enriched mission definitions and fixtures.
- Produces: final reviewed enrichment matrix with implemented, deferred, and deliberately linear paths identified.

- [ ] **Step 1: Run the complete campaign-data verification set**

Run:

```powershell
node tools/scripts/test-ashes-v1-campaign.mjs
node tools/scripts/test-v1-mission-contracts.mjs
node tools/scripts/test-v1-mission-package-linter.mjs
node tools/scripts/test-v1-mission-reducer.mjs
node tools/scripts/test-v1-mission-entry-capabilities.mjs
node tools/scripts/test-v1-mission-journey.mjs
node tools/scripts/test-v1-mission-transition-narration.mjs
node tools/scripts/test-v1-command-bearing.mjs
node tools/scripts/test-v1-campaign-conclusion.mjs
```

Expected: every command exits zero; the Ashes gate reports 13 mission contracts and a scenario total greater than 221.

- [ ] **Step 2: Audit completion, reward, and route coverage**

For each mission, record in the enrichment document:

```text
opening hooks | approach routes | required closure | optional closure
terminal dispositions | Command Bearing awards | downstream capabilities
costly-success acknowledgement | failure-forward acknowledgement | scenario IDs
```

Every promised reward must name the exact existing-architecture field that persists it.

- [ ] **Step 3: Scan for forbidden drift and accidental conspiracy inflation**

Run:

```powershell
rg -n -i "voyager.*asterion|rhee.*pale lantern|hesperus.*pale lantern|redline.*pale lantern|relationship meter|morality score|story graph" packages/bundled/breckenridge docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md
```

Expected: no claim connects Voyager, Hesperus, or redline to Pale Lantern; no new meter or graph-data proposal appears.

- [ ] **Step 4: Review player-facing completion language**

Confirm every objective terminal text and mission terminal summary names the achieved disposition and any material cost. Confirm transition `mustNarrate` clauses acknowledge only established outcomes and never claim an available capability was used without accepted story evidence.

- [ ] **Step 5: Update the living enrichment document**

Mark implemented paths and rewards as complete, preserve deliberate linear sequences with their rationale, list any intentionally unresolved character futures, and replace provisional hypotheses with the final verified result.

- [ ] **Step 6: Commit final campaign certification**

```powershell
git add docs/authoring/ASHES_OF_PEACE_ENRICHMENT.md
git commit -m "docs: certify Ashes campaign enrichment"
```
