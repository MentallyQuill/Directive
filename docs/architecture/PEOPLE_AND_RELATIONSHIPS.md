# People and Relationships

Directive treats People as a read-only projection of Story Settlement, not as a second mutable character database.

## Creation threshold

A card is created only from an accepted direct encounter in which the NPC gives the player a usable name. A name mentioned in narration or conversation about someone else is insufficient. The accepted-pair Utility role proposes all People observations in its existing batch; runtime validates sources and creates an identity-stable `person.emergent.*` ID from branch and accepted-message lineage. Names are display facts, never identity keys, and Directive does not guess that two records are the same person.

One optional Reasoning call handles every newly introduced person in that accepted pair. Its closed schema permits only public identity and service fields. If authoring fails, the name and encounter summary still produce a usable minimal card. Ordinary later turns do not rerun dossier authoring.

## Updates and relationships

Later accepted pairs may add allowlisted public facts or source-backed relationship evidence. They do not rewrite cards directly. Story Settlement retains the events, and the People projection folds surviving events in accepted order so later facts replace earlier values. Source edits, deletions, selected-swipe changes, and branch reconstruction remove invalidated events and rebuild the result deterministically.

The existing episode evaluator reviews all people involved in a checkpoint together. It may propose a qualitative current posture and one open matter for each supported person. There is no relationship score. On a seal, it may also retain at most one defining moment per person for that episode, only when the episode contains a durable relationship turning point. There is no lifetime limit on defining moments.

## Projection boundaries

The player People projection contains the complete surviving public record and every visible defining moment. The detail UI omits absent fields and renders each moment as a collapsed native disclosure that expands individually.

The narration packet is intentionally smaller: compact identity, current posture/open matter, and at most eight recent defining moments globally. Comprehensive storage and selective recall are separate concerns, so relationship history can grow without creating unbounded prompts or per-person model calls.

## Resolving unfinished business

The ID of the current visible `character.relationshipOpenMatter` effect identifies the exact matter. Accepted-pair interpretation receives a bounded directory of those matters. A quoted, accepted assistant outcome may produce a `relationshipMatterResolved` event, including when someone else fulfills the original obligation. An event clears only its named current matter. It does not change posture, trust, knowledge, audience access, or notification of the person.

The existing episode evaluator can also reconcile an open matter against a quoted assistant-backed People evidence event. This resolution is a separate operation from posture updates. Old evidence cannot recreate an obligation after its resolution; a new matter needs later relationship evidence. Plans, attempts, promises, player claims of success, and unrelated outcomes are insufficient.

All resolution events remain in Story Settlement. Removing their source reopens the surviving original matter; replacing that matter cannot let an old resolution clear the new one. Recovered episodes retain their original story order when relationships are folded, so repairing an old source cannot overwrite a newer relationship. Exact event and review replays are idempotent; conflicting replays are rejected. Old saves load without migration.

## Observation limits and recovery

The normal Utility response shares a configured selection budget between mission claims and People. It now declares People coverage `complete` or `overflow`. An overflowing result, or a saturated legacy result without a coverage declaration, triggers at most one People-only request through the same Utility role. This request uses the configured People-event bound and preserves every initially valid observation; it cannot change mission claims, acceptance, time, or pacing.

The original output is validated in full, including its tail. Invalid, incomplete, over-limit, cancelled, or failed recovery leaves the accepted pair pending with explicit diagnostics. Nothing is partially settled. Normal retries can recover the pair. Complete in-budget results make no extra call. Semantic omissions by a model are still possible even when it reports complete coverage.

Open-matter context uses the configured episode relationship count/text bounds, reports omitted count, and does not trim stored history. No live saves are automatically reprocessed by this change.
