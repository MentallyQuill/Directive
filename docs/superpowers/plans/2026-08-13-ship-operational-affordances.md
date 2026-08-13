# Ship Operational Affordances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Ashes of Peace two narrative-driven Ship improvement tracks whose accepted milestones change authored mission possibilities and appear on a universal, player-safe Ship status page.

**Architecture:** Package-owned Ship mechanics definitions are validated and reduced into a read-only projection from active Story Settlement effects. Ship-work candidates share the existing accepted-pair interpretation call, while mission predicates consume dynamically derived capability receipts and retain their source effect dependencies. The existing Director prompt route carries bounded operational constraints and affordances to SillyTavern's canonical narrator; no new model call or mutable Ship sidecar is added.

**Tech Stack:** Node.js ES modules, JSON campaign packages, deterministic accepted-pair reducers, Story Settlement source custody, DOM rendering with repository fake-DOM tests, PowerShell-compatible repository scripts.

## Global Constraints

- Keep `campaignState.ship` as immutable identity plus the existing bounded operational overview.
- Story Settlement remains the only durable semantic authority for Ship milestones.
- Add no model call, Director service, repair agent, state memo, resource ledger, numerical bonus, roll, percentage, degradation clock, or Ship-page mutation control.
- The accepted-pair interpreter may select only authored candidates; deterministic code owns validation, effects, state derivation, replay, and projection.
- Existing `capabilityAvailable` remains a mission-entry snapshot; dynamic Ship mechanics use `shipCapabilityAvailable`.
- Ashes of Peace V1 contains exactly two Ship systems, no more than three states per system, and no more than two capability unlocks per system.
- Major state ladders and benefits are visible; undiscovered work-order details remain hidden until their authored reveal condition is satisfied.
- Player cheating is out of scope. Validation protects Directive's consistency, not competitive integrity.
- Preserve unrelated `debug.log` and `.codex-remote-attachments/` work.

---

### Task 1: Validate Campaign-Owned Ship Mechanics

**Files:**
- Create: `src/ship/v1/ship-mechanics-contracts.mjs`
- Create: `tools/scripts/test-v1-ship-mechanics-contracts.mjs`
- Modify: `src/runtime/package-library.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `validateShipMechanics(shipDataset)`, `indexShipMechanics(shipDataset)`, and `validateShipMechanicsPackage({ shipDataset, missionDefinitions })`.
- Definition contract: `shipDataset.mechanics.kind === "directive.shipMechanics.v1"`; top-level `capabilities`, `constraints`, and `systems` arrays use globally unique stable IDs.
- A system contains `openingStateId`, ordered `states`, `milestones`, and forward-only `transitions`. A milestone contains `sourceRoles`, `interpretation`, `playerText`, and optional `revealWhen: { milestoneSatisfied: id }`. A transition contains `fromStateId`, `toStateId`, and non-empty `requiredMilestoneIds`.
- A mission may optionally contain `shipInteractions`; package validation checks each interaction's capability and evidence-policy IDs against both definitions.

- [ ] **Step 1: Write the failing contract test**

Create a literal two-state fixture and assert that a valid definition passes while duplicate IDs, a transition cycle, an unknown milestone dependency, an undeclared state capability, and an interaction referencing an unknown capability each fail with a specific error fragment.

```js
const valid = validateShipMechanics(shipDataset);
assert.equal(valid.ok, true, valid.errors.join('\n'));
assert.match(validateShipMechanics(cyclicDataset).errors.join('\n'), /cycle/i);
assert.match(validateShipMechanicsPackage({
  shipDataset,
  missionDefinitions: [{ ...mission, shipInteractions: [{
    id: 'interaction.test',
    capabilityId: 'ship-capability.missing',
    evidencePolicyIds: ['policy.test'],
    narratorGuidance: 'Use the declared route.',
    limits: ['Do not guarantee success.']
  }] }]
}).errors.join('\n'), /unknown ship capability/i);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-v1-ship-mechanics-contracts.mjs`

Expected: module-not-found for `ship-mechanics-contracts.mjs`.

- [ ] **Step 3: Implement the minimal closed validator**

Validate stable IDs, exact required player copy, authorized source roles (`assistant`, `runtime`, `adjudicator`), `explicit|clearOutcome` interpretation standards, non-empty exclusions, increasing state ranks, valid opening state, forward-only transitions, reachable states, transition cycles, milestone reveal references, declared capability/constraint references, and cross-package interaction references. Make `package-library.mjs` reject an invalid bundled Ship mechanics package before indexing runtime assets.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node tools/scripts/test-v1-ship-mechanics-contracts.mjs`

