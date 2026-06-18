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
5. Validate capability against authoritative state.
6. Resolve uncertain parts.
7. Create an outcome packet.
8. Ask the Director which causal pressures respond.
9. Validate the proposed state delta.
10. Commit state and ledger records.
11. Compose prompt context for the active SillyTavern narrator.
12. Generate prose from the committed outcome.
13. Store Command Log summary from the committed outcome.

## Swipe Rule

An assistant swipe must not reroll adjudication. It may regenerate prose from the same committed outcome packet.

## User Edit Rule

Editing a user message restores the pre-turn snapshot and resolves the revised action as a new outcome.

## Delete Rule

Deleting a message removes dependent state changes. If later turns depend on that state, they must be rolled back or marked invalid according to the branch policy.

## Branch Rule

A branch starts from the correct historical snapshot. It must not inherit consequences from turns outside that branch.

## Provider Failure Rule

A failed provider response cannot partially commit state. If parsing, validation, narration, or summary generation fails, the transaction must either:

- Resume from a recoverable checkpoint.
- Reuse a committed outcome.
- Roll back cleanly.

## Open Implementation Questions

- Which SillyTavern events expose user edits, message deletions, and branch changes reliably enough for first implementation?
- Should the turn ledger live in one campaign payload or a separate append-oriented payload?
- How much raw provider output should be retained for diagnostics?
- How are interrupted transactions resumed after browser reload?
- How much transaction state should be visible in Settings or Log debug surfaces?

