# Coming-Later Campaign Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make future campaigns selectable reading entries in the certified Campaign library while locking campaign creation only in their detailed view.

**Architecture:** Preserve the existing certified campaign view model and its `available`/`coming-later` availability values. Route every package through the existing selectable master-row path, then let the package-detail renderer derive a locked presentation from `pack.disabled`; CSS applies greyscale only to locked detail artwork, while the native disabled button prevents runtime actions.

**Tech Stack:** Browser-native JavaScript modules, DOM APIs, CSS, Node.js assertion scripts, Playwright 1.61, SillyTavern extension host, PowerShell/npm.cmd on Windows.

## Global Constraints

- The frozen certified mockup blob remains `954d50e508772557fd827d93c58c0b442888cacb` and must not change.
- Future campaign list rows are full-color, keyboard-selectable buttons with no list-level `Coming Later` text.
- Future campaign detail shows the complete current description, `Coming Later` status, greyed hero artwork, and a disabled `New campaign` button.
- Only Ashes of Peace remains playable in V1.
- Do not change campaign descriptions, art assets, runtime actions, storage, chat binding, prompts, or V1 state semantics.
- The Directive shell and route page remain fixed; only declared bounded panels may scroll.
- Synchronize only `manifest.json`, `src`, `styles`, `assets`, `content`, `packages`, `presets`, and `schemas` to the installed extension.

---

### Task 1: Specify Selectable Future Rows And Locked Detail Behavior

**Files:**
- Modify: `tools/scripts/test-certified-campaign-panel.mjs`
- Modify: `tools/scripts/test-campaign-library-presentation.mjs`

**Interfaces:**
- Consumes: `renderCampaignPanel(body, view, actions)` and `resetCampaignPanelState()` from `src/ui/campaign-panel.js`.
- Produces: failing behavioral assertions for selectable future rows, readable future detail, and inert campaign creation.

- [ ] **Step 1: Extend the focused fake DOM with replacement and native-disabled click behavior**

Add these methods to the `Element` test double in `test-certified-campaign-panel.mjs`:

```js
replaceChildren(...children) {
  this.children = [];
  this.append(...children);
}

click() {
  if (this.disabled) return undefined;
  return this.listeners.get('click')?.({ preventDefault() {} });
}
```

- [ ] **Step 2: Replace the old noninteractive-preview assertions with the approved row/detail contract**

Use a counter-backed action and assert the real renderer behavior:

```js
let startCalls = 0;
const actions = {
  startCreatorDraft: async () => { startCalls += 1; },
  refresh: async () => {}
};

resetCampaignPanelState();
renderCampaignPanel(body, view, actions);

const futureRow = byData(body, 'campaignAvailability', 'coming-later')
  .find((node) => node.classList.contains('campaign-row'));
assert.equal(futureRow.tagName, 'BUTTON');
assert.equal(futureRow.getAttribute('aria-disabled'), null);
assert.equal(futureRow.tabIndex, 0);
assert.equal(futureRow.listeners.has('click'), true);
assert.doesNotMatch(textOf(futureRow), /Coming later/i);
assert.match(textOf(futureRow), /Current approved campaign description\./);

await futureRow.click();

const futureHero = byClass(body, 'campaign-library-hero')
  .find((node) => node.dataset.campaignAvailability === 'coming-later');
assert.ok(futureHero);
assert.match(textOf(body), /Coming later/i);
assert.match(textOf(body), /Current approved campaign description\./);
const newCampaign = byClass(body, 'campaign-command-primary')
  .find((node) => /New campaign/i.test(textOf(node)));
assert.equal(newCampaign.disabled, true);
await newCampaign.click();
assert.equal(startCalls, 0);
```

- [ ] **Step 3: Update the campaign-library presentation assertions for all teaser rows**

Change the lower fake-DOM assertions in `test-campaign-library-presentation.mjs` to require every future teaser row to be a button, selectable, and free of list-level availability copy:

