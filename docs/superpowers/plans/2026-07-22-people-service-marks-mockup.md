# People Service Marks Mockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove campaign-specific General settings and add deterministic Voyager-era rank pips in department color above compact-list names and beside detail names while tightening the desktop People geometry.

**Architecture:** Keep the mockup's person records authoritative by adding a structured `service` object to each Starfleet person. One pure resolver maps tracked department and rank code to the three approved Voyager-era colors and pip patterns; shared markup helpers render those marks in desktop and phone surfaces without parsing prose or category placement.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js contract test, Playwright browser verification.

## Global Constraints

- Modify the mockup and its focused contract test only; do not begin the production UI migration.
- Use exact personnel colors: command `#a60400`, operations `#dd8a12`, science `#004880`.
- Use colored pips only; do not add visible rank labels, division bars, combadges, uniform graphics, or insignia illustrations.
- Non-Starfleet people receive no Starfleet marks.
- People category placement is presentation-only and cannot affect rank or division marks.
- Desktop People roster is `240px`; portrait width loses `10px`, portrait height loses `20px`; `48px` thumbnails remain unchanged.
- Remove the entire active-campaign settings section from General Settings.

---

### Task 1: Add the mockup contract test

**Files:**
- Create: `tools/scripts/test-expanded-interface-mockup.mjs`
- Test: `docs/design/mockups/directive-expanded-interface.html`

**Interfaces:**
- Consumes: mockup HTML source.
- Produces: a zero-dependency Node assertion script covering required source contracts.

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../docs/design/mockups/directive-expanded-interface.html', import.meta.url),
  'utf8',
);

assert.doesNotMatch(source, /Campaign settings/);
assert.match(source, /grid-template-columns:240px minmax\(0,1fr\)/);
assert.match(source, /const VOYAGER_DIVISION_BY_DEPARTMENT/);
assert.match(source, /const VOYAGER_RANK_PIPS/);
assert.match(source, /function starfleetPips\(person\)/);
assert.match(source, /service:\{organization:'starfleet'/);
assert.match(source, /crew-service-marks/);
assert.match(source, /crew-name-row/);
assert.doesNotMatch(source, /crew-division-bar/);
assert.doesNotMatch(source, /crew-rank-label/);

console.log('expanded interface mockup contract: PASS');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/scripts/test-expanded-interface-mockup.mjs`

Expected: FAIL because Campaign Settings remains and the service resolver/classes are absent.

### Task 2: Implement shared service marks and layout

**Files:**
- Modify: `docs/design/mockups/directive-expanded-interface.html`
- Test: `tools/scripts/test-expanded-interface-mockup.mjs`

**Interfaces:**
- Consumes: `person.service = { organization, department, rankCode, rankLabel }`.
- Produces: `starfleetPips(person) -> { division, rankLabel, pips } | null` and `renderServicePips(person, compact) -> string`.

- [ ] **Step 1: Add canonical resolver and shared renderer**

```js
const VOYAGER_DIVISION_BY_DEPARTMENT = Object.freeze({
  command:'command', flight:'command',
  tactical:'operations', security:'operations', operations:'operations', engineering:'operations',
  science:'science', medical:'science'
});
const VOYAGER_RANK_PIPS = Object.freeze({
  captain:['solid','solid','solid','solid'],
  commander:['solid','solid','solid'],
  lieutenant_commander:['solid','solid','hollow'],
  lieutenant:['solid','solid'],
  lieutenant_junior_grade:['solid','hollow'],
  ensign:['solid']
});

function starfleetPips(person) {
  const service = person?.service;
  if (service?.organization !== 'starfleet') return null;
  const division = VOYAGER_DIVISION_BY_DEPARTMENT[service.department];
  if (!division) return null;
  return { division, rankLabel:service.rankLabel, pips:VOYAGER_RANK_PIPS[service.rankCode] || [] };
}
```

- [ ] **Step 2: Add structured service data to the seven mock Starfleet records**

Use tracked Voyager-era rank and department values. Do not derive them from `role`, `kicker`, or People category.

- [ ] **Step 3: Render the same marks in all People surfaces**

Insert `renderServicePips(...)` above the name in desktop rows and mobile accordion summaries. Keep it in the same flex row as the larger selected desktop detail name. Update selected-detail pips inside `selectCrewPreview(...)`.

- [ ] **Step 4: Apply the approved geometry and color CSS**

```css
.directive-screen:not(.phone-preview) .crew-journal {
  grid-template-columns:240px minmax(0,1fr);
}
.directive-screen:not(.phone-preview) .crew-detail {
  grid-template-columns:clamp(250px,42%,350px) minmax(0,1fr);
}
.directive-screen:not(.phone-preview) .crew-detail-portrait {
  height:calc(70% - 20px);
  min-height:280px;
}
```

Color the pips through CSS custom property `--crew-division-color`, preserving existing row height and exposing full rank/division through `aria-label` only.

- [ ] **Step 5: Remove General campaign settings**

Delete the complete `Ashes of Peace / Campaign settings` section. General begins with Interface and retains Help & Tutorials.

- [ ] **Step 6: Run the contract test to verify it passes**

Run: `node tools/scripts/test-expanded-interface-mockup.mjs`

Expected: `expanded interface mockup contract: PASS`.

### Task 3: Verify behavior and responsive rendering

**Files:**
- Verify: `docs/design/mockups/directive-expanded-interface.html`
- Verify: `tools/scripts/test-expanded-interface-mockup.mjs`

**Interfaces:**
- Consumes: live mockup at `http://localhost:55835/`.
- Produces: desktop and phone evidence for layout, marks, settings removal, interaction, and console health.

- [ ] **Step 1: Run static checks**

Run:

```powershell
node tools/scripts/test-expanded-interface-mockup.mjs
git diff --check
```

Expected: contract test passes and diff check has no whitespace errors.

- [ ] **Step 2: Verify desktop People**

At desktop width, open People and assert:

- roster width is `240px`;
- portrait column maximum is `350px` and portrait height reflects the `20px` reduction;
- every visible Starfleet row has the expected pip count and no visible rank label or division bar;
- selecting Whitaker, Bronn, Cross, Sato, Saye, Nayar, and Vale updates pip color and pattern;
- moving a card between categories leaves its marks unchanged.

- [ ] **Step 3: Verify phone People and Settings**

Switch to Phone and assert that collapsed and expanded Starfleet records use the same marks without overflow. Open Settings > General and confirm no active-campaign settings remain.

- [ ] **Step 4: Check browser health**

Assert no page errors or console errors after route changes, person selection, category interactions, and responsive-mode switching.
