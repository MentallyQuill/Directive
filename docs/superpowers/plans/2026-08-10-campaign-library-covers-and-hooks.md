# Campaign Library Covers and Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all six campaign-library cards equal 16:9 cover frames and readable four-sentence spoiler-free hooks.

**Architecture:** Keep campaign identity and hook copy in the bundled teaser registry, keep rendering in `campaign-panel.js`, and enforce presentation through campaign-scoped CSS. Add a data-contract test for the hook length and a browser-computed presentation test that reproduces the square-versus-widescreen image mismatch.

**Tech Stack:** JavaScript ES modules, Node.js strict assertions, Playwright Chromium, CSS Grid.

## Global Constraints

- Every campaign hook has exactly four complete, spoiler-free sentences.
- Campaign hook type is `0.82rem` with `1.4` line height and no line clamp.
- Every campaign cover uses a responsive 16:9 frame and `object-fit: cover`.
- Do not alter availability, buttons, package IDs, campaign start behavior, source artwork, or package schemas.
- Use `npm.cmd` commands on Windows.

---

### Task 1: Expand the six campaign hooks

**Files:**
- Modify: `tools/scripts/test-bundled-package-registry.mjs`
- Modify: `src/packages/bundled-package-registry.mjs`

**Interfaces:**
- Consumes: `V1_CAMPAIGN_LIBRARY_TEASERS: readonly CampaignTeaser[]`
- Produces: `campaign.highConcept: string` containing exactly four player-facing sentences for every teaser.

- [ ] **Step 1: Write the failing data-contract test**

Add this assertion after the existing teaser-count assertions:

```js
function sentenceCount(value) {
  return String(value || '').match(/[.!?](?=\s+[A-Z]|$)/g)?.length || 0;
}

for (const teaser of V1_CAMPAIGN_LIBRARY_TEASERS) {
  assert.equal(
    sentenceCount(teaser.campaign?.highConcept),
    4,
    `${teaser.title} must provide a four-sentence campaign hook`
  );
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tools/scripts/test-bundled-package-registry.mjs`

Expected: FAIL with `Ashes of Peace must provide a four-sentence campaign hook` because the current teaser has one sentence.

- [ ] **Step 3: Replace each registry summary with approved player-facing copy**

Use these exact four-sentence hooks:

```js
// Ashes of Peace
'The Dominion War is over, but the choices made to survive it still shape Federation worlds. You join the USS Breckenridge as its new executive officer while a mostly reconstituted crew returns to service. Three days later, a stabilization assignment begins with missing relief crews and counterfeit Starfleet orders. Command the mission, shape the crew, and decide what Starfleet principles require when restoring the old order may not be enough.'

// Drowned Constellation
'As the newly promoted executive officer of the USS Glass Harbor, you enter the unmapped currents of the Nerine Reef. When the captain and her shuttle vanish during a gravitic inversion, you assume acting command. Rescue, survey, escort, and diplomacy all depend on charts that different communities need for different reasons. Decide who may map the Reef when every reliable route can save lives, expose a sanctuary, create a border, or become a weapon.'

// Black Current
'The Dominion War is over, but the Vanta Wake continues to deliver its wreckage. A migrating subspace current releases damaged vessels, live ordnance, records, and survivors months after the battles that trapped them. Command the USS Serein through rescue operations where every recovered person and object carries competing claims. Decide who owns what returns, which people are still legally alive, and what it means to come home to a world that already buried you.'

// Broken Accord
'Five inhabited worlds depend on a shared terraforming lattice that has kept their fragile environments alive for generations. When a lattice surge leaves the USS Eudora Vale without its captain, you inherit your first independent command. Keeping the system alive means discovering why its benefits and burdens were never shared honestly. Balance finite Starfleet resources, competing planetary needs, and the question of what lawful authority can replace a peace built on unequal sacrifice.'

// Unseen Border
'Starfleet charts say the Lacuna March is empty in places where families are raising children and convoys still travel by mutable markers. When an official colony route ends in empty space, you take the USS Aster Vale beyond the boundary of reliable maps. Every route you restore may save a settlement, expose a sanctuary, or reveal whose orders made entire communities disappear on paper. Command the ship, protect the witnesses, and decide whether visibility is rescue, betrayal, or both.'

// Enemy's Garden
'Several worlds survived the final years of the Dominion War by adopting K-17 crops that thrive in damaged soil. The harvest prevented famine, but it also displaced local seed lines and bound each world to a dangerous biological inheritance. When the USS Celandine captain enters quarantine, you assume acting command over a relief mission no planet can survive alone. Guide the transition through planting deadlines, finite clean stock, and competing claims over who controls the seeds, the science, and the future.'
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node tools/scripts/test-bundled-package-registry.mjs`

Expected: PASS with `PASS V1 bundled package registry`.

- [ ] **Step 5: Commit the content contract**

```powershell
git add -- tools/scripts/test-bundled-package-registry.mjs src/packages/bundled-package-registry.mjs
git commit -m "feat(campaign): expand library hooks"
```

### Task 2: Enforce the shared cover frame and compact hook typography

