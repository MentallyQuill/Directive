# Ashes V1 Open Orders I Readiness

Status: **non-UI Open Orders I mission authority ready; narrator cutover, visible presentation, reward-asset projection, Chapter 3 migration, and live certification remain incomplete**

Date: 2026-08-09

## Certified Scope

`open-orders-1-work-worth-doing` is now the fourth V1-native Ashes journey entry. A terminal False Colors run can activate it through the deterministic mission-journey boundary using the exact Ashes package ID, package version, and authored transition target. It has no legacy quest-template row: the V1 definition is its sole new runtime identity, preventing a duplicate mission card or accidental activation of the old side-quest UI.

The V1 interval deliberately collapses the legacy representation into:

- one required interval-conclusion objective;
- three visible optional opportunities: The Long Repair, Borrowed Wings, and Quiet Channels;
- one initially known briefing fact that explains all three choices, the normal two-assignment load, and the delegation/overextension boundary;
- one assessment event and one discoverable aggregate fact per engaged assignment;
- at most one required Duty Report per assignment;
- one engagement decision and one high-value result per assignment;
- four outcome dimensions: workload plus the three assignment results;
- no clock, phase tracker, pressure meter, progress percentage, per-task rows, or legacy reward state.

The interval is authored campaign structure and the exact successor named by False Colors, but it is not a legacy package quest. The registry loads only its V1 definition after False Colors. The old Open Orders, pressure, delegation, side-assignment, and reward runtimes remain compatibility surfaces for uncut-over consumers and are not parallel V1 authority.

## Player Ownership and Flexible Choice

Every engagement and conclusion decision is exclusively user-sourced. Assistant prose cannot decide that the player directly accepted, delegated, declined, overextended, concluded, or left early. An unauthorized assistant selection fails closed without initializing or persisting mission state.

The player may:

- undertake an assignment directly;
- delegate it and receive a later depicted offscreen assessment;
- knowingly decline it;
- reconsider a decline before the interval closes;
- complete any two assignments in any causal order as a normal load;
- cover all three responsibly when at least one is delegated;
- carry all three directly and accept recorded overextension;
- leave early with unfinished opportunities recorded.

Decline is provisional until interval conclusion. This avoids terminalizing an optional objective while the player can still change course. At closure, a still-declined assignment receives `knowinglyDeclined`; a reconsidered and completed assignment receives its actual result.

The three optional objectives never participate directly in `closeWhen`. The required conclusion objective is the sole closure authority, and it changes only on an explicit player-owned conclusion decision. Resolving two assignments therefore does not silently close the interval while the player is still roleplaying or considering the third.

## Assessment, Delegation, and Report Custody

Selection and delegation are not success. Each engaged assignment requires:

```text
player-owned direct or delegated engagement
    -> accepted assistant prose depicts a completed usable assessment
    -> one selected-swipe Directive-owned Duty Report discloses the aggregate finding
    -> later accepted assistant prose depicts the actual assignment disposition
```

The assessment standards accept varied credible play while excluding assignment selection, scheduling, one isolated observation, one contact, one exercise, or a bare declaration of success. Delegation can produce a real offscreen result, but the order itself grants nothing.

The reports communicate only the high-value aggregate:

- accumulated ship technical debt is ordinary work requiring honest priorities and bounded support, not sabotage;
- civilian pilots can become useful through honest qualification, command, escort, and abort limits, not by pretending they are Starfleet crew;
- informal channels are primarily mutual aid with real security and obligation risks, not a hidden spy network.

Each route requires both an engaged assignment and a completed assessment event. Required fact claims are stripped from ordinary sidecar output without exact selected-swipe manifest custody. Delivered report IDs deduplicate, and an unselected or declined assignment cannot create a pending report.

## Closure and Mixed Outcomes

The interval supports clean capability creation, responsible limited resolution, and informed failure for each assignment. It records workload separately from result quality.

Terminal dispositions are deterministic:

- `earlyDepartureForward` when the player knowingly leaves before a normal work program concludes;
- `limitedWorkForward` when any assignment fails after informed action, including during an overextended three-assignment program;
- `overextendedWithCost` for all-direct broad work without a more serious informed failure;
- `resilienceBuilt` when at least two assignments create durable capabilities;
- `workWorthDoing` for a responsible mixed or limited program.

An informed failure outranks generic overextension, while the workload dimension still records the all-direct cost. Every terminal result continues to `chapter-3-dead-letters`. That successor remains durably pending until an exact V1 Chapter 3 definition exists; no legacy template or graph can activate in its place.

## Runtime and Source Custody

The bundled Ashes registry now loads Prelude, Empty Convoy, False Colors, and Open Orders I in journey order. Without the interval definition, terminal False Colors remains pending. With the exact definition present, activation atomically archives False Colors, creates a fresh interval state, advances the journey once, reloads cleanly, and leaves unrelated Ship, People, Quest, Thread, Command Log, and Command Bearing roots unchanged.

No legacy pressure, assignment, progress, or reward sentinel is copied into V1 state. Duplicate activation is idempotent. Terminal Open Orders I remains pending because Chapter 3 has not yet been migrated.

Accepted-pair runtime proof covers natural-language direct, delegated, declined, assessment, result, and conclusion prose. One selected assistant generation can settle multiple high-value claims into the single interval aggregate without generating tracker rows. Quiet scenes settle with no mission evidence or unrelated-root mutation.

Source reconstruction now revalidates every surviving evidence batch against its authored prerequisites. If an edit, deletion, or swipe change removes an upstream engagement, dependent assessment, report, result, conclusion, and Story Settlement effects are pruned without a provider call. Independent surviving evidence remains active. Terminal rollback also removes supersession replacements descended from the invalidated source rather than leaking stale active effects.

Mutating False Colors evidence before interval activation repairs False Colors only. Mutating it after activation rolls the journey back to repaired False Colors and prunes the Open Orders descendant.

## Evidence and Robustness Matrix

| Risk | Implemented boundary | Verification |
| --- | --- | --- |
| Three opportunities become three mandatory quests | One required conclusion owns closure; all assignments are optional and never appear directly in `closeWhen`. | definition, validator, scenarios |
| V1 interval duplicates legacy Mission UI identity | Registry adds only the V1 definition; no legacy quest-template row is created. | registry and validator |
| Initial briefing creates repeat evidence | Initially known facts require no disclosure policy; the linter now recognizes that boundary. | package linter and validator |
| Assistant chooses for the player | All engagement and conclusion policies authorize only `user`. | validator and hostile runtime case |
| Selection or delegation grants success | Results require a player-known post-assessment fact and later depicted final disposition. | scenarios and runtime test |
| Delegated work teleports an offscreen answer | A completed assessment event and owned Duty Report are required before a result. | definition and runtime test |
| Every task or observation becomes a tracker row | Exactly three aggregate reports and three aggregate results exist; multi-claim prose settles into one mission state. | definition and runtime test |
| Decline becomes irreversible by accident | Decline terminalizes only at conclusion; decline-then-reconsider reaches clean completion. | adversarial scenario |
| Third assignment hides overextension | Initial player briefing states the two-versus-three load boundary; load dimension records direct overextension. | initial projection and scenarios |
| Failure is masked by workload cost | `limitedWorkForward` outranks generic overextension while retaining the load dimension. | combined adversarial scenario |
| Interval fabricates urgency | No clock exists; background analysis duration is not presented as a deadline. | definition and validator |
| Mission forces a fixed assignment order | Non-linear and decline/reconsider scenarios reach valid closure. | scenario fixture |
| Model self-certifies player or world outcomes | User-only decisions, clear-outcome standards, role checks, prerequisite validation, and selected-source custody fail closed. | mission and runtime tests |
| Required report arrives through generic prose | Required claims are stripped without a valid selected-swipe Duty Report manifest. | runtime test |
| Edit/delete/swipe leaves causal descendants | Rebuild revalidates predicates, prunes dependent evidence and story effects, and never calls a provider. | runtime and shared source-mutation tests |
| False Colors activation copies legacy state | Successor activation archives once, creates fresh V1 state, and preserves unrelated roots. | handoff test |
| Missing Chapter 3 falls back to legacy content | Transition remains pending with `transition-target-definition-unavailable`. | handoff test |

