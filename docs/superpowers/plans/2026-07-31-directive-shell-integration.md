# Directive Host-Integrated Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended; or superpowers:executing-plans) to implement this plan task-by-task. Steps use checkbox syntax (- [ ]) for tracking.

**Goal:** Replace the default full-browser Directive takeover with a centered bounded overlay that coexists with SillyTavern, while retaining an explicit fullscreen action and making blocking dialogs mount above the shell.

**Architecture:** runtime-shell.js owns a body-level runtime overlay containing a backdrop and the existing directive-expanded-shell panel. directive-overlay-root.js gains a separate body/document-level modal helper; existing host-root overlays remain unchanged for non-blocking integrations. CSS defines desktop geometry and a mobile near-fullscreen adaptation. The shell owns internal scrolling; the host document does not acquire a second scrollbar.

**Tech Stack:** src/runtime/runtime-shell.js, src/ui/directive-expanded-shell.js, src/ui/directive-overlay-root.js, styles/directive.css, Node DOM-contract scripts, Playwright live checks.

## Global Constraints

- Default desktop/tablet geometry is width: min(1120px, calc(100vw - 64px)) and height: min(860px, calc(100dvh - 64px)).
- The panel is centered with viewport margins and must not touch all four browser edges at ordinary desktop sizes.
- Fullscreen is false on open and changes only through toggleDirectiveRuntimeFullscreen(force) or the visible fullscreen control.
- The backdrop dims and pointer-blocks the host while the panel is open; the panel remains the only interactive surface in the overlay.
- Escape and the close action hide the overlay and restore focus to the launcher/opener when one is known.
- Blocking dialogs mount at body/document level with an explicit z-index above the runtime overlay. They must not be appended below #sheld.
- Do not remove the existing five route controls or redesign route content in this slice.

## Files and interfaces

- Modify src/runtime/runtime-shell.js.
  - Add ensureRuntimeOverlay() and getRuntimeOverlay() to create/find #directive-runtime-overlay, .directive-runtime-backdrop, and the panel host at document.body or document.documentElement.
  - Add runtimeFullscreen = false and runtimeOpener = null module state.
  - Change ensurePanel() to append the panel to the body-level runtime overlay host, not runtimeMountHost/#sheld.
  - Make showDirectiveRuntimePanel({ opener } = {}) record the opener, show the overlay/backdrop, and set panel aria-hidden=false.
  - Make hideDirectiveRuntimePanel() hide the overlay, clear the open class, set panel aria-hidden=true, and restore focus to runtimeOpener.
  - Make toggleDirectiveRuntimeFullscreen(force) return { fullscreen, required: false, viewportBound: true } and toggle .is-fullscreen on the panel.
  - Keep toggleDirectiveSpineMode() as a compatibility API, but return actual shell state rather than claiming fullscreen is required.
- Modify src/ui/directive-overlay-root.js.
  - Add DIRECTIVE_MODAL_ROOT_ID = 'directive-modal-root'.
  - Add getDirectiveModalRoot({ document }), appendDirectiveModal(node, { document, fallbackParent }), and closeAllDirectiveModals().
  - The modal root must append to document.body (falling back to document.documentElement) and must never resolve to #sheld.
- Modify src/ui/campaign-panel.js only to consume appendDirectiveModal in its existing openDialog helper; campaign presentation changes belong to the campaign slice.
- Modify styles/directive.css.
  - Add runtime overlay/backdrop layers.
  - Replace default directive-expanded-shell inset/viewport rules with centered bounded geometry.
  - Add explicit directive-expanded-shell.is-fullscreen rules and a mobile media query.
  - Add modal-root/dialog layers above the shell.
- Update tools/scripts/test-expanded-interface-shell.mjs and add tools/scripts/test-directive-runtime-overlay-host.mjs.
- Update tools/scripts/test-runtime-shell-creator-flow.mjs only where its DOM fixture needs the new runtime overlay host; preserve its body-level Save As assertions.
- Update tools/scripts/test-player-facing-ui-playwright.mjs assertions for bounded geometry, backdrop presence, fullscreen opt-in, and nested modal visibility.

## Implementation tasks

### 1. Write the red shell contract tests

