# Durable Accepted-Pair Settlement Receipts

## Goal

Prevent complete-chat replay after native branching from reinterpreting historical accepted pairs, while ensuring a genuinely new or mutated assistant/player pair is never silently treated as settled.

## Authority

Story Settlement remains the sole semantic authority. It gains an optional `acceptedPairReceipts` collection so existing V1 saves remain valid without migration. A receipt is committed atomically with the accepted-pair settlement that produced it, including semantically insignificant and corrected/rejected assistant outcomes.

Each receipt contains:

- a branch-independent fingerprint derived from both exact normalized source descriptors;
- the previous assistant message ID, selected swipe ID, and text hash;
- the current player message ID, selected swipe ID, and text hash;
- the source-range hash;
- the interpreter's exact assistant-acceptance outcome;
- the accepted source contribution IDs that entered Story Settlement custody; and
- the Story Settlement revision at which the receipt committed.

The receipt ID includes both the source fingerprint and the acceptance outcome. Matching compares the stored descriptors as well as the fingerprint, so hash collision alone cannot establish settlement.

## Settlement and replay

The mission runtime checks durable accepted-pair receipts before invoking the Utility provider. An exact receipt returns `already-settled`. Existing saves without receipts may still reconcile an accepted assistant/player pair when both exact, non-invalidated Story Settlement contributions survive; one contribution can never prove settlement for the pair.

Every successful interpretation records or replaces the exact receipt in the same state-spine proposal as mission, Story Settlement, time, People, Ship, Cohesion, and Command Bearing effects. There is no bounded retention limit.

## Invalidation and native branching

Editing, deleting, or changing a swipe removes every receipt that names the affected host message, even when corrected/rejected assistant prose never entered contribution custody. Authority-only invalidations must still commit when there are no mission or Story Settlement contribution IDs.

Causal rollback also removes receipts for every descendant contribution or message whose mission/story effects are discarded. A descendant receipt cannot outlive the authority it summarizes and suppress the reinterpretation required to rebuild that authority.

Native branch reconstruction passes every discarded host message ID through the same receipt invalidation path before custody rebinding. Retained receipts survive rebinding because their source fingerprint is branch-independent, while their branch custody field is rebound to the child save.

After invalidation, the next exact interpretation creates a replacement receipt with the new outcome and current Story Settlement revision. Historical invalidation markers do not disable that replacement receipt.

## Compatibility and safety

- `acceptedPairReceipts` is optional in schema version 1; new empty settlements initialize it to `[]`.
- Existing accepted pairs can use the exact two-contribution fallback once, without provider calls.
- Existing corrected/rejected pairs without a durable receipt fail closed and may be interpreted once to establish one.
- Time decisions remain bounded time custody and are not semantic settlement receipts.
- Rejected/corrected assistant prose remains absent from contribution custody.

## Verification

Regression coverage must prove:

1. exact retained and exact invalidated-then-resettled accepted pairs use zero provider calls;
2. retaining assistant A, discarding player U, then receiving U2 invokes the provider;
3. corrected/rejected assistant edit or swipe invokes the provider;
4. exact corrected/rejected replay remains idempotent after more than 128 later time decisions;
5. accepted-to-invalidated-to-corrected resettlement remains idempotent after rebinding;
6. identical assistant text under another swipe ID invokes the provider; and
7. invalidating a historic mission closure removes descendant receipts so replay reinterprets every rolled-back pair; and
8. the complete 134-check repository gate passes before installation and push.
