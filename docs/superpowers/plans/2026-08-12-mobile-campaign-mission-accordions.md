# Mobile Campaign and Mission Accordions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cramped phone Campaign and Mission split panes with accessible, single-scroll disclosure lists while leaving widths above `640px` unchanged.

**Architecture:** Keep the existing desktop master/detail nodes and add phone-only disclosure compositions beside them. A small shared disclosure controller changes `aria-expanded` and panel hidden state in place; each route supplies its record content and selection synchronization. CSS switches compositions only inside `@media (max-width: 640px)`.

**Tech Stack:** Browser JavaScript modules, DOM APIs, CSS media queries, Node assertion scripts, Playwright browser conformance.

## Global Constraints

- Every behavior and visual change is confined to phone widths of `640px` or less.
- Widths above `640px` retain the existing route heading, master/detail layout, two visible scroll owners, index headers, and navigation styling.
- Phone Campaign and Mission each have exactly one visible declared scroll owner.
- Disclosure updates happen in place and preserve list identity, scroll offset, and trigger focus.
- Only one record may be expanded; tapping it again collapses all.
- Keep all existing Campaign actions, facts, coming-later behavior, and Mission player-safe content.
- Add no dependency and no compatibility layer.

---

### Task 1: Shared controlled-disclosure behavior

**Files:**
- Create: `src/ui/mobile-record-disclosure.js`
- Create: `tools/scripts/test-mobile-record-disclosure.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `{ records: Array<{ key: string, trigger: HTMLElement, panel: HTMLElement }>, initialOpenKey?: string, onOpen?: (key: string) => void }`.
- Produces: `bindSingleOpenDisclosure(options)`, whose trigger handlers keep at most one panel open and return a controller exposing `getOpenKey()` and `setOpenKey(key)`.

- [ ] **Step 1: Write the failing controller test**

Create fake buttons and panels, bind two records, and assert initial state, open-switch, collapse-all, stable trigger/panel identity, and `onOpen` calls. The test must expect `aria-expanded`, `hidden`, and focus to change without replacing nodes.

- [ ] **Step 2: Run the test to verify RED**

Run: `node tools/scripts/test-mobile-record-disclosure.mjs`

Expected: FAIL because `src/ui/mobile-record-disclosure.js` does not exist.

- [ ] **Step 3: Implement the minimal controller**

Implement `bindSingleOpenDisclosure` so `setOpenKey` normalizes unknown or repeated keys to collapse-all, patches every trigger/panel in place, and invokes `onOpen` only for a newly opened key. Trigger click handlers call `setOpenKey(record.key === openKey ? null : record.key)`.

- [ ] **Step 4: Register and run the focused test**

Add the script to the `npm.cmd test` chain beside the other UI contracts.

Run: `node tools/scripts/test-mobile-record-disclosure.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/mobile-record-disclosure.js tools/scripts/test-mobile-record-disclosure.mjs package.json
git commit -m "feat(ui): add mobile disclosure controller"
```

---

### Task 2: Campaign phone disclosure composition

**Files:**
- Modify: `src/ui/campaign-panel.js`
- Modify: `src/ui/view-models/certified-campaign-view.mjs`
- Modify: `tools/scripts/test-certified-campaign-panel.mjs`

**Interfaces:**
- Consumes: `bindSingleOpenDisclosure`, `appendCampaignDetail`, `appendPackageDetail`, and Campaign records containing `id`, `active`, and `lastPlayedAt`.
- Produces: `.campaign-mobile-accordion[data-directive-scroll-owner="true"]`, `.campaign-mobile-record`, `.campaign-mobile-trigger`, and `.campaign-mobile-detail`; `lastPlayedCampaignId` from `buildCertifiedCampaignView`.

- [ ] **Step 1: Write failing Campaign DOM regressions**

Extend the fixture with two Campaigns whose active record is older than the other record. Assert that `lastPlayedCampaignId` identifies the greatest valid `lastPlayedAt`, its trigger begins expanded, every trigger controls one detail, the existing desktop master/detail still exists, and the phone list is the only phone-specific scroll owner.

Click a second trigger and then click it again. Assert one-open and collapse-all behavior, unchanged accordion identity, no `body.replaceChildren`, retained trigger focus, and synchronized desktop active row/detail.

- [ ] **Step 2: Run the Campaign test to verify RED**

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Expected: FAIL because the phone accordion and last-played selection are absent.

- [ ] **Step 3: Add last-played normalization**

In `buildCertifiedCampaignView`, preserve `selectedCampaignId` and expose `lastPlayedCampaignId` by sorting only records with valid `lastPlayedAt` dates descending, then falling back to the active record.

- [ ] **Step 4: Build the phone Campaign list**

Refactor detail rendering behind a `renderCampaignRecordDetail(detail, key, model, actions)` helper used by desktop and mobile. Render saved/current Campaign triggers, a compact `Campaign Library` separator, and package triggers. Give each panel a stable encoded ID, bind the shared controller with the approved default, and patch desktop selected row/detail when a phone record opens. Do not rerender on disclosure.

- [ ] **Step 5: Run the focused tests to verify GREEN**

Run: `node tools/scripts/test-certified-campaign-view.mjs`

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Expected: both PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/campaign-panel.js src/ui/view-models/certified-campaign-view.mjs tools/scripts/test-certified-campaign-panel.mjs
git commit -m "feat(campaign): add mobile disclosure list"
```

---

### Task 3: Mission phone disclosure composition

