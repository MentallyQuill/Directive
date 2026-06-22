# Backend Redesign Integration Prep

## Purpose

This document prepares the backend/runtime portions of `Directive-interface-redesign.zip` for integration into the current Directive repo.

The backend integration posture is intentionally different from the UI posture. Because Directive is pre-alpha, backend improvements from the handoff may replace current non-Chapter 2 work when they are demonstrably better. The protected current-branch work is Chapter 2: False Colors through Quiet Channels, including its package records, runtime state transitions, pressure continuity, and tests.

## Reviewed Source

Local review source:

- Archive: `C:/Users/Keptin/Downloads/Directive-interface-redesign.zip`
- Extracted review copy: `C:/Users/Keptin/AppData/Local/Temp/directive-interface-redesign-review-20260620/Directive-main`
- Review manifest: `artifacts/interface-redesign-2026-06-20/MANIFEST.md`

The archive is a full repo-shaped bundle. Its backend material includes runtime source, mission/adjudication source, host source, bundled package JSON, assets, tests, tools, and docs.

## Integration Posture

Accept backend improvements broadly, but do not erase Chapter 2.

Allowed by default:

- Replacing non-Chapter 2 backend implementation when the handoff is cleaner and tests pass.
- Replacing Prelude or Chapter 1 phrasing, fixtures, and helper logic if the behavior remains valid.
- Adding new package asset metadata and optimized package images.
- Updating backend docs or tooling when they do not downgrade current gate coverage.

Protected by default:

- Chapter 2 mission graph behavior.
- Chapter 2 outcome flags, facts, pressure records, actor/front posture records, clocks, and retrieval hooks.
- Stage 41-46 runtime tests.
- Quiet Channels Open Orders pressure, scene, resolution, direct/delegated interval behavior, and reward asset continuity.
- Current alpha-gate coverage count and any checks that prove Chapter 2.

## Key Finding

The backend source diff is much smaller than the UI diff. Earlier review identified package identity drift as a risk, and the repo has now consolidated on `Breckenridge` / `breckenridge` everywhere.

The main non-UI improvement found in the archive is package image metadata and optimized package assets:

- The archive's `ashes-of-peace.campaign-package.json` has 8 `assets.images` records.
- The current repo's `ashes-of-peace.campaign-package.json` has 0 `assets.images` records.
- The archive includes optimized `hero`, `card`, `detail`, and `thumb` WebP derivatives under `assets/packages/breckenridge/images/`.
- The archive also includes source PNGs and `asset-build-manifest.json`.

Those assets should be integrated with the canonical `Breckenridge` / `breckenridge` identity and must not reintroduce an alternate spelling.

## Chapter 2 Protected Surfaces

Do not overwrite these current repo surfaces with archive versions unless the resulting file still preserves the current Chapter 2 semantics and passes the protected tests:

| Surface | Protected reason |
|---|---|
| `packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json` | Authoritative Chapter 2 mission graph. |
| `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json` | Carries Chapter 2 dataset references, side assignments, `side-quiet-channels`, and `quiet-channels-network`. |
| `packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json` | Carries initial state and protected Chapter 2 continuity domains. |
| `src/adjudication/intent-parser.mjs` | Parses Chapter 2 player intent and target signals. |
| `src/adjudication/action-resolver.mjs` | Resolves Chapter 2 outcome packets and player-facing facts. |
| `src/adjudication/capability-validator.mjs` | Defines Chapter 2 authority/capability constraints. |
| `src/mission/director.mjs` | Builds Chapter 2 Director, narrator, and Command Log packets without hidden-source leaks. |
| `src/mission/state-delta.mjs` | Commits Chapter 2 flags, fronts, actors, clocks, pressure ledger updates, and hidden-state-safe records. |
| `src/pressures/pressure-seeding.mjs` | Seeds `pressure.regional.false-colors-quiet-channels` from the joint charter. |
| `src/pressures/open-orders-scene.mjs` | Builds Open Orders scene briefs used by Quiet Channels. |
| `src/pressures/open-orders-resolution.mjs` | Resolves `quiet-channels-network` reward and direct/delegated assignment outcomes. |
| `src/side-missions/*` | Must not resolve Chapter 1 follow-up in ways that prematurely answer Chapter 2. |
| `tools/scripts/test-runtime-stage41-chapter2-transparency-terms.mjs` | Protected Chapter 2 stage test. |
| `tools/scripts/test-runtime-stage42-chapter2-orison-evidence.mjs` | Protected Chapter 2 stage test. |
| `tools/scripts/test-runtime-stage43-chapter2-aegis-medical.mjs` | Protected Chapter 2 stage test. |
| `tools/scripts/test-runtime-stage44-chapter2-security-access.mjs` | Protected Chapter 2 stage test. |
| `tools/scripts/test-runtime-stage45-chapter2-joint-charter.mjs` | Protected Chapter 2 stage test. |
| `tools/scripts/test-runtime-stage46-chapter2-quiet-channels-continuity.mjs` | Protected Stage 46 Quiet Channels continuity test. |
| `tools/scripts/run-alpha-gate.mjs` | Must keep the current 72-check gate or a strictly stronger replacement. |

