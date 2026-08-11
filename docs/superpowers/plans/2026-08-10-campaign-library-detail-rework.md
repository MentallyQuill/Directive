# Campaign Library Detail Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose Campaign Library package details so artwork contains only the title or `Coming Later` plus title, while the full description, four player-safe campaign facts, and existing action occupy the body below.

**Architecture:** Extend the existing library teaser records with explicit structured campaign metadata, normalize that metadata into an ordered fact list in the certified Campaign view model, and render one shared below-hero body for playable and future packages. Keep all selection, availability, creator, saved-campaign, and checkpoint behavior unchanged.

**Tech Stack:** JavaScript ES modules, DOM rendering helpers, CSS Grid, Node.js assertions, Playwright Chromium, Git.

## Global Constraints

- Ashes of Peace hero text is only `Ashes of Peace`; remove `Playable in V1`.
- Future campaign heroes retain `Coming Later` immediately above their titles.
- Descriptions and facts render below the hero image.
- Facts appear in this order: `Era`, `Theater`, `Assignment`, `Your Role`.
- Do not expose mission count, chapter count, expected sessions, story arcs, quest templates, or any campaign-size signal.
- Only Ashes of Peace is playable in V1; future actions remain disabled and mutation-free.
- Saved/current campaign details and checkpoint behavior remain unchanged.
- Do not add legacy support, migrations, compatibility layers, or prose inference.

---

### Task 1: Add Explicit Library Facts To The Certified View

**Files:**
- Modify: `src/packages/bundled-package-registry.mjs:41-113`
- Modify: `src/ui/view-models/certified-campaign-view.mjs:10-28`
- Test: `tools/scripts/test-certified-campaign-view.mjs`

**Interfaces:**
- Consumes: library teaser fields `campaign.eraLabel`, `campaign.theater`, `ship.name`, `ship.class`, `playerRole.rank`, and `playerRole.billet`.
- Produces: `pack.facts`, an ordered array of `{ label: string, value: string }` entries for `Era`, `Theater`, `Assignment`, and `Your Role`, omitting entries with no value.

- [ ] **Step 1: Write the failing view-model assertions**

Add explicit metadata to both test packages and assert the normalized result:

```js
campaign: {
  highConcept: 'Current Ashes description.',
  eraLabel: '2376, Post-Dominion War',
  theater: 'Asterion Reach'
},
ship: { name: 'U.S.S. Breckenridge', class: 'Intrepid-class' },
playerRole: { rank: 'Commander', billet: 'Executive Officer' }
```

```js
assert.deepEqual(campaign.packages[0].facts, [
  { label: 'Era', value: '2376, Post-Dominion War' },
  { label: 'Theater', value: 'Asterion Reach' },
  { label: 'Assignment', value: 'U.S.S. Breckenridge, Intrepid-class' },
  { label: 'Your Role', value: 'Commander, Executive Officer' }
]);
```

Also mutate a source fact field after building the view and assert that the certified model remains unchanged.

- [ ] **Step 2: Run the focused view test and verify it fails**

Run: `node tools/scripts/test-certified-campaign-view.mjs`

Expected: FAIL because `facts` is not produced.

- [ ] **Step 3: Extend teaser metadata and normalize facts**

Change the teaser factory signature to accept `era`, `theater`, `shipClass`, `rank`, and `billet`, then store them in the existing semantic shapes:

```js
campaign: { title, highConcept: summary, eraLabel: era, theater },
ship: { id: shipId, name: shipName, class: shipClass },
playerRole: { rank, billet },
```

Populate the six approved records:

```text
Ashes of Peace          | 2376, Post-Dominion War | Asterion Reach          | Intrepid-class    | Commander | Executive Officer
Drowned Constellation   | 2373, Dominion War      | Nerine Reef             | Steamrunner-class | Commander | Executive Officer
Black Current           | 2376, Post-Dominion War | Vanta Wake              | Steamrunner-class | Commander | Executive Officer
Broken Accord           | 2378, Post-Dominion War | Ilyra System             | Intrepid-class    | Commander | Executive Officer
Unseen Border           | 2371                    | Lacuna March             | New Orleans-class | Commander | Executive Officer
Enemy's Garden          | 2376, Post-Dominion War | Cyradon Relief Cluster   | Norway-class      | Commander | Executive Officer
```

In `buildCertifiedCampaignView`, create facts only from these explicit fields:

