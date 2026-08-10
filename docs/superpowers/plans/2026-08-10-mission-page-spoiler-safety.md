# Mission Page Spoiler Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the Mission page from revealing Hesperus, Kieran's invitation, or comparable Ashes of Peace discoveries before accepted story state establishes them.

**Architecture:** Preserve the V1 `worldFacts` versus `knownFacts` authority boundary and correct campaign data that bypasses or mislabels it. Protect the boundary with real initial player-projection tests and a campaign-wide entry-copy audit in the existing Ashes gate.

**Tech Stack:** Node.js ES modules, JSON V1 mission definitions, `node:assert/strict`, PowerShell-compatible `npm.cmd` commands.

## Global Constraints

- The Mission page must never be the first place a player learns a story fact.
- Kieran's invitation is initially true world state but is not player knowledge until accepted assistant prose explicitly gives the invitation.
- Do not add legacy support, migrations, compatibility layers, a new tracker, or unrelated tests.
- Preserve Story Settlement and accepted-pair evidence as semantic authority.

---

### Task 1: Lock the spoiler-safe projection behavior

**Files:**
- Modify: `tools/scripts/test-v1-mission-player-projection.mjs`
- Modify: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Consumes: `createMissionState({ definition, branchId })`, `reduceMissionEvidence({ definition, state, acceptedClaims })`, and `createMissionPlayerProjection({ definition, state })`.
- Produces: regression coverage for the exact initial player-facing behavior and the audited campaign-entry wording boundary.

- [ ] **Step 1: Write the failing Prelude projection assertions**

Change the initial projection expectations to require the safe summary, no initial facts, and no `Hesperus` or `Kieran` text:

```js
assert.equal(
    initial.summary,
    'Complete the command handover, establish a working command rhythm, and bring the Breckenridge to the Asterion Reach.',
);
assert.deepEqual(initial.facts, []);
assert.doesNotMatch(JSON.stringify(initial), /Hesperus|Kieran/i);
```

Add a disclosure claim for `fact.prelude.poker-invitation`, reduce it through real mission evidence, and assert that Kieran appears only in the resulting projection:

```js
const pokerInvitationKnown = reduceMissionEvidence({
    definition,
    state: initialState,
    acceptedClaims: [claim(
        'prelude-poker-invitation-disclosed',
        'factDisclosed',
        'fact.prelude.poker-invitation',
        { policyId: 'policy.prelude.poker-invitation-disclosed' },
    )],
}).state;
assert.match(
    JSON.stringify(createMissionPlayerProjection({ definition, state: pokerInvitationKnown })),
    /Kieran Vale has invited/i,
);
```

- [ ] **Step 2: Add campaign-wide initial entry checks**

