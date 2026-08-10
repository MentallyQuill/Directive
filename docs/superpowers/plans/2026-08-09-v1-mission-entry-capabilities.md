# V1 Mission Entry Capabilities Implementation Plan

> Status: approved prerequisite under the standing V1 architecture scope. This plan changes non-UI mission state and projection contracts only; it does not authorize player-facing rendering or narrator-prompt changes.

**Goal:** Give a newly activated V1 mission exact, reconstructable knowledge of durable capabilities earned in earlier V1 missions, so later missions can make prior choices materially alter options and costs without adding an inventory ledger, duplicating domain trackers, or trusting transition prose as state.

## Why This Is Required

The current journey archives each terminal mission and its outcome dimensions. Transition packets also include player-safe optional-result prose. Activation, however, creates the successor with a fresh `createMissionState(...)` and no typed entry context. The successor therefore cannot distinguish an earned asset from an unearned one through predicates, state authority, or player projection.

Chapter 8 is the first mission where this omission becomes unacceptable: the source explicitly requires prior allies and assets to change what is possible or costly across simultaneous fronts. Treating every asset as available would erase choices; treating none as available would erase rewards; relying on narrator memory would be brittle and unreconstructable.

## Minimal Contract

Add optional `entryCapabilities` to `directive.missionDefinition.v1`. Each authored capability contains:

- a stable capability ID;
- an exact source mission definition ID and version;
- one or more required source outcome-dimension matches;
- concise player text containing a label and material effect summary.

Example shape:

```json
{
  "id": "capability.chapter8.quiet-channels-network",
  "source": {
    "definitionId": "mission.open-orders-1-work-worth-doing",
    "definitionVersion": "1.0.0",
    "requirements": [
      {
        "dimensionId": "dimension.open-orders1.quiet-channels",
        "in": ["asset-earned"]
      }
    ]
  },
  "playerText": {
    "label": "Quiet Channels Network",
    "summary": "Maintains communication when official relays are compromised."
  }
}
```

Every requirement is conjunctive. `in` handles multiple acceptable results without adding a general cross-mission predicate language. A capability derives only from one exact archived source definition/version; no current mission may self-import.

## Entry Receipt and State Authority

Successor activation evaluates the target definition's capability rules against the complete newly archived journey history. The new mission state stores one bounded `entryContext`:

```json
{
  "kind": "directive.missionEntryContext.v1",
  "capabilities": [
    {
      "id": "capability.chapter8.quiet-channels-network",
      "sourceRunId": "mission-run...",
      "sourceDefinitionId": "mission.open-orders-1-work-worth-doing",
      "sourceDefinitionVersion": "1.0.0",
      "dimensions": [
        {
          "id": "dimension.open-orders1.quiet-channels",
          "value": "asset-earned"
        }
      ]
    }
  ]
}
```

This is not user-editable inventory. It is an activation receipt whose source is an archived terminal mission. The state validator checks exact authored capability identity, source binding, requirement coverage, allowed values, uniqueness, and stable ordering. Journey validation additionally proves each receipt against the exact earlier archive and run ID.

`createMissionState(...)` accepts an optional entry context. Mission-state authority rebuild uses the stored context before replaying accepted evidence. Journey reconstruction derives it again from rebuilt archived outcomes; source invalidation therefore removes capabilities whose earning result no longer survives.

Definitions without `entryCapabilities` receive an empty context and preserve existing behavior. Missing entry context from older in-development V1 state is treated as empty for compatibility only when the definition declares no entry capabilities. A mission that declares imports fails closed if its entry context is absent or unverifiable.

## Predicate and Projection

Add one bounded predicate operator:

```json
{ "capabilityAvailable": "capability.chapter8.quiet-channels-network" }
```

It references only capability IDs authored by the current mission definition. No predicate may query arbitrary history or another mission's raw state.

The mission player projection adds one `capabilities` array containing only the capabilities proven in the entry receipt, in definition order. Each entry has `id`, `label`, and `summary`. This is a concise data contract for later approved UI and narrator work; the current interface does not render it in this slice.

Capabilities change available methods, evidence routes, or costs. They never directly complete objectives, establish world results, select a strategy, or guarantee a favorable terminal disposition.

## Robustness Boundaries

- Exact source definition and version prevent semantic drift after campaign updates.
- Exact source run identity prevents a receipt from borrowing another save's state.
- Exact dimension/value matches avoid model interpretation during activation.
- Definition order provides deterministic projection and hashing.
- Multiple requirements support compound capabilities without a broad query language.
- The receipt contains only high-value durable capabilities, never momentary equipment, dialogue, routine competence, or scene color.
- Archived definitions remain required for validation and repair.
- A missing source definition, missing archive, dimension mismatch, duplicated receipt, unknown capability, or forged value fails closed.
- Capability derivation does not call a provider.
- No capability becomes a ship condition, relationship moment, quest, thread, command-log entry, or Command Bearing record.

## Implementation Tasks

### Task 1: RED contract and predicate

- [ ] Extend mission-contract tests with valid and hostile `entryCapabilities` definitions.
- [ ] Extend predicate tests with `capabilityAvailable`, unknown-ID rejection, true/false evaluation, and boolean composition.
- [ ] Keep the definition field optional and reject self-import, duplicate IDs, empty requirements, duplicate requirement dimensions, malformed versions, and empty player text.

### Task 2: State and projection

- [ ] Add the entry-context contract, derivation-free state initialization, structural validation, and exact projection.
- [ ] Prove missing/spoofed/duplicated/wrong-version/wrong-value receipts fail closed.
- [ ] Prove mission-state authority rebuild preserves entry context while evidence replay remains unchanged.
- [ ] Prove definitions without capabilities remain backward compatible.

### Task 3: Journey activation and repair

- [ ] Derive receipts only from exact earlier terminal archives during successor activation.
- [ ] Validate current and archived mission entry receipts against the appropriate earlier history prefix.
- [ ] Prove earned, unearned, compound, and multiple-capability activation paths.
- [ ] Prove reload, idempotency, tamper rejection, source invalidation, and deterministic reconstruction without provider calls.

### Task 4: Runtime and certification

- [ ] Extend transition/runtime proof so real activation persists and projects capabilities without touching legacy roots.
- [ ] Run focused mission contracts, predicates, state authority, projection, journey, transition, source-rebuild, and runtime suites.
- [ ] Challenge save compatibility, circular/self imports, definition drift, stale archives, capability spam, automatic-win semantics, and UI duplication.
- [ ] Fix every Critical or Important finding, run the full gate, record readiness, and then resume Chapter 8 mission fixtures.

## Explicit Non-Goals and Stop Boundary

- No generic inventory system.
- No mutable capability acquisition during an active mission in this slice.
- No arbitrary query language over campaign history.
- No model call for activation or capability derivation.
- No automatic objective progress or success from capability availability.
- No duplicate ship, relationship, quest, thread, log, or Command Bearing records.
- No player-facing UI, narrator prompt, notification, or chat-presentation changes.
- Stop only before an actual player-facing UI or narrator-prompt change.