Expected: `PASS V1 Ship mechanics contracts`.

- [ ] **Step 5: Add the test to the alpha gate and commit**

```powershell
git add src/ship/v1/ship-mechanics-contracts.mjs src/runtime/package-library.mjs tools/scripts/test-v1-ship-mechanics-contracts.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ship): validate mechanics definitions"
```

### Task 2: Derive Ship State and Closed Work Candidates

**Files:**
- Create: `src/ship/v1/ship-mechanics-state.mjs`
- Create: `src/ship/v1/ship-work-evidence.mjs`
- Create: `tools/scripts/test-v1-ship-mechanics-state.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `deriveShipMechanicsState({ shipDataset, storySettlement })` returning `{ systems, capabilities, capabilityEvidenceById, activeEffectIds }`.
- Produces: `createShipWorkInterpretationCandidates({ shipDataset, storySettlement })` returning candidates with `domain: "shipWork"`, `claimType: "shipMilestoneCompleted"`, and a closed milestone target.
- Produces: `validateShipWorkEvidenceProposal({ shipDataset, storySettlement, proposal, resolveSourceRef })` returning accepted/rejected claims and typed `ship.milestoneCompleted` effects.
- Produces: `appendShipWorkEvidenceToMissionState(state, acceptedClaims)` for accepted-key/evidence-log custody without changing mission facts, objectives, outcomes, or clocks.

- [ ] **Step 1: Write the failing derivation and evidence tests**

Exercise opening state, one satisfied milestone, chained transitions, hidden-work reveal, capability source effect IDs, candidate omission after satisfaction, duplicate rejection, wrong source role, wrong hash, and idempotent replay.

```js
const opening = deriveShipMechanicsState({ shipDataset, storySettlement: emptySettlement });
assert.equal(opening.systems[0].currentState.id, 'provisional');
assert.deepEqual(opening.systems[0].workOrders.map(({ status }) => status), ['known', 'unknown']);

const improved = deriveShipMechanicsState({ shipDataset, storySettlement: settlementWithBaseline });
assert.equal(improved.systems[0].currentState.id, 'aligned');
assert.deepEqual(improved.capabilityEvidenceById.get('ship-capability.correlation'), ['effect.ship.baseline']);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-v1-ship-mechanics-state.mjs`

Expected: module-not-found for the new state/evidence modules.

- [ ] **Step 3: Implement pure derivation and source-bound validation**

Filter only active `ship.milestoneCompleted` Story effects, advance transitions monotonically while every required milestone is present, union capability effect receipts from the milestones that establish the current state, and project `unknown|known|satisfied` work independently from satisfaction. Validate accepted source identity, branch, selected swipe, text hash, role authorization, milestone policy identity, and duplicate evidence keys. Never infer progress from arbitrary Story summaries.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node tools/scripts/test-v1-ship-mechanics-state.mjs`

Expected: `PASS V1 Ship mechanics state`.

- [ ] **Step 5: Commit**

```powershell
git add src/ship/v1 tools/scripts/test-v1-ship-mechanics-state.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ship): derive accepted work state"
```

### Task 3: Share the Accepted-Pair Interpreter and State Spine

