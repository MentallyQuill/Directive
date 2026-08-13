# People Cards and Relationships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and maintain source-backed People Cards for named emergent NPCs, synthesize qualitative relationships without per-person calls, and present the complete defining-moment history in accessible accordions.

**Implementation status:** Completed and verified on 2026-08-13. The step checkboxes below preserve the original TDD execution plan rather than acting as a live status list.

**Architecture:** Story Settlement remains the sole durable semantic authority. The existing accepted-pair Utility call proposes bounded People observations, runtime materializes validated stable-ID events, a rare batched Reasoner call authors initial public dossiers, and the existing episode evaluator synthesizes posture and defining moments. The UI receives a comprehensive player projection while narration receives a separately bounded People prompt projection.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, SillyTavern generation-role routing, Story Settlement V1, DOM APIs, CSS, Playwright.

## Global Constraints

- Create a People Card only after a directly encountered NPC gives the player a usable name.
- Do not create cards for names that are merely mentioned.
- Use one accepted-pair Utility call for all People observations; never call Utility per person.
- Use at most one batched dossier Reasoner call per accepted pair, only when valid new introductions exist.
- Keep all durable data source-backed and rebuildable from accepted Story Settlement contributions.
- Store every defining moment; do not impose a lifetime count limit.
- Keep narration prompt context bounded independently from UI history.
- Never expose or author secrets, private motives, romance, hidden state, or future plot in public records.
- Preserve existing People portraits, sorting, category controls, mobile disclosure, and Command Bearing behavior.
- Preserve existing saves that do not contain People events.

---

### Task 1: Validated Story Settlement People events

**Files:**
- Create: `src/people/people-event-contracts.mjs`
- Modify: `src/story/story-settlement-contracts.mjs`
- Modify: `src/story/story-settlement.mjs`
- Test: `tools/scripts/test-v1-people-events.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `PEOPLE_EVENT_TYPES`, `PUBLIC_PERSON_FACT_FIELDS`, `validatePeopleEvent(event, { knownContributionIds, knownPersonIds })`, and `appendStoryPeopleEvents(settlement, events)`.
- Persists: optional `episode.peopleEvents: PeopleEvent[]` for backward-compatible V1 saves.
- Invalidates: events whose `sourceContributionIds` intersect withdrawn contributions.

- [ ] **Step 1: Write one failing event-contract test**

Create a contribution-backed `personIntroduced` event, append it to an active episode through the wished-for `appendStoryPeopleEvents`, and assert the event persists and its person ID is added to `episode.references.participantIds`. Also assert a name-only introduction without a source contribution is rejected.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-v1-people-events.mjs`

Expected: module/import failure because the People event contract and append operation do not exist.

- [ ] **Step 3: Implement the minimal event contract and append operation**

Use these durable shapes:

```js
{
  id: 'people-event.<stable>',
  type: 'personIntroduced',
  personId: 'person.emergent.<stable>',
  name: 'Ari Sol',
  introductionSummary: 'Ari introduced herself while repairing relay junction four.',
  publicFacts: { role: 'Damage-control technician' },
  sourceContributionIds: ['contribution.accepted']
}
```

```js
{ id, type: 'publicFactLearned', personId, field: 'birthplace', value, sourceContributionIds }
{ id, type: 'relationshipEvidence', personId, summary, sourceContributionIds }
```

