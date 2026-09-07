# Reliable Objective Progress Implementation Plan

**Goal:** Ship generic, durable player corrections and controlled objective-resolution tests in a draft PR.
**Architecture:** Persist objective decisions in the canonical mission runtime. All views and actions share that authority. Reuse authored dispositions and existing settlement/replay, never fabricate evidence to satisfy a manual resolution.
**Spec:** ../../design/RELIABLE_OBJECTIVE_PROGRESS.md
**Tech stack:** Native ES modules, existing Node assertion scripts and Playwright.

## Constraints

No compatibility layer; no paid model calls; current-mission corrections only; player decisions win; no merge or deployment. Check usage between segments and stop starting work at 80% remaining. Preserve primary checkout changes.

## Tasks

- [x] Audit all 13 missions / 50 objectives; add reproducible inventory and pattern/case coverage checks. Own docs/testing matrix and inventory scripts.
- [x] Add canonical decision state and generic resolution/correction/replay handling with focused failing-then-passing tests. Own mission/runtime/projection core. Define action API for UI integration.
- [x] Wire Mission adjustments, notifications and pending/error feedback through shared commands; add controlled browser checks. Own UI and host action wiring, coordinate exact API with core.
- [x] Integrate, run full alpha gate, review source and test coverage against spec, address findings.
- [ ] Commit scoped work, push feature branch and create draft PR with controlled validation evidence and explicit deferred live testing.

## Rulings and evidence

- Approval covers implementation and draft PR without further approval questions.
- Current-mission scope is revalidated at action commit, not merely when opening the dialog.
- Player corrections must not silently create negative Command Bearing or undo later chapters; resolve concrete dependent consequences before commit or give a checkpoint recovery explanation.
- Source inventory extraction alone is not semantic corpus coverage.

- Manual changes update pending transition eligibility; transition activation remains in the existing lifecycle.
- Independent review covered replay prerequisites, stale provider cancellation ownership, conflicting terminal evidence, conditional visibility, and notification retirement. Regression tests cover the reported defects.
- Final controlled alpha gate passed 164 focused checks (exit 0). Live-model testing remains deferred.
