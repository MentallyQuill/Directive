# Ashes V1 False Colors Readiness

Status: **non-UI Chapter 2 mission authority ready; narrator cutover, visible presentation, Open Orders I migration, and live certification remain incomplete**

Date: 2026-08-09

## Certified Scope

`chapter-2-false-colors` is now the third V1-native Ashes mission definition. A terminal Empty Convoy can activate it through the deterministic journey boundary using the exact Ashes package ID and version. The legacy Chapter 2 phases, facts, outcome flags, hidden risk clocks, pressure records, intent parser, adjudication paths, and mission graph remain migration sources and compatibility surfaces only; none become parallel V1 state authority.

The V1 mission deliberately collapses the legacy representation:

- three core objectives: protect the Aegis Two wounded, establish a credible account of the attack, and set a safe independent-verification boundary;
- one conditional optional objective: establish a joint Compact investigation framework;
- four aggregate outcome dimensions: medical disposition, attack account, verification/security boundary, and Compact partnership;
- four high-value facts, of which only the attack crisis is initially known;
- two causal evidence events: an independent baseline actually preserved and usable counterfeit-route evidence actually obtained;
- three aggregate Duty Report routes across the mission;
- no Chapter 2 clock, because public anger, audit fragility, medical risk, and security exposure are authored pressures rather than concrete player-known deadlines.

The initial player state contains the attack crisis and two immediate responsibilities only. It does not show the access dispute, counterfeit platform, Hecate route, Holt, Pale Lantern, hidden objective counts, or future checklist gaps. Plot-critical knowledge reaches the player through selected, accepted, Directive-owned reports whose visible text states the same fact the report commits.

## Fair Discovery and Player Agency

The mission's causal discovery path is:

```text
known Aegis Two attack, casualties, and disputed alibi
    -> required verification/access report

credible independent records actually preserved
    -> required independent-evidence report

usable debris, traffic, testimony, telemetry, or equivalent evidence obtained
    -> required counterfeit-route and weak-Hecate report

medical care, evidence work, negotiation, and security-boundary work
may proceed in any causally valid order
```

An order, plan, theory, preliminary scan, record request, unidentified signal, or director-only truth cannot cross an evidence gate. The player may use joint audit, neutral expertise, civilian records, selected disclosure, controlled demonstration, cryptographic proof, field recovery, diplomacy, delegation, or another credible equivalent. The model classifies varied prose against these authored standards, but deterministic validation and reduction own all state changes.

Whitaker is the fallback for every mandatory discovery route. The player is therefore not punished for failing to guess that they must accuse Holt, identify Pale Lantern, identify an operator, or discover another undisclosed fact. Those attributions remain outside player knowledge. The mission requires a credible attack account and preserved next route, not a hidden culprit reveal.

Medical success is independent of testimony, access, admission, and political cooperation. Refusing dangerous command-system access is a clean success when paired with a credible alternative. Exposing dangerous architecture or refusing verification without an alternative produces a recorded informed consequence rather than being mistaken for successful transparency.

## Closure and Mixed Outcomes

The mission closes when the three core objectives receive authored terminal dispositions. Each can complete cleanly, complete with cost, or be handed off. Informed medical failure, political rupture, dangerous exposure, and unsupported refusal continue the campaign with consequences.

The optional joint framework never participates in `closeWhen`. It can improve the recorded outcome, but its absence, limitation, fragmentation, or knowing decline does not secretly fail the mission.

Terminal mission dispositions are deterministic:

- `jointLegitimacy` for clean core outcomes plus a credible joint Compact framework;
- `credibleVindication` for clean core outcomes without requiring the optional partnership;
- `managedAmbiguity` for responsible containment with uncertainty, cost, or transferred obligations;
- `politicalRuptureForward` for an informed failure, dangerous exposure, or hardened accusation.

All four dispositions continue the campaign. False Colors targets `open-orders-1-work-worth-doing`, but that target remains durably pending until an exact V1 definition exists.

## Runtime and Source Custody

The bundled Ashes registry loads Prelude, Empty Convoy, and False Colors in journey order. With only Prelude and Chapter 1 available, a terminal Empty Convoy remains pending. With the exact False Colors definition present, the runtime atomically archives Chapter 1, creates a fresh Chapter 2 state, advances the journey once, validates after reload, and leaves unrelated ship, relationship, quest, thread, Command Log, and Command Bearing roots unchanged.

The accepted-pair interpreter has been exercised against natural-language Chapter 2 prose. One accepted assistant generation can settle multiple high-value claims into the single mission aggregate. The reducer does not match prose; it consumes only validated, source-bound candidate selections.

Required report claims are stripped from ordinary sidecar output without an accepted selected-swipe manifest. Each of the three real reports delivers once, visibly communicates its committed fact, and supports different report ordering when causal gates make more than one report eligible.

A swipe, edit, or delete invalidates every claim owned by the selected assistant contribution and rebuilds state without a provider call. Restoring a source advances its custody epoch. Mutating Chapter 1 evidence before Chapter 2 activation repairs Chapter 1 only; mutating it after activation rolls the journey back to repaired Chapter 1 and prunes the False Colors descendant.

## Evidence and Robustness Matrix

