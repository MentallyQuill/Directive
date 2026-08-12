# Accepted-Pair Seconds Time Design

## Goal

Prevent ordinary dialogue and immediate action from disappearing as repeated zero-minute decisions while retaining model judgment for fictional duration and deterministic custody for accepted campaign time.

## Decision

The shared `acceptedPairMissionEvidence` result proposes a whole-number `elapsedSeconds` value for the complete accepted pair. The complete pair includes both the selected previous-assistant response and the current player response. Time interpretation remains independent of mission-claim acceptance: correcting or disputing an assistant claim does not erase the seconds consumed by the exchange.

Directive accumulates accepted seconds deterministically from the campaign's authored opening Stardate and `openingMinuteOfDay`. The model never writes canonical clock state. The visible final footer becomes:

```text
*Stardate 53068.4 | 08:30:47 hours*
```

The clock uses `00:00:00` through `23:59:59`. `24:00:00` is never stored or rendered.

## State and Compatibility

New state records add cumulative `elapsedSeconds`, a `shipClock.secondOfDay`, and bounded diagnostic time decisions. Existing V1 saves that contain only whole-minute fields remain valid: runtime derives their initial seconds as `elapsedMinutes * 60` and upgrades the time ledger on its next accepted decision.

Compatibility fields remain projections:

- cumulative `elapsedMinutes` is the floor of cumulative seconds divided by 60;
- `shipClock.minuteOfDay` is the floor of `secondOfDay / 60`;
- each new positive boundary carries exact `elapsedSeconds` and a numeric `elapsedMinutes` projection for mission clocks;
- legacy boundaries containing only `elapsedMinutes` rebuild as `elapsedMinutes * 60`.

## Decision and Custody

The strict model output is:

```json
{
  "time": {
    "decision": "advance",
    "elapsedSeconds": 47,
    "reason": "spoken exchange and brief physical action",
    "confidence": 0.84
  }
}
```

`advance` requires 1 through 2,678,400 seconds, equivalent to the existing 31-day bound. `unchanged` and `indeterminate` require zero seconds. Malformed output fails closed.

The prompt instructs the model to account for all visible speech, pauses, and actions across both messages. Continuous dialogue can remain within the same minute, but normally consumes seconds. There is no deterministic minimum or word-count formula in this revision.

Every valid decision is persisted in a bounded diagnostic list, including `unchanged` and `indeterminate`. Positive decisions additionally create accepted time boundaries. This makes zero-time behavior inspectable without giving diagnostics semantic authority.

## Deterministic Arithmetic

For opening Stardate `S`, opening second-of-day `O`, total accepted seconds `T`, and package Stardate units per day `R`:

```text
secondOfDay = (O + T) mod 86400
stardate = S + (T / 86400) * R
```

Stardate state retains deterministic internal precision while the footer displays one decimal place.

## Failure and Rebuild

- Provider or schema failure commits no decision and advances no time.
- A valid zero decision commits only its diagnostic record.
- Duplicate accepted-pair anchors reuse the prior decision and never advance twice.
- Branch invalidation removes affected decisions and boundaries, then rebuilds cumulative seconds from surviving boundaries.
- Legacy minute-only saves and boundaries remain loadable and rebuildable.
- The preset remains time-agnostic; all time instructions remain in the runtime packet.

## Verification

Automated coverage must prove seconds footer parsing and formatting, full-pair prompt scope, time independence from assistant mission acceptance, cumulative sub-minute advancement across turns, midnight rollover, long cuts, zero-decision diagnostics, duplicate idempotency, invalidation rebuild, legacy save compatibility, runtime prompt output, and the complete V1 gate.