In the Ashes campaign gate, create every mission's real initial state and projection. Positively snapshot all player-facing text across title, summary, visible objectives, known facts, visible clocks, capabilities, outcomes, and terminal copy for all thirteen missions. Also construct each authored capability-bearing entry context and snapshot its projected label and summary. Any future entry-copy change must therefore receive explicit review rather than merely avoiding a short blacklist.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
node tools/scripts/test-v1-mission-player-projection.mjs
node tools/scripts/test-ashes-v1-campaign.mjs
```

Expected: the projection test fails because the initial summary contains Hesperus and the initial facts contain Kieran; the campaign gate fails on the audited entry-copy terms.

### Task 2: Correct the Prelude knowledge boundary

**Files:**
- Modify: `packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/prelude-hesperus-scenarios.fixture.json`

**Interfaces:**
- Consumes: the existing mission fact, evidence-policy, reducer, and player-projection contracts.
- Produces: a safe initial mission summary and a discoverable Kieran invitation governed by `policy.prelude.poker-invitation-disclosed`.

- [ ] **Step 1: Restore the safe Prelude summary**

Set `playerText.summary` to:

```json
"Complete the command handover, establish a working command rhythm, and bring the Breckenridge to the Asterion Reach."
```

- [ ] **Step 2: Make Kieran's invitation discoverable**

Keep `initiallyTrue: true`, change `visibility` from `known` to `discoverable`, and add this evidence policy near the other Prelude disclosure policies:

```json
{
  "id": "policy.prelude.poker-invitation-disclosed",
  "claimType": "factDisclosed",
  "targetId": "fact.prelude.poker-invitation",
  "sourceRoles": ["assistant", "runtime", "adjudicator"],
  "when": { "worldFact": "fact.prelude.poker-invitation" },
  "interpretation": {
    "evidenceStandard": "explicit",
    "guidance": "Claim only when accepted prose explicitly depicts Kieran Vale inviting the player to the established junior-officer poker game after first watch.",
    "exclusions": ["Kieran being present, mentioning off-duty plans, or the player independently asking about poker does not establish that the invitation was given."]
  }
}
```

- [ ] **Step 3: Run the Prelude projection and package-linter tests and verify GREEN**

Update the shared `redline-poker-hook` scenario fragment so accepted story evidence discloses `fact.prelude.poker-invitation` before `event.prelude.poker-conversation-held`, then increase the accepted-claim expectation by one for each scenario using that fragment.

Run:

```powershell
node tools/scripts/test-v1-mission-player-projection.mjs
node tools/scripts/test-v1-mission-package-linter.mjs
```

Expected: both pass, proving Kieran is absent initially, eligible for accepted disclosure, and visible afterward.

### Task 3: Revise campaign-wide entry copy

**Files:**
- Modify: `packages/bundled/breckenridge/v1/chapter-3-dead-letters.mission-v1.json`
- Modify: `packages/bundled/breckenridge/v1/chapter-4-the-colony-that-stayed.mission-v1.json`
- Modify: `packages/bundled/breckenridge/v1/chapter-5-old-lessons.mission-v1.json`
- Modify: `packages/bundled/breckenridge/v1/chapter-6-the-cost-of-knowing.mission-v1.json`

**Interfaces:**
- Consumes: existing objective IDs, predicates, dispositions, and scenario fixtures unchanged.
- Produces: player-facing summary and objective copy that asks investigative questions without stating undiscovered answers.

- [ ] **Step 1: Revise Dead Letters entry copy**

Use these player-safe objective texts:

```json
"title": "Establish what the Hecate Seven evidence proves",
"summary": "Build the strongest supportable account from what can be recovered at the site; missing direct evidence changes confidence and cost rather than blocking the campaign."
```

```json
"title": "Resolve the site's custody",
"summary": "Make informed choices about any dangerous or sensitive material you find, then establish what actually happens to it."
```

- [ ] **Step 2: Revise The Colony That Stayed entry copy**

Use this player-safe mission summary:

```json
"summary": "Demeris has refused Starfleet searches and arrests while offering a negotiated inquiry. Establish a workable process, determine what the evidence supports, and resolve the people, evidence, and risks actually found."
```

Use these player-safe objective texts:

```json
"summary": "Determine what happened on Demeris, whom it helped or harmed, and what continuing risks the evidence supports without requiring one prescribed investigation path."
```

```json
"title": "Resolve personal and evidentiary accountability",
"summary": "After the relevant record is known, decide how responsible people, evidence, and any resulting risks should be handled, then establish what actually happens to each."
```

- [ ] **Step 3: Revise Old Lessons entry copy**

Use this player-safe mission summary:

```json
"summary": "Conflicting warnings are driving civilian and Compact ships into the Orison Gap as obsolete defenses activate and regional command links fail. Keep the corridor from becoming a killing ground, determine what is causing the crisis and whether it has a coordinated purpose, and leave the Reach with a defensible account."
```

Use these player-safe objective texts:

```json
"title": "Determine and resolve the crisis's purpose",
"summary": "Determine whether the crisis has a coordinated purpose and establish a defensible disposition for any consequential evidence you actually uncover."
```

```json
"summary": "Build the strongest supported account of how the crisis was created and what actors or systems are involved."
```

- [ ] **Step 4: Revise The Cost of Knowing entry copy**

Use these player-safe objective texts:

```json
"summary": "Keep the Breckenridge coherent through the Lacuna operation and establish the actual result of the command-network risk."
```

```json
"title": "Establish the classified operation's conduct and remaining risk",
"summary": "Build a usable account of what the authorized operation did and what danger remains, even if the physical archive is incomplete."
```

- [ ] **Step 5: Run the Ashes campaign gate and verify GREEN**

Run:

```powershell
node tools/scripts/test-ashes-v1-campaign.mjs
```

Expected: all 13 mission contracts, every authored scenario, and the new campaign-wide entry-copy assertions pass.

### Task 4: Document and certify the completed boundary

**Files:**
- Modify: `docs/architecture/FAIR_DISCOVERY.md`
- Modify: `docs/authoring/ASHES_OF_PEACE_ENRICHMENT.md`

**Interfaces:**
- Consumes: verified behavior from Tasks 1-3.
- Produces: authoring guidance stating that the Mission page cannot introduce a fact and a campaign audit record of the corrected entry projections.

- [ ] **Step 1: Update fair-discovery guidance**

Add that mission summaries and immediately visible objective copy must be grounded in the opening or accepted story state; authored future hooks remain discoverable until disclosed and must not be promoted to `known` merely to advertise them in the UI.

- [ ] **Step 2: Update the Ashes enrichment audit**

Record that the final campaign-data certification now includes mission-entry player-projection review and that the Prelude begins with no Known Information until accepted narration establishes a fact.

- [ ] **Step 3: Run the full alpha gate**

Run:

```powershell
npm.cmd test
```

Expected: 73 focused checks pass, including 13 Ashes mission contracts and all authored scenarios.

- [ ] **Step 4: Inspect the final initial projection**

Run the real projection over the Prelude definition and confirm:

```text
SUMMARY: Complete the command handover, establish a working command rhythm, and bring the Breckenridge to the Asterion Reach.
FACTS: []
```

- [ ] **Step 5: Commit the verified change**

```powershell
git add docs/superpowers/specs/2026-08-10-mission-page-spoiler-safety-design.md docs/superpowers/plans/2026-08-10-mission-page-spoiler-safety.md docs/architecture/FAIR_DISCOVERY.md docs/authoring/ASHES_OF_PEACE_ENRICHMENT.md tools/scripts/test-v1-mission-player-projection.mjs tools/scripts/test-ashes-v1-campaign.mjs tests/fixtures/mission/v1/prelude-hesperus-scenarios.fixture.json packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json packages/bundled/breckenridge/v1/chapter-3-dead-letters.mission-v1.json packages/bundled/breckenridge/v1/chapter-4-the-colony-that-stayed.mission-v1.json packages/bundled/breckenridge/v1/chapter-5-old-lessons.mission-v1.json packages/bundled/breckenridge/v1/chapter-6-the-cost-of-knowing.mission-v1.json
git commit -m "fix(mission): prevent entry spoiler leaks"
```
