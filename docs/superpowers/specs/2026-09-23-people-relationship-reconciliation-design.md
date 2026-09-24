# People relationship reconciliation design

Date: 2026-09-23

## Outcome and scope
Keep People unfinished business consistent with accepted outcomes, including fulfillment through another person. Preserve current posture, character knowledge, complete history, and deterministic source rollback. Keep the existing accepted-pair Utility and episode evaluator roles; add no mutable relationship database or always-on model stage. The user authorized design, plan, implementation, verification, and push to main as one goal. Do not change the installed SillyTavern host or its saves.

## Observed problem
The interpreter sees a known-person directory but no unresolved matters. Episode updates couple posture and open matter and require same-person evidence. A saved test campaign records the scheduling conflict resolved with Saye while Cross's obligation remains open. The parser also slices People observations to the remaining combined claim budget before validating them, allowing information loss to count as success.

## Design
### Stable matter targets and conditional resolutions
Use the existing visible active `character.relationshipOpenMatter` effect ID as the exact matter identity. Add a pure shared relationship projection over current surviving episodes. It returns current posture, current matter and effect ID, and resolution guards. A `relationshipMatterResolved` People event names `personId` and `matterEffectId`, retains the accepted source contribution and quote/hash, and clears only that exact latest matter. An unrelated or newer matter cannot be cleared. No effect changes posture, inferred trust, information access, audience, or character knowledge.

Validate new resolutions against the current unresolved target at admission. Persist resolutions in the existing episode People event array. Source invalidation removes events through existing custody; projection applies a resolution only while its target survives. Thus removing resolution evidence reopens a surviving matter, removing the original matter cannot clear a later one, and historical saves remain valid without migration.

### Accepted-pair context and observation
Add a bounded `openMatters` directory to People interpretation context: person ID, effect ID, text, original source IDs. Use the existing episode relationship-count and text limits; expose omitted count explicitly. Deterministic recent-first selection limits context, never stored history. An obligation longer than the configured text budget is omitted and counted rather than exposed as an incomplete resolution target. The model may propose `relationshipMatterResolved` only for supplied exact targets, citing an accepted assistant outcome. Player plans, claims of success, attempts, and future promises cannot resolve matters. The materializer rechecks target identity before creating an event.

### Episode reconciliation
The existing episode request uses the same relationship projection and includes exact unresolved IDs. Add optional `openMatterResolutions` proposals referencing the target and an existing quoted assistant-backed relationship-evidence event in the request, even if that event concerns another person. Reconcile as part of the existing review commit. Reject duplicate targets, stale targets, simultaneous reopening, missing quotes, user-only evidence, and unrelated/nonexistent event references. Outcome sources must not precede the originating obligation sources; same-contribution evidence is eligible. Emit only changed relationship fields so a later posture-only review cannot replace resolution custody with an independent null-matter effect. Keep normal same-person validation for posture and defining moments. Prevent old relationship evidence from recreating a resolved matter: after resolution, a new open matter must cite relationship evidence from a contribution after that resolution. This does not infer that the original person learned the outcome.

### Overflow recovery
Never slice observations before validation. The ordinary combined selection budget remains in force. Add `peopleCoverage: complete|overflow` to the requested schema; tolerate its absence in historical fixture/provider output. Overflow, excess shared capacity, or a saturated legacy output triggers at most one People-only recovery request through the same Utility role. The recovery has its own existing `interpreterMaxPeopleEvents` bound, no mission/time/acceptance authority, and must preserve every already valid observation exactly while adding omitted observations. Mission claims, time, and pacing remain frozen from the validated initial result. Use the same sources, context, evidence catalog, cancellation, timeout, and callback mechanisms.

Recovery must declare complete coverage. Validate all returned events and reference dependencies. Over-budget, incomplete, malformed, cancelled, or failed recovery returns an explicit failure before any settlement; normal retry handles the pending accepted pair. Diagnostics report recovery attempted and recovered counts, never a successful discarded-overflow count. This cannot detect semantic omissions in an otherwise plausible model response; live quality remains a separate qualification.

## Compatibility and limits
New fields are additive, and old saves require no migration. Player-facing People layout stays unchanged. Narration and UI consume the same reconciled state. No automated repair or reprocessing of existing live saves. No promise of complete NPC-to-NPC tracking. Matter selection is bounded; omitted matters remain stored and are eligible for later episode review.

## Verification
Regress Cross fulfilled through Saye, unchanged posture/knowledge, rejected player-only outcomes, stale and wrong-person targets, duplicate resolution, later replacement matter, active/sealed source invalidation, branch replay, save/reload, repeated admission, and old evidence reopening. Test busy mission turns with introductions and local references, explicit and legacy overflow, preservation of initial events, malformed tail entries, cancellation, recovery failure, and no partial commit. Run focused scripts and the complete alpha gate; obtain a fresh branch review, fix material findings, then push a fast-forward result to main and verify the remote SHA.