**Files:**
- Create: `tools/scripts/test-campaign-library-presentation.mjs`
- Modify: `src/ui/campaign-panel.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: campaign teaser summaries rendered by `renderCampaignPanel(body, view, actions)`.
- Produces: `.directive-v1-campaign-hook` paragraphs and 16:9 `.directive-v1-campaign-media` frames.

- [ ] **Step 1: Write the failing browser-computed presentation test**

Create a Node script that loads the real stylesheet into Chromium with two equal-width campaign frames whose image sources have 1:1 and 16:9 intrinsic dimensions. Assert that the frames have equal height, their width-to-height ratio is 16:9, both images compute to `object-fit: cover`, and a `.directive-v1-campaign-hook` computes smaller than a normal campaign paragraph:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const css = fs.readFileSync(new URL('../../styles/directive.css', import.meta.url), 'utf8');
const svg = (width, height) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`)}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.setContent(`
    <style>${css}</style>
    <div class="directive-expanded-shell">
      <article class="directive-v1-campaign-package">
        <figure id="square" class="directive-media-frame directive-v1-campaign-media" style="width:320px"><img src="${svg(640, 640)}"></figure>
        <div class="directive-v1-campaign-package-copy"><p id="control">Control copy.</p><p id="hook" class="directive-v1-campaign-hook">Campaign hook.</p></div>
      </article>
      <figure id="wide" class="directive-media-frame directive-v1-campaign-media" style="width:320px"><img src="${svg(960, 540)}"></figure>
    </div>
  `);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  const metrics = await page.evaluate(() => {
    const square = document.querySelector('#square').getBoundingClientRect();
    const wide = document.querySelector('#wide').getBoundingClientRect();
    const hook = getComputedStyle(document.querySelector('#hook'));
    const control = getComputedStyle(document.querySelector('#control'));
    return {
      square: { width: square.width, height: square.height },
      wide: { width: wide.width, height: wide.height },
      fits: [...document.querySelectorAll('.directive-v1-campaign-media img')].map((image) => getComputedStyle(image).objectFit),
      hookFont: Number.parseFloat(hook.fontSize),
      controlFont: Number.parseFloat(control.fontSize),
      hookLineHeight: Number.parseFloat(hook.lineHeight)
    };
  });
  assert.equal(metrics.square.height, metrics.wide.height, 'intrinsic image ratios must not change cover height');
  assert.ok(Math.abs(metrics.square.width / metrics.square.height - 16 / 9) < 0.01, 'campaign covers must render at 16:9');
  assert.deepEqual(metrics.fits, ['cover', 'cover']);
  assert.ok(metrics.hookFont < metrics.controlFont, 'campaign hook type must be smaller than ordinary card copy');
  assert.ok(metrics.hookLineHeight > metrics.hookFont, 'campaign hooks must retain readable line spacing');
} finally {
  await browser.close();
}

console.log('PASS campaign library presentation');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tools/scripts/test-campaign-library-presentation.mjs`

Expected: FAIL because the square source produces a taller frame than the wide source.

- [ ] **Step 3: Add the scoped hook class and minimal CSS**

Change the summary element to:

```js
const summary = createElement('p', 'directive-v1-campaign-hook');
```

Change the campaign media and hook rules to:

```css
.directive-expanded-shell .directive-v1-campaign-media {
  position: relative;
  width: 100%;
  min-height: 0;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--high);
}

.directive-expanded-shell .directive-v1-campaign-package .directive-v1-campaign-hook {
  font-size: 0.82rem;
  line-height: 1.4;
}
```

Remove the mobile-only `min-height: 150px` override so it cannot compete with the shared ratio.

- [ ] **Step 4: Run the browser test and verify GREEN**

Run: `node tools/scripts/test-campaign-library-presentation.mjs`

Expected: PASS with `PASS campaign library presentation`.

- [ ] **Step 5: Register the focused test in the full gate**

Insert `"test-campaign-library-presentation.mjs"` immediately after `"test-bundled-package-registry.mjs"` in `tools/scripts/run-alpha-gate.mjs`.

- [ ] **Step 6: Run focused regressions**

Run:

```powershell
node tools/scripts/test-bundled-package-registry.mjs
node tools/scripts/test-campaign-library-presentation.mjs
node tools/scripts/test-expanded-interface-shell.mjs
```

Expected: all three commands exit 0.

- [ ] **Step 7: Commit the presentation contract**

```powershell
git add -- tools/scripts/test-campaign-library-presentation.mjs src/ui/campaign-panel.js styles/directive.css tools/scripts/run-alpha-gate.mjs
git commit -m "fix(campaign): normalize library covers"
```

### Task 3: Verify the complete chooser and integrate

**Files:**
- Verify: all modified files
- Generate locally only: desktop and mobile screenshots under `artifacts/`

**Interfaces:**
- Consumes: the completed campaign library renderer and stylesheet.
- Produces: verified branch commits merged into `main` and pushed to `origin/main`.

- [ ] **Step 1: Run the full alpha gate**

Run: `npm.cmd test`

Expected: exit 0 with every focused check passing.

- [ ] **Step 2: Inspect the rendered chooser at desktop and mobile widths**

Render the campaign chooser at 1280x900 and 390x844. Confirm all visible cover frames share 16:9 proportions, all six hooks are readable and unclamped, cards do not overflow, and playable/locked buttons retain their prior behavior.

- [ ] **Step 3: Review the final diff and workspace state**

Run:

```powershell
git diff main...HEAD --check
git status --short
git log --oneline main..HEAD
```

Expected: no whitespace errors, no unstaged files, and the two implementation commits plus this plan's documentation history are present.

- [ ] **Step 4: Merge the feature branch into main**

From the primary checkout:

```powershell
git switch main
git merge --no-ff codex/campaign-library-covers-hooks
```

- [ ] **Step 5: Re-run the full gate on merged main**

Run: `npm.cmd test`

Expected: exit 0 on the exact merged `main` tree.

- [ ] **Step 6: Push main and verify the remote SHA**

```powershell
git push origin main
git rev-parse HEAD
gh api repos/{owner}/{repo}/commits/main --jq .sha
```

Expected: local `HEAD` and remote `main` SHAs are identical.
