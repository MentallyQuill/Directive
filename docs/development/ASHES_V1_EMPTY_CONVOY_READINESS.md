# Ashes V1 Empty Convoy Readiness

Status: **non-UI Chapter 1 mission authority ready; narrator cutover, visible presentation, Chapter 2 migration, and live certification remain incomplete**

Date: 2026-08-09

## Certified Scope

`chapter-1-the-empty-convoy` is now the second V1-native Ashes mission definition. A terminal Prelude can activate it through the deterministic journey boundary using the exact Ashes package ID and version. The legacy Chapter 1 mission graph, quest rows, phases, pressure clocks, and outcome flags remain migration sources only; none become V1 state authority.

The V1 mission is deliberately smaller than the legacy representation:

- three core objectives: protect the convoy's people, resolve the conflicting quarantine authority, and account for the missing emergency hardware;
- one conditional optional objective: establish a shared incident record with the Compact;
- four aggregate outcome dimensions: relief effort, authority response, hardware disposition, and Compact cooperation;
- four high-value facts, of which only the convoy emergency is initially known;
- two causal intermediate events: a completed initial operational assessment and actually obtained recovery evidence;
- three aggregate Duty Report routes across the mission;
- no Chapter 1 clock, because the authored source contains pressure but no concrete player-known deadline.

The initial player projection contains the mission frame and rescue objective only. The authority, hardware, and cooperation objectives do not appear as empty rows, hidden counts, or spoilers. Plot-critical facts become player-known only through selected, accepted, Directive-owned Duty Reports whose visible text states the same fact the deterministic claim commits.

The required discovery sequence is flexible but causal:

```text
known convoy emergency
    -> required authority-conflict report

completed initial operational assessment
    -> one required survivor + custody + missing-hardware report

usable recovery evidence actually obtained
    -> one required hardware + authentication-significance report

player may resolve relief, authority, hardware, and optional cooperation
in any causally valid order after their knowledge gates open
```

Opening a search, attempting contact, ordering a scan, or mentioning a theory does not cross these gates. Competent crew initiative makes mandatory knowledge reachable without requiring the player to guess the plot, while the evidence predicates prevent that initiative from teleporting conclusions into state.

## Closure and Fairness

The mission closes when the three core objectives have authored terminal dispositions. Each can complete cleanly, complete with cost, or be handed off. Authority and hardware can also be knowingly declined or fail after informed action. The relief objective can fail only after a material risk was known and an action was committed.

The optional shared record never participates in `closeWhen`. A cooperative record can improve the mission's recorded disposition, while a Starfleet-only, fragmented, declined, or unpursued record remains a consequence rather than a hidden fail condition.

Terminal mission dispositions are deterministic:

- `cooperativeSuccess` for clean core outcomes plus a completed shared record;
- `primarySuccess` for clean core outcomes without requiring optional cooperation;
- `containedWithSeriousCost` for completed-with-cost or handed-off core outcomes;
- `limitedFailureForward` for an informed failure or knowingly unresolved core risk.

Every terminal disposition continues the campaign. Chapter 1's receipt targets `chapter-2-false-colors`, but that transition remains durably pending until an exact V1 Chapter 2 definition exists.

## Runtime and Source Custody

The bundled Ashes registry loads Prelude and Chapter 1 in journey order. With Prelude alone, its terminal receipt is pending. With the exact Chapter 1 definition present, the runtime atomically archives Prelude, creates a fresh Chapter 1 state, advances the journey once, and retains unrelated ship, relationship, quest, thread, Command Log, and Command Bearing roots unchanged.

The actual accepted-pair interpreter has been exercised against Chapter 1 prose. One accepted assistant generation may settle multiple high-value claims into the single mission aggregate. The reducer never matches prose itself; it consumes only validated, source-bound candidate selections.

Required Duty Report policies cannot be smuggled through ordinary sidecar output. Without an accepted selected-swipe manifest, such a proposed claim is stripped and records `required-manifest-missing`. With a valid manifest, each of the three Chapter 1 reports settles exactly once and exposes the objectives it is authorized to reveal.

A selected-swipe change invalidates every claim owned by that assistant contribution and rebuilds Chapter 1 from surviving accepted evidence without a provider call. Restoring the source creates a new custody epoch. Mutating a Prelude source before activation repairs Prelude only; mutating it after Chapter 1 activation rolls the journey back to the repaired Prelude and prunes the descendant run.

## Evidence and Robustness Matrix