## Adversarial Review Findings

Five Important non-UI findings were found and fixed:

1. Source reconstruction originally removed only claims owned by the edited contribution. Later claims whose authored prerequisites disappeared could survive. Rebuild now revalidates batches, prunes dependent mission evidence and Story effects, and removes causal supersession replacements on terminal rollback.
2. The initially known opportunity briefing had a disclosure policy, allowing a model to create meaningless evidence for information already present at mission start. The redundant policy was removed, and the general package linter now exempts only facts that are both initially true and explicitly known.
3. Engagement and conclusion policies allowed assistant, runtime, and adjudicator sources in addition to the user. All seven player choices are now exclusively user-owned, with a fail-closed hostile assistant test.
4. Decline immediately terminalized an optional objective even though a later engagement could overwrite the decision. Decline now settles only when the interval concludes, and a reconsideration fixture proves recovery.
5. Generic overextension outranked informed assignment failure. The priority now foregrounds the serious failure while preserving the independent workload dimension.

The review also challenged mandatory-side-quest drift, duplicate legacy identity, selection-as-success, delegation-as-free-reward, assessment teleportation, report spam, hidden overextension, fake clocks, forced ordering, optional blocking, premature Chapter 3 setup, actor IDs, package binding, legacy fallback, quiet-scene noise, and unrelated-root mutation. No unresolved Critical or Important non-UI finding remains in this slice.

## Verification Record

Focused mission, semantic validator, package linter, accepted-pair, Duty Report, journey handoff, source mutation, Story Settlement, projection rebuild, state-spine, registry, host, and transition suites passed. The final complete alpha gate passed:

```text
node tools/scripts/run-alpha-gate.mjs
Exit code: 0
280 checks
214.8 seconds
```

The 280-check inventory consists of 239 explicit checks and 41 package-derived checks. It is the previously certified 277-check gate plus the Open Orders I mission, semantic validator, and accepted-pair runtime checks.

## Deliberate Non-Claims and Residual Risks

- Open Orders I is V1-native state content, but Directive has not cut narrator prompt authority over to the V1 projection.
- Duty Report preparation and accepted-delivery paths are deterministic; live scheduling, actor availability, timing, and prose quality are not yet certified.
- Semantic interpretation can still produce false positives or false negatives. Deterministic contracts contain the effect, user/world authority separates claim types, and source custody makes accepted mistakes reversible, but live rehearsal remains necessary.
- No mission-transition narration is generated, posted, or marked consumed.
- No player-facing Mission page, optional-status treatment, progress display, urgency treatment, notification, chat report presentation, or completion transition has changed.
- V1 `assetEarned` results are authoritative mission outcomes only. They do not yet grant or project the legacy Helix Yard Support, Civilian Rescue Wing, or Quiet Channels Network assets.
- No Command Bearing award or spend is derived from this interval.
- The legacy Open Orders, pressure, assignment, delegation, reward, and progress runtimes remain for uncut-over consumers. Their retirement still requires an exact cutover inventory.
- Chapter 3 has no V1 definition. Completed interval saves correctly remain pending.
- The definition is bound to Ashes package version `0.3.0-pre-alpha.1`; all archived definitions referenced by saves must remain available for reconstruction.
- Deterministic gates do not replace the isolated 20-turn strict rehearsal or the 25-turn/five-user certification.

## Explicit UI Approval Boundary

This work makes no player-facing UI change. Mission-page rendering, optional assignment interaction, decline/reconsider presentation, asset presentation, completion transitions, progress bars, urgency display, notifications, chat narration, and the send-tray Directive launcher remain stopped pending the user's explicit UI approval.