Stage 40 is not Chapter 2 itself, but it is the transition into False Colors. Treat it as a dependency: it may change only if Stage 41-46 still pass.

## Archive Material To Integrate

### Package Image Metadata

Candidate source:

- `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- `assets/packages/breckenridge/asset-build-manifest.json`
- `assets/packages/breckenridge/images/**`
- `assets/packages/breckenridge/source/**`

Required identity handling:

- Use `breckenridge.ship.primary`.
- Use `uss-breckenridge`.
- Use `assets/packages/breckenridge/...`.
- Use `USS_Breckenridge.png` or another `Breckenridge` source filename.
- Alt text should match the current product identity.

Recommended first implementation slice:

1. Copy optimized WebP derivatives into `assets/packages/breckenridge/images/`.
2. Copy source PNGs into `assets/packages/breckenridge/source/`.
3. Copy or adapt `asset-build-manifest.json`.
4. Add adapted `assets.images` records to `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`.
5. Validate with package tests and the visual-system package-image resolver.

### Backend Source

Source files with backend/runtime diffs:

- `src/adjudication/action-resolver.mjs`
- `src/adjudication/capability-validator.mjs`
- `src/adjudication/intent-parser.mjs`
- `src/hosts/lumiverse/runtime-bridge.mjs`
- `src/mission/director.mjs`
- `src/mission/phase-advancement.mjs`
- `src/mission/state-delta.mjs`
- `src/pressures/open-orders-resolution.mjs`
- `src/pressures/open-orders-scene.mjs`
- `src/pressures/pressure-seeding.mjs`
- `src/runtime/director-turn-runtime.mjs`
- `src/runtime/runtime-app.mjs`
- `src/runtime/runtime-shell.js`
- `src/side-missions/opportunity-detector.mjs`
- `src/side-missions/opportunity-scene.mjs`

Observed handling:

- Most diffs in the first backend review were package identity drift; after consolidation, future backend diffs should be evaluated for actual behavior changes.
- `src/pressures/pressure-seeding.mjs` in the current repo contains the protected Chapter 2 `chapter2PressureSeeds` path; do not remove it.
- `src/mission/state-delta.mjs` in the current repo commits the protected Chapter 2 pressure ledger delta; do not remove it.
- `src/runtime/runtime-app.mjs` and `src/hosts/lumiverse/runtime-bridge.mjs` in the current repo include `generateCommandLogSummary` control used by no-generation smoke paths; do not regress that while merging backend changes.

If a future backend handoff contains source behavior beyond package identity churn, integrate it file-by-file and rerun the protected tests immediately.

## Do Not Copy Whole

Do not copy these archive areas wholesale:

- `packages/bundled/breckenridge/*`
- `content/campaigns/breckenridge/*`
- `tools/scripts/run-alpha-gate.mjs`
- `docs/testing/TESTING_STRATEGY.md`
- `src/adjudication/*` as a bulk replacement
- `src/mission/*` as a bulk replacement
- `src/pressures/*` as a bulk replacement
- `src/runtime/*` as a bulk replacement
- `src/hosts/lumiverse/*` as a bulk replacement

Bulk replacement would downgrade or risk downgrading the current Stage 46 state.

## Identity Consolidation Rule

`Breckenridge` is the canonical repo-wide spelling. Backend integration must preserve this spelling in package ids, dataset ids, actor ids, fact ids, outcome flags, asset ids, paths, tests, fixtures, docs, save metadata, and runtime output.

In-character dialogue and authored flavor text may use **the Breck** as a casual nickname for the ship when the speaker's voice supports it. The nickname must not appear in ids, paths, package metadata, formal labels, tests, fixtures, or system-owned state keys.

Required verification before backend integration is complete:

- A case-insensitive repo text search for the old spelling returns no matches.
- A filesystem-name search for the old spelling returns no paths.
- The full alpha gate passes after the search.

## Integration Phases

### Phase 1: Asset Metadata Import

Goal: integrate the handoff's backend-visible package image layer without touching Chapter 2 behavior.

Actions:

- Add adapted package image assets and metadata.
- Keep the current package path unless an identity migration is explicitly chosen.
- Do not alter Chapter 2 graph, pressure, or runtime source in this slice.

Verification:

- `node tools\scripts\validate-campaign-package.mjs`
- `node tools\scripts\test-campaign-package-context.mjs`
- `node tools\scripts\test-visual-system-foundation.mjs`
- `node tools\scripts\test-runtime-stage46-chapter2-quiet-channels-continuity.mjs`

### Phase 2: Backend Source Diff Review

Goal: decide if any archive backend source change is a real behavior improvement rather than package identity churn.

Actions:

- Review each backend file listed above.
- Accept non-Chapter 2 source changes when they simplify or improve behavior.
- Preserve Chapter 2 state transitions and tests.
- Preserve no-generation sidecar controls in runtime and Lumiverse bridge paths.

Verification:

- Focused test for the changed subsystem.
- Stage 41-46 tests if the change touches mission/adjudication/pressure state.
- `node tools\scripts\test-dual-host-scaffold.mjs` if the change touches host, runtime bridge, sidecars, or generation.

### Phase 3: Package Or Content Merge

Goal: bring in package/content improvements without losing Chapter 2 continuity.

Actions:

- Merge non-Chapter 2 package improvements deliberately.
- For `ashes-of-peace.campaign-package.json`, merge by section instead of overwriting the file.
- Preserve `side-quiet-channels`, `quiet-channels-network`, Chapter 2 dataset references, and current Chapter 2 outcome/fact ids.

Verification:

- `node tools\scripts\validate-campaign-package.mjs`
- `node tools\scripts\validate-campaign-projection.mjs`
- `node tools\scripts\validate-mission-graph.mjs schemas/mission/mission-graph.schema.json packages/bundled/breckenridge/ashes-of-peace.campaign-package.json packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json`
- Stage 41-46 tests.

### Phase 4: Full Backend Gate

Goal: prove backend integration did not regress the current branch's protected work.

Required checks:

- `node tools\scripts\test-runtime-stage41-chapter2-transparency-terms.mjs`
- `node tools\scripts\test-runtime-stage42-chapter2-orison-evidence.mjs`
- `node tools\scripts\test-runtime-stage43-chapter2-aegis-medical.mjs`
- `node tools\scripts\test-runtime-stage44-chapter2-security-access.mjs`
- `node tools\scripts\test-runtime-stage45-chapter2-joint-charter.mjs`
- `node tools\scripts\test-runtime-stage46-chapter2-quiet-channels-continuity.mjs`
- `node tools\scripts\test-dual-host-scaffold.mjs`
- `node tools\scripts\run-alpha-gate.mjs`

## Acceptance Standard

Backend integration is ready only when:

- The handoff's backend improvements are merged as current repo behavior, not as an archive overwrite.
- Chapter 2 False Colors remains playable through Stage 46 Quiet Channels.
- `side-quiet-channels` can be reviewed, selected, played, resolved, saved, loaded, and completed direct or delegated.
- Hidden Hecate/source-truth material remains hidden from player-facing packets.
- The current alpha gate passes with at least the current 72-check coverage.
- SillyTavern and Lumiverse deterministic paths still pass.
