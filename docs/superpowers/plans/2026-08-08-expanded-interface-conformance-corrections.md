# Expanded Interface Conformance Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Restore the remaining Campaign, Mission, and People conformance failures, prove immediate route switching, and certify the actual `default-user` extension copy.

**Architecture:** Keep the existing expanded shell and route renderers. Add a pure shared mission-identity resolver, merge player-safe People sources by ID, reuse Directive's existing portrait service, repair the shared reorder/tooltip primitives, and make route selection render from the last completed runtime view without invoking authoritative refresh work.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, Playwright, DOM/CSS, SillyTavern extension runtime, PowerShell/robocopy on Windows.

## Global Constraints

- Preserve every existing modified file and untracked workspace-support directory; do not reset or check out older revisions.
- Do not edit `docs/design/mockups/directive-expanded-interface.html`; its verified blob is `954d50e508772557fd827d93c58c0b442888cacb`.
- Production must not contain mockup records, `/files/...` URLs, prototype controllers, or fake responses.
- Project only explicit player-visible fields; reject director-only, hidden, private-reasoning, and uncommitted records.
- Route selection, expansion, collapse, and ordering remain presentation-only.
- Collapsed chevrons point right; expanded chevrons point down; rotation is centered and animated for `140ms` unless reduced motion is requested.
- Mission renders `MAIN QUEST` above `A Ship Underway`; no `PRELUDE`, raw slug, or literal quotation marks are added.
- People person-record drag previews use `opacity: 0.5` and keep the pointer over the cloned handle center.
- Mobile visual tooltips are universally disabled while accessible descriptions remain.
- Run each change through one-test-at-a-time Red/Green/Refactor.
- Synchronize only production extension files to `F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive`; exclude `.git`, `node_modules`, artifacts, test output, `.codex-remote-attachments`, and `.worktrees`.

---

### Task 1: Authoritative Mission Identity And Merged People Projection

**Files:**
- Create: `src/ui/mission-display-identity.mjs`
- Modify: `src/ui/player-facing-information.mjs`
- Modify: `src/ui/view-models/campaign-view.mjs`
- Test: `tools/scripts/test-player-facing-information.mjs`
- Test: `tools/scripts/test-expanded-campaign-view.mjs`

**Interfaces:**
- Produces: `resolveMissionDisplayIdentity({ missionId, explicitTitle, questLedger, packageData, missionGraphs }) => { id, title }`
- Produces: People records with `isPlayer`, merged identity/service/image/involvement/facts/relationship/history fields.
- Consumes: current quest ledger, package quest templates/campaign quests, mission graph manifests, and visible runtime records.

- [x] **Step 1: Add one failing mission-title projection assertion**

Add a `prelude-a-ship-underway` mission whose sparse mission object has no title, plus a quest-ledger instance titled `A Ship Underway`, then assert:

```js
assert.equal(information.quests[0].title, 'A Ship Underway');
assert.doesNotMatch(JSON.stringify(information.quests), /prelude-a-ship-underway(?=["'])/);
```

- [x] **Step 2: Run the focused test and observe the expected raw-ID failure**

Run: `node tools/scripts/test-player-facing-information.mjs`

Expected: FAIL because `projectQuest()` currently falls back to the mission ID.

- [x] **Step 3: Implement the pure mission resolver and connect main-quest projection**

Create and export:

```js
export function resolveMissionDisplayIdentity({
  missionId = '',
  explicitTitle = '',
  questLedger = null,
  packageData = null,
  missionGraphs = []
} = {})
```

Choose the first non-ID title from a matching quest-ledger instance, package quest/campaign template, mission graph manifest, or explicit state title. Humanize the ID only when no authored title exists.

- [x] **Step 4: Re-run the focused projection test and observe green**

Run: `node tools/scripts/test-player-facing-information.mjs`

Expected: PASS.

- [x] **Step 5: Add one failing Campaign chapter fallback assertion**

