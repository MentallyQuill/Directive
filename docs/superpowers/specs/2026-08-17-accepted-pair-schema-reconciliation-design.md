# Accepted-Pair Schema Reconciliation Design

## Problem

Mission evidence hardening limits each accepted-pair interpretation to four durable selections across mission claims and People observations. The generated native JSON schema currently applies separate limits: up to four claims and up to twenty-four People observations. A provider can therefore return schema-valid output that the parser rejects because the combined count exceeds four. The runtime treats that `invalid-output` result as unsettled accepted story state and pauses narration.

The live Sam Vickers pair at assistant message 40 and player message 41 exercises this mismatch. It contains a valid command-handover stage plus several observable senior-staff interactions, making a combined overage plausible even when the provider follows the supplied schema.

## Goals

- Keep the four-selection anti-hallucination bound.
- Keep exact source-quote grounding and pre-existing terminal progression gates.
- Prevent overflow People observations from invalidating otherwise usable mission evidence.
- Make the provider-facing schema and runtime parser describe the same total bound.
- Cover the exact live transcript shape with a deterministic regression.
- Preserve the existing chat and accepted narration; recovery must not generate narration.

## Non-goals

- Raising or removing the durable-selection limit.
- Relaxing evidence-quote membership checks.
- Allowing a terminal claim to create its own prerequisite in the same accepted pair.
- Automatically inventing missing mission evidence from narrative implications.
- Redesigning People extraction or the provider-routing system.

## Design

### Provider contract

The interpretation schema will constrain the combined claim and People-observation count to four. It will retain the existing closed candidate variants, source-slot restrictions, value restrictions, and quote length requirements.

The schema will express five mutually exclusive count branches: zero through four claims, with the corresponding People maximum of four through zero. The root remains a strict object so existing native structured-output routing continues to receive an object schema.

### Defensive parser boundary

The parser remains the authority even when a provider or provider adapter does not enforce the schema completely. When claims are within their existing maximum but the combined durable count is too large, the parser will retain all claims and only the number of leading People observations that fit the remaining capacity. Mission, Ship, and Cohesion evidence therefore has priority over optional People enrichment.

The parser will still reject unknown candidates, unauthorized source slots, unsupported values, missing or non-source evidence quotes, malformed time decisions, and structurally invalid output. Overflow pruning must never turn an invalid claim into accepted authority.

Diagnostics will report how many People observations were discarded for capacity, distinct from observations discarded because the assistant response was not accepted.

### Runtime behavior

A sanitized interpretation settles through the existing atomic state-spine path. No special fail-open route is added. Persistence failures, provider failures, malformed output, and invalid grounded evidence continue to pause settlement and remain retryable.

### Live recovery

After source verification, the installed extension will be synchronized. The pending 40/41 pair will be repaired through the same mission settlement authority with a guarded, deterministic interpretation derived from exact quoted source. A backup of the exact active save, index, chat, and timeline journal will be taken first. Recovery will not invoke the narration provider or append a new assistant message.

## Tests

- Schema tests prove every permitted claim count leaves only the corresponding People capacity.
- Parser tests prove an otherwise valid overflow result retains claims, trims People observations to four total, and reports the discarded count.
- The exact assistant 40 and player 41 transcript proves a handover-stage claim plus multiple People observations no longer returns `invalid-output`.
- Existing tests continue to prove quote absence, quote mismatch, unknown candidates, disallowed values, and more than four claims are rejected.
- Focused runtime tests prove the sanitized result settles atomically and retains retry behavior for genuine failures.
- The full alpha gate, installed-file parity, and installed-module live-save validation remain required before completion.

## Success criteria

The Sam Vickers chat can continue without the reconciliation modal caused by combined durable-selection overflow. The live save records only grounded evidence, no premature terminal objective is created, and all campaign-wide progression audits remain green.
