# Expanded Directive Interface Production Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Directive's command-spine/drawer UI with the approved viewport-bound Campaign, Mission, People, Ship, and Settings interface while preserving real SillyTavern chat, save, provider, asset, and runtime behavior.

**Architecture:** Keep `src/runtime/runtime-app.mjs` as the host-neutral application boundary, but move route projection into focused player-safe view-model modules and replace the current shell renderer with a viewport-bound expanded shell. Shared responsive collection, disclosure, reorder, focus, scrollbar, and service-mark modules supply one interaction system across routes. Manual saves become immutable checkpoints backed by an idempotent save/load journal; autosaves remain runtime-owned and hidden from the normal Saved Games surface.

**Tech Stack:** Browser-native JavaScript modules, CSS, SillyTavern host adapters, Directive CORE/storage v2, Node.js contract tests, and Playwright/CDP live-host verification.

**Execution status, 2026-07-22:** Phase 0 is complete. Phase 1 production cutover is implemented: the old shell/layout modules and player-facing geometry actions are removed, the viewport-bound shell and People route are active, shared focus/record/reorder state primitives exist, and UI preferences v2 migrates v1 quest selection to campaign scope. The full alpha gate passes 222 checks. Phase 1 live screenshot/overflow certification remains open because this checkout has no configured SillyTavern URL or dedicated test-user credentials; the four-viewport keyboard/touch Playwright matrix is ready to run when that host is supplied. Obsolete command-spine CSS assertions/selectors remain scheduled for route-by-route deletion through Phase 7 so route styling is not removed before its replacement lands.

## Global Constraints

- `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md` is the living design and integration authority.
- `docs/design/mockups/directive-expanded-interface.html` is the executable visual and behavioral reference, not production source.
- Do not copy mock data, `/files/...` URLs, inline prototype controllers, or page-local drag logic.
- Directive is pre-alpha; remove obsolete UI and migrate every caller/test in place instead of preserving the old shell as a compatibility mode.
- Primary routes are Campaign, Mission, People, Ship, and Settings.
- Route selection, expansion, collapse, and ordering are presentation-only unless the control is an explicit game operation.
- The extension is viewport-bound; long content scrolls only inside Directive-owned bounded regions.
- Desktop/console and phone share state and components but use distinct responsive compositions.
- Preserve package-owned images, player-safe projections, SillyTavern chat binding, provider routing, CORE v2 authority, autosave, and prompt lifecycle.
- Never expose raw hidden state, prompts, credentials, endpoints, private reasoning, or internal relationship values.
- Before any production phase is declared complete, run its focused tests, the applicable Playwright matrix, and real SillyTavern verification for changed host actions.

---

## Current Architecture And Migration Boundaries

### Production mount and shell

- `manifest.json` loads `src/extension/index.js` and `styles/directive.css`.
- `src/extension/index.js` bootstraps `src/hosts/sillytavern/bootstrap.js`.
- `src/hosts/sillytavern/bootstrap.js` creates the SillyTavern host, runtime app, overlay root, and runtime bridge.
- `src/runtime/runtime-shell.js` owns active route, rendering, global Escape/resize listeners, fullscreen state, action adaptation, and panel refresh.
- `src/ui/directive-command-spine-shell.js` renders the desktop spine, drawer, resize handle, and phone bottom bar.
- `src/ui/directive-shell-layout.mjs` persists drawer geometry under `directive.runtime.commandSpine.layout.v1`.
- `src/ui/directive-routes.mjs` already defines five routes, but the People route still uses internal and visible id/label `crew` / `Crew`.

Cutover: replace the spine/drawer renderer and geometry persistence rather than layering the expanded shell over them. Retain `runtime.show`, `runtime.hide`, `runtime.open`, `runtime.setTab`, Close, refresh, overlay mounting, and creator entry behavior. Remove drawer resize, shelf drag, density, drawer toggle, and layout-reset behavior after all callers and tests are migrated.

### Runtime view and actions

- `src/runtime/runtime-app.mjs` builds a single `directive.runtimeView`, owns UI-only quest selection, exposes provider/profile data, and adapts campaign/chat/save actions.
- `src/ui/player-facing-information.mjs` currently projects quests, crew, ship, and alerts. It is too thin for the approved interface and should become an aggregator over focused route projectors.
- `src/runtime/ui-preferences.mjs` persists only hidden campaign-session keys and selected quest ids.
- `src/storage/directive-storage-repository.mjs` normalizes and writes `system/ui-preferences.v1.json`.