Create save metadata with `activeMissionId: 'prelude-a-ship-underway'`, no `activeMissionTitle`, and package campaign quest metadata containing `{ id: 'prelude-a-ship-underway', title: 'A Ship Underway' }`. Assert `campaign.chapter === 'A Ship Underway'`.

- [x] **Step 6: Run the Campaign view test and observe the expected raw-ID failure**

Run: `node tools/scripts/test-expanded-campaign-view.mjs`

Expected: FAIL because Campaign currently prefers `activeMissionId` directly.

- [x] **Step 7: Use the shared resolver in Campaign and re-run green**

Pass the save's active mission ID, explicit title fields, and matched package context into `resolveMissionDisplayIdentity()` before assigning `chapter`.

Run: `node tools/scripts/test-expanded-campaign-view.mjs`

Expected: PASS.

- [x] **Step 8: Add one failing sparse-plus-rich People merge assertion**

Provide the same person ID in sparse `crewDataset.officers` and richer package/runtime sources. Assert the final record preserves the sparse identity while gaining service, involvement, facts, relationship, history, and `isPlayer` where applicable. Include a hidden linked record and assert its text is absent.

- [x] **Step 9: Run the People projection test and observe first-wins failure**

Run: `node tools/scripts/test-player-facing-information.mjs`

Expected: FAIL because the first sparse source currently suppresses richer later sources.

- [x] **Step 10: Replace first-wins person projection with field-aware merge**

Collect sources by stable ID, merge stable package identity with player-safe runtime state, deduplicate facts/history, normalize service metadata, and attach only records that pass `recordVisibility()`.

- [x] **Step 11: Re-run focused projection tests and refactor while green**

Run:

```powershell
node tools/scripts/test-player-facing-information.mjs
node tools/scripts/test-expanded-campaign-view.mjs
node tools/scripts/test-quest-selection-ui-only.mjs
```

Expected: all PASS.

### Task 2: Player Portrait Lifecycle In People

**Files:**
- Create: `src/ui/player-portrait-controls.js`
- Modify: `src/ui/people-journal.js`
- Modify: `src/ui/crew-panel.js`
- Modify: `styles/directive.css`
- Test: `tools/scripts/test-visual-system-foundation.mjs`
- Test: `tools/scripts/test-player-portrait-assets.mjs`
- Test: `tools/scripts/test-mobile-route-composition.mjs`

**Interfaces:**
- Consumes: `createPlayerPortraitImage()`, `DIRECTIVE_COMM_BADGE_ICON`, `actions.importPlayerPortrait`, `actions.removePlayerPortrait`, `actions.refresh`.
- Produces: editable selected-player portrait on desktop and phone; non-editable NPC portraits.

- [x] **Step 1: Add one failing People portrait source contract**

Assert that `people-journal.js` imports and calls `createPlayerPortraitImage`, references `DIRECTIVE_COMM_BADGE_ICON`, and contains real import/remove action bindings.

- [x] **Step 2: Run the source contract and observe failure**

Run: `node tools/scripts/test-visual-system-foundation.mjs`

Expected: FAIL because the People journal uses only the generic package image path.

- [x] **Step 3: Reuse the production portrait renderer and controls**

Pass `actions` through `renderCrewPanel()` to `renderPeopleJournal()`. For `person.isPlayer`, resolve `view.playerCharacterView || view.loadedPlayerCharacterView`, render its portrait with the comm badge fallback, and expose a hidden `input[type=file]` accepting PNG/JPEG/WebP plus Import/Change and conditional Remove buttons wired to real runtime actions.

- [x] **Step 4: Re-run portrait contracts and observe green**

Run:

```powershell
node tools/scripts/test-visual-system-foundation.mjs
node tools/scripts/test-player-portrait-assets.mjs
node tools/scripts/test-mobile-route-composition.mjs
```

Expected: all PASS.

- [x] **Step 5: Add DOM assertions to deterministic visual coverage**

Assert that an empty player portrait contains `[data-asset-icon="assets/icons/comm-badge.svg"]`, contains no generic image icon, and exposes Import but not Remove; a populated portrait exposes Change and Remove.

