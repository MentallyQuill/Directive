# V1 Semantic Authority Cutover Design

## Status

Approved implementation refinement of the V1 Gameplay Architecture, Unified Story Settlement, Mission State and Objective Resolution, and V1 UI and Legacy Retirement contracts. This design governs the non-UI cutover for new V1-native saves. It does not convert legacy saves and does not authorize player-facing UI changes.

## Decision

Fresh V1-native Ashes saves carry an explicit, persisted gameplay-architecture stamp created with the save. The stamp makes Story Settlement and the V1 mission reducer authoritative for that save. A save without the stamp remains on the legacy compatibility path even when it belongs to Ashes or uses the same package version.

Runtime code must never infer authority from a campaign title, mission name, presence of V1 assets, or package identity alone. It validates the stamp against the active package and loaded mission definition. A stamped save whose V1 assets are missing or mismatched is blocked from semantic fallback; it is not silently processed by legacy writers.

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

- `legacy`: no V1 stamp; preserve existing behavior and never initialize V1 implicitly;
- `authoritative`: exact stamp, active package, runtime package, and active V1 mission definition agree;
- `blocked`: a V1 stamp exists but is malformed, mismatched, or cannot resolve its required assets.

## Accepted-Pair Ordering

For a V1-authoritative save, processing the next player message performs:

1. prepare the exact selected-assistant/current-player snapshot;
2. run passive SRE source preflight;
3. adjudicate and commit accepted scene time through the narrow V1 time custodian;
4. run V1 accepted-pair interpretation and deterministic reduction;
5. continue classification and response generation from the refreshed committed state.

The legacy latest-pair settlement provider is not called. No legacy Scene Handshake semantic operations are applied. Failure never falls back to legacy semantics.

For a legacy save, the existing Scene Handshake path remains unchanged and the V1 accepted-pair reducer is not invoked.

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

All semantic legacy work must consult the same authority decision. In V1-authoritative scope, disable:

- Scene Handshake semantic settlement and ship `technicalDebt` extraction;
- Narrative Thread Director extraction and conversation-to-quest promotion;
- generic per-turn relationship memory derivation;
- legacy story-event and story-arc semantic append paths;
- legacy quest, reaction, and attention mutations caused by accepted-pair time advancement;
- automatic Command Bearing evidence mining or closure awards;
- legacy mission mutations that compete with `mission.v1`.

Retain infrastructure and presentation work that does not originate competing story meaning: CORE journaling, source frames, passive mutation detection, REPAIR, exact response custody, bounded Command Log presentation, prompt scheduling, and explicit authored Command Bearing spend/award mechanics.

Writer retirement is fail-closed per writer. A writer with ambiguous ownership does not run merely because it was previously scheduled. Each retained writer must have a focused test proving its allowed roots and purpose in V1 scope.

## Failure Policy

- A legacy save never enters V1 implicitly.
- A stamped V1 save never falls back to legacy semantic settlement.
- Missing or invalid selected-pair custody produces no semantic mutation.
- Missing or mismatched V1 definitions produce a bounded blocked result with sanitized diagnostics.
- Provider or interpretation failure preserves committed time custody but creates no mission or Story Settlement claim; exact replay may retry.
- Projection or prompt failure cannot change authority or re-enable legacy writers.
- Source edits, swipes, deletion, regeneration, and branching continue through CORE/SRE/REPAIR invalidation and V1 reconstruction.

## Migration Policy

V1 requires only newly created Ashes saves to use the new architecture. Existing saves are labeled and supported as legacy compatibility saves until a separately designed explicit migration exists. There is no automatic in-place rewrite of old mission, quest, thread, relationship, ship, or story records.

This resolves the chicken-and-egg problem deliberately: the new architecture is the target; Ashes is authored and created natively for it; old content is migrated later to the target rather than shaping the target around legacy state.

## Acceptance Criteria

- New Ashes saves receive the exact persisted V1 authority stamp.
- Existing unstamped Ashes saves remain legacy.
- Stamp/package/definition mismatches block rather than fall back.
- A V1 accepted pair calls no legacy semantic settlement provider.
- A legacy accepted pair calls no V1 reducer.
- V1 time advancement changes only canonical time roots before V1 reduction.
- V1 background scheduling creates no Narrative Thread, dynamic quest, generic relationship memory, technical-debt, or legacy story-event semantics.
- Source mutation reconstruction remains active.
- Focused tests prove route selection, exact-once behavior, sanitized failure, and writer gates.
- The full deterministic gate remains green before live certification.

## Final Rule

Save creation chooses the architecture once. Runtime validates that choice on every semantic boundary. A V1 save either settles through Story Settlement or reports that V1 settlement is unavailable; it never quietly revives the systems V1 replaced.