| Risk | Implemented boundary | Verification |
| --- | --- | --- |
| Initial mission spoils the culprit or Hecate route | Only the attack crisis and immediate medical/account responsibilities are initially visible. | `test-ashes-v1-chapter-2-mission.mjs` |
| Player never guesses a hidden plot action | All mandatory discoveries have required crew reports with Whitaker fallback; culprit attribution is not an objective. | mission definition, validator |
| Crew initiative teleports conclusions | Independent and counterfeit reports require completed evidence-acquisition events, not attempts or theories. | mission scenarios, runtime report test |
| Tracker knows more than the player | Every owned report's canonical visible text communicates the same aggregate fact it commits. | `test-ashes-v1-chapter-2-runtime.mjs` |
| Legacy scenes become checklist spam | Six phases, twenty-three facts, and twenty-five flags collapse into three core objectives plus one optional objective and four dimensions. | definition contract |
| Mission becomes a fixed briefing sequence | Causally valid scenario and real report orders differ from the legacy phase order while producing equivalent state. | scenario fixture, runtime report test |
| Medical aid becomes leverage | Medical outcome authority depends only on the known casualty crisis; testimony and political cooperation are explicitly excluded. | validator and scenarios |
| Unsafe disclosure is rewarded as transparency | Dangerous exposure and refusal without a credible alternative map to failed-after-informed-action, while bounded proof maps to success. | definition outcome predicates |
| Optional partnership blocks or secretly fails closure | Joint framework is absent from `closeWhen`; independent vindication remains a clean terminal path. | validator and scenarios |
| Abstract pressure becomes a fake timer | False Colors defines no clock. A future clock requires a concrete player-known deadline and consequence. | definition and validator |
| Model declares success from intent or player assertion | Clear-outcome policies exclude plans and assertions; user-proved world outcomes are rejected. | mission scenarios |
| Required fact arrives through unowned prose | Required report policies are stripped without selected-swipe Duty Report custody. | runtime test |
| Wrong or stale source leaves durable state | Selected-swipe, revision, manifest, and source-contribution custody rebuild deterministically. | mission and runtime tests |
| Incorrect crew identity silently bypasses preferred reporters | The validator now checks every preferred and fallback actor against the authoritative crew dataset. | adversarial regression |
| Chapter 1 activation copies legacy state | Successor activation replaces V1 fields, archives once, reloads cleanly, and leaves unrelated roots untouched. | handoff test |
| Missing Open Orders target falls back to legacy data | Terminal False Colors remains pending with `transition-target-definition-unavailable`. | handoff test |

## Adversarial Review Findings

One Important content/runtime integration issue was found and fixed: both security-sensitive report routes initially used `bronn`, while the authoritative crew dataset identifies him as `hadrik-bronn`. This would have bypassed the preferred actor and depended on generic capability or fallback selection. The routes now use the exact crew ID, and the Chapter 2 validator rejects every unknown preferred or fallback actor.

The review also exposed a migration-boundary assumption: Open Orders I is authored in campaign prose and is the exact target of the legacy False Colors graph, but it is not a package quest template and has no V1 definition. The validator now binds the transition to that exact authored graph target, while the runtime correctly refuses activation and keeps the receipt pending. No synthetic package record or legacy fallback was introduced.

The review challenged initial spoiler projection, forced phase order, unavailable actors, premature reports, inaccessible required facts, report count and ordering, coerced care, unsafe disclosure, optional closure, hidden clocks, model self-certification, stale revisions, wrong swipes, report-manifest bypass, save/reload, duplicate activation, source mutation before and after activation, unrelated-root mutation, package drift, director-only attribution, and legacy Open Orders fallback. No unresolved Critical or Important non-UI finding remains in this slice.

## Verification Record

Focused mission, package lint, accepted-pair, Duty Report, journey, source mutation, runtime package library, host injection, registry, and legacy Chapter 2 graph suites passed. The final complete alpha gate passed:

```text
node tools/scripts/run-alpha-gate.mjs
Exit code: 0
277 checks
192.5 seconds
```

The 277-check inventory consists of 236 explicit checks and 41 package-derived checks. It is the previously certified 274-check gate plus the False Colors mission, validator, and accepted-pair runtime checks.

## Deliberate Non-Claims and Residual Risks

- False Colors is V1-native state content, but Directive has not cut narrator prompt authority over to the V1 projection.
- The three Duty Report preparation and accepted-delivery paths are deterministically proven, but their live scheduling, prose quality, and actor availability are not live-certified.
- Semantic interpretation can still misclassify model prose. Deterministic authority contains the effect and source custody makes it reversible, but live rehearsal remains necessary to measure false positives and false negatives.
- No mission-transition narration is generated, posted, or marked consumed.
- No visible Mission-page objective, optional-result, completion, urgency, or transition treatment has changed.
- The legacy Chapter 2 graph, hidden pressures, parser, resolver, state-delta writers, and tests remain for existing consumers. They are not V1 authority, but their exact-scope retirement remains future work.
- Open Orders I has no V1 definition or package quest template. A completed False Colors save correctly remains pending rather than continuing through legacy content.
- The definition encodes Ashes package version `0.3.0-pre-alpha.1`; archived Prelude, Chapter 1, and Chapter 2 definitions must remain available while saves reference them.
- No Command Bearing award or spend is derived from this mission slice.
- Deterministic gates do not replace the isolated 20-turn strict rehearsal or the 25-turn/five-user certification.

## Explicit UI Approval Boundary

This work makes no player-facing UI change. Mission-page rendering, objective disclosure treatment, optional-result presentation, completion transitions, progress bars, urgency display, notifications, and chat narration remain stopped pending the user's explicit UI approval.
