# Director Reachability Implementation Plan

**Goal:** Make every currently authored Director route affect the single canonical SillyTavern narration path, while preserving deterministic authority and adding no per-turn model calls.

**Architecture:** Deterministic runtime policies produce authoritative evidence. Director-owned presentation instructions are assembled into the existing V1 prompt packet for SillyTavern's active narrator. Accepted contributions always enter a current Story Settlement episode so the existing bounded evaluator can review story-only developments at its existing cadence.

## 1. Certify deterministic runtime evidence

- Add failing mission/runtime tests proving an eligible `runtime` evidence policy can establish its authored world fact without asking the accepted-pair model to invent authority.
- Add a deterministic policy producer that evaluates eligible runtime policies against current accepted state and emits source-bound claims.
- Keep player/assistant interpretation candidates unchanged and validate runtime claims through the same evidence contract.

## 2. Put authored presentation routes into the host prompt

- Add failing prompt/runtime tests proving a pending Duty Report and committed mission transition appear in the next canonical V1 prompt packet.
- Build a Director prompt projection from authoritative state and authored assets.
- Include bounded, spoiler-safe Duty Report and transition instructions in the existing prompt block; do not call a Directive narration model.
- Preserve Duty Report custody metadata so acceptance can validate delivery.

## 3. Make story-only contributions reachable

- Add failing state-spine tests proving accepted non-mission contributions open/continue a working episode instead of being immediately classified insignificant.
- Open an episode for new accepted contributions, append observations, checkpoint at the existing cadence, and retain hard-boundary sealing.
- Project the current working capsule into the canonical prompt with strict bounds.

## 4. Verify and land

- Run focused Director, Duty Report, transition, prompt, state-spine, and runtime suites.
- Run the complete repository verification gate.
- Review the diff for extra calls, hidden-authority leakage, and custody gaps.
- Merge this pass to `main`, rerun the full gate on `main`, and push.