Cutover: bump UI preferences to v2 in place and update the repository normalizer, runtime service, view envelope, and tests together. UI preferences remain outside campaign authority and are never fed to prompts or simulation.

### Campaign saves and chats

- `src/runtime/runtime-app.mjs#saveCurrentGame` overwrites the active save.
- `src/runtime/runtime-app.mjs#saveCurrentGameAs` clones the current SillyTavern chat, activates the branch, copies CORE v2 state, rebuilds prompts, and retargets the active binding.
- `src/runtime/runtime-app.mjs#loadGame` activates an existing save and opens/rebuilds its bound chat.
- `src/hosts/sillytavern/chat-adapter.mjs#cloneCurrentChatForSaveBranch` can save and open a cloned character chat, but has no preserve-without-opening checkpoint API.
- `src/storage/core-store-v2.mjs#copyCoreStoreStateV2ForSaveBranch` supplies the closest existing CORE fork seam.

Cutover: replace visible overwrite/branch semantics with immutable manual checkpoints. Do not change stable-turn autosave behavior. Add host-neutral preserve/open clone calls, an idempotent operation journal, immutable checkpoint records, and copy-on-load CORE/save/chat creation before deleting visible `Save Game As...` behavior.

### Panels and styles

- `src/ui/campaign-panel.js`, `mission-panel.js`, `crew-panel.js`, `ship-panel.js`, and `settings-panel.js` are direct DOM renderers.
- `src/ui/runtime-ui-kit.js` provides generic DOM/button/tooltip helpers.
- `src/ui/directive-media.js` and `src/packages/package-image-resolver.mjs` already resolve package-owned ship and portrait assets with fallbacks and focal points.
- `styles/directive.css` is a large accumulated stylesheet with several later override layers for the old shell and routes.

Cutover: keep media resolution and focused generic helpers. Add shared expanded-interface components; migrate one route at a time; delete superseded panel branches and old CSS selectors at each phase instead of appending a final compatibility layer.

---

## Phase 0: Reconcile Authorities And Freeze Contract Tests

