# Recent systems hardening

The September 2026 hardening changes preserve the existing accepted-pair authority and atomic state gateway. No save migration or new authority store is introduced.

## Replay and evidence recovery

An already-settled source pair retains its committed continuity when narration is regenerated, swiped, reloaded, or refreshed for a provider change. Direction may refresh independently. Older settled pairs without continuity are not silently backfilled from a fresh nondeterministic extraction.

Interpreter validation retries receive at most eight diagnostic strings of 240 characters each. The feedback is labelled separately from source evidence, and the captured source pair and candidate set remain unchanged. Strict exact-quote and authority checks still apply before persistence.

## Causal continuity

Status updates follow validated source occurrence order. Contradictory updates with overlapping or ambiguous evidence are rejected rather than ordered alphabetically. Creation dependencies remain intact.

Information acquisition is ordered by the passage establishing both the statement and its audience, which can be later than the statement's original source. Shared receipt boundaries preserve the primary statement order within one briefing. The projection retains the stored order through pruning and branch rebinding; old events remain readable without fabricated acquisition positions. Exact evidence verifies custody, not the semantic truth of an asserted audience or claim.

## Recovery and settings

Retry belongs to its original runtime, bound campaign/save/chat, generation operation and attempt. Ownership checks surround awaited preparation and native continuation. A one-use handoff claim preserves Retry's own native interceptor entry; a later generation or retry attempt invalidates older failure callbacks. A stopped native request releases its event-suppression ownership independently of late transport cleanup. Canceled dossier outcomes are reconciled before an explicit retry selects replacement work.

Advanced settings preserve drafts while other saves complete. Versioned acknowledgements cannot overwrite a newer edit. Reset reserves both lane updates in order, discards the drafts it targets on success, and leaves later edits intact.

## Extraction evaluation

`tools/scripts/character-information-extractor-evaluation.mjs` supplements the older manually labelled narrator A/B/C pack with six synthetic extraction cases: private call, late arrival, partial document, reported communication, outdated report, and explicit briefing.

```powershell
# No provider call: report unrun cases.
node tools/scripts/character-information-extractor-evaluation.mjs

# Export actual production analyst requests, without expected labels.
node tools/scripts/character-information-extractor-evaluation.mjs --requests > requests.json

# Validate and score independently collected responses (object keyed by case ID).
node tools/scripts/character-information-extractor-evaluation.mjs --responses responses.json
```

Each response value may be a raw model string or parsed proposal. Use the exported envelope unchanged. The response replay path invokes the production analyst/parser with a fixture transport; it makes no network requests and does not access player saves. A real provider adapter can call exported `runExtractionEvaluation({generate})` using the generation router return contract. Do not send expected labels to the provider.

Scores separately report unsupported grants, omissions, correct receipts, unclassified records and structurally invalid cases. Exact labelled source-span matching is intentionally narrow: unclassified records require review. The scorer does not prove correct speaker attribution, belief, narrator prose, or full semantic understanding. In particular, the reported-communication case still needs human review to distinguish receiving a claim from independently knowing its alleged content.

The default CLI status is `unrun`. Supplied response scoring identifies itself as replay. Invalid cases, unsupported grants, omissions or unclassified records make the CLI fail. Fixture runs at 0.5x, 1x and 5x verify capacity propagation; empty, reasoning-only, token-limit, timeout and malformed outputs remain distinct failures.

No live provider or installed-host semantic benchmark is claimed by the deterministic suite. There was no dedicated evaluation endpoint configured for this implementation run. Real-provider evaluation should use the synthetic requests and a disposable campaign/host session, recording model/configuration, attempt counts, latency and human semantic adjudication without modifying a player's active save.

## Verification

The final `npm.cmd test` gate passed all 225 focused checks, including browser and persistence suites. The dedicated recovery suite passed 18 cases. Independent reviews covered replay/feedback, causal ordering, cancellation, settings and evaluation; their two discovered follow-up defects were corrected and re-reviewed before publication.
