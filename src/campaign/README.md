# Campaign Source

Authoritative campaign state, campaign-state projection, state manager, turn ledger, transaction manager, rollback manager, and campaign import/export code.

`campaign-start.mjs` turns an accepted package-driven Character Creator review into initialized campaign state from the active projection.

`campaign-start-service.mjs` is the runtime-facing workflow layer for starting/resuming Character Creator drafts, accepting a draft into the first campaign save, Save Game, Save Game As, stable-turn autosaves, and Load Game.

`transaction-state.mjs` commits Director turn packets into campaign-owned state, including optional Command Competence ledger records when a turn carries a `competencePacket`.