- [x] **Step 6: Run the visual test and preserve its red result for missing fixture state**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL until the fixture supplies explicit empty/populated player portrait states and action capabilities.

- [x] **Step 7: Extend the fixture and People CSS minimally, then re-run green**

Use fixture-only runtime view/action data. Keep desktop actions inside the portrait frame and phone actions reachable below/within the compact portrait without covering content.

### Task 3: Drag Anchoring, Preview Opacity, Handle Alignment, And Chevrons

**Files:**
- Modify: `src/ui/expanded-interface-reorder.js`
- Modify: `src/ui/people-journal.js`
- Modify: `src/ui/mission-quest-journal.js`
- Modify: `styles/directive.css`
- Test: `tools/scripts/test-expanded-interface-reorder-contract.mjs`
- Test: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Extends: `bindPresentationReorderHandle(handle, { previewSelector, ...existingOptions })`.
- Produces: a preview whose cloned handle center tracks pointer X/Y and whose People opacity is `0.5`.

- [x] **Step 1: Add one failing reorder-controller contract**

Assert the controller computes handle-center offsets, updates both `left` and `top`, supports `previewSelector`, and treats touch and pen as long-press inputs.

- [x] **Step 2: Run the reorder contract and observe failure**

Run: `node tools/scripts/test-expanded-interface-reorder-contract.mjs`

Expected: FAIL because only `top` changes and only touch uses the delay.

- [x] **Step 3: Implement centered two-axis preview anchoring**

At activation, measure the selected preview element and handle. Store the handle center relative to the preview. On movement set:

```js
ghost.style.left = `${event.clientX - state.handleCenterX}px`;
ghost.style.top = `${event.clientY - state.handleCenterY}px`;
```

Clone only `.mobile-accordion-head` for expanded phone records and the full visible desktop list record for desktop People rows. Preserve placeholder, cancellation, auto-scroll, and keyboard behavior.

- [x] **Step 4: Re-run the reorder contract and observe green**

Run: `node tools/scripts/test-expanded-interface-reorder-contract.mjs`

Expected: PASS.

- [x] **Step 5: Add one failing computed-style/geometry assertion**

In Playwright, verify desktop People handle vertical centers match row centers, the preview opacity is `0.5`, the cloned handle center remains within `2px` of the pointer, collapsed/expanded chevrons have the expected matrices, and transform origin is centered.

- [x] **Step 6: Run visual conformance and observe the expected CSS/geometry failure**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

- [x] **Step 7: Apply minimal CSS and shared chevron primitive changes**

Set People person handles to `align-self: center`, use a People preview modifier at `opacity: .5`, and give SVG chevrons `transform-origin: 50% 50%`, `transform-box: fill-box`, and the approved `140ms` transition with reduced-motion suppression.

- [x] **Step 8: Re-run interaction and visual tests green**

Run:

```powershell
node tools/scripts/test-expanded-interface-reorder-contract.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

### Task 4: Universal Mobile Tooltip Suppression

**Files:**
- Modify: `src/ui/runtime-ui-kit.js`
- Modify: `src/runtime/runtime-shell.js`
- Modify: `src/ui/campaign-panel.js`
- Modify: `src/ui/people-journal.js`
- Modify: `src/ui/settings-panel.js`
- Test: `tools/scripts/test-visual-system-foundation.mjs`
- Test: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Produces: `isMobileRuntimeTooltipSurface()` decision shared by native, hover, and focus tooltip paths.
- Preserves: `data-directive-tooltip`, `aria-label`, `aria-description`, and explicit guidance/tutorial UI.

- [x] **Step 1: Add one failing touch-origin focus contract**

Assert the tooltip kit records pointer modality before focus and suppresses visual tips for touch/pen, phone width, coarse pointers, no-hover media, and mobile shell ancestry.

- [x] **Step 2: Run the tooltip contract and observe failure**

Run: `node tools/scripts/test-visual-system-foundation.mjs`

- [x] **Step 3: Implement one shared mobile-input predicate**

Install one capture-phase input-modality listener, make `showFloatingTooltip()`, `shouldUseFloatingTooltip()`, and native-title assignment consult the same predicate, and hide any visible tooltip when a touch/pen interaction begins.

- [x] **Step 4: Replace remaining direct `title` assignments in the expanded shell scope**

Use `addTooltip()` so accessible descriptions remain while native titles cannot bypass mobile suppression.

- [x] **Step 5: Re-run source and phone Playwright coverage green**

Run:

```powershell
node tools/scripts/test-visual-system-foundation.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