**Files:**
- Modify: `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md`
- Modify: `docs/planning/INTERFACE_REDESIGN_INTEGRATION_PREP.md`
- Modify: `docs/planning/VISUAL_ASSET_AND_MOBILE_UI_INTEGRATION_PLAN.md`
- Modify: `docs/design/DIRECTIVE_DESIGN_BASELINE.md`
- Modify: `tools/scripts/test-expanded-interface-mockup.mjs`
- Create: `tools/scripts/test-expanded-interface-authority.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Produces:** one current authority chain with Ship and Settings marked approved, correct production file names, the five-route People vocabulary, and explicit save/diagnostics/privacy contracts.

- [ ] Add failing assertions that Settings is no longer described as pending, Ship/Settings are not blocked as unapproved, the production map names the real shell boundary, and lower-priority docs do not reinstate desktop command-spine or Log/Crew routes.
- [ ] Update the authority documents without altering approved mockup behavior: replace stale pending-route summaries; identify `src/runtime/runtime-shell.js` plus the new expanded shell as the production seam; mark the old integration-prep stage counts and donor archive as historical.
- [ ] Record the diagnostics exclusion contract: no system prompts, credentials, endpoint URLs, private reasoning, hidden facts, or raw private relationship values; story transcript is explicit opt-in and contains only player-visible messages from the active visible branch.
- [ ] Run `node tools/scripts/test-expanded-interface-mockup.mjs`, `node tools/scripts/test-expanded-interface-authority.mjs`, and `git diff --check`.

## Phase 1: Expanded Shell, Responsive Primitives, And UI Preferences v2

**Files:**
- Create: `src/ui/directive-expanded-shell.js`
- Create: `src/ui/responsive-record-list.js`
- Create: `src/ui/reorderable-collection.js`
- Create: `src/ui/expanded-interface-focus.js`
- Modify: `src/runtime/runtime-shell.js`
- Modify: `src/extension/runtime-mount.js`
- Modify: `src/ui/directive-routes.mjs`
- Modify: `src/ui/runtime-ui-kit.js`
- Modify: `src/runtime/ui-preferences.mjs`
- Modify: `src/storage/directive-storage-repository.mjs`
- Modify: `src/storage/logical-storage-paths.mjs`
- Modify: `styles/directive.css`
- Delete after cutover: `src/ui/directive-command-spine-shell.js`
- Delete after cutover: `src/ui/directive-shell-layout.mjs`
- Test: `tools/scripts/test-extension-shell.mjs`
- Test: `tools/scripts/test-runtime-ui-preferences.mjs`
- Create: `tools/scripts/test-expanded-interface-shell.mjs`
- Create: `tools/scripts/test-responsive-record-list.mjs`
- Create: `tools/scripts/test-reorderable-collection.mjs`
- Modify: `tools/scripts/test-visual-system-foundation.mjs`
- Modify: `tools/scripts/test-runtime-host-injection.mjs`

**Interfaces:**
- `createDirectiveExpandedShell({ routes, activeRouteId, onSelectRoute, onClose }) -> HTMLElement`
- `createResponsiveRecordList({ records, openRecordId, renderSummary, renderDetail, onToggle, reorder }) -> HTMLElement`
- `createReorderableCollectionController({ scopeKey, categories, records, preferences, onPreferencesChange })`
- `uiPreferences.v2` adds selected campaign/person, category placement/order/collapse, quest order/open state, and ship issue/capability order/open issue keyed by campaign or campaign+ship.

- [ ] Write failing shell tests for `100dvh`, fixed internal route bar, no command spine/drawer/resize/density control, direct five-route selection, Close, Escape, focus return, and no history Back state.
- [ ] Write failing collection tests for dedicated handles, `175ms` touch/pen long press, pointer cancellation, nearest-list autoscroll, exact-height placeholder, body-level ghost, Arrow-key reorder, focus restoration, and zero campaign-state mutation.
- [ ] Implement the expanded shell while temporarily mounting the current route panel bodies inside its bounded route body; rename the production route id and visible label from `crew` to `people` in one cutover and migrate all callers/tests.
- [ ] Implement UI preferences v2 with an in-place pre-alpha rewrite of v1, dropping drawer geometry and mapping `selectedQuestIdsByScope` into the new route preference envelope.
- [ ] Add scoped thin scrollbars, reduced-motion rules, `:focus-visible`, safe-area spacing, `overscroll-behavior: contain`, and phone/desktop composition breakpoints.
- [ ] Remove the old shell/layout modules and their CSS only after no production import, test, or documentation reference remains.
- [ ] Run the focused shell/preference/collection tests plus `node tools/scripts/test-visual-system-foundation.mjs` and `node tools/scripts/test-runtime-host-injection.mjs`.
- [ ] Run Playwright at `1440x900`, `1024x768`, `390x844`, and `360x800`, asserting shell height, no document horizontal overflow, stable route bar, reachable final record, visible focus, and screenshot output.

## Phase 2: Campaign View, Immutable Checkpoints, And Chat Navigation

**Files:**
- Create: `src/ui/view-models/campaign-view.mjs`
- Rewrite: `src/ui/campaign-panel.js`
- Create: `src/runtime/manual-checkpoint-service.mjs`
- Create: `src/storage/manual-checkpoint-records.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/campaign-start-controller.mjs`
- Modify: `src/storage/directive-storage-repository.mjs`
- Modify: `src/storage/logical-storage-paths.mjs`
- Modify: `src/storage/core-store-v2.mjs`
- Modify: `src/hosts/sillytavern/chat-adapter.mjs`
- Modify: `src/hosts/sillytavern/host-factory.mjs`
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-expanded-campaign-view.mjs`
- Create: `tools/scripts/test-manual-checkpoint-service.mjs`
- Create: `tools/scripts/test-sillytavern-checkpoint-chat.mjs`
- Modify: `tools/scripts/test-campaign-start-and-save.mjs`
- Modify: `tools/scripts/test-active-save-facade-v2.mjs`
- Modify: `tools/scripts/test-current-chat-campaign-scope.mjs`
- Modify: `tools/scripts/test-sillytavern-chat-prompt-adapters.mjs`
- Create: `tools/scripts/smoke-checkpoint-game-live.mjs`
- Delete after checkpoint smoke replacement: `tools/scripts/smoke-save-game-as-live.mjs`

