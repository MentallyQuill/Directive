# Parallel analysis and thread retrieval

Directive keeps complete continuity events in each campaign save while constructing
a focused working set for each turn. This replaces the production combined
continuity/direction/episode prompt with independent analyses.

## Calls and ownership

| Role | Input | Output |
| --- | --- | --- |
| acceptedPairMissionEvidence | Pending exchange, mechanical candidates and existing interpretation context | Existing accepted-pair interpretation |
| continuityAnalyst | Pending exchange, relevant continuity and authored references | Evidence-backed thread changes or a targeted lookup request |
| storyDirectionAnalyst | Pending exchange, established continuity and authored opportunities | One next-beat direction |
| episodeEvaluator | Committed episode snapshot, only when review is due | Existing bounded episode proposal |

All initial calls start concurrently. Separate schemas prevent ownership overlap.
The direction call cannot target a local thread being created concurrently.
The existing state spine applies the proposals to a candidate state and persists
through one custody transaction. A model never merges outputs or writes a save.

Two attempts per failed role are allowed in a preparation run. Successful roles
are cached for the captured identity. A user retry can retry failures without
repeating successes. Cancellation and changed inputs prevent stale reuse.

A continuity response can request up to three targeted lookups using IDs or text.
The runtime retrieves from the same saved snapshot and makes one follow-up pass.
Repeated lookup requests remain a failure rather than being treated as empty
changes. Direction that conflicts with validated state gets one direction-only
reconciliation pass. Failure prevents persistence and narration handoff.

## Persistence and lifecycle

Existing continuity events remain the archive. Open, fact and status events
retain evidence and dependencies; projection and pruning preserve rollback.
Statuses are active, deferred, dormant, resolved and expired. Dormancy never
removes a fact or proves an obligation was fulfilled. Resolved and expired status
changes require assistant evidence; elapsed time alone does not create them.

Facts can link supplied thread, character, location and authored IDs. Optional
authored deadlines must match the supplied mapping. With canonical current ship
time supplied, the continuity analyst may also extract a source-backed schedule
attention hint within seven days. Ambiguous schedules must omit the hint. These
model-interpreted hints only affect retrieval: they cannot advance time, prove an
outcome or expire a thread. Facts without a hint retain conservative retrieval.
Metadata and its evidence survive save replay.

## Retrieval

The working set considers explicit references, matching text, active obligations,
scheduled deadlines, recency and dependencies. Dormant records can return through
references or matching text. A deadline attention hint wakes a record within 1,800
seconds of its deadline and keeps overdue obligations unresolved.

Inactivity currently uses settled revision distance (12), not a count of player
turns or inferred ship time. It affects routine eligibility, not persisted truth.
Text matching is lexical, not embedding-based semantic search.

The routine projection selects at most 12 records and six relevant facts per
record, with a 12,000-character final safeguard. Targeted lookups select at most
six records. These limits constrain prompt projections only. Omission counts and
partial coverage tell analysts that unprovided history remains unknown and can
be looked up. The archive is never truncated to satisfy prompt limits.

Direction responses are capped at 2,048 tokens; continuity at 6,144, also respecting
a smaller configured provider limit. Mandatory episode review uses a 60-second
default timeout and 4,096-token ceiling. These caps include any provider reasoning
charged against its completion budget. They are not measured usage or latency
claims. Provider concurrency limits still determine actual overlap and speed.
