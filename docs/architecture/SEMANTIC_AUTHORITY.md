# Semantic Authority

## Rule

Only validated V1 reducers may commit semantic campaign state. Models propose; code verifies; the state gateway commits; projections display.

## Authority matrix

| Concern | Authoritative owner | Model role |
|---|---|---|
| Objective progress and closure | Mission reducer | Select closed evidence candidates |
| Known facts | Validated disclosure evidence | Identify explicit disclosure candidates |
| Story chronology | Story Settlement | Propose bounded episode summaries or soft seals |
| Story time | Accepted-pair time custody plus deterministic arithmetic | The shared mission-evidence role proposes bounded elapsed seconds across both accepted messages |
| Character moments | Sealed, source-backed episode effects | Propose concise summaries from accepted sources |
| Ship condition | Exact ship aggregate state | Narrate existing condition; never create mention-level issues |
| Command Bearing | Explicit eligibility, award, and spend effects | No direct mutation |
| UI | Player-safe projections | No authority |

Every proposal is branch-bound, revision-bound, package-bound, and source-bound. A model cannot invent target IDs or operations. Failures are closed: unavailable or invalid analysis leaves semantic state unchanged.

The State Delta Gateway allows only declared mutable V1 domains, enforces compare-and-swap freshness, persists once, and rolls back only when the in-memory state still equals the failed after-state. Concurrent divergence becomes an indeterminate persistence conflict requiring operator review; it is never silently reconciled.

Prompt context is rebuilt from accepted state. It is not read back as truth. The visible chat remains narrative evidence, while exact accepted-pair custody determines which variant may support a state claim.