**Interfaces:**
- `buildCampaignView(...) -> { campaigns, selectedCampaignId }`
- `saveGame({ name }) -> { checkpoint, activeSaveId, activeChatId }`
- `loadGame({ checkpointId }) -> { checkpointId, activeSaveId, playableChat }`
- `deleteSave({ checkpointId })`
- Host chat: `cloneCampaignChat({ sourceChatId, targetName, open })` where `open:false` preserves a checkpoint chat without changing the active host chat.

- [ ] Write failing projector tests for active-first/recent ordering, approved fields only, package asset refs, checkpoint-only Saved Games, Open Chat only on the active timeline, and selection without activation.
- [ ] Write a fault-injection matrix for journal stages: source guard, chat clone, checkpoint record, CORE fork/reference, binding write, prompt rebuild, and open chat. Replaying the same idempotency key must converge without duplicate chats or records.
- [ ] Implement an immutable `directive.manualCheckpoint.v1` record referencing the preserved chat and frozen CORE authority. Treat existing manual/branch records as pre-alpha data to migrate or discard explicitly; do not present them as checkpoints by label alone.
- [ ] Implement Save Game so active save/chat ids remain unchanged and the preserved chat is not opened.
- [ ] Implement Load Game so every load creates a new active save id, clones a playable chat from the checkpoint, forks CORE v2 authority, rebuilds prompt context for the new binding only, and leaves the checkpoint reusable.
- [ ] Implement Delete Save confirmation and prohibit checkpoint UI from deleting the active timeline.
- [ ] Rewrite Campaign as unified master/detail on desktop and expandable campaign/save records on phone; keep creation/import subordinate behind the approved New Campaign entry.
- [ ] Remove visible `Load Campaign`, overwrite-style `Save Game`, `Save Game As...`, old Command/Library/Records tabs, raw save health/binding telemetry, and archive/review completion actions.
- [ ] Run focused storage/runtime/host tests, then real SillyTavern proof for Open Chat, Save Game, repeated Load Game, Delete Save, interrupted operation resume, wrong-chat guard, and completed-campaign checkpoint loading.

## Phase 3: Mission Journal

