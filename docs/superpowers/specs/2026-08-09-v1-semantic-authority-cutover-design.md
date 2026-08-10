# V1 Semantic Authority Cutover Design

## Status

Approved implementation refinement of the V1 Gameplay Architecture, Unified Story Settlement, Mission State and Objective Resolution, and V1 UI and Legacy Retirement contracts. This design governs the non-UI cutover for new V1-native saves. It does not convert legacy saves and does not authorize player-facing UI changes.

## Decision

Every playable Directive V1 save carries an explicit, persisted gameplay-architecture stamp created with the save. The stamp makes Story Settlement and the V1 mission reducer authoritative. A save without the stamp is unsupported and cannot enter gameplay.

Runtime code must never infer authority from a campaign title, mission name, presence of V1 assets, or package identity alone. It validates the stamp against the active package and loaded mission definition. Missing, malformed, or mismatched V1 authority blocks gameplay. There is no alternate semantic runtime.

## Authority Stamp

The package manifest opts new saves into the architecture with a stable architecture identifier. Campaign creation materializes a compact record under `campaign.runtimeArchitecture`:

```js
{
  kind: 'directive.gameplayArchitecture.v1',
  contractVersion: 1,
  semanticAuthority: 'storySettlement',
  packageId: 'directive:campaign-package:breckenridge-ashes-of-peace',
  packageVersion: '0.3.0-pre-alpha.1',
  createdForNewSave: true
}
```

The record is branch-preserving data. Save As copies it with the rest of campaign state. Source custody remains branch-bound through the active save ID, mission state, Story Settlement, and CORE artifacts rather than by rewriting the architecture stamp.

Authority resolution has three results:

- `authoritative`: exact stamp, active package, runtime package, and active V1 mission definition agree;
- `blocked`: the stamp is absent, malformed, mismatched, or cannot resolve its required assets.

## Accepted-Pair Ordering

For a V1-authoritative save, processing the next player message performs:

1. prepare the exact selected-assistant/current-player snapshot;
2. run passive SRE source preflight;
3. adjudicate and commit accepted scene time through the narrow V1 time custodian;
4. run V1 accepted-pair interpretation and deterministic reduction;
5. continue classification and response generation from the refreshed committed state.

No alternate latest-pair settlement provider or Scene Handshake semantic operation exists in the V1 runtime. Failure blocks settlement and never selects another authority.

## Time Custody

The existing Scene Handshake time path also invokes the legacy open-world boundary processor, which can mutate quest, thread, story-arc, event, reaction, attention, and mission roots. V1 must not use that bundled path.

The V1 accepted-pair time custodian:

- uses the existing bounded time adjudicator and the same exact pair anchor;
- deduplicates by player message and source-range identity;
- updates only canonical `campaign`, `worldState`, and `timeLedger` time fields;
- emits a `directive.timeBoundary.v1` record consumed as authoritative time evidence by the V1 mission reducer;
- does not run legacy reactions, quest lifecycle, dynamic quest promotion, story events, or thread extraction;
- remains retry-safe if V1 semantic interpretation later fails.

Authored V1 mission clocks advance only from the committed boundary evidence accepted by the mission definition.

## Legacy Writer Retirement Gate

Delete the superseded semantic implementations rather than keeping dormant alternatives:

- Scene Handshake semantic settlement and ship `technicalDebt` extraction;
- Narrative Thread Director extraction and conversation-to-quest promotion;
- generic per-turn relationship memory derivation;
- legacy story-event and story-arc semantic append paths;
- legacy quest, reaction, and attention mutations caused by accepted-pair time advancement;
- automatic Command Bearing evidence mining or closure awards;
- legacy mission mutations that compete with `mission.v1`.

Retain infrastructure and presentation work that does not originate competing story meaning: CORE journaling, source frames, passive mutation detection, REPAIR, exact response custody, bounded Command Log presentation, prompt scheduling, and explicit authored Command Bearing spend/award mechanics.

Writer retirement is deletion, not a feature flag. Each retained writer must have a focused test proving its allowed roots and purpose.

## Failure Policy

- An unstamped or non-V1 save cannot enter gameplay.
- A V1 save never falls back to another semantic settlement path.
- Missing or invalid selected-pair custody produces no semantic mutation.
- Missing or mismatched V1 definitions produce a bounded blocked result with sanitized diagnostics.
- Provider or interpretation failure preserves committed time custody but creates no mission or Story Settlement claim; exact replay may retry.
- Projection or prompt failure cannot change authority or re-enable legacy writers.
- Source edits, swipes, deletion, regeneration, and branching continue through CORE/SRE/REPAIR invalidation and V1 reconstruction.

## Migration Policy

V1 supports only V1-native Ashes saves. Existing saves are not migrated, loaded into gameplay, or maintained by a compatibility runtime. There is no automatic in-place rewrite of old mission, quest, thread, relationship, ship, or story records.

This resolves the chicken-and-egg problem deliberately: the new architecture is the target; Ashes is authored and created natively for it; old content is migrated later to the target rather than shaping the target around legacy state.

## Acceptance Criteria

- New Ashes saves receive the exact persisted V1 authority stamp.
- Existing unstamped saves are rejected as unsupported.
- Stamp/package/definition mismatches block rather than fall back.
- A V1 accepted pair calls no legacy semantic settlement provider.
- V1 time advancement changes only canonical time roots before V1 reduction.
- V1 background scheduling creates no Narrative Thread, dynamic quest, generic relationship memory, technical-debt, or legacy story-event semantics.
- Source mutation reconstruction remains active.
- Focused tests prove route selection, exact-once behavior, sanitized failure, and writer gates.
- The full deterministic gate remains green before live certification.

## Final Rule

Save creation chooses the V1 architecture once. Runtime validates it on every semantic boundary. A save either settles through Story Settlement or is blocked; the systems V1 replaced do not remain in production code.
