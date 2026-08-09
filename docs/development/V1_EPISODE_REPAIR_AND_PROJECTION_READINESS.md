# V1 Episode Repair and Projection Readiness

## Decision

The V1 Story Settlement repair path and composite player projection are ready to remain enabled as additive, read-only shadow architecture for the exact V1-native Ashes Prelude definition.

This slice does not authorize V1 cutover. It does not install narrator-prompt authority, retire legacy writers, render the projection in the player UI, or claim the full Ashes campaign is V1-native. No player-facing UI changed.

## Implemented Architecture

### Semantic episode custody

Accepted mission evidence still updates mechanics immediately, while meaningful effects accumulate into one active story episode. An episode can seal only at a validated hard boundary with a closed code and trusted provenance:

- mission transition;
- authored scene closure;
- save-branch change;
- major time jump;
- meaningful location transition;
- world settlement;
- source recovery.

Ordinary message count, token count, topic drift, speaker changes, emotional beats, room movement, and routine time advancement do not create story entries. A long active episode receives a compact deterministic checkpoint after a bounded contribution/effect threshold. The checkpoint advances review metadata only; it does not seal, summarize transcript prose, create a receipt, or call a model.

Soft-boundary interpretation is intentionally absent. Adding keyword or elapsed-time heuristics here would reintroduce the brittle, prose-sensitive behavior this architecture is meant to remove.

### Sealed source repair

A source edit, deletion, or selected-swipe change invalidates exact contribution identities, never textually similar records. If a sealed episode loses a source:

1. the stale episode becomes audit-only and immediately leaves current projections;
2. dependent effects and character moments are removed;
3. independent accepted effects survive;
4. a meaningful survivor set produces one new sealed replacement with a `source-recovery` boundary and an explicit `supersedesEpisodeIds` reference;
5. an empty survivor set produces no replacement;
6. repeated or multi-source invalidation remains idempotent and atomic.

The stale episode retains its original boundary for audit. The replacement cannot copy its old summary; it recomputes player-visible text from surviving authored effects. Focus clears conservatively instead of guessing that an unresolved consequence retained equivalent identity.

### Concise projections

One pure composite projection now derives from the exact active definition, package assets, mission state, Story Settlement, and current structured campaign state:

```text
directive.playerProjection.v1
|- mission: spoiler-safe objectives, known facts, visible clocks, outcome dimensions
|- story: current sealed episodes, visible changes, visible unresolved consequences
|- ship: one operational aggregate
`- people: authored crew identity, explicit player-known posture, rare sealed moments
```

The composite is ephemeral and deterministic. It does not persist a second truth, invoke a provider, install prompt context, or mutate campaign state. Exact package, definition, version, and save-branch binding fail closed.

Semantic ownership is deliberately narrow:

- Mission owns objectives, progress, known facts, clocks, and mission disposition.
- Story owns durable episode summaries and unresolved consequences.
- Ship owns one condition/capability/readiness aggregate plus confirmed damage and explicit restrictions.
- People owns crew identity, explicit player-safe posture, current mission relevance, and at most three valid sealed moments per person.

Story and People do not copy objectives. Ship links at most one authored readiness objective/dimension. Mission does not copy story entries.

## Anti-Spam and Spoiler Guarantees

The reported Breckenridge failure case is an explicit regression fixture. New-plating smell, one corridor-light flicker, a sensor-calibration remark, and repeated generic refit concerns produce zero V1 issue rows. The projector exposes one ship condition summary and never copies legacy `ship.technicalDebt`.

Routine dialogue or mere character presence produces zero character moments. A People card may legitimately contain only authored identity and role. Moments must already be explicit, player-visible annotations on a current sealed episode; this slice consumes them but does not authorize model extraction.

Hidden mission facts, hidden questions, relationship scores, private stance, provider diagnostics, transcript prose, hashes, evidence queues, and source-level rows are absent from the player projection. The Hesperus fraud remains hidden until mission state deterministically marks its player-safe facts/objectives visible.

## Robustness Challenge

| Risk | Current mitigation | Remaining boundary |
|---|---|---|
| A valid semantic scene never reaches a hard boundary | Mechanics still settle immediately; checkpoints bound review metadata without inventing significance | Add a bounded soft-boundary evaluator over an active-episode capsule, then prove it against varied prose before it may seal |
| An authored hard boundary is emitted incorrectly | Closed codes, trusted source kinds, branch checks, and accepted-source checks fail malformed signals | Campaign reducers and transition emitters still require scenario review; deterministic code cannot repair bad authoring |
| A source edit leaves stale player data | One current-episode selector feeds Story, Prompt-ready, and People projections; sealed replacement is survivor-backed | Live SillyTavern edit/delete/swipe timing and persisted artifact inspection remain required |
| Projection silently combines another save or package | Exact definition/version/package/source and branch bindings fail closed | Save As and chat switching need isolated live-host rehearsal |
| Ship mention spam returns through another field | Legacy technical-debt rows are ignored entirely; only confirmed structured damage/restrictions and authored readiness project | Future ship effect types need stable authored target IDs and anti-spam tests before projection support |
| People becomes a conversation-memory ledger | Absence is valid, presence creates nothing, moments require current sealed annotations and are capped | Moment extraction is deliberately not implemented; its precision/recall policy is a later design gate |
| Hidden plot leaks through summaries | Only authored player text and visible current effects/facts project; hidden canaries are tested | Prompt and UI consumers need their own end-to-end hidden-canary tests before cutover |
| The composite becomes another persisted authority | It is rebuilt on demand, makes no model or persistence call, and survives JSON restart identically | Consumers must continue to treat source refs and revision pairs as freshness evidence, not writable state |
| Similar information appears on every page | Each section has one semantic owner and cross-links only narrow current relevance | The actual UI mapping still needs approval and page-by-page visual verification |
| Deterministic rules miss freeform play | The model proposes only authored evidence candidates; code validates and reduces them | Live provider recall, abstention, negation, quoted speech, and indirect prose remain certification obligations |

## Verification Evidence

Fourteen focused suites passed directly on 2026-08-09:

- episode boundary, Story Settlement contracts, and Story Settlement lifecycle;
- story, prompt-ready, ship, people, and composite projections;
- source-rebuild projection;
- V1 state spine, mission runtime, source-mutation runtime, and accepted-pair orchestrator.
- the real runtime-app shadow API through the fake Directive host.

These suites prove repeated-read and JSON-restart equality, no projection-time state mutation or model call, exact binding isolation, spoiler canaries, anti-spam ship behavior, absence-valid people behavior, current sealed supersession, and stale-source removal.

The complete repository alpha gate then passed all **261 checks** in **202.3 seconds**. This includes package and schema validation plus existing CORE, REPAIR, SillyTavern host, source mutation, persistence, scale, prompt-safety, and UI regression suites.

Independent review found and drove regressions for five integration risks before certification: chat-capability coupling, incomplete package pinning, malformed persisted state, duplicated readiness-objective content, and non-atomic mission/story rebuild evidence. A second challenge pass then closed forged derived visibility by requiring mission authority to replay from accepted evidence, and aligned fractional time replay with the positive-finite-number evidence contract. The final review reported no remaining Critical or Important findings.

Deterministic gate success is baseline evidence only. It does not substitute for live-provider behavior, player usability, or the required isolated SillyTavern rehearsal and multi-user certification.

## Commit Ledger

- `783278a2 feat(story): formalize episode boundaries`
- `617b15c3 feat(runtime): enforce semantic episode boundaries`
- `fa4e3643 feat(story): supersede stale sealed episodes`
- `be35b687 feat(projection): derive current V1 story context`
- `d2398a83 feat(projection): consolidate ship status`
- `acb39bfa feat(projection): derive concise people views`
- `9363cb7d feat(projection): compose V1 shadow views`

This certification record is the terminal documentation commit for the implementation slice.

## Residual Cutover Gates

The following work remains intentionally outside this readiness claim:

1. **Active working capsule and soft-boundary evaluator:** summarize only bounded structured episode state, not transcript, and treat the model as a proposal source rather than boundary authority.
2. **Character-moment extraction:** define rare-event eligibility, source custody, abstention, deduplication, and player visibility before any model can create annotations.
3. **Duty Report delivery:** schedule, narrate, acknowledge, deduplicate, and settle what the player actually learned, including Whitaker or capable-crew fallback.
4. **Prompt-authority installation:** make the bounded V1 prompt packet authoritative with budget, hidden-canary, stale-source, and fallback tests.
5. **V1 mission transition:** activate exactly one V1-native successor from a terminal transition packet and remain idempotent through narration failure, reload, and reconstruction.
6. **Remaining Ashes migration:** Prelude/Hesperus alone is not a complete V1-native campaign. Convert and scenario-certify the remaining missions against the new contracts.
7. **Legacy writer retirement:** use an exact package/definition/version cutover registry; remove overlapping semantic writers only after parity evidence, never through a broad campaign-name switch.
8. **Parity and isolated live soak:** measure interpretation disagreements, abstentions, latency, no-effect volume, source mutation, restart, Save As, and chat isolation in Directive soak profiles, never `default-user`.
9. **Player-facing UI approval:** map the approved composite to Mission, Campaign, People, and Ship with no redundant rows or new clutter. No renderer, layout, label, or interaction change is authorized yet.
10. **Full certification:** complete the 20-turn strict rehearsal and 25-turn five-user certification, inspect execution artifacts, then obtain operator approval.

Non-Ashes campaigns remain name-and-image teasers, greyed out and unselectable, and do not block the Ashes-only V1 release boundary.

## Next Slice

The next non-UI implementation slice should build the active working capsule and bounded soft-boundary evaluator, because that resolves the largest remaining durability risk: an open episode that accumulates too long. It must reuse the existing accepted-source custody and closed hard-boundary contracts, fail soft without sealing, and remain separate from narrator-prompt authority until its live recall and abstention behavior are measured.