**Files:**
- Modify: `src/mission/v1/accepted-pair-interpreter.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `tools/scripts/test-v1-accepted-pair-interpreter.mjs`
- Modify: `tools/scripts/test-v1-mission-runtime.mjs`
- Modify: `tools/scripts/test-v1-state-spine-runtime.mjs`

**Interfaces:**
- Candidate selections preserve the candidate's `domain`; absent domain continues to mean `mission`.
- `settleAcceptedPair` accepts `shipDataset` and `shipProposal`, validates Ship claims internally, appends Ship evidence to the current mission evidence log, and appends instantiated Ship effects in the same Story Settlement commit.
- The existing Utility request remains exactly one request per accepted pair and continues to return mission evidence and time independently.

- [ ] **Step 1: Write failing shared-interpreter and atomic-settlement tests**

Assert that one interpreter response selecting one mission candidate and one `shipWork` candidate materializes two domain-qualified claims; one settlement commits the mission effect and Ship milestone effect with the same accepted source contribution; a repeated pair is idempotent; and provider/schema failure commits neither domain.

```js
assert.deepEqual(interpreted.proposal.claims.map(({ domain }) => domain), ['mission', 'shipWork']);
assert.equal(settled.storySettlement.episodes[0].effects.some(
  ({ type, targetId }) => type === 'ship.milestoneCompleted' && targetId === 'ship-milestone.sensor-baseline'
), true);
assert.equal(generationRequests.length, 1);
```

- [ ] **Step 2: Run the three focused tests and verify RED**

Run:

```powershell
node tools/scripts/test-v1-accepted-pair-interpreter.mjs
node tools/scripts/test-v1-state-spine-runtime.mjs
node tools/scripts/test-v1-mission-runtime.mjs
```

Expected: assertions fail because candidate domains and Ship effects are not preserved.

- [ ] **Step 3: Implement the shared candidate and atomic effect path**

Merge Ship candidates into the existing mission candidate packet before the interpreter call. Preserve `domain` during materialization, partition the resulting proposal, and pass both partitions to one state-spine settlement. Include Ship accepted claims when resolving referenced source contributions. Instantiate Ship effects through the same stable effect-ID function used for mission effects. Return Ship accepted/rejected diagnostics without adding a state root or provider route.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the three commands from Step 2.

Expected: all three scripts exit 0.

- [ ] **Step 5: Commit**

```powershell
git add src/mission/v1/accepted-pair-interpreter.mjs src/runtime/v1-mission-runtime.mjs src/runtime/v1-state-spine.mjs tools/scripts/test-v1-accepted-pair-interpreter.mjs tools/scripts/test-v1-mission-runtime.mjs tools/scripts/test-v1-state-spine-runtime.mjs
git commit -m "feat(ship): settle work with accepted pairs"
```

### Task 4: Consume Dynamic Ship Capabilities in Mission Rules

**Files:**
- Modify: `src/mission/v1/predicate-evaluator.mjs`
- Modify: `src/mission/v1/mission-state.mjs`
- Modify: `src/mission/v1/evidence-contracts.mjs`
- Modify: `src/mission/v1/mission-reducer.mjs`
- Modify: `src/mission/v1/mission-contracts.mjs`
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `tools/scripts/test-v1-mission-predicates.mjs`
- Modify: `tools/scripts/test-v1-mission-evidence.mjs`
- Modify: `tools/scripts/test-v1-mission-reducer.mjs`
- Modify: `tools/scripts/test-v1-state-spine-runtime.mjs`

**Interfaces:**
- `missionStateContext(definition, state, { shipCapabilityEvidenceById })` exposes `shipCapabilities` and `shipCapabilityEvidenceById` without changing entry capabilities.
- `shipCapabilityAvailable` validates a stable capability ID and evaluates only against dynamic Ship capability evidence.
- Accepted mission claims whose policy references Ship capabilities receive sorted `dependencyEffectIds`; reducer evidence-log entries and Story effects retain those IDs.
- Replay rejects a claim with `dependency-not-met` when any recorded Ship effect receipt is no longer active.

- [ ] **Step 1: Write failing predicate, custody, and rollback tests**

Prove that entry capability and Ship capability are independent, a gated policy rejects without an active Ship receipt, accepts with one, stores its exact effect dependency, and becomes invalid after that effect's source contribution is invalidated. Assert that unrelated mission evidence survives.

```js
assert.equal(evaluateMissionPredicate(
  { shipCapabilityAvailable: 'ship-capability.segmented-isolation' },
  contextWithShipReceipt
).value, true);
assert.deepEqual(accepted.acceptedClaims[0].dependencyEffectIds, ['effect.ship.isolation-test']);
assert.equal(replayed.rejectedClaims[0].reasonCode, 'dependency-not-met');
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node tools/scripts/test-v1-mission-predicates.mjs
node tools/scripts/test-v1-mission-evidence.mjs
node tools/scripts/test-v1-mission-reducer.mjs
node tools/scripts/test-v1-state-spine-runtime.mjs
```

Expected: unknown predicate and missing dependency receipt assertions fail.

- [ ] **Step 3: Implement dynamic context and dependency replay**

Add Ship capability refs to predicate reference collection. Pass the derived capability map through validation and every mission-reducer evaluation path. At initial acceptance, bind dependencies from the exact active effect IDs proving every referenced Ship capability. At replay, first require those IDs to remain active, then evaluate the predicate with the surviving capability map. During source invalidation, exclude invalidated Ship effects before mission replay; use existing journey rollback behavior when the Ship milestone belonged to an archived run.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the four commands from Step 2.

Expected: all scripts exit 0.

- [ ] **Step 5: Commit**

```powershell
git add src/mission/v1 src/runtime/v1-state-spine.mjs tools/scripts/test-v1-mission-predicates.mjs tools/scripts/test-v1-mission-evidence.mjs tools/scripts/test-v1-mission-reducer.mjs tools/scripts/test-v1-state-spine-runtime.mjs
git commit -m "feat(ship): gate missions by capability"
```

### Task 5: Route Operational Affordances Through the Existing Director Prompt

**Files:**
- Create: `src/ship/v1/ship-operational-packet.mjs`
- Create: `tools/scripts/test-v1-ship-operational-packet.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/test-v1-runtime-opening-prompt.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `createShipOperationalPacket({ shipDataset, storySettlement, missionDefinition })`.
- Packet contains bounded current constraints, capabilities, and active mission interactions only; hidden milestones and unavailable capabilities never appear.
- `createV1RuntimePromptPacket` adds `payload.shipMechanics` plus one concise instruction to apply its rules as causal preparation/resources without auto-success.