```js
const fact = (label, value) => ({ label, value: String(value || '').trim() });
const facts = [
  fact('Era', pack.campaign?.eraLabel || pack.campaign?.openingYear),
  fact('Theater', pack.campaign?.theater),
  fact('Assignment', [pack.ship?.name, pack.ship?.class].filter(Boolean).join(', ')),
  fact('Your Role', [pack.playerRole?.rank, pack.playerRole?.billet].filter(Boolean).join(', '))
].filter(({ value }) => value);
```

Return `facts` on each cloned package record. Do not read `highConcept` to derive facts.

- [ ] **Step 4: Run the focused view test and verify it passes**

Run: `node tools/scripts/test-certified-campaign-view.mjs`

Expected: `PASS certified Campaign view`.

- [ ] **Step 5: Commit the data/view-model slice**

```text
feat(campaign): add library briefing facts
```

---

### Task 2: Move Package Copy Into A Shared Detail Body

**Files:**
- Modify: `src/ui/campaign-panel.js:147-176`
- Test: `tools/scripts/test-certified-campaign-panel.mjs`

**Interfaces:**
- Consumes: `pack.description`, `pack.facts`, `pack.disabled`, `pack.availability`, and existing `pack.actions`.
- Produces: `.campaign-library-hero` containing only availability status when required plus `h2`, followed by `.campaign-library-detail-body` containing description, `.campaign-library-facts`, and the existing primary action.

- [ ] **Step 1: Write failing DOM contract assertions**

Add structured metadata to the panel fixtures. Select the available library row and assert:

```js
const ashesHero = byClass(body, 'campaign-library-hero')[0];
assert.equal(textOf(ashesHero).trim(), 'Ashes of Peace');
assert.doesNotMatch(textOf(ashesHero), /Playable in V1|Current Ashes description/i);
const ashesBody = byClass(body, 'campaign-library-detail-body')[0];
assert.match(textOf(ashesBody), /Current Ashes description\./);
assert.match(textOf(ashesBody), /Era 2376, Post-Dominion War/);
assert.match(textOf(ashesBody), /Your Role Commander, Executive Officer/);
```

After selecting Drowned Constellation, assert its hero contains `Coming later` and the title but not the description, while the body contains the description and facts. Assert neither selected package detail contains `13 missions`, `chapters`, `expected sessions`, or `Playable in V1`.

- [ ] **Step 2: Run the focused panel test and verify it fails**

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Expected: FAIL because description and status still share the hero and no fact body exists.

- [ ] **Step 3: Implement the shared package body**

Add a fact helper:

```js
function createCampaignFact({ label, value }) {
  const fact = createElement('div', 'campaign-fact');
  const key = createElement('span');
  key.textContent = label;
  const content = createElement('strong');
  content.textContent = value;
  fact.append(key, content);
  return fact;
}
```

In `appendPackageDetail`:

- append `.campaign-status` only when `unavailable`;
- append only status and title to `.campaign-hero-copy`;
- create `.campaign-library-detail-body` after the hero;
- append the full description as `.campaign-summary campaign-library-description`;
- append `.campaign-facts campaign-library-facts` populated from `pack.facts` when facts exist;
- append the existing primary action after the facts.

Do not change `appendCampaignDetail` or any checkpoint helper.

- [ ] **Step 4: Run focused panel and view tests**

Run:

```powershell
node tools/scripts/test-certified-campaign-view.mjs
node tools/scripts/test-certified-campaign-panel.mjs
```

Expected: both print `PASS` and exit zero.

- [ ] **Step 5: Commit the renderer slice**

```text
feat(campaign): recompose library details
```

---

### Task 3: Restore Certified Fact-Tile Geometry And Responsive Layout

**Files:**
- Modify: `styles/directive.css:3351-3399`
- Modify: `tools/scripts/test-campaign-library-presentation.mjs`

**Interfaces:**
- Consumes: `.campaign-library-detail-body`, `.campaign-library-description`, `.campaign-library-facts`, and `.campaign-fact` markup from Task 2.
- Produces: four-column desktop facts, two-column phone facts, wrapping values, uniform compact heroes, local scrolling, and an accessible action below the facts.

- [ ] **Step 1: Rewrite the browser fixture and add failing geometry assertions**

Move the fixture description below the hero, add four fact tiles, and put the disabled action inside `.campaign-library-detail-body`.

Capture and assert:

```js
descriptionInsideHero: Boolean(document.querySelector('.campaign-hero .campaign-library-description')),
factColumns: getComputedStyle(document.querySelector('.campaign-library-facts')).gridTemplateColumns.split(' ').filter(Boolean).length,
factValueWhiteSpace: getComputedStyle(document.querySelector('.campaign-fact strong')).whiteSpace,
heroHeight: document.querySelector('.campaign-library-hero').getBoundingClientRect().height,
actionAfterFacts: Boolean(document.querySelector('.campaign-library-facts + .campaign-command-primary')),
```

Expected assertions:

```js
assert.equal(metrics.descriptionInsideHero, false);
assert.equal(metrics.factColumns, viewport.width <= 640 ? 2 : 4);
assert.equal(metrics.factValueWhiteSpace, 'normal');
assert.equal(metrics.actionAfterFacts, true);
assert.equal(metrics.heroHeight, viewport.width <= 640 ? 170 : 230);
assert.equal(metrics.overflowX, false);
```

Extend the DOM-only registry assertions so every teaser has the four explicit metadata fields and every rendered selected detail keeps its description outside the hero.

- [ ] **Step 2: Run the browser presentation test and verify it fails**

Run: `node tools/scripts/test-campaign-library-presentation.mjs`

Expected: FAIL because the below-hero body and fact-grid CSS do not exist.

- [ ] **Step 3: Add focused Campaign Library styles**

Add certified fact-tile styling:

```css
.directive-expanded-shell .campaign-library-detail-body {
  display: grid;
  gap: 14px;
  padding: 16px 20px 20px 26px;
}
.directive-expanded-shell .campaign-library-description {
  margin: 0;
  color: var(--directive-expanded-muted);
  font-size: 13px;
  line-height: 1.45;
}
.directive-expanded-shell .campaign-library-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}
.directive-expanded-shell .campaign-fact {
  min-width: 0;
  padding: 8px 9px;
  background: var(--directive-expanded-surface);
  border-left: 3px solid rgba(255, 159, 74, .72);
}
.directive-expanded-shell .campaign-fact span {
  display: block;
  color: var(--directive-expanded-muted);
  font: 800 9px/1.2 "Roboto Condensed", "Arial Narrow", sans-serif;
  text-transform: uppercase;
}
.directive-expanded-shell .campaign-fact strong {
  display: block;
  margin-top: 3px;
  color: var(--directive-expanded-text);
  font-size: 11px;
  line-height: 1.3;
  white-space: normal;
  overflow-wrap: anywhere;
}
.directive-expanded-shell .campaign-library-detail-body > .campaign-command {
  justify-self: start;
}
```

At `max-width: 640px`, use two fact columns and narrower body padding. Remove the current `290px` future-hero exception so all package heroes use the existing `170px` phone height.

- [ ] **Step 4: Run the presentation and focused Campaign tests**

Run:

```powershell
node tools/scripts/test-campaign-library-presentation.mjs
node tools/scripts/test-certified-campaign-view.mjs
node tools/scripts/test-certified-campaign-panel.mjs
```

Expected: all print `PASS` and exit zero.

- [ ] **Step 5: Commit the responsive presentation slice**

```text
fix(campaign): finish library detail layout
```

---

### Task 4: Full Verification, Merge, And Push

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: completed data, view-model, renderer, and CSS slices.
- Produces: a verified feature branch merged into local `main` and pushed to `origin/main`.

- [ ] **Step 1: Run formatting and scope checks**

Run:

```powershell
git diff --check main...HEAD
git status --short
```

Expected: no whitespace errors and no unrelated files.

- [ ] **Step 2: Run the full Directive gate**

Run: `npm.cmd test`

Expected: every focused check passes with exit code zero.

- [ ] **Step 3: Review the final diff against the approved spec**

Confirm directly from the diff and focused tests that all Global Constraints are covered and saved/current campaign code is unchanged.

- [ ] **Step 4: Merge the feature branch into main**

From the primary checkout, verify `main` is clean, then merge the feature branch non-interactively.

- [ ] **Step 5: Re-run the full gate on merged main**

Run: `npm.cmd test`

Expected: every focused check passes on the exact merged tree.

- [ ] **Step 6: Push main and verify the remote SHA**

Run:

```powershell
git push origin main
git rev-parse HEAD
gh api repos/{owner}/{repo}/commits/main --jq .sha
```

Expected: push succeeds and local `HEAD` equals the remote `main` SHA.
