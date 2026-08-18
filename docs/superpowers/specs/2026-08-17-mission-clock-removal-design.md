# Narrative-Time-Only Mission Design

**Date:** 2026-08-17
**Status:** Approved
**Scope:** Remove mission countdown clocks from Directive V1 while preserving authoritative story time, ship time, date/Stardate, and the contextual Campaign and Mission chronometers.

## Decision

Directive V1 will not maintain or display mission-specific countdowns. Mission urgency, deadlines, arrivals, deterioration, and consequences will become authoritative only through accepted narration and ordinary mission facts, events, decisions, and outcomes.

This removes the independent mission-clock authority that can expose a number or consequence before the story establishes it. The accepted story-time ledger remains canonical and continues to drive the visible ship chronometer and Stardate.

## Current Usage and Rationale

The bundled Ashes of Peace campaign contains:

- 13 V1 mission definitions;
- 50 objectives;
- 2 mission clocks in 2 missions; and
- 1 objective that directly depends on a clock.

The Prelude Hesperus clock enables `expiredAfterKnownDeadline` for one conditional objective. The Chapter 7 task-group clock creates an arrival event, but no objective, close condition, or terminal disposition consumes that event. Clock concepts nevertheless cross mission schema, contracts, predicates, state, reconstruction, reduction, projection, UI, package linting, runtime settlement, and their associated tests.

That use does not justify a second temporal authority or a player-facing countdown system. The accepted narrative-time ledger already supplies the campaign chronology needed by the Director and player.

## Authority Model

The authority flow is:

1. The Director narrates events, urgency, estimates, elapsed activity, and consequences within the bounded campaign context.
2. The selected assistant response remains provisional until the next player message accepts or continues from it.
3. Accepted-pair settlement records grounded facts, events, decisions, outcomes, and elapsed story time with source provenance.
4. Mission state derives only from that accepted evidence.
5. Player-facing UI projects only accepted state.

The UI never creates urgency or a deadline. A number printed in narration does not create a separate countdown. A vague statement such as “time is short” has no hidden numeric interpretation. Crossing an elapsed-time threshold cannot automatically fail an objective or reveal a consequence that narration has not established.

## Preserved Time and Date System

The following remain unchanged:

- `campaignState.timeLedger` and its accepted-pair source custody;
- canonical elapsed story seconds and the accepted ship clock;
- current date/Stardate authority and formatting;
- `directive.timePlayerProjection.v1`;
- the shared Campaign and Mission ship chronometers;
- `HH:MM:SS` ship-time display and one-decimal Stardate display;
- chronology context supplied to the Director; and
- replay, invalidation, branching, hydration, and persistence behavior for accepted story time.

Mission-clock removal must not weaken, reset, reinterpret, or duplicate the canonical time ledger. It also must not reintroduce model-authored timestamp footers or wall-clock ticking.

## Removed Mission-Clock Contract

Remove the mission-specific clock model from V1:

- `clocks` in mission definitions and mission state;
- the `clockState` mission predicate;
- `timeAdvanced` mission evidence policies and claims;
- clock start, pause, resume, resolve, expiry, and consequence reduction;
- clock visibility and clock values in the mission player projection;
- the Mission page `Time-sensitive` section and clock-card styles;
- clock-specific package-lint and state-authority rules; and
- clock-specific branch reconstruction and compatibility paths after migration.

Accepted-pair time interpretation remains. Runtime code must stop converting accepted elapsed story time into per-mission clock advances.

After migration, bundled V1 mission definitions, fixtures, and source/runtime modules must contain no active mission-clock contract. Generic uses of the word “clock” for the ship chronometer or canonical time ledger remain valid.

## Ashes of Peace Package Changes

### Prelude: Hesperus

Remove:

- `clock.hesperus-life-support`;
- `policy.hesperus.authoritative-time`;
- the automatic life-support-window expiry event;
- `expiredAfterKnownDeadline` from the Hesperus objective;
- clock-expiry-derived outcome dimensions and terminal routing; and
- player text that presents a continuously decreasing safe-response window.

Keep the Hesperus distress, passenger risk, engineering condition, rescue choices, handoff routes, informed-risk decisions, rescue results, and material costs.

Success, failure, delay, loss of life, or a shift from rescue to recovery must be established in accepted narration and then recorded through the existing bounded outcome/event policies. The backend must not infer death, failure, or rescue merely because accepted story time advanced by some amount.

### Chapter 7: Task-Group Arrival

Remove:

- `clock.chapter7.task-group-arrival`;
- `policy.chapter7.authoritative-time`;
- its automatic expiry consequence; and
- the unused clock-owned task-group-arrival event if no accepted-narration policy consumes it.

