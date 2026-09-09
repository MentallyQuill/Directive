# Parallel story analysis and thread retrieval

> **For agentic workers:** Use superpowers:subagent-driven-development to implement these scoped tasks with review.

**Goal:** Run focused event, continuity, direction and due episode analysis concurrently, with persistent retrievable thread history and selective recovery.

**Architecture:** All analysts read one captured revision. Event-backed continuity remains in existing save storage. Focused retrieval and explicit lookup keep history out of routine prompts; a coordinator validates proposals and commits through existing custody once.

**Tech Stack:** JavaScript ES modules, Node assertion scripts, existing generation router and state spine.

**Spec:** Approved conversation: four parallel roles, deterministic merge, failed-role retry, persistent lifecycle and targeted retrieval.

## Global constraints

- Preserve unrelated debug.log changes and all installed host/save data.
- No invented outcomes, expiry by age, player speech, or semantic JSON repair.
- Source evidence and shared revision remain authoritative; failed calls cannot become empty successes.
- Dormancy changes retrieval, not factual obligations. Preserve complete event history.
- Do not add a memory database or require provider-specific infrastructure.

## Tasks

- [x] Thread lifecycle and retrieval: continuity contracts/events, director-context, thread-retrieval; prove dormant reactivation, evidence-backed expiry, bounded lookup, omission visibility and replay.
- [x] Focused provider roles: direction and continuity schemas/prompts, role registration; reuse exact quote and structured parsing validators, exclude episode context, validate lookup output.
- [x] Runtime integration: parallel coordinator and mission runtime; prove concurrent launch, due-only review, cached successes, failed-role retry, cancellation/stale rejection, targeted second pass and atomic commit.
- [x] Consumer integration: fake host, gate registration, user/developer documentation and prompt-size evidence.
- [x] Review complete diff, run focused tests and full gate, fix findings; report deployment scope precisely.

## Interface rulings

| Producers / consumers | Contract |
| --- | --- |
| Retrieval / analysts | index and records plus explicit retrieval coverage; omitted history is unknown, never absent |
| Analysts / runtime | independent validated proposals from one captured snapshot; runtime controls persistence |
| Runtime / existing storage | existing event-backed continuity and custody transaction, no external data mutation |

Ruling: Use existing settled revisions for inactivity where canonical turn/time metadata is unavailable. Do not infer a timestamp from natural-language facts. This favors preservation over invented scheduling.
Ruling: Keep legacy injected director adapters for existing consumers only if production uses focused calls by default.

Ruling: Source-backed narrative deadlines may be interpreted as retrieval-only attention hints against supplied canonical ship time, within seven days. They cannot advance time or expire records. This makes narrative schedule retrieval functional without promoting a model conversion to time authority.

## Verification

Full alpha gate passed 204 checks. Final focused retrieval, analyst, context,
contract, mission-runtime and runtime-app checks passed after review fixes.
Review corrected mandatory episode budgets, fake episode transport, overdue-thread
starvation and opaque entity names. No installed extension or save was changed.
