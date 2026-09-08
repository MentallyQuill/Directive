# UI Experience Polish Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review the independent tasks below.

**Goal:** Give Directive consistent controls and dialogs, stable and truthful waiting feedback, and restrained shared interaction styling.

**Architecture:** Keep semantic runtime and storage authority unchanged. Host events drive activity ownership; shared UI helpers own busy and modal interaction behavior; CSS tokens standardize motion and component families. Preserve the existing five routes, LCARS palette, and notification bevels.

**Tech Stack:** JavaScript ES modules, CSS, Node assertion suites, Playwright, SillyTavern host adapter.

**Spec:** User-approved six-part design in this task, captured below. Execution, PR creation, and merge are authorized without further approval.

## Global Constraints

- Work in `.worktrees/ui-experience-polish` from current `origin/main`; preserve unrelated primary-checkout changes.
- Never delay generation to finish a UI animation. Never claim output has started based solely on a timer.
- Keep accepted story state, saves, provider calls, and retry authority intact.
- Do not modify or restart the user's installed SillyTavern host. Read its source to verify lifecycle events; exercise production modules in an isolated browser fixture.
- Motion values are defaults: control 120ms, disclosure/notification 180ms, modal enter 220ms and shorter exit. Reduced motion removes spatial movement.
- Preserve intentional component families; geometry changes need rendered comparison, not radius uniformity alone.
- Each behavioral improvement follows one failing regression, minimal fix, passing regression. Existing assertions change only where approved behavior changes.

## Approved Experience Contract

1. Immediate, interruptible interaction feedback. Selection and focus never wait for animation. No queued route transitions.
2. Distinct hover, pressed, selected, focus, unavailable, and busy states. Busy actions retain width, guard duplicates, and preserve focus where practical.
3. One stable activity surface follows actual processing/handoff/completion/stop. Retain quiet waiting for non-streaming output; hand off to visible streaming text only with a verified event. Old operations cannot clear newer activity. No invented progress or elapsed-time warnings.
4. Failure preserves Directive-owned input, uses plain copy and one error area, and distinguishes closing UI from canceling work. Dismissed retry results cannot mutate newer UI.
5. Shared spacing, icon alignment, control heights, borders and focus styling within families, retaining LCARS and route colors. Stable busy/error geometry at desktop and mobile sizes.
6. Dialogs share layout, focus containment, appropriate initial focus, host-background blocking, dismissal and restoration. Keep actions reachable with long content. Do not implicitly cancel irreversible work on dismissal.

## Task 1: Activity lifecycle

**Files:** `src/hosts/sillytavern/{turn-activity-indicator.js,runtime-bridge.mjs,shell-events.js,events-adapter.mjs}`; related existing host tests and `tools/scripts/test-turn-activity-indicator-visual.mjs`.

**Interfaces:** Preserve current activity token API. Add explicit lifecycle handlers only when needed; handoff accepts an exact activity token. Bind actual verified host events and dispose subscriptions with existing lifecycle.

- [x] Inspect `F:/SillyTavern/public/script.js` and its event definitions read-only for start, stream, end, stop ordering and payloads.
- [x] Add a regression that hands off token A, waits past the old 350ms expiry, and asserts A remains in the truthful waiting phase until an explicit lifecycle event.
  ```js
  const token = markDirectiveTurnActivity();
  resolveDirectiveHostGenerationHandoff({ token });
  // Advance the test clock beyond 800ms: activity must still be owned.
  assert.equal(__directiveTurnActivityTestHooks.activeActivities().length, 1);
  ```
- [x] Run the focused test and record its intended failure; implement event-driven transition without the obsolete reading hold.
- [x] Incrementally cover fast completion, non-streaming, first visible streaming output if verifiable, stop, failure, retry handoff, overlapping reading work, chat switch and disabled/disposed cleanup.
- [x] Run host integration and browser activity suites. Record source proof for chosen events and any conservative fallback.

## Task 2: Shared controls and modal behavior

**Files:** `src/ui/runtime-ui-kit.js`; new focused busy/modal helpers as appropriate; `src/ui/{timeline-dialogs.js,campaign-delete-dialog.js,character-creator-assist-dialog.js,settlement-retry-dialog.js,connection-profile-picker.js}` and corresponding tests.

**Interfaces:** Introduce `setButtonBusy(button, busy, { label })` (returns cleanup/restoration behavior as documented in implementation) and a shared modal binding that returns an idempotent release function. Use `aria-busy` and `data-directive-busy` for CSS; retain original label and width. Modal binding owns background inertness, focus cycle, Escape, initial focus, and restoration with a connected fallback.

- [x] Add a real DOM regression demonstrating duplicate prevention and busy width/state restoration on success and failure; run it red before implementing.
  ```js
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(calls, 1);
  assert.equal(button.getBoundingClientRect().width, beforeWidth);
  ```
