# Hybrid Accepted-Pair Ship Time

**Status:** Superseded by `2026-08-12-accepted-pair-seconds-time-design.md`

**Date:** 2026-08-12

This document records the initially approved minute-resolution design. The seconds-resolution design supersedes its footer shape, model output unit, persistence precision, and zero-decision diagnostics while retaining its accepted-pair authority and preset-agnostic boundaries.

## Purpose

Give every active Directive campaign one dependable story clock without returning to a manually maintained date tracker, adding another sidecar, or trusting narration models to perform exact clock arithmetic.

Directive will use the Multihog-style visible timestamp convention: each ordinary in-character assistant response ends with a provisional Stardate and 24-hour ship-time footer. The selected response becomes authoritative only when the player sends the next message. At that accepted-pair boundary, Directive's existing mission-evidence model call may interpret elapsed story time, while deterministic code validates and commits the resulting clock change.

The complete time contract belongs to Directive's runtime injection. The bundled Directive preset may be adjusted to avoid conflicting instructions, but it must not supply the date, clock, advancement policy, footer schema, or acceptance semantics. Ship time must continue to work with the bundled preset absent and with an unrelated preset active.

## Product Decisions

- Show a scene-end footer in the form `*Stardate 53068.4 | 1045 hours*` as the final nonblank line of ordinary in-character assistant responses.
- Use minute resolution. Directive will not expose or persist a second-by-second clock in this change.
- Use `0000` through `2359` for the 24-hour ship clock. Midnight is `0000 hours`; `2400 hours` is not a stored or rendered value.
- Do not derive time from dialogue word count, total response length, token count, or a fixed minimum per reply. Those proxies confuse prose length with fictional duration and are especially poor for action, montage, and summary.
- Do not require time to advance on every accepted pair. Several rapid exchanges may share the same displayed minute.
- Use model judgment for semantic duration and deterministic code for parsing, validation, Stardate arithmetic, persistence, idempotency, and rollback.
- Fold time interpretation into the existing `acceptedPairMissionEvidence` call. Retire the separate `timeAdvanceAdjudicator` role and its extra provider call.
- Do not create a new sidecar. Keep canonical time in the existing V1 campaign state and its bounded `timeLedger`; the ledger remains part of the save's accepted-pair authority rather than a parallel tracker.
- Preserve fail-closed behavior. If time cannot be interpreted safely, accepted story time does not advance.

## Authority Model

There are three distinct layers:

1. **Authoritative current time** lives in validated V1 campaign state: `campaign`, `worldState`, and `timeLedger` must continue to agree.
2. **A visible assistant footer** is a provisional proposal about scene-end time. Like the prose above it, it has no durable effect merely because it was generated.
3. **An accepted time boundary** is committed only after the player sends the next message with that assistant response selected. It is anchored to the same accepted pair used by mission interpretation.

The model never writes campaign time directly. It may propose or reconstruct elapsed minutes. Deterministic runtime code owns the state transition:

- normalize elapsed minutes to a nonnegative integer;
- calculate total elapsed campaign minutes;
- calculate the ship clock modulo 1,440 minutes;
- calculate canonical Stardate from the package's opening Stardate and `stardatePerDay` rate;
- advance time-driven mission clocks from the committed duration;
- create the bounded time-boundary receipt; and
- persist all affected V1 domains atomically through accepted-pair custody.

The source anchor makes repeat settlement idempotent. Swipe replacement, branch changes, deletion, and accepted-source invalidation continue to rebuild or roll back time from surviving accepted boundaries rather than trusting timestamp text left in chat history.

## Narration Contract

`DIRECTIVE V1 CAMPAIGN CONTEXT` will carry the complete temporal contract on every bound generation. It will provide:

- the authoritative current Stardate and ship clock at generation time;
- the exact final-line footer schema;
- the rule that the footer describes the narrator's proposed time at the end of the narrated response;
- the rule that continuous dialogue or immediate action may remain within the same minute;
- the rule that travel, waiting, medical work, repairs, meals, sleep, research, and explicit scene cuts should reflect their supported fictional duration;
- the rule that deadlines, schedules, past events, hypothetical durations, and statements about how long something usually takes do not themselves advance time; and
- the rule that prior timestamps in chat are display artifacts, while the injected current time is authoritative.

