# Character Information Access Implementation Plan

Approved design: extend existing continuity analysis/history with evidence-backed access to consequential statements. No additional model stage, independent knowledge store, dialogue generator, or mandatory narration reviewer. No changes to live SillyTavern installation/data.

Architecture: optional informationAccess on addFact records describes receipt/observation, not truth or belief. Audience evidence uses existing source anchors and contributes to invalidation. Immutable archived statement events drive a bounded character projection; supersession/resolved threads do not erase acquired information. Old events remain valid and coverage is explicitly partial.

- [x] Contracts/events: add bounded typed access metadata, source validation, multi-source custody, projection and branch rebinding; regression tests first.
- [x] Analyst: expose metadata in existing schema, reference known people only, evidence rules for direct speech/observation/read material, no retroactive or imagined communication. Keep current call count and limits.
- [x] Narration: derive per-character records locally from surviving history, cap payload, preserve partial coverage and professional competence, wire into existing packet.
- [x] Verification: deterministic Nayar contrast cases, disclosure/edit/branch/supersession/legacy tests, schema and runtime integration, complete alpha gate, independent review.
- [x] Evaluation artifact: repeatable A/B/C prompt fixtures and offline evidence without claiming unrun provider results. Record latency limitations.
- [x] Integration prepared: reviewed scoped files for a fast-forward to main. Publication and remote SHA verification follow the passing gate; preserve dirty debug.log.

Rulings: source-backed extraction is a semantic model responsibility; structural validation proves custody only. Missing records never imply ignorance. Statement-level access lives inside current continuity facts; a new information category allows consequential disclosures without inventing obligations. Audience evidence is bounded to supplied pending pair; insufficient historical audience proof remains unestablished rather than guessed. Broader historical backfill is not performed on live saves.

Verification outcome: all 219 alpha-gate checks passed; independent final review found no material issues. The offline eight-case evaluation pack is generated successfully and explicitly unrun against providers. No live semantic or latency improvement is claimed.