The approaching task group can remain an authored political and tactical pressure. If the task group arrives, the Director depicts that arrival and accepted-pair settlement records the resulting posture, control, and settlement outcomes. No continuously decremented arrival estimate is required.

## Narrative Timing Behavior

The Director may still narrate time-bound information when the universe supports it, including estimates such as “another vessel is approximately thirty hours away.” That information remains prose and, where useful, a player-known fact.

The Director must not be instructed to maintain arithmetic countdowns between scenes. It receives the current accepted ship time and relevant accepted story state, then narrates what happens next. Accepted-pair time settlement records the actual elapsed duration supported by the scene.

If later narration establishes that an expected arrival occurred, conditions worsened, an opportunity closed, or rescue became recovery, the corresponding event or outcome is recorded from that narration. No hidden numeric mission timer is required to authorize it.

## Projection and UI

The mission projection exposes objectives, facts, capabilities, outcome dimensions, and terminal state, but no clocks.

The Mission panel removes the entire conditional `Time-sensitive` renderer. It does not replace the countdown with a progress bar, condition meter, urgency badge, or other gamified proxy.

The contextual ship chronometer remains in the Mission hero and Campaign hero. It continues to display accepted `SHIP TIME` and `STARDATE` as chronology, not as mission pressure.

## Existing Saves and Migration

Clock removal changes persisted mission-state shape and definition authority, so existing saves require a bounded migration rather than permissive parsing.

The clockless package and affected mission definitions receive explicit version bumps. A one-shot compatibility reader may recognize the immediately preceding clock-bearing version only to produce a clockless replacement. Legacy clock fields, policies, predicates, and evidence must not remain accepted inputs to the active post-migration contract.

Migration must:

- resolve the exact active save through its storage index;
- back up the exact index, save/base/segments, bound chat, and related timeline records before mutation;
- preserve `timeLedger`, ship time, date/Stardate, story settlement, accepted-pair receipts, source contributions, People state, Ship state, Command Bearing, and all non-clock mission evidence;
- reconstruct the active mission from surviving non-clock evidence against the clockless definition;
- remove clock state, `timeAdvanced` evidence, and clock-only effects without rewriting narration;
- preserve completed historical mission runs as inert versioned legacy history rather than reinterpreting their prose or validating their clock fields as active state; and
- fail closed for operator review if an active terminal mission depends solely on a removed clock disposition and no accepted narrated outcome supports a clockless disposition.

The currently active Hesperus path must no longer expose a countdown after migration. Existing accepted narration, player messages, and non-clock mission progress must remain unchanged.

## Failure Behavior

- Missing or ambiguous narrated timing does not create a number.
- Accepted elapsed time alone does not create a mission consequence.
- A provider failure or unsettled accepted pair leaves both narrative time and mission state at their last committed authority.
- Migration mismatch or unsupported legacy terminal state stops without partial persistence.
- Missing time projection omits the ship chronometer as it does today; mission-clock removal must not substitute wall time or a fabricated date.

## Verification

Automated verification must prove:

- all 13 bundled Ashes mission definitions validate without `clocks`;
- no V1 mission objective, terminal disposition, transition, outcome dimension, or event depends on `clockState`;
- mission contracts reject legacy clock definitions, `clockState` predicates, and `timeAdvanced` mission claims after migration support has consumed them;
- mission state, reducer, authority reconstruction, and player projection contain no active clock state;
- accepted-pair elapsed story time still commits exact whole seconds to the canonical time ledger;
- Campaign and Mission chronometers still render the same `HH:MM:SS` ship time and one-decimal Stardate;
- the Mission UI contains no `Time-sensitive` section or mission countdown card;
- Hesperus success, cost, handoff, informed failure, and unresolved paths remain narration-grounded and scenario-complete without automatic expiry;
- Chapter 7 remains completable across its authored settlement outcomes without an arrival clock;
- migrated active saves preserve non-clock evidence and time/date authority while dropping unsupported timer state;
- the one-shot compatibility reader accepts only the immediately preceding clock-bearing package/state version and cannot create new clock-bearing active state;
- completed clock-bearing mission history remains inert and cannot influence current mission predicates, projection, or settlement;
- active legacy terminal states that depend only on clock expiry fail closed for review; and
- the full alpha gate, package/source audits, installed parity, hydration, and responsive Mission/Campaign checks pass.

## Non-Goals

- Removing or simplifying the canonical story-time ledger.
- Removing the Campaign or Mission ship chronometer.
- Removing date/Stardate from the player experience.
- Changing accepted-pair elapsed-time interpretation.
- Adding a replacement progress meter, urgency tracker, or generic scheduled-event subsystem.
- Rewriting historical chat narration.
- Prohibiting characters from discussing schedules, estimates, deadlines, travel time, or urgency in ordinary narration.