### Task 5: Immediate Retained-View Route Switching

**Files:**
- Modify: `src/runtime/runtime-shell.js`
- Test: `tools/scripts/test-runtime-shell-creator-flow.mjs`
- Test: `tools/scripts/test-extension-shell.mjs`
- Test: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Adds: module-local `lastCompletedRuntimeView` retained after successful `getRuntimeView()`.
- Produces: presentation-only `selectRouteFromSpine()` that renders from the retained view without calling `getCurrentView()`.
- Preserves: full `refreshDirectiveRuntimePanel()` for initial opening and real runtime/host changes.

- [x] **Step 1: Add one failing route-switch call-count assertion**

Initialize the runtime shell, record `getCurrentView()` call count after its first render, click Campaign/Mission/People/Ship/Settings, and assert the count does not increase while route content and `data-active-route` update.

- [x] **Step 2: Run the runtime-shell test and observe failure**

Run: `node tools/scripts/test-runtime-shell-creator-flow.mjs`

Expected: FAIL because every route click awaits `refreshDirectiveRuntimePanel()`.

- [x] **Step 3: Retain successful views and split presentation render from authoritative refresh**

Refactor `renderBody()` so it can render an explicitly supplied view without clearing first. Make route selection update shell chrome and call the retained-view renderer synchronously. If no retained view exists, start/await the normal refresh. Keep request-ID stale-response protection.

- [x] **Step 4: Re-run route-shell tests green**

Run:

```powershell
node tools/scripts/test-runtime-shell-creator-flow.mjs
node tools/scripts/test-extension-shell.mjs
```

- [x] **Step 5: Add one failing next-animation-frame browser assertion**

Measure route click to `data-active-route` plus target route content. Assert it completes by the next animation frame and that the fixture runtime-view fetch counter is unchanged.

- [x] **Step 6: Run and make visual/performance coverage green**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

### Task 6: Full-Width Geometry, Certification, Integration, And Installed Copy

**Files:**
- Modify: `styles/directive.css`
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `docs/superpowers/specs/2026-08-08-expanded-interface-conformance-corrections-design.md`
- Modify: `docs/superpowers/plans/2026-08-08-expanded-interface-conformance-corrections.md`

**Interfaces:**
- Produces: strict screenshots and DOM measurements at `1440x900`, `1024x768`, `390x844`, and `360x800`.
- Produces: synchronized `default-user` extension matching pushed `main` production files.

- [x] **Step 1: Add failing master/detail width assertions**

Assert Campaign and People route layouts fill their route-body width, keep approved master tracks, allocate the remainder to `minmax(0, 1fr)`, and introduce no document horizontal overflow.

- [x] **Step 2: Run visual conformance and observe any remaining width failure**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

- [x] **Step 3: Remove only conflicting maximum widths and repair grid containment**

Preserve approved `240px` desktop People roster, `210px` tablet roster, portrait tracks, phone accordion composition, independent scroll regions, and bottom route-bar clearance.

- [x] **Step 4: Run all focused correction tests**

Run:

```powershell
node tools/scripts/test-player-facing-information.mjs
node tools/scripts/test-expanded-campaign-view.mjs
node tools/scripts/test-player-portrait-assets.mjs
node tools/scripts/test-expanded-interface-reorder-contract.mjs
node tools/scripts/test-visual-system-foundation.mjs
node tools/scripts/test-mobile-route-composition.mjs
node tools/scripts/test-runtime-shell-creator-flow.mjs
node tools/scripts/test-extension-shell.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: all PASS.

- [x] **Step 5: Run the complete repository gate**

Run: `npm.cmd test`

Expected: PASS with no failing alpha-gate checks.

- [x] **Step 6: Review the complete diff and frozen blob before integration**

Run:

```powershell
git diff --check
git status -sb
git rev-parse HEAD:docs/design/mockups/directive-expanded-interface.html
```

Expected blob: `954d50e508772557fd827d93c58c0b442888cacb`.

- [x] **Step 7: Commit intentionally on `main` and push**

Stage only the reviewed production, test, plan, and specification files. Do not stage `.codex-remote-attachments/` or `.worktrees/`.

```powershell
git add docs/superpowers/specs/2026-08-08-expanded-interface-conformance-corrections-design.md docs/superpowers/plans/2026-08-08-expanded-interface-conformance-corrections.md src/ui/mission-display-identity.mjs src/ui/player-facing-information.mjs src/ui/view-models/campaign-view.mjs src/ui/people-journal.js src/ui/crew-panel.js src/ui/player-portrait-controls.js src/ui/expanded-interface-reorder.js src/ui/mission-quest-journal.js src/ui/runtime-ui-kit.js src/runtime/runtime-shell.js src/ui/campaign-panel.js src/ui/settings-panel.js styles/directive.css tools/fixtures/expanded-interface-runtime-fixture.mjs tools/scripts/test-player-facing-information.mjs tools/scripts/test-expanded-campaign-view.mjs tools/scripts/test-visual-system-foundation.mjs tools/scripts/test-mobile-route-composition.mjs tools/scripts/test-expanded-interface-reorder-contract.mjs tools/scripts/test-runtime-shell-creator-flow.mjs tools/scripts/test-extension-shell.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "fix(ui): complete expanded interface conformance"
git push origin main
```

- [x] **Step 8: Synchronize production files to `default-user`**

Use `robocopy` with `/E` and exclusions for `.git`, `node_modules`, artifacts, test output, `.codex-remote-attachments`, and `.worktrees`. Accept robocopy exit codes `0-7` only.

- [x] **Step 9: Verify repository, remote, and installed-copy identity separately**

Confirm local and remote `main` SHAs match. Hash every synchronized production file in the repository and installed extension and assert no mismatches or unexpected production files.

- [x] **Step 10: Run installed-copy/live-host certification**

Exercise all five routes at desktop and phone widths, portrait import/change/remove, mouse/touch/keyboard reorder, centered chevrons, mobile tooltip suppression, route-switch timing, Campaign Open Chat/Save/Load/Delete, Settings provider controls, diagnostics download, internal scroll regions, and document overflow.

- [x] **Step 11: Record plan completion**

Change every completed checkbox in this plan to `[x]`, update the design specification status to `Implemented and certified`, and include exact test, SHA, sync, and live-host evidence in the final handoff.

## Completion Evidence — 2026-08-09

- Frozen mockup blob: `954d50e508772557fd827d93c58c0b442888cacb`.
- Focused projection, Campaign, reorder, shell, creator-flow, and visual-system tests passed.
- Strict Playwright screenshot and DOM conformance passed for all five routes at `1440x900`, `1024x768`, `390x844`, and `360x800`.
- Full repository gate: `npm.cmd test` passed all 235 checks.
- Integrated commit: `0ec4a12066584c54157ea81f56f1073a00bcdf94`; local and GitHub `main` matched before installed-copy certification.
- Production-only `default-user` sync verified 896 repository files with zero missing files or hash mismatches.
- Live SillyTavern certification opened the installed runtime, activated Campaign, Mission, People, Ship, and Settings, confirmed the authored `A Ship Underway` chapter title, loaded the corrected stylesheet rules, preserved internal route scrolling, and measured zero document-level horizontal overflow.