The narrator should choose a plausible scene-end footer rather than performing durable state mutation. A well-formed footer is evidence for the accepted-pair interpreter, not unquestioned authority. This distinction lets a frontier model make useful temporal judgments while preventing arithmetic drift or a weak/local model's malformed output from corrupting the save.

Opening messages remain runtime-authored. The runtime will render their timestamp directly from initial state using the same footer format and place it at the end, so campaign openings do not depend on model or preset compliance.

OOC-only replies and other non-story outputs do not need to pretend fictional time passed. The runtime contract may omit the footer requirement for a response that is explicitly outside play. Returning to in-character play restores the footer from authoritative state.

## Accepted-Pair Interpretation

`acceptedPairMissionEvidence` will receive time inputs alongside its existing mission inputs:

- authoritative time before the selected assistant response;
- the selected user and assistant text;
- a parsed footer candidate when the assistant ended with a valid footer;
- relevant package time scale such as `stardatePerDay`; and
- bounded mission time constraints needed by the existing interpreter.

Its strict structured result will add one time decision without changing mission-evidence authority. The result must distinguish:

- `advance`: the accepted scene supports a specific positive number of elapsed minutes;
- `unchanged`: the scene remains in the same minute or contains no supported passage; and
- `indeterminate`: the evidence is contradictory or insufficient.

Only `advance` commits positive time. `unchanged`, `indeterminate`, schema failure, provider failure, timeout, or missing output all commit zero minutes.

The interpreter uses the footer as a strong proposal but checks it against the scene. It may repair time from prose when the footer is missing, malformed, impossible, or inconsistent with an explicit duration or scene cut. It must not infer a long jump merely because a drink cools, a conversation feels complete, the prose is long, or a future deadline is mentioned.

Time interpretation must still run when there are no mission-evidence candidates. The current mission interpreter's no-candidates fast path therefore cannot skip the shared model call merely because mission claims are absent. The single call serves two independent outputs: mission evidence may abstain while time advances, or time may remain unchanged while mission evidence settles.

## Deterministic Validation and Arithmetic

Runtime code will parse a footer only when it is the final nonblank line and exactly matches the supported shape. It will reject invalid clock fields, nonfinite Stardates, negative or backward proposals without supported rollover, and values outside configured safety bounds.

The accepted model result supplies elapsed minutes, not canonical state fields. Runtime code recomputes both displayed clocks from the previously accepted state. The model-proposed Stardate is never copied into state.

For a campaign with opening Stardate `S`, total accepted elapsed minutes `M`, and package rate `R` Stardate units per day:

```text
shipMinute = (openingMinuteOfDay + M) mod 1440
stardate = S + (M / 1440) * R
```

Internal Stardate precision remains sufficient for deterministic accumulation. Player-facing formatting may remain at one decimal place, so several minute advances can legitimately share the same displayed Stardate while the `HHMM` field changes.

The footer's absolute clock can help form a candidate duration, but deterministic parsing alone must not guess how many whole days passed. Explicit prose and the accepted-pair interpretation disambiguate midnight rollover and longer scene cuts. If ambiguity remains, time stays unchanged.

## Preset-Agnostic Boundary

The bundled preset currently reinforces an exact first-line time header in both `Directive Main System` and `Directive Post-History Reinforcement`. Those time-specific instructions will be removed when the runtime switches to the final-line footer contract.

The preset may retain a general instruction to treat `DIRECTIVE V1 CAMPAIGN CONTEXT` as authoritative, but it must contain no:

- starting Stardate or ship time;
- time-advance cadence or minimum;
- time-estimation heuristic;
- header or footer position and format;
- rule for accepting or rejecting a timestamp;
- Stardate arithmetic; or
- dependency on a preset regex to make time correct.

Do not replace the already compact footer with a shorter machine tag that only a preset regex can expand. The few saved output tokens do not justify a second stored-versus-rendered representation, preset dependence, or ambiguity in swipe and accepted-pair source hashes. If Directive later gives the footer richer visual treatment, that enhancement must be an optional Directive-owned presentation transform over the same canonical plain-text footer; parsing and custody must remain correct without it.