```js
const comingLater = nodes.filter((node) => (
  node.dataset.campaignAvailability === 'coming-later'
  && node.className.split(/\s+/).includes('campaign-row')
));
assert.equal(comingLater.length, V1_CAMPAIGN_LIBRARY_TEASERS.length - 1);
for (const row of comingLater) {
  assert.equal(row.tagName, 'button');
  assert.equal(row.attributes.get('aria-disabled'), undefined);
  assert.equal(row.listeners.has('click'), true);
  assert.doesNotMatch(nodes.filter((node) => row === node || node.parentNode === row).map((node) => node.textContent).join(' '), /Coming later/i);
}
```

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```powershell
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-campaign-library-presentation.mjs
```

Expected: FAIL because current future rows are `ARTICLE` elements with `aria-disabled="true"`, have no click listener, and cannot render package detail.

- [ ] **Step 5: Commit the failing tests**

```powershell
git add tools/scripts/test-certified-campaign-panel.mjs tools/scripts/test-campaign-library-presentation.mjs
git commit -m "test(ui): specify future campaign previews"
```

---

### Task 2: Implement Selectable Rows And Detail-Only Locking

**Files:**
- Modify: `src/ui/campaign-panel.js`
- Modify: `styles/directive.css`
- Test: `tools/scripts/test-certified-campaign-panel.mjs`
- Test: `tools/scripts/test-campaign-library-presentation.mjs`

**Interfaces:**
- Consumes: package fields `availability: 'available' | 'coming-later'` and `disabled: boolean` from `buildCertifiedCampaignView(view)`.
- Produces: selectable package rows and `appendPackageDetail(detail, pack, actions)` output whose unavailable state is represented only in detail.

- [ ] **Step 1: Add availability metadata to the existing selectable-row helper**

Extend the helper signature and apply the stable data attribute:

```js
function createSelectableRow({ key, title, meta, state, imageSource, availability = '', active, onSelect }) {
  const row = createElement('button', `campaign-row${active ? ' active' : ''}`);
  row.type = 'button';
  row.dataset.campaignRecordKey = key;
  if (availability) row.dataset.campaignAvailability = availability;
  row.setAttribute('aria-pressed', active ? 'true' : 'false');
  if (imageSource) row.appendChild(packageImage(imageSource));
  const copy = createElement('span', 'campaign-row-copy');
  const heading = createElement('strong');
  heading.textContent = title;
  const detail = createElement('span');
  detail.textContent = meta;
  copy.append(heading, detail);
  row.appendChild(copy);
  if (state) {
    const status = createElement('span', 'campaign-row-state');
    status.textContent = state;
    row.appendChild(status);
  }
  row.addEventListener('click', onSelect);
  return row;
}
```

Delete `createComingLaterPreview(pack)`; it is no longer a valid interaction path.

- [ ] **Step 2: Render every campaign package through the selectable-row path**

Replace the disabled-package branch with one row construction:

```js
model.packages.forEach((pack) => {
  const key = `package:${pack.packageId}`;
  list.appendChild(createSelectableRow({
    key,
    title: pack.title,
    meta: pack.description,
    state: pack.disabled ? '' : 'Playable',
    imageSource: pack,
    availability: pack.availability,
    active: key === selectedRecordKey,
    onSelect: () => refreshSelection(key)
  }));
});
```

- [ ] **Step 3: Render future packages in detail without wiring a start action**

Update `appendPackageDetail` and the package lookup:

```js
function appendPackageDetail(detail, pack, actions) {
  const unavailable = pack.disabled === true;
  const hero = createElement(
    'section',
    `campaign-hero campaign-library-hero${unavailable ? ' is-coming-later' : ''}`
  );
  hero.dataset.campaignAvailability = pack.availability;
  hero.appendChild(packageImage(pack, 'hero', 'campaign-hero-media'));
  const copy = createElement('div', 'campaign-hero-copy');
  const status = createElement('span', 'campaign-status');
  status.textContent = unavailable ? 'Coming later' : 'Playable in V1';
  const title = createElement('h2');
  title.textContent = pack.title;
  const description = createElement('p', 'campaign-summary');
  description.dataset.campaignDescription = 'true';
  description.textContent = pack.description;
  copy.append(status, title, description);
  hero.appendChild(copy);
  detail.appendChild(hero);
  detail.appendChild(createButton({
    label: unavailable
      ? 'New campaign'
      : (pack.actions?.resumeDraft ? 'Continue setup' : 'Start campaign'),
    icon: 'fa-solid fa-play',
    className: 'campaign-command campaign-command-primary',
    disabled: unavailable,
    onClick: unavailable
      ? null
      : (pack.actions?.resumeDraft
        ? () => runAndRefresh(actions.resumeCreatorDraft, { draftId: pack.actions.resumeDraft }, actions)
        : () => runAndRefresh(actions.startCreatorDraft, { packageId: ASHES_V1_PACKAGE_ID }, actions))
  }));
}
```

Resolve a selected package without filtering out disabled packages:

```js
const pack = model.packages.find(
  (candidate) => candidate.packageId === selectedRecordKey.slice('package:'.length)
);
if (pack) appendPackageDetail(detail, pack, actions);
```

- [ ] **Step 4: Move greyscale from the master row to detail artwork**

Delete:

```css
.directive-expanded-shell .campaign-row.is-coming-later {
  cursor: default;
  filter: grayscale(1);
  opacity: .48;
}
```

Add:

```css
.directive-expanded-shell .campaign-library-hero.is-coming-later .campaign-hero-media {
  filter: grayscale(1);
  opacity: .48;
}
```

Keep the existing `.campaign-command:disabled` rule unchanged.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-campaign-library-presentation.mjs
node tools/scripts/test-certified-campaign-view.mjs
```

Expected: all three PASS; the view-model test continues to prove future packages remain `disabled: true` for campaign creation.

- [ ] **Step 6: Commit the implementation**

```powershell
git add src/ui/campaign-panel.js styles/directive.css tools/scripts/test-certified-campaign-panel.mjs tools/scripts/test-campaign-library-presentation.mjs
git commit -m "fix(ui): unlock future campaign previews"
```

---

### Task 3: Certify The New Visual Variance

**Files:**
- Modify: `tools/scripts/test-campaign-library-presentation.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `tools/fixtures/certified-v1-ui-variances.json`

**Interfaces:**
- Consumes: `[data-campaign-availability="coming-later"]`, `.campaign-library-hero.is-coming-later`, and `.campaign-command-primary:disabled` from Task 2.
- Produces: CSS metrics at three focused widths, four Campaign-route screenshots with future detail selected, and an updated four-variance authority registry.

- [ ] **Step 1: Replace the static CSS fixture with the approved master/detail state**

Use a normal list button and a locked detail hero:

```html
<button class="campaign-row campaign-library-row" data-campaign-availability="coming-later" aria-pressed="true">
  <figure class="directive-media-frame"><img class="directive-media-image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='640'/%3E"></figure>
  <span class="campaign-row-copy"><strong>Drowned Constellation</strong><span class="campaign-row-description">Current approved campaign description.</span></span>
</button>
<section class="campaign-detail" data-directive-scroll-owner="true">
  <section class="campaign-hero campaign-library-hero is-coming-later" data-campaign-availability="coming-later">
    <figure class="directive-media-frame campaign-hero-media"><img class="directive-media-image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'/%3E"></figure>
    <div class="campaign-hero-copy"><span class="campaign-status">Coming later</span><h2>Drowned Constellation</h2><p>Current approved campaign description.</p></div>
  </section>
  <button class="campaign-command campaign-command-primary" disabled>New campaign</button>
</section>
```

- [ ] **Step 2: Assert neutral list styling and locked detail styling at 1280, 680, and 390 pixels**

Replace the old row-grey assertions with:

