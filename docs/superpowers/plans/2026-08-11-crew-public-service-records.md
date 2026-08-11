# Crew Public Service Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show source-backed species and ordinary service-record facts for every non-player senior officer in the Crew detail panel without exposing private character material.

**Architecture:** Add a small player-safe `publicRecord` contract to the bundled crew dataset, copy only that contract through `createPeoplePlayerProjection()`, and render it in the existing shared desktop/mobile detail component. Story-derived relationship posture and moments remain independently gated by Story Settlement.

**Tech Stack:** JSON campaign assets, JavaScript ES modules, Node.js assertion scripts, browser visual conformance through Playwright, CSS.

## Global Constraints

- Every displayed value must already exist in authoritative Ashes of Peace source material.
- Do not infer values from names, portraits, setting conventions, or private narration guidance.
- Do not expose public reputation, central strength, central flaw, campaign function, private biography, relationships, narration guidance, or distinguishing history.
- Keep the campaign-package and mission-binding version at `0.3.0-pre-alpha.1`; this change does not alter mission semantics or save authority.
- Bump the additive crew-dataset manifest version from `1.0.0` to `1.1.0`.
- Render the same record in desktop and mobile through `createPeopleDetail()`.

---

### Task 1: Add and project player-safe crew records

**Files:**
- Modify: `tools/scripts/test-ashes-v1-campaign.mjs`
- Modify: `tools/scripts/test-v1-people-projection.mjs`
- Modify: `packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json`
- Modify: `src/projection/v1/people-projection.mjs`

**Interfaces:**
- Consumes: each crew officer's existing `id`, `service`, and authored campaign-source record.
- Produces: `person.species: string` and `person.publicRecord: { age: string, birthplace: string, serviceBackground: string, assignmentHistory?: string }` in `directive.peoplePlayerProjection.v1`.

- [ ] **Step 1: Write failing campaign-data assertions**

Update the officer-key assertion in `test-ashes-v1-campaign.mjs` to require `species` and `publicRecord`. Add a literal snapshot keyed by officer ID that verifies these source-backed values:

```js
const publicRecords = {
  'mara-whitaker': ['Human', '47', 'Kingston, Ontario, Earth', 'Science operations, diplomacy, executive command'],
  'kieran-vale': ['Human', '29', 'Tycho City, Luna', 'Shuttle operations, tactical flight, high-stress navigation'],
  'priya-nayar': ['Human', '36', 'Starbase 12', 'Logistics, communications, personnel coordination, operations management'],
  'hadrik-bronn': ['Tellarite', 'Late fifties by human comparison', 'Drekon Cooperative District, Tellar Prime', 'Border security, convoy protection, shipboard defense, crisis containment'],
  'rowan-saye': ['Human', '41', 'Utopia Colony, Mars', 'Astrophysics, subspace phenomena, scientific intelligence, anomaly analysis'],
  'miriam-sato': ['Human', '43', 'Sapporo, Earth', 'Trauma surgery, emergency medicine, bioethics, operational health'],
  'imani-cross': ['Human', '39', 'Nairobi, Earth', 'Starship systems integration, bio-neural architecture, propulsion-control validation']
};
```

Assert the dataset manifest version is `1.1.0`, every common field is non-empty, and `assignmentHistory` is either absent or non-empty. Assert forbidden keys such as `publicReputation`, `centralStrength`, `centralFlaw`, `campaignFunction`, `narrationGuide`, and `distinguishingHistory` are absent from every `publicRecord`.

- [ ] **Step 2: Write failing projection assertions**

In `test-v1-people-projection.mjs`, assert Whitaker projects:

```js
assert.equal(baselineWhitaker.species, 'Human');
assert.deepEqual(baselineWhitaker.publicRecord, {
  age: '47',
  birthplace: 'Kingston, Ontario, Earth',
  serviceBackground: 'Science operations, diplomacy, executive command',
  assignmentHistory: "Commanding officer since the Breckenridge's 2372 commission"
});
```