**Files:**
- Modify: `src/ui/mission-panel.js`
- Modify: `tools/scripts/test-certified-mission-panel.mjs`

**Interfaces:**
- Consumes: `bindSingleOpenDisclosure` and `buildCertifiedMissionView(projection)`.
- Produces: `.mission-mobile-accordion[data-directive-scroll-owner="true"]`, `.mission-mobile-record`, `.mission-mobile-trigger`, and `.mission-mobile-detail`.

- [ ] **Step 1: Write failing Mission DOM regressions**

Assert that the current mission trigger starts expanded, owns a correctly linked detail, preserves every existing Mission section, collapses on a second click, retains focus, and never replaces the route body or accordion. Keep assertions that the existing desktop collection/detail composition remains present.

- [ ] **Step 2: Run the Mission test to verify RED**

Run: `node tools/scripts/test-certified-mission-panel.mjs`

Expected: FAIL because no phone Mission disclosure exists.

- [ ] **Step 3: Extract reusable detail rendering and add the phone list**

Move the current hero and section appends into `appendMissionDetail(detail, mission)`. Use it for the desktop detail and each phone panel, then bind the phone triggers with `model.selectedMissionId` as the initial open key. Do not add another title block.

- [ ] **Step 4: Run the Mission test to verify GREEN**

Run: `node tools/scripts/test-certified-mission-panel.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/mission-panel.js tools/scripts/test-certified-mission-panel.mjs
git commit -m "feat(mission): add mobile disclosure list"
```

---

### Task 4: Phone-only presentation and measured responsive proof

**Files:**
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-expanded-interface-shell.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `tools/scripts/test-certified-scroll-ownership.mjs`
- Modify: `tools/fixtures/certified-v1-ui-variances.json` only if the approved visible-owner count is recorded there.

**Interfaces:**
- Consumes: the desktop and phone classes produced by Tasks 2 and 3.
- Produces: a phone-only single-column disclosure layout and solid-color phone navigation states.

- [ ] **Step 1: Write failing CSS and browser assertions**

Assert the CSS contains phone-scoped rules that hide `.directive-route-heading`, desktop Campaign/Mission panes, and phone index headers; show the mobile accordions; and remove phone nav outlines/inset rings while keeping a solid route-color focus and active fill.

At all certified phone viewports assert one visible route scroll owner, a hidden route heading, no visible Campaign/Mission index header, full-width expanded content, disclosure/list identity and scroll retention, and solid no-ring navigation. At `1024x768` and `1440x900`, assert the route heading, desktop panes, index headers, two visible scroll owners, and current navigation geometry remain present.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `node tools/scripts/test-expanded-interface-shell.mjs`

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL on the missing phone-only presentation and changed owner counts.

- [ ] **Step 3: Implement phone-only CSS**

Inside `@media (max-width: 640px)`, hide `.directive-route-heading`, `.campaign-master`, `.campaign-detail`, `.mission-collection`, and the desktop `.mission-detail`; display each mobile accordion as the route's single scroll owner; style record triggers and nested details with their existing amber/lilac route accents; and override nav `outline`, `box-shadow`, and border-ring treatments with solid fills. Outside that media rule, hide the mobile accordions and change no existing rules.

- [ ] **Step 4: Run focused browser verification**

Run: `node tools/scripts/test-expanded-interface-shell.mjs`

Run: `node tools/scripts/test-certified-scroll-ownership.mjs`

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS at every certified phone, tablet, and desktop viewport.

- [ ] **Step 5: Inspect generated phone screenshots**

Open the Campaign and Mission artifacts at `390x844` and `360x500`. Confirm details use the shared list scroll, no duplicated title bars remain, touch targets are legible, and the bottom selected tab is solid without a ring. If artifact names are not viewport-specific, add explicit phone screenshots to the visual-conformance script before rerunning it.

- [ ] **Step 6: Run the complete gate**

Run: `npm.cmd test`

Expected: every focused check passes with no browser error or overflow regression.

- [ ] **Step 7: Commit**

```powershell
git add styles/directive.css tools/scripts/test-expanded-interface-shell.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs tools/scripts/test-certified-scroll-ownership.mjs tools/fixtures/certified-v1-ui-variances.json
git commit -m "fix(ui): simplify phone campaign and mission"
```

---

### Task 5: Final audit and publication

**Files:**
- Modify: `docs/superpowers/plans/2026-08-12-mobile-campaign-mission-accordions.md` only to mark completed checkboxes if desired.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: a verified `main` commit sequence pushed to `origin/main`.

- [ ] **Step 1: Audit the diff boundary**

Run: `git diff HEAD~4 -- src/ui styles/directive.css tools/scripts package.json`

Confirm no rule or behavior above `640px` changed, no unrelated dirty file is staged, and `.codex-remote-attachments/` remains untracked.

- [ ] **Step 2: Run fresh completion verification**

Run: `npm.cmd test`

Run: `git diff --check HEAD~4..HEAD`

Expected: the full gate exits zero and the committed diff has no whitespace errors.

- [ ] **Step 3: Push main**

Run: `git push origin main`

Expected: `origin/main` advances to the verified local `HEAD`.

- [ ] **Step 4: Verify local and remote identity**

Run: `git rev-parse HEAD`

Run: `gh api repos/{owner}/{repo}/commits/main --jq .sha`

Expected: the local and remote SHA values are identical, while the user's pre-existing `debug.log` and attachment changes remain untouched.