- [ ] **Step 1: Write failing packet and prompt tests**

Assert opening constraints appear, unavailable future capabilities do not, an earned capability appears with its limit, only the active mission's matching interaction appears, and no new generation route is invoked.

```js
assert.deepEqual(packet.capabilities.map(({ id }) => id), ['ship-capability.segmented-isolation']);
assert.equal(packet.interactions[0].id, 'interaction.prelude.segmented-isolation');
assert.doesNotMatch(JSON.stringify(packet), /ship-milestone.hidden-part/);
assert.match(prompt.text, /SHIP OPERATIONAL MECHANICS/);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node tools/scripts/test-v1-ship-operational-packet.mjs
node tools/scripts/test-v1-runtime-app.mjs
node tools/scripts/test-v1-runtime-opening-prompt.mjs
```

Expected: module-not-found and missing prompt packet assertions.

- [ ] **Step 3: Implement bounded Director projection**

Derive current mechanics once per prompt sync, select mission interactions whose capability is active, copy only player-safe package guidance, and inject it into the canonical V1 state block. Keep the existing simulation mode authoritative for consequence severity and retain the existing Duty Report/transition Director paths unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the three commands from Step 2.

Expected: all scripts exit 0.

- [ ] **Step 5: Commit**

```powershell
git add src/ship/v1/ship-operational-packet.mjs src/runtime/runtime-app.mjs tools/scripts/test-v1-ship-operational-packet.mjs tools/scripts/test-v1-runtime-app.mjs tools/scripts/test-v1-runtime-opening-prompt.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ship): route operational affordances"
```