Assert Bronn projects `Tellarite`, all seven people have the three required public-record fields, and `JSON.stringify(baseline)` contains none of the forbidden private field names or narration-guide canaries.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
node tools/scripts/test-ashes-v1-campaign.mjs
node tools/scripts/test-v1-people-projection.mjs
```

Expected: both fail because the dataset and projection do not yet contain the public record.

- [ ] **Step 4: Add exact campaign data**

Update the crew dataset manifest to `1.1.0`. Add `species` and `publicRecord` to all seven officers using the literal values above. Add concise source-backed assignment history where explicitly available:

- Whitaker: commanding officer since the Breckenridge's 2372 commission.
- Kieran and Priya: previous posting U.S.S. Valorous.
- Bronn: original Breckenridge senior officer and acting XO during post-refit transit.
- Rowan and Sato: previous posting U.S.S. Huxley.
- Imani: previous posting Utopia Planitia systems-integration and refit program.

- [ ] **Step 5: Project only the allowlisted fields**

In `createPeoplePlayerProjection()`, add:

```js
species: compact(officer.species),
publicRecord: {
  age: compact(officer.publicRecord?.age),
  birthplace: compact(officer.publicRecord?.birthplace),
  serviceBackground: compact(officer.publicRecord?.serviceBackground),
  ...(compact(officer.publicRecord?.assignmentHistory)
    ? { assignmentHistory: compact(officer.publicRecord.assignmentHistory) }
    : {})
},
```

Do not spread or clone the entire officer object.

- [ ] **Step 6: Run tests and verify GREEN**

Run the two commands from Step 3. Expected: campaign contract and projection tests pass.

- [ ] **Step 7: Commit Task 1**

```powershell
git add tools/scripts/test-ashes-v1-campaign.mjs tools/scripts/test-v1-people-projection.mjs packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json src/projection/v1/people-projection.mjs
git commit -m "feat(crew): project public service records"
```

### Task 2: Render service records in desktop and mobile details

**Files:**
- Modify: `tools/scripts/test-v1-crew-panel.mjs`
- Modify: `src/ui/people-journal.js`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: `record.species` and `record.publicRecord` from `createV1CrewPanelModel()`.
- Produces: a species header label and one `people-service-record` block shared by desktop and mobile.

- [ ] **Step 1: Write failing Crew-panel assertions**

Extend the NPC fixture in `test-v1-crew-panel.mjs` with a complete public record. Assert both desktop and mobile NPC details contain `Human`, `Service record`, `Age`, `47`, `Birthplace`, `Kingston, Ontario, Earth`, `Service background`, and the assignment-history text. Create a direct detail fixture without `assignmentHistory` and assert it renders no `Assignment history` label or blank row.

- [ ] **Step 2: Run the Crew-panel test and verify RED**

Run:

```powershell
node tools/scripts/test-v1-crew-panel.mjs
```

Expected: fail because NPC species and the service-record rows are not rendered from the new projection fields.

- [ ] **Step 3: Implement the service-record block**

Add a focused helper in `people-journal.js` that receives `record.publicRecord`, builds a `people-detail-block people-service-record` section, and appends a `<dl>` with only non-empty rows:

```js
[
  ['Age', publicRecord.age],
  ['Birthplace', publicRecord.birthplace],
  ['Service background', publicRecord.serviceBackground],
  ['Assignment history', publicRecord.assignmentHistory]
]
```

Call it immediately after `Profile`. Keep the existing header species rendering and Story Settlement sections unchanged.

- [ ] **Step 4: Style compact labeled rows**

In `styles/directive.css`, add scoped rules for `.people-service-record dl`, `div`, `dt`, and `dd`. Use the existing muted text and blue heading tokens, a two-column layout on desktop, and allow values to wrap without horizontal overflow on mobile.

- [ ] **Step 5: Run the Crew-panel test and verify GREEN**

Run `node tools/scripts/test-v1-crew-panel.mjs`. Expected: pass.

- [ ] **Step 6: Run focused projection, campaign, panel, and visual checks**

```powershell
node tools/scripts/test-ashes-v1-campaign.mjs
node tools/scripts/test-v1-people-projection.mjs
node tools/scripts/test-v1-crew-panel.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: all commands exit 0 with no horizontal-overflow or geometry regressions.

- [ ] **Step 7: Commit Task 2**

```powershell
git add tools/scripts/test-v1-crew-panel.mjs src/ui/people-journal.js styles/directive.css
git commit -m "feat(crew): show public service records"
```

### Task 3: Final verification and integration readiness

**Files:**
- Verify: all changed files and the approved design/plan.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: a reviewed, fully verified feature branch ready to merge into `main`.

- [ ] **Step 1: Audit requirements and diff**

Run `git diff main...HEAD --check` and inspect `git diff main...HEAD`. Confirm each design requirement maps to data, projection, rendering, or test evidence and no unrelated files changed.

- [ ] **Step 2: Run the full gate**

Run:

```powershell
npm.cmd test
```

Expected: exit 0 with every alpha-gate check passing.

- [ ] **Step 3: Request independent review**

Review `main...HEAD` for source fidelity, projection allowlisting, player-knowledge leaks, desktop/mobile rendering, and test coverage. Fix every Critical or Important issue test-first and rerun the relevant focused checks plus `npm.cmd test`.

- [ ] **Step 4: Commit review fixes if needed**

```powershell
git add packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json src/projection/v1/people-projection.mjs src/ui/people-journal.js styles/directive.css tools/scripts/test-ashes-v1-campaign.mjs tools/scripts/test-v1-people-projection.mjs tools/scripts/test-v1-crew-panel.mjs
git commit -m "fix(crew): address service record review"
```

- [ ] **Step 5: Merge, verify, and push**

Return to the main checkout, fast-forward or merge the feature branch into `main`, rerun `npm.cmd test` on the merged tree, then push `main` to `origin`. Verify local and remote `main` SHAs match.