**Files:**
- Create: `src/ui/view-models/mission-view.mjs`
- Rewrite: `src/ui/mission-panel.js`
- Modify: `src/ui/mission-quest-journal.js` or delete it after its behavior moves to the shared responsive list
- Modify: `src/ui/player-facing-information.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/ui-preferences.mjs`
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-expanded-mission-view.mjs`
- Modify: `tools/scripts/test-player-facing-information.mjs`
- Modify: `tools/scripts/test-player-facing-panel-contracts.mjs`
- Modify: `tools/scripts/test-quest-selection-ui-only.mjs`
- Modify: `tools/scripts/test-player-facing-ui-playwright.mjs`

**Produces:** title/type/status, concise description, objective, structured tasks, computed task progress, and authoritative player-safe context without generated urgency.

- [ ] Write failing projection tests proving tasks come from structured mission/quest state, progress is derived from task completion, absent countdowns stay absent, and hidden facts never enter the view.
- [ ] Extend quest projection with description, objective, tasks, location, people, evidence/constraints, and selection/order preferences while retaining simulation-state fingerprints before and after UI actions.
- [ ] Replace current Mission subtabs/dashboard duplication with one quest list/detail composition and the shared phone accordion/reorder primitive.
- [ ] Keep pending command/recovery operations available only where they are genuinely actionable; do not reintroduce a separate Situation, Intel, or operator-diagnostics surface.
- [ ] Run focused projector/panel/selection tests and Playwright selection, reorder, accordion, keyboard, touch, overflow, and screenshot checks at all four viewports.

## Phase 4: People Schema, Projection, Service Marks, And Collections

**Files:**
- Create: `src/ui/view-models/people-view.mjs`
- Create: `src/ui/starfleet-service-marks.js`
- Create: `src/ui/people-panel.js`
- Delete after route cutover: `src/ui/crew-panel.js`
- Modify: `src/ui/directive-media.js`
- Modify: `src/ui/player-facing-information.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/ui-preferences.mjs`
- Modify: `schemas/packages/crew.schema.json`
- Modify: `schemas/packages/crew-dataset.schema.json`
- Modify: `packages/bundled/aster-vale/unseen-border.campaign-package.json`
- Modify: `packages/bundled/aster-vale/aster-vale-senior-staff.crew-dataset.json`
- Modify: `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- Modify: `packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json`
- Modify: `packages/bundled/celandine/enemys-garden.campaign-package.json`
- Modify: `packages/bundled/celandine/celandine-senior-staff.crew-dataset.json`
- Modify: `packages/bundled/eudora-vale/broken-accord.campaign-package.json`
- Modify: `packages/bundled/eudora-vale/eudora-vale-senior-staff.crew-dataset.json`
- Modify: `packages/bundled/glass-harbor/drowned-constellation.campaign-package.json`
- Modify: `packages/bundled/glass-harbor/glass-harbor-senior-staff.crew-dataset.json`
- Modify: `packages/bundled/serein/black-current.campaign-package.json`
- Modify: `packages/bundled/serein/serein-senior-staff.crew-dataset.json`
- Modify: matching package validators/generators under `tools/scripts/`
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-starfleet-service-marks.mjs`
- Create: `tools/scripts/test-expanded-people-view.mjs`
- Modify: `tools/scripts/validate-crew-dataset.mjs`
- Modify: `tools/scripts/test-rich-crew-runtime-hydration.mjs`
- Modify: `tools/scripts/test-player-facing-information.mjs`
- Modify: `tools/scripts/test-extension-shell.mjs`

**Interfaces:**
- `person.service = { organization, department, rankCode, rankLabel } | null`
- `resolveStarfleetPips(person) -> { division, rankLabel, pips } | null`
- `buildPeopleView(...) -> { selectedPersonId, categories, people }`

- [ ] Add failing schema/fixture tests that require explicit service metadata for Starfleet records, reject unknown rank/department codes, and never infer service marks from billet, role, name, category, or biography.
- [ ] Migrate bundled Starfleet people in place; keep non-Starfleet people service-null. Remove `crewDivision()` and rank-label parsing from presentation code.
- [ ] Project package crew, player-visible runtime crew, and encountered non-crew NPCs into one deduplicated People view with image ref, public identity, current involvement, known facts, relationship summary, and player-visible history.
- [ ] Implement protected baseline categories plus user categories, add/rename/reorder/remove, cross-category person moves, campaign-scoped persistence, and projection cleanup when authoritative records disappear.
- [ ] Render `240px` desktop roster, independent detail scrolling, phone accordions, package portraits, and shared department-colored Voyager pips in the exact approved positions.
- [ ] Test that category moves do not alter service marks, system categories and package-owned people cannot be deleted, non-Starfleet people receive no pips, and selection/reorder leaves campaign state unchanged.
- [ ] Run desktop/phone screenshot review for crops, pips, long names, independent scrolling, keyboard reorder, touch long-press, and reduced motion.

## Phase 5: Ship Operational Board

**Files:**
- Create: `src/ui/view-models/ship-view.mjs`
- Rewrite: `src/ui/ship-panel.js`
- Modify: `src/ui/player-facing-information.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/ui-preferences.mjs`
- Modify: `schemas/packages/ship.schema.json`
- Modify: `schemas/packages/ship-dataset.schema.json` only if capability presentation metadata cannot be expressed by existing player-safe fields
- Modify: bundled ship/package records under `packages/bundled/*` only where structured player-safe fields are missing
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-expanded-ship-view.mjs`
- Modify: `tools/scripts/test-ship-dataset-live.mjs`
- Modify: `tools/scripts/test-ship-panel-state-records.mjs`
- Modify: `tools/scripts/test-player-facing-information.mjs`

**Produces:** package identity/image, explicit condition/alert, committed operation, prioritized structured issues, and a small package-authored capability list.

- [ ] Write failing projection tests for omission of unknown values, issue priority, resolved-issue removal, no invented readiness/ETA, and capability selection from explicit package data rather than every ship system.
- [ ] Add the minimum structured state/schema needed for position, course, travel state, issue type/effect/status/owner/assignment/updated time, and player-relevant capabilities.
- [ ] Implement desktop hero + operation strip + two-column board and phone hero + open Issues/collapsed Capabilities disclosures.
- [ ] Reuse the shared reorder controller; capabilities remain non-expandable and issues use single-peer expansion.
- [ ] Test campaign+ship preference scoping, authoritative append/prune projection, keyboard/touch reorder, nearest-list autoscroll, and zero simulation mutation.
- [ ] Run dataset validators, ship-focused tests, all viewport checks, and live state-refresh proof after a structured ship issue changes.

## Phase 6: Settings, Providers, And Privacy-Safe Diagnostics

**Files:**
- Create: `src/ui/view-models/settings-view.mjs`
- Rewrite: `src/ui/settings-panel.js`
- Create: `src/runtime/support-diagnostics.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/hosts/sillytavern/chat-adapter.mjs`
- Modify: `src/hosts/sillytavern/host-factory.mjs`
- Modify: `src/providers/directive-provider-settings.mjs` only if the view cannot consume its current sanitized contracts directly
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-support-diagnostics.mjs`
- Create: `tools/scripts/test-expanded-settings-view.mjs`
- Modify: `tools/scripts/test-directive-provider-routing.mjs`
- Modify: `tools/scripts/test-sillytavern-generation-client.mjs`
- Modify: `tools/scripts/test-visual-system-foundation.mjs`

**Interfaces:**
- `buildSettingsView(...) -> { general, advanced: { preset, providers, roleRouting, diagnostics } }`
- `exportSupportDiagnostics({ includeStoryTranscript = false }) -> { fileName, payload }`
- Host chat: `getVisibleTranscript({ chatId, fullBranch: true }) -> [{ id, role, text, createdAt? }]`

- [ ] Write failing view tests for exactly two sections, General and Advanced, with no campaign-specific autosave, history, difficulty, Outcome Integrity, recovery, or active-campaign controls.
- [ ] Preserve current host profile/source, temperature, top-p, max-token, model, provider test, preset, and role-routing APIs; change composition and copy, not provider authority.
- [ ] Implement `directive.diagnostics.v1` from current sanitized version, binding-status/hash, provider, runtime, model-call, tracking, and storage views. Hash ids where identity is useful; omit raw state payloads.
- [ ] Add the explicit transcript opt-in. Export only player-visible user/assistant text from the active visible branch; exclude hidden/system messages, prompts, swipe alternatives not currently selected, metadata blobs, credentials, endpoint URLs, and private reasoning.
- [ ] Replace `Export Active Save` in the normal Settings surface with `Export Diagnostics`; retain raw save export only as an intentionally separate developer API if tests/tools still require it.
- [ ] Run provider/profile/routing tests, diagnostics privacy fixtures containing canary secrets/prompts/hidden facts, and live SillyTavern provider-test plus transcript opt-in/opt-out downloads.

## Phase 7: Cross-Route Polish, Accessibility, And Obsolete-Code Removal

**Files:**
- Modify: all expanded route renderers and `styles/directive.css`
- Modify: `src/ui/expanded-interface-focus.js`
- Modify: `src/ui/responsive-record-list.js`
- Modify: `src/ui/reorderable-collection.js`
- Modify: `tools/scripts/test-expanded-interface-shell.mjs`
- Modify: `tools/scripts/test-player-facing-ui-playwright.mjs`
- Modify: `tools/scripts/capture-runtime-route-live.mjs`
- Modify: `tools/scripts/smoke-sillytavern-live.mjs`
- Modify: `docs/testing/TESTING_STRATEGY.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`

- [ ] Add roving focus within the route bar, Home/End and arrow navigation, focus restoration after rerender/reorder/delete, modal focus trapping, Escape hierarchy, and live-region feedback.
- [ ] Add optional controller mapping only after the approved controller decision: route bumpers, D-pad/left-stick focus movement, confirm, cancel, and no controller-only action.
- [ ] Verify `prefers-reduced-motion`, 44px phone targets, scroll/touch separation, text zoom, high-contrast focus, semantic headings, names/labels, and no keyboard traps.
- [ ] Remove unused old panel helpers, route subtabs, command-spine selectors, drawer geometry tests, stale documentation renders, and obsolete route vocabulary. Search for `commandSpine`, `directive-command-spine`, `directive-command-drawer`, `Save Game As`, `Load Campaign`, visible `Crew`, and removed route ids.
- [ ] Split `styles/directive.css` only if the phase can preserve manifest loading and test ownership coherently; otherwise delete obsolete blocks in place and keep one stylesheet for this integration.
- [ ] Capture and visually review every route at all four target viewports, including long-content and empty/error/recovery fixtures.

## Phase 8: Host Certification And Full Gate

**Files:**
- Modify: `tools/scripts/run-alpha-gate.mjs`
- Modify: `tools/scripts/smoke-sillytavern-live.mjs`
- Modify: `tools/scripts/test-player-facing-ui-playwright.mjs`
- Create or update: phase evidence under `artifacts/expanded-interface/` during execution only

- [ ] Run every phase-focused test and `node tools/scripts/test-expanded-interface-mockup.mjs`.
- [ ] Run `node tools/scripts/test-player-facing-ui-playwright.mjs --live` against the actually served extension copy at all four viewports, capture screenshots, and assert shell/document overflow, internal scrollers, stable nav, focus, keyboard, touch, and route functionality.
- [ ] Prove real SillyTavern Open Chat, Save Game, repeated Load Game, Delete Save, provider tests, diagnostics export, asset resolution, prompt rebuild, and interrupted checkpoint recovery.
- [ ] Confirm the served/installed extension hashes match the repository files before trusting live evidence.
- [ ] Run `npm.cmd test` and do not weaken runtime, hidden-state, provider, or prompt contracts to make the UI pass.
- [ ] Review final screenshots against the approved mockup and contract; record any deliberate variance in the living contract before completion.

---

## Recommended First Implementation Slice

Implement Phase 0 and Phase 1 together as the first approval-sized slice.

This is the correct foundation because the current five-route registry and runtime action adapter can survive the shell replacement, while every approved route depends on the same viewport, route-bar, scrollbar, accordion, reorder, focus, and preference contracts. It also creates an immediate, testable user-visible improvement without prematurely coupling the shell to incomplete Campaign checkpoint or People schema work. Campaign follows next because it is the first route in the product flow and is the only route whose approved UI requires a new cross-storage/host runtime transaction.

The validated sequence is therefore:

1. Contract reconciliation + expanded shell/shared primitives/preferences.
2. Campaign + checkpoint runtime.
3. Mission.
4. People.
5. Ship.
6. Settings.
7. Cross-route accessibility/polish/removal.
8. Live host certification/full gate.

Mission precedes People because a player-safe quest projection and UI-only selection already exist and need extension rather than a package-schema migration. People follows because its correct implementation requires explicit service metadata and an encountered-NPC projection. Ship follows People because it reuses the same record ordering/expansion foundation but needs additional structured operational state. Settings is last among routes because current provider contracts are reusable and its largest new risk is isolated diagnostics privacy, not core navigation.

## Approval Decisions Still Required

1. **Empty People categories:** recommend omitting empty protected baseline categories until they contain a person; preserve their definitions in preferences so they appear deterministically when populated.
2. **New Campaign entry:** recommend the mockup's `+` button open a focused chooser with Create from Package and Import Package, rather than placing import controls in the normal campaign detail.
3. **Checkpoint retention:** recommend no manual-checkpoint cap in pre-alpha and keep autosaves invisible; add retention only when real storage evidence justifies it.
4. **Controller mapping:** recommend left/right bumper route switching, D-pad/left-stick roving focus, confirm to activate, and cancel to collapse/close; mouse, touch, and keyboard remain complete without a controller.
5. **Legacy save disposition:** recommend an explicit one-time pre-alpha cutover that preserves existing active timelines but does not relabel mutable branches as immutable checkpoints. Existing branches may remain loadable through a migration utility or be intentionally discarded, but the choice must be made before Phase 2 implementation.

## Principal Risks

- Checkpoint creation/load crosses SillyTavern chat persistence, Directive storage indexes, CORE v2, prompt lifecycle, and active binding. Without a persisted operation journal, partial failure can orphan chats or point prompts at the wrong timeline.
- The current CSS file contains many late override layers. Appending another full redesign layer would make viewport behavior fragile; each route phase must delete the selectors it replaces.
- Current People service marks parse rank/billet prose, and bundled schemas lack structured service metadata. Styling the existing values would violate the approved authority contract.
- Current player-facing projections silently omit tasks, encountered NPCs, ship operation, structured issue detail, and several campaign fields. Panels must not compensate by parsing prose or inventing values.
- Existing UI tests strongly assert old shell and Settings behavior. They are useful migration sentinels but must be rewritten alongside each intentional cutover, not treated as immutable product requirements.
- Live SillyTavern may serve an installed extension copy rather than this checkout. Repository-only screenshots are insufficient evidence for chat, checkpoint, provider, transcript, or asset behavior.