### Task 6: Project and Render the Universal Ship Status Board

**Files:**
- Modify: `src/projection/v1/ship-projection.mjs`
- Modify: `src/ui/view-models/certified-ship-view.mjs`
- Modify: `src/ui/ship-journal.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-v1-ship-projection.mjs`
- Modify: `tools/scripts/test-certified-ship-view.mjs`
- Modify: `tools/scripts/test-certified-ship-panel.mjs`
- Modify: `tools/scripts/test-ship-panel-state-records.mjs`

**Interfaces:**
- Ship projection adds `systems`, each containing current state, visible state ladder, active mechanical effect, and `unknown|known|satisfied` work orders.
- Certified view passes only the projection's player-safe fields.
- Ship journal renders a system card per campaign-defined system and no action control.

- [ ] **Step 1: Write failing projection and DOM tests**

Assert that the opening Ashes projection contains exactly two systems, all state labels/benefits, only known work details, and no hidden guidance. Render it and assert current state, mechanical effect, known work, completed work, and future ambition are legible on desktop/mobile-width structures while buttons and pursuit copy are absent.

```js
assert.deepEqual(ship.systems.map(({ id }) => id), [
  'ship-system.sensor-calibration',
  'ship-system.systems-integration'
]);
assert.doesNotMatch(textOf(body), /Pursue|Start repair|Track project/i);
assert.equal(allElements(body).filter(({ tagName }) => tagName === 'button').length, 0);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node tools/scripts/test-v1-ship-projection.mjs
node tools/scripts/test-certified-ship-view.mjs
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-ship-panel-state-records.mjs
```

Expected: missing `systems` and system-card assertions fail.

- [ ] **Step 3: Implement the projection, view model, DOM, and responsive styles**

Reuse pure Ship-state derivation, preserve the existing hero and overall operational snapshot, then render one `ship-system-card` per system. Use text and state markers rather than progress bars. Show the whole state ladder; show `Known work` only for revealed requirements; mark satisfied items as complete records. Keep the board scroll owner and single-column mobile layout.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the four commands from Step 2.

Expected: all scripts exit 0.

- [ ] **Step 5: Commit**

```powershell
git add src/projection/v1/ship-projection.mjs src/ui/view-models/certified-ship-view.mjs src/ui/ship-journal.js styles/directive.css tools/scripts/test-v1-ship-projection.mjs tools/scripts/test-certified-ship-view.mjs tools/scripts/test-certified-ship-panel.mjs tools/scripts/test-ship-panel-state-records.mjs
git commit -m "feat(ship): render system status board"
```

### Task 7: Author Ashes Systems, Work Orders, and Mission Interactions

**Files:**
- Modify: `packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json`
- Modify: `packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json`
- Modify: `packages/bundled/breckenridge/v1/chapter-2-false-colors.mission-v1.json`
- Modify: `tools/scripts/test-ashes-v1-campaign.mjs`
- Modify: `tools/scripts/test-v1-mission-contracts.mjs`
- Modify: `tools/scripts/test-v1-mission-package-linter.mjs`

**Interfaces:**
- Systems Integration states: `unvalidated -> segmented -> integrated`; capabilities: `segmented-isolation`, `integrated-failover`.
- Sensor Calibration states: `provisional -> aligned -> validated`; capabilities: `calibration-correlation`, `cross-system-reconstruction`.
- Prelude interaction: applying segmented isolation during the Hesperus response can establish the authored `event.hesperus.cascade-avoided` and visible protection outcome dimension.
- Chapter 2 interaction: cross-system reconstruction can establish `event.chapter2.cross-system-reconstruction-completed`, satisfying an alternate route to the independent evidence picture without replacing the existing preserved-baseline route.

- [ ] **Step 1: Write failing Ashes package assertions**