The preset version will advance because the bundled prompt asset materially changes. Its notes and user documentation will continue to describe the preset as a narration layer; campaign and timeline facts remain runtime/package-owned.

This is accommodation, not dependency. Automatic activation of the Directive preset may continue to provide the intended narration style, but ship time must behave the same when activation fails, the preset is missing, or the player uses an unrelated preset. A hostile external preset can still reduce model compliance, but it cannot become a source of accepted time or alter deterministic commitment rules.

## Data Flow

1. Runtime reads the accepted V1 time state and injects the complete temporal contract into the next narration request.
2. The narration model writes ordinary scene prose and ends it with a provisional scene-end footer.
3. The player may swipe, edit, or delete before acceptance; no time state changes.
4. The player sends the next message with one assistant response selected, establishing the accepted-pair source anchor.
5. Runtime separates the final footer from narrative evidence while retaining both in the accepted-pair input and source identity.
6. The existing `acceptedPairMissionEvidence` call returns mission interpretation and a time decision.
7. Runtime validates the time decision, computes canonical Stardate and ship time, advances mission clocks, and commits the accepted boundary atomically.
8. The newly authoritative time is injected into the narration request for the player's new message.

The footer is excluded from narrative claim extraction so it cannot become mission evidence merely by existing. It must nevertheless participate in source identity or have its own anchored digest so that changing the selected footer cannot silently reuse a prior time decision.

## Failure Handling

- Missing or malformed footer: the shared accepted-pair call may reconstruct elapsed time from clear scene evidence; otherwise zero minutes.
- Model proposes implausible or contradictory duration: deterministic validation rejects it or applies an explicit configured bound; it never copies arbitrary absolute time.
- Shared call times out or fails schema validation: no mission or time proposal is committed from that failed call, and time remains unchanged.
- Duplicate accepted-pair event: the existing source anchor returns the prior boundary and does not advance again.
- Swipe or edited selected response before acceptance: only the final selected text is interpreted.
- Accepted source later invalidated by branch or deletion: rebuild time from the surviving accepted boundaries.
- Unrelated or missing preset: runtime still injects the complete contract and deterministic custody is unchanged.
- Conflicting external preset: runtime remains authoritative, but live behavior must be reported as model/preset-specific rather than guaranteed compliance.

## Verification

Focused automated coverage will prove:

- runtime injection contains the complete temporal contract and exact final-line footer schema;
- opening timestamps are runtime-generated at the end of the opening message;
- the bundled preset contains no independent timestamp format or advancement rule;
- the bundled preset contains no time-specific rendering regex;
- runtime time instructions are identical with the bundled preset, no preset, and an unrelated preset;
- valid, missing, malformed, unchanged-minute, midnight-rollover, and explicit long-skip cases;
- dialogue, action, deadlines, historical references, and hypothetical durations do not trigger unsupported acceleration;
- the shared interpreter runs for time even when mission candidates are empty;
- one structured call can independently return mission evidence and a time decision;
- provider and schema failure preserve the prior time;
- Stardate and ship-clock arithmetic are deterministic and mutually consistent;
- time-driven mission clocks advance only from the committed boundary;
- duplicate settlement is idempotent; and
- swipe, branch, and source invalidation preserve accepted-pair rollback semantics.

After focused tests, run the existing alpha gate. Live checks should include at least one frontier model and one weaker or local model. The deterministic custody claim applies across models; footer compliance and duration quality must be reported per tested model.

## Non-Goals

- No dialogue word-count timer, prose-length multiplier, token timer, or fixed one-minute-per-reply rule.
- No visible seconds or sub-minute simulation ledger.
- No new time sidecar, background timer, wall-clock synchronization, or real-time pause tracking.
- No separate time provider role or second accepted-pair model call.
- No preset-specific time behavior or model-specific hard-coded exceptions.
- No retroactive reinterpretation of old chat timestamps as accepted state.
- No guarantee that every external preset and model will obey the visible footer instruction.