Allow only the public fields in the design. Bound names/titles to 120 characters, summaries/profile text to 512 characters, other fact values to 240 characters, and source arrays to 16 unique stable IDs.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node tools/scripts/test-v1-people-events.mjs`

Expected: PASS.

- [ ] **Step 5: Add one failing invalidation/recovery test**

Assert that invalidating the introduction contribution removes the event/card authority, while invalidating a later fact restores the previous surviving value. Assert sealed-episode recovery retains surviving People events even when the episode has no mission effects.

- [ ] **Step 6: Implement People-aware source pruning and verify GREEN**

Update active pruning, sealed replacement, descendant rollback, and replacement reference collection so `peopleEvents` follows the same accepted-source lifecycle as effects and moments.

- [ ] **Step 7: Commit Task 1**

```powershell
git add src/people/people-event-contracts.mjs src/story/story-settlement-contracts.mjs src/story/story-settlement.mjs tools/scripts/test-v1-people-events.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(people): add source-backed event ledger"
```

### Task 2: One-call accepted-pair People observation

**Files:**
- Create: `src/people/accepted-pair-people.mjs`
- Modify: `src/mission/v1/accepted-pair-interpreter.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/v1-state-spine.mjs`
- Test: `tools/scripts/test-v1-accepted-pair-interpreter.mjs`
- Test: `tools/scripts/test-v1-mission-runtime.mjs`

**Interfaces:**
- Produces: `createPeopleInterpretationContext({ crewDataset, storySettlement })` and `materializeAcceptedPairPeopleEvents({ observations, peopleContext, sourcePair, branchId, dossiers })`.
- Extends: accepted-pair interpretation with `peopleEvents`, bounded to 24 observations in the same Utility response.
- Passes: materialized People events into `settleAcceptedPair`, which appends them to the active episode transactionally.

- [ ] **Step 1: Write one failing interpreter test for the naming threshold**

Extend the accepted-pair fixture with known People context. Assert a valid accepted assistant observation can propose:

```js
{
  type: 'personIntroduced',
  localRef: 'new-1',
  name: 'Ari Sol',
  introductionSummary: 'Ari gave her name during a direct engineering-deck conversation.',
  sourceSlot: 'previousAssistant'
}
```

Assert the schema includes People events, the prompt forbids cards for merely mentioned names, and a corrected/rejected assistant response discards assistant-sourced People observations.

- [ ] **Step 2: Run the interpreter test and verify RED**

Run: `node tools/scripts/test-v1-accepted-pair-interpreter.mjs`

Expected: failure because `peopleEvents` is not in the strict schema/output.

- [ ] **Step 3: Extend the strict schema, parser, and prompt**

Support `personIntroduced`, `publicFactLearned`, and `relationshipEvidence` observations. Known people must use a supplied stable `personId`; new introductions use a call-local `localRef`. Runtime rejects unknown known IDs, duplicate local refs, unsupported fields, cross-event references without an introduction, and introduction attempts that collide with an existing stable ID.

- [ ] **Step 4: Run the interpreter test and verify GREEN**

Run: `node tools/scripts/test-v1-accepted-pair-interpreter.mjs`

Expected: PASS.

- [ ] **Step 5: Write one failing runtime integration test**

Drive a single accepted pair through `createV1MissionRuntime` with two named introductions and relationship evidence. Assert the generation router receives one `acceptedPairMissionEvidence` call rather than one call per person, both introductions receive deterministic distinct stable IDs, and one state transaction persists all People events.

- [ ] **Step 6: Implement runtime materialization and Story Settlement append**

Use the accepted source message ID, selected swipe ID, text hash, branch ID, and local ref to derive stable event/person IDs. Attach every event to contribution IDs already materialized by the accepted-pair runtime. Pass `peopleEvents` through `createV1StateSpine().settleAcceptedPair()` and append them after accepted contributions exist.

- [ ] **Step 7: Run focused runtime tests and verify GREEN**

Run: `node tools/scripts/test-v1-mission-runtime.mjs`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```powershell
git add src/people/accepted-pair-people.mjs src/mission/v1/accepted-pair-interpreter.mjs src/runtime/v1-mission-runtime.mjs src/runtime/v1-state-spine.mjs tools/scripts/test-v1-accepted-pair-interpreter.mjs tools/scripts/test-v1-mission-runtime.mjs
git commit -m "feat(people): observe named contacts per accepted pair"
```

### Task 3: Batched public dossier authoring

**Files:**
- Create: `src/people/people-dossier-author.mjs`
- Modify: `src/generation/generation-roles.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Test: `tools/scripts/test-people-dossier-author.mjs`
- Test: `tools/scripts/test-directive-provider-routing.mjs`
- Test: `tools/scripts/test-directive-provider-policy.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `createPeopleDossierAuthor({ generationRouter, timeoutMs })` returning a batch author function.
- Input: public campaign label, public ship profile, accepted introduction excerpts, and all new stable IDs/names in one request.
- Output: allowlisted dossiers keyed by exact stable person ID.

- [ ] **Step 1: Write one failing dossier contract test**

Assert one request containing two introductions calls `peopleDossierAuthor` once, uses the reasoning provider kind, accepts only requested stable IDs, trims/omits unsupported fields, and rejects secrets/personality keys.

- [ ] **Step 2: Run the dossier test and verify RED**

Run: `node tools/scripts/test-people-dossier-author.mjs`

Expected: import/role failure.

- [ ] **Step 3: Implement the strict batched dossier author**

Return exact JSON shaped as:

```js
{
  kind: 'directive.peopleDossierBatch.v1',
  dossiers: [{
    personId,
    displayName,
    role,
    affiliation,
    species,
    age,
    birthplace,
    serviceBackground,
    assignmentHistory,
    profileSummary
  }]
}
```

Every dossier field except `personId` and `displayName` may be null. Prompt instructions explicitly limit content to ordinary public identity/service facts and prohibit hidden or private material.

- [ ] **Step 4: Run dossier and provider tests and verify GREEN**

Run: `node tools/scripts/test-people-dossier-author.mjs`

Run: `node tools/scripts/test-directive-provider-routing.mjs`

Run: `node tools/scripts/test-directive-provider-policy.mjs`

Expected: PASS.

- [ ] **Step 5: Write one failing retry/call-budget runtime test**

Force a post-generation revision conflict, retry the same accepted pair, and assert the cached interpretation plus dossier result prevents a second Utility or dossier call. Assert a dossier failure still persists minimal introduction cards and subsequent ordinary turns do not retry the dossier.

- [ ] **Step 6: Integrate cached batch authoring and verify GREEN**

Cache prepared materialized People events under the accepted-pair interpretation key. Only call the author when filtered accepted observations contain valid `personIntroduced` records without authored roster matches.

- [ ] **Step 7: Commit Task 3**

```powershell
git add src/people/people-dossier-author.mjs src/generation/generation-roles.mjs src/runtime/v1-mission-runtime.mjs tools/scripts/test-people-dossier-author.mjs tools/scripts/test-directive-provider-routing.mjs tools/scripts/test-directive-provider-policy.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(people): author emergent dossiers in one batch"
```

### Task 4: Relationship synthesis at episode checkpoints

**Files:**
- Modify: `src/story/episode-evaluator.mjs`
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `src/story/story-settlement-contracts.mjs`
- Test: `tools/scripts/test-v1-episode-evaluator.mjs`
- Test: `tools/scripts/test-v1-soft-boundary-runtime.mjs`

**Interfaces:**
- Extends evaluation requests with bounded `peopleEvents` and `currentRelationships`.
- Extends proposals with `relationshipUpdates` and `characterMoments`.
- Materializes `character.relationshipPosture` and `character.relationshipOpenMatter` effects plus sealed character moments with deterministic IDs.

- [ ] **Step 1: Write one failing evaluation-contract test**

Create an active episode with relationship evidence and a prior posture. Assert the request contains the relevant event and prior posture, while unrelated people/history are omitted by a global bounded selector.

- [ ] **Step 2: Run the evaluator test and verify RED**

Run: `node tools/scripts/test-v1-episode-evaluator.mjs`

Expected: strict request mismatch because People relationship fields are absent.

- [ ] **Step 3: Implement bounded request/proposal validation**

Each relationship update uses `{ personId, posture, openMatter, sourceContributionIds }`. Each moment uses `{ personId, title, summary, sourceContributionIds }`. IDs must refer to people/events available in the exact request, and all cited contribution IDs must be allowed. Continue may update posture but may not create moments. Seal may create at most one moment per involved person at that boundary.

- [ ] **Step 4: Run evaluator tests and verify GREEN**

Run: `node tools/scripts/test-v1-episode-evaluator.mjs`

Expected: PASS.

- [ ] **Step 5: Write one failing state-spine synthesis test**

Apply a valid continue review and assert current posture is appended as a visible source-linked effect. Apply a valid seal review and assert one titled defining moment is stored. Assert routine evidence with empty relationship proposals produces no moment.

- [ ] **Step 6: Materialize relationship effects/moments and verify GREEN**

Generate deterministic IDs from branch, episode, checkpoint, person, and cited sources. Append posture/open-matter effects before updating or sealing the episode. Pass validated titled moments to `sealStoryEpisode`.

- [ ] **Step 7: Commit Task 4**

```powershell
git add src/story/episode-evaluator.mjs src/runtime/v1-state-spine.mjs src/story/story-settlement-contracts.mjs tools/scripts/test-v1-episode-evaluator.mjs tools/scripts/test-v1-soft-boundary-runtime.mjs
git commit -m "feat(people): synthesize qualitative relationships"
```

### Task 5: Comprehensive People projection and bounded narration context

**Files:**
- Modify: `src/projection/v1/people-projection.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Test: `tools/scripts/test-v1-people-projection.mjs`
- Test: `tools/scripts/test-v1-runtime-app.mjs`
- Test: `tools/scripts/test-v1-projection-rebuild.mjs`