Assert exact system/state/capability counts, player-safe work-order copy, both mission interactions, and real outcome consumption. Run a literal Prelude evidence sequence with and without segmented isolation, and a Chapter 2 sequence proving validated sensors unlock the alternate reconstruction route while provisional sensors reject it.

```js
assert.equal(shipDataset.mechanics.systems.length, 2);
assert.deepEqual(shipDataset.mechanics.systems.map(({ states }) => states.length), [3, 3]);
assert.equal(withSensors.events.includes('event.chapter2.cross-system-reconstruction-completed'), true);
assert.equal(withoutSensors.events.includes('event.chapter2.cross-system-reconstruction-completed'), false);
```

- [ ] **Step 2: Run focused campaign tests and verify RED**

Run:

```powershell
node tools/scripts/test-ashes-v1-campaign.mjs
node tools/scripts/test-v1-mission-contracts.mjs
node tools/scripts/test-v1-mission-package-linter.mjs
```

Expected: missing mechanics and interaction assertions fail.

- [ ] **Step 3: Add only source-supported Ashes content**

Use the campaign source's established refit discrepancies, Rowan sensor calibration, Imani integrated validation, combined-load testing, protected calibration, and neutral references. Do not invent a special part, outside specialist, relationship gate, permission, or historical repair. Keep work orders phrased as actions the player can take naturally in chat and interaction limits explicit.

- [ ] **Step 4: Run focused campaign tests and verify GREEN**

Run the three commands from Step 2.

Expected: all scripts exit 0.

- [ ] **Step 5: Commit**

```powershell
git add packages/bundled/breckenridge tools/scripts/test-ashes-v1-campaign.mjs tools/scripts/test-v1-mission-contracts.mjs tools/scripts/test-v1-mission-package-linter.mjs
git commit -m "feat(ashes): author ship improvements"
```

### Task 8: Documentation, Full Verification, and Main Push

**Files:**
- Modify: `docs/technical/DIRECTIVE_DATASETS.md`
- Modify: `docs/architecture/V1_GAMEPLAY_ARCHITECTURE.md`
- Modify: `docs/user/DIRECTIVE_OPERATOR_MANUAL.md`
- Modify: `docs/user/FIRST_CAMPAIGN_WORKFLOW.md`

**Interfaces:**
- Documents distinguish package definition, accepted milestone effects, derived player projection, Director prompt consumption, and cooperative-play boundary.
- Final repository state contains only scoped Ship work plus pre-existing user-owned dirt.

- [ ] **Step 1: Update technical, architecture, and player documentation**

Document the universal page grammar, Ashes V1 systems, narrative work-order behavior, dynamic mission affordances, accepted-pair timing, rollback semantics, and explicit absence of anti-cheat, numerical checks, project buttons, and a new model call.

- [ ] **Step 2: Run focused Ship and mission suites**

Run every new/modified focused script from Tasks 1-7 individually and confirm each exits 0.

- [ ] **Step 3: Run the full V1 gate**

Run: `npm.cmd test`

Expected: `[v1-gate] passed` with zero failed scripts.

- [ ] **Step 4: Review the final diff and state authority**

Run:

```powershell
git diff --check
git status --short
git diff --stat HEAD~8..HEAD
```

Confirm no raw provider response, credential, second generation route, mutable Ship state root, project button, percentage tracker, user-owned `debug.log`, or `.codex-remote-attachments/` content is staged.

- [ ] **Step 5: Commit documentation**

```powershell
git add docs/technical/DIRECTIVE_DATASETS.md docs/architecture/V1_GAMEPLAY_ARCHITECTURE.md docs/user/DIRECTIVE_OPERATOR_MANUAL.md docs/user/FIRST_CAMPAIGN_WORKFLOW.md
git commit -m "docs(ship): explain operational mechanics"
```

- [ ] **Step 6: Pull safely, reverify, and push main**

Run:

```powershell
git pull --rebase --autostash origin main
npm.cmd test
git push origin main
```

If the pull introduces conflicts or changes the tested authority path, resolve only scoped files, rerun focused tests, then rerun the full gate before pushing.
