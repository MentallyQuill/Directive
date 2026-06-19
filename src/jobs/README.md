# Sidecar Jobs

Sidecar jobs are host-neutral background work units for future Mission Director advice, continuity tracking, crew/ship analysis, command-log enrichment, and recap generation.

Jobs consume immutable snapshots and return packets or diagnostics. They must not mutate campaign state directly. A stale result should be journal-only or discarded by the caller.

This folder is isolated scaffolding until the Stage 30 gate is stable.
