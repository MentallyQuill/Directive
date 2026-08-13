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
