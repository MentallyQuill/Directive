# Preserve state application ownership through publication

Part of the approved complete-history integration work. Keep each logical state application intact from synchronous source validation through asynchronous publication. Independent implementation and review are required by the parent plan.

The gateway supplies a detached frozen context containing exact before/after state, resolved proposal ID, normalized domains, allowed descriptor data and source preconditions. Progress services and cancellation objects remain outside that evidence. Forward options even when there is no progress scope. Preserve synchronous preconditions, no-change behavior, rollback and uncertainty semantics.

The runtime forwards that context to the controller. The controller copies candidate/prior state before its first await, verifies supplied application evidence against both states and custody identity, and rechecks publication/selection ownership after the asynchronous read barrier. A caller mutation during the read must not change the saved candidate. Concurrent calls must not both acquire publication ownership.

Verification reads also retain selection ownership: delayed successful or failed intent reads cannot overwrite pending state or quarantine a newer completed publication. Reproduced regressions prove recovery remains blocked while the publisher owns its intent and obsolete reads leave completed saves available.

- [x] Reproduce caller-mutation publication with a failing controller regression.
- [x] Implement gateway context and runtime/controller forwarding with focused regressions.
- [x] Independently review integrated behavior, run release gate, and publish verified scope.
- [x] Verify installed identity and a bounded native application through the runtime.

This does not activate history capture. Assistant finalization still needs an exact generation-owner lifecycle and admission checks. A blanket queue wait would deadlock generation preparation, which itself commits state through that queue. Full capture also requires baseline/lifecycle enrollment, non-prefix edits, inherited ownership and the historical branch consumer.

Published source `56398d23ae00821f2cb64c23deda58865d76cc62` passed independent integrated review and all 243 checks. Native reload/reopen and normal portrait import/remove passed with 672 installed/served files verified, custody 8 to 10, restored null portrait, owned resource cleanup, preserved campaign/checkpoint/transcript state and zero provider dispatch. Detailed scope and evidence are in the stabilization report.