**Interfaces:**
- Produces dynamic People Cards by folding surviving People events in Story Settlement order.
- Produces `createPeoplePromptProjection({ peopleProjection, activeParticipantIds, maxMomentEntries })` for narration.
- Exposes all UI moments but a globally bounded prompt moment subset.

- [ ] **Step 1: Write one failing projection test**

Build an introduction plus dossier, two later fact values for the same field, current posture/open matter, and five defining moments. Assert the dynamic card exists immediately, the latest surviving fact wins, all five moments are present newest first, and invalidating the newest fact restores the prior value.

- [ ] **Step 2: Run the projection test and verify RED**

Run: `node tools/scripts/test-v1-people-projection.mjs`

Expected: no dynamic card and only three moments.

- [ ] **Step 3: Implement event folding and remove the UI projection slice**

Keep authored roster values as their baseline, then apply surviving `publicFactLearned` events. Only create dynamic records with a surviving `personIntroduced`. Derive Known since from that event and its episode. Do not merge identities by name.

- [ ] **Step 4: Run projection and rebuild tests and verify GREEN**

Run: `node tools/scripts/test-v1-people-projection.mjs`

Run: `node tools/scripts/test-v1-projection-rebuild.mjs`

Expected: PASS.

- [ ] **Step 5: Write one failing prompt-budget test**

