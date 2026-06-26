# Sidecar Jobs

Sidecar jobs are host-neutral background work units for future Mission Director advice, continuity tracking, crew/ship analysis, Command Log summaries, and recap generation.

Jobs consume immutable snapshots and return packets or diagnostics. They must not mutate campaign state directly. A stale result should be journal-only or discarded by the caller.

`host-sidecar-orchestrator.mjs` chooses sequential or concurrent sidecar scheduling from host capabilities and forwards job progress to the host UI adapter. When the host generation client exposes batch generation, concurrent sidecars use the batch path.

`command-log-summary-sidecar.mjs` is the first player-facing sidecar. After a committed Director turn, it asks the active host for a compact low-cost `commandLogSummarizer` result from committed Command Log inputs only, then stores the assisted summary on the matching Command Log entry. It is presentation-only and fail-soft; deterministic committed inputs remain the audit trail.

The current implementation is still conservative, but it is wired into the SillyTavern plus fake-host test gate and can evolve now that the Stage 29/30 parallel work is closed.