- [x] Implement shared busy behavior, with immediate label feedback and no mandatory spinner flash. Guard duplicate activation even if a button remains focusable.
- [x] Add a modal regression proving Tab containment and host background inertness while open, plus restoration on dismissal. Implement shared modal behavior and migrate the listed dialog families.
- [x] Add failure/retry regressions preserving save names and dialog inputs, rejecting stale completion, and maintaining safe close/cancel semantics. Replace internal settlement jargon with accurate plain copy.
- [x] Run the focused dialog/helper suites. Record integration needs for CSS and test-gate registration for the root agent.

## Task 3: Visual and motion standardization

**Files:** `styles/directive.css`; new `tools/scripts/test-ui-experience-polish-visual.mjs`; `tools/scripts/run-alpha-gate.mjs`.

**Interfaces:** Consume `aria-busy`/`data-directive-busy` and shared modal classes/data hooks from Task 2. CSS custom properties centralize motion, spacing and family geometry. Do not change ambient hero animation choreography.

- [x] Capture representative production route/control/dialog screenshots at 1440x900 and 390x844 before editing.
- [x] Add a browser regression for equivalent controls' focus/busy geometry and reduced motion; observe the intended failure.
- [x] Centralize 120/180/220ms motion tokens and apply only to existing interaction transitions. Add restrained pressed/focus/disabled/busy states and shared dialog spacing with responsive bounds.
- [x] Compare before/after images, verify label/icon alignment, long labels, long dialog content, small-height viewport, keyboard focus, and reduced motion. Fix measured defects rather than forcing all radii equal.
- [x] Register new tests in the full alpha gate and run existing visual conformance checks.

## Task 4: Review and integration

- [x] Review each task against the six experience contracts, then conduct independent whole-diff review and address actionable findings.
- [x] Run `npm.cmd test` on the integrated head, keep browser evidence in ignored `artifacts/`, and update this plan with outcomes.
- [x] Check latest remote ancestry and integrate concurrent main changes if any; rerun affected/full gates as required.
- [ ] Commit only scoped files; push the feature branch with network permission. Use `gh pr create --body-file <path>` with concrete behavior and validation.
- [ ] Wait for required PR checks, merge the authorized PR, and verify merge state and remote main ancestry. Do not overwrite the dirty primary checkout or update the installed host.

## Execution ledger

- Plan self-review: all six approved areas map to Tasks 1–3, with integration and verification in Task 4.
- Ruling: maintain existing visual families and host ownership; no blanket route animation or synthetic progress indicator. This limits regression risk while improving consistency.
- Ruling: delegated Tasks 1 and 2 have disjoint production ownership; root owns CSS, gate registration, documentation, integration and PR operations.
- Baseline: `npm.cmd test` passed all 164 original checks on `e4bb661df` before implementation. Logs: ignored `artifacts/baseline.log`.
- Activity red/green evidence: old timer expiry removed the waiting token after 850ms; exact-token and disabled-bridge regressions also failed before their fixes. Lifecycle, host context, event wiring and activity browser suites pass.
- Host evidence: installed `F:/SillyTavern/SillyTavern/public/script.js` emits `STREAM_TOKEN_RECEIVED` before asynchronous rendering at 3869–3870. `CHARACTER_MESSAGE_RENDERED` is emitted at finalization/error (3774/3803). Ruling: keep one quiet waiting indication until the actual end/stop event; do not infer visible text from a pre-render event. The host source was read only.
- Activity review: independent review passed. An abort-cleanup concern was withdrawn after tracing `deactivateSendButtons` before interception: it shows the stop button, allowing subsequent unblock to emit generation end.
- Controls/modal red/green evidence: busy state, whole-host inertness, failed rename recovery, external retry disposal and pending deletion focus loss were each reproduced before correction. Added shared `button-busy.js` and `modal-lifecycle.js`; included the existing objective-progress modal in the same lifecycle.
- Visual red/green evidence: reproduced moving hover target, retry's Times New Roman font/overflowing mobile width, default 1px action focus, missing modal reduced-motion handling, and busy retry height/position changes. Shared action minimum width and reserved status space now keep retry geometry stable at 1440x900, 390x844 and 360x500, including long recovery content.
- Rendered before/after screenshots inspected under ignored `artifacts/ui-experience-polish/`. Existing conformance passed 25 route/viewport combinations and its modal state.
- Ruling: dialogs enter with a restrained opacity fade; dismissal remains immediate so focus and background interactivity restore synchronously. Do not retain outgoing modal DOM merely to perform an exit animation.
- Independent integrated review: the retry geometry finding was corrected and re-reviewed clean. No remaining actionable findings.
- All 167 focused checks passed with explicit localhost listener permission (`artifacts/polish-full-gate-unrestricted.log`). Two earlier sandbox runs failed before assertions when preview listeners were denied ports; the first affected test passed independently on retry. No host or product workaround was introduced.
- Additional rendered QA covered load, name, delete, character assistance, profile and objective dialogs at desktop/mobile sizes. It exposed an undefined amber token on the detached modal root: focused Apply text was dark on transparent. Added a fallback and a browser contrast regression (red then green); inspected corrected screenshots at all three polish viewports.
- Release validation: run the full gate again against the committed candidate containing the final contrast correction; record its result in the PR before merge.
