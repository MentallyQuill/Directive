# Threads Domain

`src/threads` owns the hidden Narrative Thread Engine state.

The first pre-alpha slice is intentionally isolated from campaign save projection, transaction state, Open Orders, Mission Director focus, Command Bearing awards, and UI. It proves the ledger contract before integration:

- `thread-ledger.mjs` normalizes hidden thread records.
- Ledger helpers preserve `rawValuesHidden: true`.
- Evidence merges by evidence id or cited source.
- Lifecycle deltas enforce directed status transitions.
- Closure reviews append to both the ledger review list and the owning thread.
- Player summaries are a filtered projection for future Open Threads surfaces.

Player-safe summaries must not expose latent or watchlisted records, raw scores, hidden facts, raw relationship or development values, or Command Bearing potential.
