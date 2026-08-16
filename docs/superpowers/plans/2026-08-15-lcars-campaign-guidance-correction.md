# LCARS Campaign Guidance Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the conventional campaign-required card and smooth glow with a multicolor LCARS assembly and an exact held-state Campaign backlight.

**Architecture:** Extend the focused empty-state renderer with decorative rail segments and an icon pod while preserving its public state interface. Scope all geometry and animation changes to the existing campaign-required classes and verify them through the established fake-DOM and Playwright checks.

**Tech Stack:** Browser DOM APIs, CSS custom properties/keyframes, Node.js assertions, Playwright.

## Global Constraints

- Keep Campaign as the only action; add no button, connector, or alternate save-loading path.
- Use the existing amber, lilac, blue, violet, and salmon theme variables.
- Animate exactly `0.2s` on-ramp, `1s` on-hold, `0.2s` off-ramp, and `1s` off-hold.
- Preserve route geometry, transforms, accessibility state, and reduced-motion support.
- Preserve unrelated `debug.log` and `.codex-remote-attachments/` worktree changes.

---

### Task 1: Lock the corrected structural and pulse contract

**Files:**
- Modify: `tools/scripts/test-campaign-required-empty-state.mjs`
- Modify: `tools/scripts/test-campaign-required-empty-state-visual.mjs`

**Interfaces:**
- Consumes: `.directive-campaign-required`, `.directive-campaign-required-segment`, `.directive-campaign-required-icon-pod`, and `.is-campaign-guidance-target`.
- Produces: regression coverage for six decorative tone segments, icon/copy ordering, exact timing, held states, button silhouette, and reduced motion.

- [ ] Add fake-DOM assertions for three upper and three lower rail segments, ordered theme tones, `aria-hidden="true"`, and the separate icon pod.
- [ ] Replace the smooth two-second CSS assertions with `2.4s linear infinite` and held-state keyframe assertions.
- [ ] Extend Playwright sampling to the four timing boundaries and assert stable on/off holds, unchanged geometry, rounded corners, inset-only illumination, and no outline.
- [ ] Run both focused tests and verify they fail for the missing LCARS structure and old pulse contract.

### Task 2: Implement the LCARS assembly and bridge-panel backlight

**Files:**
- Modify: `src/ui/current-chat-empty-state.js`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: existing theme variables, bundled `route.ship` glyph, current copy, and shell guidance class.
- Produces: decorative upper/lower rails, icon pod, unbordered text well, and `directive-campaign-guidance-pulse 2.4s linear infinite`.

- [ ] Render upper and lower decorative rail containers with the exact six tone segments while preserving readable content and IDs.
- [ ] Replace the card border/background with responsive LCARS rail, pod, and text-well geometry.
- [ ] Replace the smooth keyframes with exact `0%`, `8.333%`, `50%`, `58.333%`, and `100%` held-state keyframes and the active-tab corner shape.
- [ ] Keep reduced motion as a steady, fully shaped internal illumination.
- [ ] Run the focused structural and visual tests until green.

### Task 3: Regression, visual review, and publication

**Files:**
- Modify only if evidence reveals a scoped defect: `styles/directive.css`, `tools/scripts/test-campaign-required-empty-state-visual.mjs`

**Interfaces:**
- Consumes: the completed focused change.
- Produces: browser-reviewed desktop/mobile output, a clean full gate, committed main, and exact remote-main verification.

- [ ] Run the expanded-interface visual and focus regressions.
- [ ] Inspect desktop and certified-mobile screenshots for LCARS composition and button-shape illumination.
- [ ] Run `npm.cmd test` and `git diff --check`.
- [ ] Review only the scoped diff and preserve unrelated dirty files.
- [ ] Commit intentionally, push `main`, and verify local HEAD equals remote `main`.
