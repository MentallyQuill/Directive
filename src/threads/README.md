# Threads Domain

`src/threads` owns the hidden Narrative Thread Engine state.

The first pre-alpha slice proved the ledger contract before integration. The thread domain now remains hidden by default, but committed thread closure can also feed Command Bearing review planning when separate Command Bearing evidence is already anchored to the closed thread:

- `thread-ledger.mjs` normalizes hidden thread records.
- Ledger helpers preserve `rawValuesHidden: true`.
- Evidence merges by evidence id or cited source.
- Lifecycle deltas enforce directed status transitions.
- Closure reviews append to both the ledger review list and the owning thread.
- `thread-engine.mjs` converts proven thread closures into Command Bearing review candidates only when open player-safe Command Bearing evidence exists for that thread.
- Player summaries are a filtered projection for future Open Threads surfaces.

Player-safe summaries must not expose latent or watchlisted records, raw scores, hidden facts, raw relationship or development values, or Command Bearing potential. Command Bearing review candidates are deterministic planning records, not awards; Mark awards still require the Command Bearing evaluator proposal plus deterministic validation and transaction application.