- [ ] Update tools/scripts/test-expanded-interface-shell.mjs so its expected CSS contract asserts the exact bounded width and height, centered positioning rather than inset: 0, a backdrop class, an explicit fullscreen class, and no default 100vw/100dvh takeover rule.
- [ ] Create tools/scripts/test-directive-runtime-overlay-host.mjs using the existing stub DOM style. Assert showDirectiveRuntimePanel() creates a body-level runtime overlay, the panel is a child of it, the backdrop is visible, toggleDirectiveRuntimeFullscreen() starts false and becomes true only after the call, and hide restores opener focus.
- [ ] Extend the modal portion of tools/scripts/test-runtime-shell-creator-flow.mjs to assert directive-modal-root is a direct body/document child and that its z-layer is above the runtime overlay.
- [ ] Run the red tests:

      node tools/scripts/test-expanded-interface-shell.mjs
      node tools/scripts/test-directive-runtime-overlay-host.mjs
      node tools/scripts/test-runtime-shell-creator-flow.mjs

  Expected result: the updated geometry/host assertions fail against the current inset/fullscreen implementation; do not weaken the assertions to preserve old behavior.

### 2. Implement the body-level runtime overlay

- [ ] In src/runtime/runtime-shell.js, implement ensureRuntimeOverlay() with stable ids/classes and append order backdrop then panelHost so the panel is above the backdrop.
- [ ] Move panel insertion in ensurePanel() to the new panel host and leave runtimeMountHost available only for unrelated runtime surfaces.
- [ ] Update show/hide paths so the overlay itself controls visibility and aria-hidden; do not rely on the panel hidden attribute alone.
- [ ] Preserve existing route refresh and internal scroll behavior. Verify opening/closing does not recreate the panel or lose the active route.
- [ ] Add opener capture to the launcher/open API without changing callers that do not provide an opener.

### 3. Implement explicit fullscreen and modal mounting

- [ ] Add modal-root helpers in src/ui/directive-overlay-root.js with a separate id and no fallback to the host root.
- [ ] Change openDialog() in src/ui/campaign-panel.js to call appendDirectiveModal() and retain Escape, click-away, focus trap, and focus restoration behavior.
- [ ] Add a fullscreen control to the existing shell topbar/action area in src/ui/directive-expanded-shell.js; it must call the runtime-shell toggle API and expose aria-pressed.
- [ ] Ensure opening a blocking dialog adds a modal-open state that prevents pointer interaction with the shell while leaving the shell visible behind the dialog.

### 4. Replace takeover CSS with approved geometry

- [ ] In styles/directive.css, define the runtime overlay as fixed, viewport-sized, and transparent to layout; define the backdrop as the dim/blur/pointer-block layer.
- [ ] Define the default panel as centered with the exact bounded width/height values, internal overflow, and a clear close action.
- [ ] Define .is-fullscreen as the only state that uses viewport edges.
- [ ] Add a mobile breakpoint that permits near-fullscreen dimensions and keeps the compact bottom route bar usable without adding document overflow.
- [ ] Define modal root/dialog z-index above the runtime overlay and use existing Directive theme variables.

### 5. Run focused deterministic verification

- [ ] Run:

      node tools/scripts/test-expanded-interface-shell.mjs
      node tools/scripts/test-directive-runtime-overlay-host.mjs
      node tools/scripts/test-expanded-campaign-panel-contract.mjs
      node tools/scripts/test-runtime-shell-creator-flow.mjs

- [ ] Confirm all four pass and no test still asserts default 100dvh/100vw takeover.
- [ ] Run git diff --check and inspect the diff for accidental route or campaign behavior changes.

### 6. Prove the installed SillyTavern surface

- [ ] Run the dry-run contract: node tools/scripts/test-player-facing-ui-playwright.mjs.
- [ ] With a dedicated user and configured host, set DIRECTIVE_SILLYTAVERN_USER and SILLYTAVERN_BASE_URL, then run node tools/scripts/test-player-facing-ui-playwright.mjs --live.
- [ ] Capture desktop, tablet, and phone screenshots showing host content around the panel, then capture a nested New Campaign dialog above the shell.
- [ ] Verify Escape, close, launcher focus restoration, no document scrollbar, and explicit fullscreen entry/exit in the live host.
- [ ] If the live host is unavailable, record the exact blocker and leave the slice uncertified.

### 7. Commit the slice

- [ ] Run git status --short --branch and confirm only shell-slice files are changed.
- [ ] Commit with fix(ui): restore bounded Directive shell.
- [ ] Record commit SHA and screenshot paths for the recovery-program handoff.

## Exit evidence

- [ ] Focused deterministic tests pass.
- [ ] Installed host shows the bounded panel coexisting with SillyTavern at ordinary desktop sizes.
- [ ] Nested dialogs are visible above the shell and block the shell.
- [ ] Mobile, fullscreen opt-in, Escape, close, and focus return are proven.
- [ ] Human reviewer approves screenshots against the approved recovery design before Slice B begins.
