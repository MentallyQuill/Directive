# Authoritative Ship Chronometer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove model-authored ship-time text from campaign chat and render the accepted canonical clock as a restrained LCARS chronometer on Current Campaign and Mission.

**Architecture:** Add a player-safe time projection derived only from validated `timeLedger` state, then feed it through existing Campaign and Mission view models into one shared chronometer component. Keep accepted-pair custody unchanged. Prevent new chat drift by removing the narrator footer instruction, omitting the opening footer, and normalizing only newly generated terminal Stardate lines before response metadata is hashed.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, SillyTavern chat adapter, Directive V1 projections, CSS, Playwright browser fixtures.

## Global Constraints

- The accepted campaign `timeLedger` remains the only time authority.
- Do not infer time from response length, word count, fixed per-message increments, wall-clock time, save names, or printed timestamps.
- Existing historical chat text, accepted-pair hashes, and live saves must not be rewritten or migrated.
- Chat contains story only; Current Campaign and Mission display the accepted clock.
- Ship clock format is `HH:MM:SS`; Stardate format is one decimal.
- The chronometer does not tick or animate continuously.
- The clock is absent when no bound valid V1 projection exists.
- Preserve unrelated `debug.log` changes.

---

### Task 1: Shared formatting and player-safe time projection

**Files:**
- Modify: `src/time/ship-time.mjs`
- Create: `src/projection/v1/time-projection.mjs`
- Modify: `src/projection/v1/player-projection.mjs`
- Modify: `src/ui/v1-player-facing-panel-model.mjs`
- Test: `tools/scripts/test-ship-time.mjs`
- Create: `tools/scripts/test-v1-time-player-projection.mjs`
- Modify: `tools/scripts/test-v1-composite-player-projection.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `formatShipClock({ secondOfDay, minuteOfDay }) -> string`
- Produces: `formatStardate(stardate) -> string`
- Produces: `createTimePlayerProjection({ campaignState }) -> directive.timePlayerProjection.v1`
- Produces projection fields: `{ kind, stardate, secondOfDay, clockDisplay, stardateDisplay }`
- Extends: `createV1PlayerProjection(...).time`

- [ ] **Step 1: Write failing formatter tests**

Add assertions to `test-ship-time.mjs`:

```js
assert.equal(formatShipClock({ secondOfDay: 31059 }), '08:37:39');
assert.equal(formatShipClock({ minuteOfDay: 510 }), '08:30:00');
assert.equal(formatStardate(53068.405312), '53068.4');
assert.equal(formatStardate(Number.NaN), '');
```

- [ ] **Step 2: Run the formatter test and verify RED**

Run: `node tools/scripts/test-ship-time.mjs`

Expected: module import failure because `formatShipClock` and `formatStardate` are not exported.

- [ ] **Step 3: Implement shared formatters**

Refactor `formatShipTimeFooter` to compose these exports without changing existing footer output:

```js
export function formatShipClock({ secondOfDay, minuteOfDay } = {}) {
  const numericSecond = Number(secondOfDay ?? (Number(minuteOfDay) * 60));
  if (!Number.isFinite(numericSecond)) return '';
  const second = ((Math.round(numericSecond) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  const hour = Math.floor(second / 3600);
  const minute = Math.floor((second % 3600) / 60);
  const clockSecond = second % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(clockSecond).padStart(2, '0')}`;
}

export function formatStardate(stardate) {
  const numeric = Number(stardate);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : '';
}
```

- [ ] **Step 4: Run the formatter test and verify GREEN**

Run: `node tools/scripts/test-ship-time.mjs`

Expected: `Ship-time formatting and parsing tests passed.`

- [ ] **Step 5: Write the failing time-projection test**

Create `test-v1-time-player-projection.mjs` with a valid ledger and assertions:

```js
const projection = createTimePlayerProjection({
  campaignState: {
    campaign: { currentStardate: 53068.405312 },
    timeLedger: {
      kind: 'directive.timeLedger.v1',
      stardate: 53068.405312,
      shipClock: { secondOfDay: 31059, minuteOfDay: 517, display: '08:37:39 hours' },
    },
  },
});
assert.deepEqual(projection, {
  kind: 'directive.timePlayerProjection.v1',
  stardate: 53068.405312,
  secondOfDay: 31059,
  clockDisplay: '08:37:39',
  stardateDisplay: '53068.4',
});
assert.throws(
  () => createTimePlayerProjection({ campaignState: {} }),
  (error) => error.code === 'DIRECTIVE_V1_TIME_PROJECTION_INVALID',
);
```

- [ ] **Step 6: Run the projection test and verify RED**

Run: `node tools/scripts/test-v1-time-player-projection.mjs`

Expected: module-not-found failure for `src/projection/v1/time-projection.mjs`.

- [ ] **Step 7: Implement and integrate the projection**

Create `time-projection.mjs` with exact ledger validation and shared formatting. Add `time` to `createV1PlayerProjection`, validate its kind in `requireV1PlayerProjection`, and assert it in `test-v1-composite-player-projection.mjs`. Register the new focused test in `run-alpha-gate.mjs` next to other V1 projection tests.

- [ ] **Step 8: Run focused projection tests and verify GREEN**

Run:

```powershell
node tools/scripts/test-v1-time-player-projection.mjs
node tools/scripts/test-v1-composite-player-projection.mjs
```

Expected: both scripts pass and the composite projection contains exactly one `directive.timePlayerProjection.v1` object.

- [ ] **Step 9: Commit Task 1**

```powershell
git add src/time/ship-time.mjs src/projection/v1/time-projection.mjs src/projection/v1/player-projection.mjs src/ui/v1-player-facing-panel-model.mjs tools/scripts/test-ship-time.mjs tools/scripts/test-v1-time-player-projection.mjs tools/scripts/test-v1-composite-player-projection.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(time): project accepted ship clock"
```

### Task 2: Campaign and Mission chronometer UI

**Files:**
- Create: `src/ui/ship-chronometer.js`
- Modify: `src/ui/view-models/certified-campaign-view.mjs`
- Modify: `src/ui/view-models/certified-mission-view.mjs`
- Modify: `src/ui/campaign-panel.js`
- Modify: `src/ui/mission-panel.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-certified-campaign-view.mjs`
- Modify: `tools/scripts/test-certified-mission-view.mjs`
- Modify: `tools/scripts/test-certified-campaign-panel.mjs`
- Modify: `tools/scripts/test-certified-mission-panel.mjs`

**Interfaces:**
- Consumes: `directive.timePlayerProjection.v1` from Task 1
- Produces: `createShipChronometer(time, { variant }) -> HTMLElement | null`
- Variants: `campaign` and `mission`

- [ ] **Step 1: Write failing view-model assertions**

Add the same time fixture to both certified view tests and assert:

```js
assert.deepEqual(model.time, {
  kind: 'directive.timePlayerProjection.v1',
  stardate: 53068.405312,
  secondOfDay: 31059,
  clockDisplay: '08:37:39',
  stardateDisplay: '53068.4',
});
```

Also assert that a Campaign view without `v1PlayerProjection` produces `time: null`.

- [ ] **Step 2: Run view tests and verify RED**

Run:

```powershell
node tools/scripts/test-certified-campaign-view.mjs
node tools/scripts/test-certified-mission-view.mjs
```

Expected: deep-equality failures because the models do not expose `time`.

- [ ] **Step 3: Pass time through both view models**

Clone the validated `projection.time` into the Mission view and the bound `view.v1PlayerProjection.time` into the Campaign view. Do not derive time from campaign-index summaries.

- [ ] **Step 4: Write failing panel assertions**

Extend both panel fixtures with `v1PlayerProjection.time` and assert:

```js
assert.equal(byClass(dashboardHero, 'directive-ship-chronometer').length, 1);
assert.match(textOf(dashboardHero), /SHIP TIME 08:37:39 STARDATE 53068\.4/);
assert.equal(byClass(body, 'directive-ship-chronometer-campaign').length, 1);
assert.equal(byClass(body, 'directive-ship-chronometer-mission').length, 2);
```

The Mission count is two because desktop and mobile detail are both rendered. Assert that Campaign browser/library heroes contain zero chronometers.

- [ ] **Step 5: Run panel tests and verify RED**

Run:

```powershell
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-certified-mission-panel.mjs
```

Expected: chronometer-count failures.

- [ ] **Step 6: Implement the shared component and placements**

Create `ship-chronometer.js` with this semantic structure:

```js
export function createShipChronometer(time, { variant = 'campaign' } = {}) {
  if (time?.kind !== 'directive.timePlayerProjection.v1') return null;
  const root = createElement('section', `directive-ship-chronometer directive-ship-chronometer-${variant}`);
  root.setAttribute('aria-label', 'Current accepted ship time');
  const label = createElement('span', 'directive-ship-chronometer-label');
  label.textContent = 'Ship time';
  const clock = createElement('strong', 'directive-ship-chronometer-clock');
  clock.textContent = time.clockDisplay;
  const stardate = createElement('span', 'directive-ship-chronometer-stardate');
  stardate.textContent = `Stardate ${time.stardateDisplay}`;
  root.append(label, clock, stardate);
  return root;
}
```

Append the Campaign variant only to the active dashboard hero. Append the Mission variant to every rendered mission detail hero.

- [ ] **Step 7: Implement restrained responsive CSS**

Use existing Campaign amber and Mission lilac variables. Campaign is an absolute upper-right instrument; Mission uses a grid with a right-side compact instrument. Add `font-variant-numeric: tabular-nums` to the clock. Under `max-width: 640px`, make each chronometer a compact in-flow strip below hero copy/summary, with no overlap or continuous animation.

- [ ] **Step 8: Run view and panel tests and verify GREEN**

Run all four certified view/panel scripts. Expected: all pass with Campaign dashboard-only and Mission desktop/mobile coverage.

- [ ] **Step 9: Commit Task 2**

```powershell
git add src/ui/ship-chronometer.js src/ui/view-models/certified-campaign-view.mjs src/ui/view-models/certified-mission-view.mjs src/ui/campaign-panel.js src/ui/mission-panel.js styles/directive.css tools/scripts/test-certified-campaign-view.mjs tools/scripts/test-certified-mission-view.mjs tools/scripts/test-certified-campaign-panel.mjs tools/scripts/test-certified-mission-panel.mjs
git commit -m "feat(ui): add accepted ship chronometer"
```

### Task 3: Remove generated time from SillyTavern chat

**Files:**
- Modify: `src/time/ship-time.mjs`
- Modify: `src/hosts/sillytavern/chat-adapter.mjs`
- Modify: `src/hosts/fake/fake-host.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/test-ship-time.mjs`
- Create: `tools/scripts/test-sillytavern-generated-time-hygiene.mjs`
- Modify: `tools/scripts/test-v1-runtime-opening-prompt.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `stripGeneratedShipTimeFooter(text) -> { text, stripped, footerText }`
- Produces host method: `stripAssistantTimeFooter({ hostMessageId })`
- Preserves: `extractShipTimeFooter` behavior for historical accepted-source compatibility

- [ ] **Step 1: Write failing tolerant-stripper tests**

Add cases that all return narrative text `The bridge holds.`:

```js
for (const footer of [
  '*Stardate 53068.4 | 08:40:53 hours*',
  '*Stardate 53068.4 | 0830 hours*',
  '*Stardate 53068.4 | 0846:15 hours*',
  'Stardate 53068.4 | 0850:21 hours',
]) {
  assert.deepEqual(stripGeneratedShipTimeFooter(`The bridge holds.\n\n${footer}`), {
    text: 'The bridge holds.',
    stripped: true,
    footerText: footer,
  });
}
```

Also prove nonterminal timestamps and ordinary prose are unchanged, and retain all existing `extractShipTimeFooter` assertions verbatim.

- [ ] **Step 2: Run the ship-time test and verify RED**

Run: `node tools/scripts/test-ship-time.mjs`

Expected: missing export failure for `stripGeneratedShipTimeFooter`.

- [ ] **Step 3: Implement the generation-only stripper**

Add a separate terminal-line regex accepting strict `HH:MM:SS`, legacy `HHMM`, malformed `HHMM:SS`, optional italics, and no more than one terminal line. Do not alter `FINAL_TIME_FOOTER`, `LEGACY_FINAL_TIME_FOOTER`, or `extractShipTimeFooter`.

- [ ] **Step 4: Write the failing SillyTavern adapter test**

Create a fake SillyTavern context with one assistant message whose selected swipe ends in `0846:15 hours`. Call `stripAssistantTimeFooter({ hostMessageId: '0' })` and assert:

```js
assert.equal(result.stripped, true);
assert.equal(context.chat[0].mes, 'The bridge holds.');
assert.equal(context.chat[0].swipes[0], 'The bridge holds.');
assert.equal(context.chat[0].swipe_info[0].extra.model, 'claude-opus-5');
assert.equal(saveCount, 1);
```

- [ ] **Step 5: Run the adapter test and verify RED**

Run: `node tools/scripts/test-sillytavern-generated-time-hygiene.mjs`

Expected: `stripAssistantTimeFooter is not a function`.

- [ ] **Step 6: Implement chat normalization**

Add `stripAssistantTimeFooter` to SillyTavern and fake host chat adapters. Resolve the exact selected assistant message, strip `mes` and only the selected swipe, preserve all metadata and other swipes, refresh the visible message, and call `saveChat` once only when text changed.

- [ ] **Step 7: Write failing runtime prompt/opening assertions**

Replace the old footer requirement assertion with:

```js
assert.match(packet.text, /Directive displays accepted ship time in its interface/i);
assert.match(packet.text, /Do not print.*Stardate.*header.*footer/i);
assert.doesNotMatch(packet.text, /using your proposed scene-end Stardate/i);
```

Update the runtime opening assertion so the posted opening text does not end in a Stardate footer. Add a generation-ended fixture proving normalization happens before response metadata attachment.

- [ ] **Step 8: Run runtime tests and verify RED**

Run:

```powershell
node tools/scripts/test-v1-runtime-opening-prompt.mjs
node tools/scripts/test-v1-runtime-app.mjs
```

Expected: old prompt and opening-footer assertions fail.

- [ ] **Step 9: Remove narrator footer ownership and normalize generation output**

Keep `campaign.currentTime` in the prompt payload, replace the footer-generation instructions with an explicit UI-ownership prohibition, remove `openingFooter` from `postOpeningIfEmpty`, and call `host.chat.stripAssistantTimeFooter` in `handleHostGenerationEnded` before computing `responseText` and duty-report hashes.

- [ ] **Step 10: Run all Task 3 tests and verify GREEN**

Run the ship-time, adapter, runtime opening, runtime app, and accepted-pair source scripts. Expected: all pass, including unchanged historical parser/hash behavior.

- [ ] **Step 11: Commit Task 3**

```powershell
git add src/time/ship-time.mjs src/hosts/sillytavern/chat-adapter.mjs src/hosts/fake/fake-host.mjs src/runtime/runtime-app.mjs tools/scripts/test-ship-time.mjs tools/scripts/test-sillytavern-generated-time-hygiene.mjs tools/scripts/test-v1-runtime-opening-prompt.mjs tools/scripts/test-v1-runtime-app.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(chat): remove generated ship time"
```

### Task 4: Stardate consistency and full visual verification

**Files:**
- Modify: `src/runtime/timeline-transaction-service.mjs`
- Modify: `src/ui/timeline-dialogs.js`
- Modify: `tools/scripts/test-v1-native-branch-runtime.mjs`
- Modify: `tools/scripts/test-timeline-dialogs.mjs`
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`
- Modify or create: `tools/scripts/test-authoritative-ship-chronometer-visual.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `formatStardate(stardate)` from Task 1
- Verifies: Campaign and Mission chronometers at desktop and phone widths

- [ ] **Step 1: Write failing saved-game formatting tests**

Assert that `53068.405312` produces `Stardate 53068.4` in both the suggested checkpoint name and Load Game metadata. Preserve numeric precision in stored state and summaries.

- [ ] **Step 2: Run timeline tests and verify RED**

Run:

```powershell
node tools/scripts/test-v1-native-branch-runtime.mjs
node tools/scripts/test-timeline-dialogs.mjs
```

Expected: raw six-decimal Stardate output differs from the required one-decimal string.

- [ ] **Step 3: Use the shared Stardate formatter**

Import `formatStardate` in the transaction service and timeline dialogs. Change presentation strings only; do not round persisted numbers.

- [ ] **Step 4: Add deterministic browser fixture time**

Set the fixture projection to `08:37:39` / `53068.4`. Add a browser script that opens Current Campaign and Mission at desktop and phone viewports and asserts:

```js
await expect(page.locator('.campaign-dashboard-hero .directive-ship-chronometer-clock')).toHaveText('08:37:39');
await expect(page.locator('.mission-desktop-detail .directive-ship-chronometer-clock')).toHaveText('08:37:39');
await expect(page.locator('.directive-ship-chronometer-stardate').first()).toHaveText('Stardate 53068.4');
```

Capture screenshots and verify the Campaign instrument does not overlap `.campaign-hero-copy`, the Mission instrument does not overlap the title/summary, and mobile strips remain in flow.

- [ ] **Step 5: Run focused browser verification**

Run: `node tools/scripts/test-authoritative-ship-chronometer-visual.mjs`

Expected: desktop and mobile Campaign/Mission checks pass and screenshots are written under the existing ignored artifact directory.

- [ ] **Step 6: Run the full gate**

Run: `npm.cmd test`

Expected: every focused script, browser runtime safety check, mission scenario audit, and visual contract passes.

- [ ] **Step 7: Inspect source and live-data safety**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only scoped source/test/spec changes plus the pre-existing `debug.log`; no files beneath the live default-user save or chat roots changed.

- [ ] **Step 8: Commit Task 4**

```powershell
git add src/runtime/timeline-transaction-service.mjs src/ui/timeline-dialogs.js tools/scripts/test-v1-native-branch-runtime.mjs tools/scripts/test-timeline-dialogs.mjs tools/fixtures/expanded-interface-runtime-fixture.mjs tools/scripts/test-authoritative-ship-chronometer-visual.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(time): unify player-facing Stardates"
```

- [ ] **Step 9: Final review and push**

Review all commits since `7190ac466`, rerun `npm.cmd test` from a clean index, verify `origin/main` ancestry, then push with `git push origin main` without staging or modifying `debug.log`.
