# Breckenridge Registry Renumber Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change every tracked U.S.S. Breckenridge registry representation from `NCC-74638` to `NCC-74656`.

**Architecture:** Treat the bundled Ashes of Peace package as runtime authority and align all tracked UI fixtures, tests, contracts, mockups, and campaign source documents with its corrected registry. Preserve ship/package identifiers and do not migrate external saves or add compatibility behavior.

**Tech Stack:** JSON campaign data, JavaScript/Node.js tests, HTML mockups, Markdown documentation, PowerShell/Git verification.

## Global Constraints

- Replace only the exact registry value `NCC-74638` with `NCC-74656`.
- Keep `uss-breckenridge`, package IDs, paths, asset names, and the ship name unchanged.
- Do not change external or live SillyTavern saves and installations.
- Preserve unrelated working-tree changes.
- Finish with zero tracked legacy registry references and a passing full repository gate.

---

### Task 1: Renumber the canonical campaign and every tracked consumer

**Files:**

- Modify: `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- Modify: `tools/scripts/test-campaign-package-context.mjs`
- Modify: `tools/scripts/test-certified-ship-view.mjs`
- Modify: `tools/scripts/test-certified-ship-panel.mjs`
- Modify: `tools/scripts/test-ship-panel-state-records.mjs`
- Modify: `tools/scripts/test-v1-composite-player-projection.mjs`
- Modify: `tools/scripts/test-v1-player-facing-panel-model.mjs`
- Modify: `tools/scripts/test-v1-ship-projection.mjs`
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`
- Modify: `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md`
- Modify: `docs/design/mockups/directive-expanded-interface.html`
- Modify: `docs/source/Directive_Game_Design_Document.md`
- Modify: `docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md`

**Interfaces:**

- Consumes: `ship.registry` from the bundled campaign package.
- Produces: the canonical string `NCC-74656` through existing package, projection, panel, and view interfaces.

- [ ] **Step 1: Establish the failing baseline**

Run:

```powershell
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!artifacts/**' --glob '!.tmp/**' 'NCC-74638' .
```

Expected: matches in exactly the listed campaign, UI, fixture, test, and documentation files, proving the old registry is still present.

- [ ] **Step 2: Apply the minimal canonical replacement**

In each listed file, replace every exact `NCC-74638` token with `NCC-74656`. Make no other content changes.

- [ ] **Step 3: Verify JSON and focused behavior**

Run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json','utf8')); console.log('campaign JSON valid')"
node tools/scripts/test-campaign-package-context.mjs
node tools/scripts/test-certified-ship-view.mjs
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-ship-panel-state-records.mjs
node tools/scripts/test-v1-composite-player-projection.mjs
node tools/scripts/test-v1-player-facing-panel-model.mjs
node tools/scripts/test-v1-ship-projection.mjs
```

Expected: JSON validation exits zero and every focused script reports success.

- [ ] **Step 4: Prove the legacy registry is absent**

Run:

```powershell
git grep -n 'NCC-74638' -- ':!docs/superpowers/specs/2026-08-13-breckenridge-registry-renumber-design.md' ':!docs/superpowers/plans/2026-08-13-breckenridge-registry-renumber.md'
git grep -n 'NCC-74656'
```

Expected: the first command returns no matches; the second returns the updated campaign, UI, fixture, test, and source-document references.

- [ ] **Step 5: Run the full repository gate**

Run:

```powershell
npm.cmd test
```

Expected: exit code 0 with all alpha-gate checks passing.

- [ ] **Step 6: Review and commit only in-scope changes**

Run:

```powershell
git diff --check
git diff --stat
git status --short
```

Confirm the diff contains only the files listed in this task plus the approved design and implementation-plan documents, then stage the listed registry files and commit:

```powershell
git commit -m "fix(campaign): renumber Breckenridge registry"
```

- [ ] **Step 7: Push the verified main branch**

Run:

```powershell
git push origin main
```

Expected: `origin/main` advances to the registry-renumber commit without including unrelated dirty files.
