# Turn Transactions

## Requirement

Directive state must remain stable under normal SillyTavern chat operations:

- Assistant swipes.
- User edits.
- Message deletion.
- Branch creation.
- Interrupted generation.
- Provider failure.
- Extension disable or reload.

## Consequential Turn Flow

For a consequential player message:

1. Snapshot authoritative state.
2. Assign a unique turn ID.
3. Classify whether the turn is consequential.
4. Parse intent, assumptions, claimed outcomes, orders, targets, and requested resources.
5. Build the Command Competence packet: routine actions, professional knowledge, Domain Reports, Authority Notes, Procedural Warnings, standing-order matches, and no-gotcha checks.
6. If a serious or critical warning needs confirmation, pause before outcome resolution and let the player confirm, revise, or request counsel.
7. Validate capability against authoritative state.
8. Resolve uncertain parts.
9. Create an outcome packet.
10. Ask the Director which causal pressures respond.
11. Validate the proposed state delta.
12. Commit state, competence records, pressure records, and other ledger records.
13. Compose prompt context for the active SillyTavern narrator.
14. Generate prose from the committed outcome.
15. Store Command Log summary from the committed outcome.

## Swipe Rule

An assistant swipe must not reroll adjudication by default. It may regenerate prose from the same committed outcome packet.

The campaign intro is the only pre-turn exception because no outcome packet exists yet. Before the first player message, `Rewrite Intro` may regenerate the intro packet, append it as a selected native SillyTavern assistant swipe, and record the selected intro revision in the activation journal. Directive also marks the pristine SillyTavern intro with `overswipe_behavior: "regenerate"` so the host's native right-swipe affordance can create an alternate first-message swipe instead of treating it as a non-regenerating greeting. After any player message exists in the campaign chat, Directive intro rewrites are locked.

Player-facing default label:

```text
Rewrite Narration
```

Directive should also offer an explicit player-selected adjudication rerun.

Recommended label:

```text
Rerun Outcome
```

`Rerun Outcome` creates a replacement outcome candidate and should warn the player that consequences, relationships, mission clocks, and the Command Log may change. The current committed outcome remains restorable until the player accepts the replacement.

Current runtime behavior:

- `Rewrite Narration` maps to narration retry/regeneration from the committed turn packet.
- `Rerun Outcome` creates a pending replacement candidate from the original pre-outcome snapshot.
- The current campaign state remains unchanged while the replacement is only previewed.
- Accepting the replacement commits against the original snapshot, so dependent outcomes are dropped and Command Bearing spends/awards from the replaced outcome are rolled back.
- Cancelling the replacement preview leaves the current committed state untouched.

## User Edit Rule

Editing a user message restores the pre-turn snapshot and resolves the revised action as a new outcome.

## Delete Rule

Deleting a message removes dependent state changes. If later turns depend on that state, they must be rolled back or marked invalid according to the branch policy.

## Branch Rule

A branch starts from the correct historical snapshot. It must not inherit consequences from turns outside that branch.

Current `Save Game As` behavior records branch metadata:

- Parent save id.
- Parent save name.
- Divergence outcome id.
- Branch timestamp.

The branch payload is written from the active campaign state, not from a stale source-save payload.

## Provider Failure Rule

A failed provider response cannot partially commit state. If parsing, validation, narration, or summary generation fails, the transaction must either:

- Resume from a recoverable checkpoint.
- Reuse a committed outcome.
- Roll back cleanly.

## Open Implementation Questions

- Which SillyTavern events expose user edits, message deletions, and branch changes reliably enough for automatic interception?
- Should the turn ledger live in one campaign payload or a separate append-oriented payload?
- How much raw provider output should be retained for diagnostics?
- How are interrupted transactions resumed after browser reload?
- How much transaction state should be visible in Settings or Log debug surfaces?