```js
assert.equal(metrics.rowOpacity, 1, `${viewport.width}px future row stays readable`);
assert.equal(metrics.rowFilter, 'none', `${viewport.width}px future row stays full-color`);
assert.ok(metrics.detailArtOpacity <= .5, `${viewport.width}px future detail art is greyed`);
assert.match(metrics.detailArtFilter, /grayscale\(1\)/, `${viewport.width}px future detail art is grayscale`);
assert.equal(metrics.newCampaignDisabled, true, `${viewport.width}px future campaign action is disabled`);
```

- [ ] **Step 3: Make the production visual matrix select the first future campaign**

In the Campaign-route block, assert the initial future row is a selectable button with no list status, click it, and inspect the rerendered detail:

```js
const later = page.locator('.campaign-row[data-campaign-availability="coming-later"]').first();
assert.equal(await later.evaluate((node) => node.tagName), 'BUTTON');
assert.equal(await later.getAttribute('aria-disabled'), null);
assert.doesNotMatch(await later.innerText(), /Coming later/i);
assert.match(await later.innerText(), /Nerine Reef/);
await later.click();

const futureDetail = await page.evaluate(() => {
  const hero = document.querySelector('.campaign-library-hero[data-campaign-availability="coming-later"]');
  const art = hero.querySelector('.campaign-hero-media');
  const action = document.querySelector('.campaign-detail .campaign-command-primary');
  return {
    status: hero.querySelector('.campaign-status')?.textContent || '',
    description: hero.querySelector('[data-campaign-description]')?.textContent || '',
    artOpacity: Number(getComputedStyle(art).opacity),
    artFilter: getComputedStyle(art).filter,
    actionText: action?.textContent || '',
    actionDisabled: action?.disabled === true
  };
});
assert.match(futureDetail.status, /Coming later/i);
assert.match(futureDetail.description, /Nerine Reef/);
assert.ok(futureDetail.artOpacity <= .5);
assert.match(futureDetail.artFilter, /grayscale\(1\)/);
assert.match(futureDetail.actionText, /New campaign/i);
assert.equal(futureDetail.actionDisabled, true);
```

The existing screenshot name remains `campaign-<width>x<height>.png`, so all four Campaign screenshots now certify the approved future-detail state without increasing the route/viewport count.

- [ ] **Step 4: Update the approved variance description without adding a fifth variance**

Change only the first registry entry:

```json
{
  "id": "campaign-coming-later",
  "selector": "[data-campaign-availability=coming-later]",
  "behavior": "selectable-library-preview-detail-only-locked",
  "reason": "Future campaign descriptions are browsable while campaign creation remains unavailable in V1"
}
```

- [ ] **Step 5: Run visual and authority tests**

Run:

```powershell
node tools/scripts/test-campaign-library-presentation.mjs
node tools/scripts/test-certified-ui-authority.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: all PASS; visual conformance reports 20 route/viewports and the approved modal state.

- [ ] **Step 6: Commit the visual certification**

```powershell
git add tools/scripts/test-campaign-library-presentation.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs tools/fixtures/certified-v1-ui-variances.json
git commit -m "test(ui): certify future campaign detail"
```

---

### Task 4: Full Verification, Installed Proof, Merge, And Push

**Files:**
- Review: all branch changes against `main`.
- Install source: `manifest.json`, `src`, `styles`, `assets`, `content`, `packages`, `presets`, and `schemas`.
- Install destination: `F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive`.

**Interfaces:**
- Consumes: committed implementation branch with focused and visual tests passing.
- Produces: clean merged `main`, exact installed production parity, live Campaign-route evidence, and matching local/remote main SHA.

- [ ] **Step 1: Run the complete committed-branch gate**

Run:

```powershell
npm.cmd test
node tools/scripts/test-expanded-interface-visual-conformance.mjs
git diff --check main...HEAD
git status --short
```

Expected: 91 focused checks pass, 20 route/viewports plus the modal pass, diff check emits nothing, and the worktree is clean.

- [ ] **Step 2: Review scope and authority**

Run:

```powershell
git diff --name-only main...HEAD
git hash-object docs/design/mockups/directive-expanded-interface.html
Get-Content -Raw tools/fixtures/certified-v1-ui-variances.json
```

Expected: production changes are limited to `src/ui/campaign-panel.js` and `styles/directive.css`; the mockup hash remains `954d50e508772557fd827d93c58c0b442888cacb`; exactly four approved variances remain.

- [ ] **Step 3: Merge into local main and rerun the full gate**

From `F:\git\Directive`:

```powershell
git merge --no-ff codex/coming-later-campaign-detail -m "merge: refine future campaign previews"
npm.cmd test
node tools/scripts/test-expanded-interface-visual-conformance.mjs
git status --short
```

Expected: merge succeeds, all tests remain green, and main is clean.

- [ ] **Step 4: Synchronize only production files and hash-verify the installed copy**

Copy the declared production boundary without `/MIR`, deletion, or destination cleanup:

```powershell
$sourceRoot = 'F:\git\Directive'
$destinationRoot = 'F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive'
$productionDirectories = @('src', 'styles', 'assets', 'content', 'packages', 'presets', 'schemas')
foreach ($directory in $productionDirectories) {
  $source = Join-Path $sourceRoot $directory
  if (-not (Test-Path -LiteralPath $source)) { continue }
  $destination = Join-Path $destinationRoot $directory
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  robocopy $source $destination /E /R:2 /W:1 /NFL /NDL /NP /NJH /NJS
  if ($LASTEXITCODE -gt 7) { throw "robocopy failed for $directory with exit $LASTEXITCODE" }
}
Copy-Item -LiteralPath (Join-Path $sourceRoot 'manifest.json') -Destination (Join-Path $destinationRoot 'manifest.json') -Force
```

Verify every production file:

```powershell
$sourceFiles = foreach ($directory in $productionDirectories) {
  $base = Join-Path $sourceRoot $directory
  if (Test-Path -LiteralPath $base) {
    Get-ChildItem -LiteralPath $base -Recurse -File | ForEach-Object {
      [pscustomobject]@{
        RelativePath = $_.FullName.Substring($sourceRoot.Length + 1)
        SourcePath = $_.FullName
      }
    }
  }
}
$sourceFiles += [pscustomobject]@{
  RelativePath = 'manifest.json'
  SourcePath = Join-Path $sourceRoot 'manifest.json'
}
$missing = @()
$mismatched = @()
foreach ($file in $sourceFiles) {
  $installedPath = Join-Path $destinationRoot $file.RelativePath
  if (-not (Test-Path -LiteralPath $installedPath)) {
    $missing += $file.RelativePath
    continue
  }
  $sourceHash = (Get-FileHash -LiteralPath $file.SourcePath -Algorithm SHA256).Hash
  $installedHash = (Get-FileHash -LiteralPath $installedPath -Algorithm SHA256).Hash
  if ($sourceHash -ne $installedHash) { $mismatched += $file.RelativePath }
}
if ($missing.Count -or $mismatched.Count) {
  throw "Installed parity failed: missing=$($missing.Count), mismatched=$($mismatched.Count)"
}
"VERIFIED_FILES=$($sourceFiles.Count) MISSING=0 MISMATCH=0"
```

Expected: zero missing and zero mismatched production files; user files, chats, campaign state, docs, tests, artifacts, and unrelated extensions are untouched.

- [ ] **Step 5: Exercise the installed Campaign route without mutating campaign data**

In a fresh/cache-busted SillyTavern page:

- open Directive and Campaign;
- select Drowned Constellation from the master list;
- confirm the list row is normal-color and contains no `Coming Later` text;
- confirm its full Nerine Reef description renders in detail;
- confirm detail status says `Coming Later`;
- confirm hero art and `New campaign` are greyed;
- confirm the button is disabled and no campaign/draft is created;
- confirm document-level overflow remains absent.

- [ ] **Step 6: Guard and push main**

Run with GitHub/network permission:

```powershell
gh api repos/MentallyQuill/Directive/commits/main --jq .sha
git push origin main
gh api repos/MentallyQuill/Directive/commits/main --jq .sha
```

Expected: the remote main SHA after push equals `git rev-parse HEAD`.
