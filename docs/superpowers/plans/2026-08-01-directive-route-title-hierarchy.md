# Directive Route Title Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the duplicated inner page layers so the expanded Directive shell has one route identity and content begins directly below the shell topbar.

**Architecture:** Keep route identity in `directive-expanded-shell.js` through the existing topbar brand and route path. Remove the shell’s colored route-heading element and remove page-level `appendSectionTitle()` calls from the route renderers; meaningful card and section headings remain in each route’s content. Clean the corresponding CSS and lock the behavior with deterministic contracts plus live Playwright verification.

**Tech Stack:** Vanilla browser DOM modules, shared CSS, Node.js ESM contract scripts, Playwright live smoke harness, SillyTavern installed extension copy.

## Global Constraints

- The shell topbar/path is the sole route page identity.
- Route content must not begin with `directive-runtime-section-title`.
- Preserve route navigation, focus behavior, route path updates, `data-route-view`, actions, state, and persistence.
- Preserve meaningful content headings such as card titles, disclosure summaries, and saved-game labels.
- Do not add dependencies or modify SillyTavern user data.

---

### Task 1: Add failing title-hierarchy contracts

**Files:**
- Modify: `tools/scripts/test-expanded-interface-shell.mjs`
- Create: `tools/scripts/test-route-title-hierarchy.mjs`

**Interfaces:**
- Consumes: `createDirectiveExpandedShell()` and route renderer source files.
- Produces: deterministic checks that reject the duplicate shell heading and route-level page titles.

- [ ] **Step 1: Write the failing shell assertion**

Extend the fake-DOM shell contract to assert that the rendered tree contains no element whose class includes `directive-route-heading`, while still requiring the topbar route path and runtime body.

- [ ] **Step 2: Write the failing route-render contract**

Create a Node script that reads `src/ui/campaign-panel.js`, `src/ui/character-creator-panel.js`, `src/ui/mission-panel.js`, `src/ui/crew-panel.js`, `src/ui/ship-panel.js`, and `src/ui/settings-panel.js`, then asserts each file contains no `appendSectionTitle` import or call. Keep `src/ui/runtime-ui-kit.js` out of this list so the helper remains available to non-route surfaces.

- [ ] **Step 3: Run the focused contracts and verify they fail**

Run:

```powershell
node tools/scripts/test-expanded-interface-shell.mjs
node tools/scripts/test-route-title-hierarchy.mjs
```

Expected: the new assertions fail against the current duplicated markup/imports.

### Task 2: Remove duplicate shell and renderer title layers

**Files:**
- Modify: `src/ui/directive-expanded-shell.js`
- Modify: `src/runtime/runtime-shell.js`
- Modify: `src/ui/campaign-panel.js`
- Modify: `src/ui/character-creator-panel.js`
- Modify: `src/ui/mission-panel.js`
- Modify: `src/ui/crew-panel.js`
- Modify: `src/ui/ship-panel.js`
- Modify: `src/ui/settings-panel.js`

**Interfaces:**
- Consumes: existing route definitions, route path updater, and renderer actions.
- Produces: the same shell and route behavior with no duplicate page-level title nodes.

- [ ] **Step 1: Remove the shell route-heading construction**

Delete the `directive-route-heading`, `directive-route-cap`, and `directive-route-name` construction from `createDirectiveExpandedShell()`. Keep `directive-route-path` in the topbar and keep the runtime body and route bar in the same order.

- [ ] **Step 2: Remove the obsolete route-name synchronization**

Delete the `directive-route-name` lookup/update in `syncShellChrome()` while leaving route-path synchronization unchanged.

- [ ] **Step 3: Remove page-level title insertion from route renderers**

For Campaign, Character Creator, Mission, Crew, Ship, and Settings, remove only the `appendSectionTitle` import and its top-level call. Do not remove nested headings or change render ordering after the removed call.

- [ ] **Step 4: Run the focused contracts and verify they pass**

Run:

```powershell
node tools/scripts/test-expanded-interface-shell.mjs
node tools/scripts/test-route-title-hierarchy.mjs
```

Expected: both scripts pass and existing route controls remain present.

### Task 3: Remove obsolete route-heading spacing and add route-body coverage

**Files:**
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-expanded-interface-shell.mjs`
- Modify: `tools/scripts/test-player-facing-ui-playwright.mjs`

**Interfaces:**
- Consumes: the simplified shell DOM from Task 2.
- Produces: content-first route layout with no blank strip and live geometry assertions that identify the shell topbar as the only page chrome.

- [ ] **Step 1: Remove route-heading CSS**

Delete the `.directive-route-heading`, `.directive-route-cap`, and `.directive-route-name` rules and the mobile-only route-heading override. Keep `.directive-route-body` scrolling and spacing rules intact, adjusting only its top padding if needed to keep the first content block visually separated from the topbar.

- [ ] **Step 2: Extend deterministic CSS/DOM contracts**

Require the route-heading selectors to be absent from the expanded-shell source/CSS contract and keep assertions for route path, body, five route controls, and mobile route-body behavior.

- [ ] **Step 3: Extend the live smoke to prove content-first structure**

In `inspectViewport()`, after opening the overlay, assert that `.directive-route-heading` is absent and that the first visible content child under `[data-directive-runtime-body="true"]` is not `.directive-runtime-section-title`. Preserve the existing route, overflow, geometry, and disclosure checks.

- [ ] **Step 4: Run focused UI checks**

Run:

```powershell
node tools/scripts/test-expanded-interface-shell.mjs
node tools/scripts/test-route-title-hierarchy.mjs
node tools/scripts/test-player-facing-ui-playwright.mjs
git diff --check
```

Expected: all focused checks pass and dry-run reports `status: "skipped"`.

### Task 4: Verify full repository and live host behavior

**Files:**
- Modify: none
- Verify: `F:\SillyTavern\SillyTavern\data\directive-soak-a\extensions\Directive`

**Interfaces:**
- Consumes: committed implementation and the dedicated non-human soak account.
- Produces: alpha-gate and live multi-viewport evidence for all five routes.

- [ ] **Step 1: Run the full alpha gate**

Run `node tools/scripts/run-alpha-gate.mjs` and require exit code 0 with all checks passed.

- [ ] **Step 2: Sync only production extension files into the approved soak user**

Synchronize `assets`, `content`, `packages`, `presets`, `schemas`, `src`, `styles`, and `manifest.json` into the soak extension copy without touching chats, saves, preferences, or other user data.

- [ ] **Step 3: Run live Playwright verification**

Run `tools/scripts/test-player-facing-ui-playwright.mjs --live` against `directive-soak-a` and verify desktop, tablet, and both phone sizes. Require all five route ids, no duplicate route heading, no horizontal overflow, bounded geometry, and closed settings disclosures.

- [ ] **Step 4: Commit the implementation**

```powershell
git add src/ui/directive-expanded-shell.js src/runtime/runtime-shell.js src/ui/campaign-panel.js src/ui/character-creator-panel.js src/ui/mission-panel.js src/ui/crew-panel.js src/ui/ship-panel.js src/ui/settings-panel.js styles/directive.css tools/scripts/test-expanded-interface-shell.mjs tools/scripts/test-route-title-hierarchy.mjs tools/scripts/test-player-facing-ui-playwright.mjs
git commit -m "fix(ui): remove nested route pages"
```