| Risk | Implemented boundary | Verification |
| --- | --- | --- |
| Initial objective spoils the false order or missing hardware | Only the convoy emergency and relief objective are initially visible. Hidden objective counts and gaps are absent. | `test-ashes-v1-chapter-1-mission.mjs` |
| Player never guesses the plot-critical action | Conditional-required objectives name required player-visible crew-report routes with Whitaker fallback. | `validate-ashes-v1-chapter-1.mjs`, `test-ashes-v1-chapter-1-runtime.mjs` |
| Crew initiative teleports the plot | Reports require a completed operational assessment or actually obtained evidence, not a plan, contact attempt, search route, signal, or theory. | `test-ashes-v1-chapter-1-mission.mjs`, scenario fixture |
| Tracker knows more than the player | Every owned report's canonical visible text communicates the exact player-safe fact it commits. | `test-ashes-v1-chapter-1-runtime.mjs` |
| Every scene creates a tracker row | Ten phases and twenty-eight legacy flags collapse into four objectives and four dimensions; ordinary prose produces no mission evidence. | `test-ashes-v1-chapter-1-runtime.mjs` |
| Mission becomes an A-to-B rail | Relief, authority, hardware, and cooperation settle in multiple tested causal orders; reversed valid order yields the same state. | `chapter-1-empty-convoy-scenarios.fixture.json` |
| Optional content blocks or secretly fails closure | Shared-record objective is absent from `closeWhen`; no undiscovered optional fact creates a penalty. | `validate-ashes-v1-chapter-1.mjs` |
| Abstract pressure becomes a fake countdown | Chapter 1 defines no clock. A future clock requires a concrete player-known deadline and authored consequence. | definition contract and validator |
| Model declares success from intent or player assertion | Outcome policies require clear depicted results from assistant/runtime/adjudicator sources. Hostile user-declared and hallucinated-policy fixtures are rejected. | `test-ashes-v1-chapter-1-mission.mjs` |
| Required fact arrives through unowned model prose | Required report policies are stripped without a selected, accepted Duty Report manifest. | `test-ashes-v1-chapter-1-runtime.mjs` |
| Swipe/edit/delete leaves stale results | Source custody rebuild removes owned claims without a provider call and advances epoch on restoration. | `test-ashes-v1-chapter-1-runtime.mjs`, `test-ashes-v1-mission-handoff.mjs` |
| Prelude activation copies stale fields | Successor activation replaces V1 fields, archives Prelude once, validates after reload, and leaves unrelated roots untouched. | `test-ashes-v1-mission-handoff.mjs` |
| Missing Chapter 2 falls back to legacy data | Chapter 1 remains terminal and pending with `transition-target-definition-unavailable`. | `test-ashes-v1-mission-handoff.mjs` |

## Adversarial Review Findings

Two Important content-contract issues were found and fixed:

1. The initial draft allowed substantive contact to unlock the full dispersal picture and allowed an opened recovery route to unlock authentication conclusions. The gates now require a completed reliable initial assessment and actually obtained usable recovery evidence.
2. The initial Duty Report summaries could commit detailed fact state while visibly reporting only that an unspecified issue existed. Each canonical report now states the exact player-safe fact its manifest settles.

The review also challenged initial spoiler projection, unavailable actors, report count and order, conditional-required reachability, optional-objective closure, non-linear ordering, self-declared success, stale revisions, wrong swipes, unknown policies, report-manifest bypass, save/reload, duplicate activation, source mutation before and after activation, unrelated-root mutation, package drift, and legacy Chapter 2 fallback. No unresolved Critical or Important non-UI finding remains in this slice.

## Verification Record

Focused mission, package lint, accepted-pair, Duty Report, journey, source mutation, runtime package library, host injection, and transition suites passed. The final post-hardening complete alpha gate passed:

```text
node tools/scripts/run-alpha-gate.mjs
Exit code: 0
274 checks
188.5 seconds
```

The 274-check inventory is the previously certified 270-check gate plus the Chapter 1 mission, validator, accepted-pair runtime, and real mission-handoff checks.

## Deliberate Non-Claims and Residual Risks

- Chapter 1 is V1-native state content, but Directive has not cut narrator prompt authority over to the V1 projection.
- The three Duty Report preparation and accepted-delivery paths are deterministically proven, but their player-facing scheduling and prose integration are not live-certified.
- No mission-transition narration is generated, posted, or marked consumed.
- No visible Mission-page objective, completion, mixed-outcome, urgency, or transition treatment has changed.
- The legacy Chapter 1 graph and writers remain present for existing consumers. They are not allowed to become V1 authority, but exact-scope retirement remains future work.
- Chapter 2 has no V1 definition. A completed Chapter 1 save correctly remains pending instead of continuing through legacy data.
- The definition encodes Ashes package version `0.3.0-pre-alpha.1`; archived Prelude and Chapter 1 definitions must remain available while saves reference them.
- No Command Bearing award or spend is derived from this mission slice.
- Deterministic gates do not replace the isolated 20-turn strict rehearsal or the 25-turn/five-user certification.

## Explicit UI Approval Boundary

This work makes no player-facing UI change. Mission-page rendering, objective disclosure treatment, optional-result presentation, completion transitions, progress bars, urgency display, notifications, and chat narration remain stopped pending the user's explicit UI approval.
