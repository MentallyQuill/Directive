# Directive Recovery Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended; or superpowers:executing-plans) to implement this plan task-by-task. Steps use checkbox syntax (- [ ]) for tracking.

**Goal:** Restore Directive's host integration, campaign discovery, and authored-story authority through three independently testable implementation slices, with installed SillyTavern evidence before the work is considered complete.

**Architecture:** Execute the shell slice first because it establishes the body-level overlay and modal stacking contract used by campaign onboarding. Execute campaign onboarding second. Execute the story-authority vertical slice third; it may use the restored shell for live replay, but its deterministic contracts remain independently testable.

**Tech Stack:** ES modules, browser DOM/CSS, Node test scripts, existing Directive runtime/reducer contracts, Playwright against an installed SillyTavern instance, screenshot and transcript artifacts.

## Global Constraints

- Use the approved design in docs/superpowers/specs/2026-07-31-directive-recovery-program-design.md as the source of truth.
- Do not replace SillyTavern chat with a Directive-owned chat surface.
- Do not make the desktop shell full-screen by default. Fullscreen is an explicit action.
- Do not let campaign selection create a save, bind a chat, or start character setup until an explicit action is chosen.
- Do not let transcript text silently rewrite committed campaign state. All model state changes must pass the authoritative reducer boundary.
- Every slice must leave evidence for five distinct states: code exists, deterministic tests pass, installed-host behavior passes, visual/semantic review is approved, and live certification is complete.
- A failed or unavailable live-host check is recorded as a blocker; it is not reported as a pass based on repository tests.
- Preserve unrelated worktree changes. Before each implementation slice, run git status --short and stop if unexpected files overlap the slice.

## Dependency and approval sequence

- [ ] Confirm the approved design and clean worktree before implementation.
  - Read the approved recovery design.
  - Run git status --short --branch.
  - Record the starting commit SHA with git rev-parse HEAD.
- [ ] Execute docs/superpowers/plans/2026-07-31-directive-shell-integration.md.
  - Required handoff: bounded desktop shell, body-level modal helper, explicit fullscreen state, focused tests, and installed-host screenshots.
  - Do not start campaign implementation until the shell's deterministic tests pass and the host overlay can be opened and closed without document overflow.
- [ ] Execute docs/superpowers/plans/2026-07-31-directive-campaign-onboarding.md.
  - Required handoff: master/detail browser, canonical package summary projection, explicit action semantics, and visible New Campaign dialog above the shell.
  - Do not start story implementation until at least Ashes of Peace and one other package have passed the installed-host comparison flow.
- [ ] Execute docs/superpowers/plans/2026-07-31-directive-story-authority-vertical-slice.md.
  - Required handoff: one Ashes opening path with deterministic eligibility, applied state proposal, pressure resurfacing, and claim authority behavior.
- [ ] Run the unified recovery evidence pass.
  - Run all focused commands listed in the three child plans.
  - Run node tools/scripts/test-player-facing-ui-playwright.mjs for the dry-run contract.
  - For an installed host, set DIRECTIVE_SILLYTAVERN_USER and SILLYTAVERN_BASE_URL, then run node tools/scripts/test-player-facing-ui-playwright.mjs --live.
  - Store screenshots/transcripts under artifacts/directive-recovery/ with the commit SHA in the manifest.
  - Compare every artifact against the approved design and record intentional variance before claiming certification.

## Commit and handoff checkpoints

- [ ] Shell slice commit: fix(ui): restore bounded Directive shell.
- [ ] Campaign slice commit: fix(campaign): restore campaign discovery flow.
- [ ] Story slice commit: feat(director): enforce elastic story authority.
- [ ] After each commit, run git status --short --branch and git log -1 --oneline.
- [ ] Do not merge, push, or open a pull request as part of this plan unless the user separately requests publication.

## Exit criteria

- [ ] Desktop Directive opens as a centered, bounded panel with visible SillyTavern around it.
- [ ] Nested campaign dialogs mount above the shell, block the shell, and restore focus on close.
- [ ] Campaign selection exposes artwork and player-safe details before Start/Continue/Import.
- [ ] A diversion in the Ashes opening keeps the active authored obligation and resurfaces its pressure without teleporting the player.
- [ ] Unsupported player/generated claims remain claims or hypotheses until an evidence/Director path commits them.
- [ ] The final installed-host screenshots, chat transcript, campaign save, and event ledger agree.