Give a record more moments than the prompt allowance. Assert the player projection retains every moment while the runtime prompt packet includes only the global bounded subset plus current posture/open matter and compact directory facts.

- [ ] **Step 6: Implement the separate People prompt projection and verify GREEN**

Rank active participants first, then moment recency. Keep stable IDs, names, roles, current posture, and open matters. Never mutate the player projection while trimming narration context.

- [ ] **Step 7: Commit Task 5**

```powershell
git add src/projection/v1/people-projection.mjs src/runtime/runtime-app.mjs tools/scripts/test-v1-people-projection.mjs tools/scripts/test-v1-runtime-app.mjs tools/scripts/test-v1-projection-rebuild.mjs
git commit -m "feat(people): project complete cards with bounded prompts"
```

### Task 6: Accessible relationship history in the People panel

**Files:**
- Modify: `src/ui/people-journal.js`
- Modify: `styles/directive.css`
- Test: `tools/scripts/test-certified-people-panel.mjs`
- Test: `tools/scripts/test-v1-crew-panel.mjs`
- Test: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Renders conditional Public/Service Record rows for affiliation and the expanded allowlist.
- Renders `Connection to You` with Known since, Current posture, and Open matter.
- Renders every moment as a native `<details>` disclosure with a `<summary>` title and expanded body.

- [ ] **Step 1: Write one failing DOM behavior test**

Render a person with Known since, posture, open matter, and five titled moments. Assert five native disclosures exist, all are initially collapsed, the fifth remains reachable, and opening one reveals its full summary. Assert missing fields create no empty labels or sections.

- [ ] **Step 2: Run the People panel test and verify RED**

Run: `node tools/scripts/test-certified-people-panel.mjs`

Expected: missing Connection section and disclosure elements.

- [ ] **Step 3: Implement the semantic detail structure and responsive styling**

Keep the hero unchanged. Use existing section typography and colors. Style disclosure rows for compact touch targets, visible keyboard focus, wrapped text, and desktop/mobile overflow safety. Do not add relationship scores, meters, or edit controls.

- [ ] **Step 4: Run focused UI tests and verify GREEN**

Run: `node tools/scripts/test-certified-people-panel.mjs`

Run: `node tools/scripts/test-v1-crew-panel.mjs`

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS on desktop and expanded mobile People details.

- [ ] **Step 5: Commit Task 6**

```powershell
git add src/ui/people-journal.js styles/directive.css tools/scripts/test-certified-people-panel.mjs tools/scripts/test-v1-crew-panel.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "feat(people): show expandable relationship history"
```

### Task 7: Documentation, compatibility, and release verification

**Files:**
- Modify: `src/story/README.md`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-13-people-cards-relationships.md`

**Interfaces:**
- Documents the one-Utility/rare-batch-Reasoner budget and the comprehensive-storage/selective-prompt rule.

- [ ] **Step 1: Run every focused People/Story/runtime test**

Run the focused commands from Tasks 1-6. Expected: all PASS with no warnings.

- [ ] **Step 2: Run the complete gate**

Run: `npm.cmd test`

Expected: all focused checks, mission contracts, authored scenarios, and visual route/viewports PASS.

- [ ] **Step 3: Inspect generated and unrelated workspace changes**

Run: `git status --short` and `git diff --check`.

Restore only test-generated `debug.log` changes in the feature worktree. Preserve all unrelated primary-checkout files.

- [ ] **Step 4: Complete plan checkboxes and commit documentation**

```powershell
git add README.md src/story/README.md docs/superpowers/specs/2026-08-13-people-cards-relationships-design.md docs/superpowers/plans/2026-08-13-people-cards-relationships.md
git commit -m "docs(people): explain relationship memory authority"
```

- [ ] **Step 5: Review, integrate, and publish**

Use the completion/review skills, merge or fast-forward the verified branch into local `main` when its dirty checkout permits, push `main`, and verify the remote main SHA equals the verified feature SHA. Do not discard or commit unrelated primary-checkout changes.
