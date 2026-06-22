# Model Call Robustness Pass Plan

## Purpose

This plan turns the current model-call audit into an implementation pass.

Directive's current architecture is sound: deterministic code owns authoritative campaign state, the Mission Director adjudicates mechanics, narration happens after commit, and sidecars are proposal-only. The robustness pass should preserve that shape while removing pre-alpha brittleness in routing, classification, proposal contracts, and cross-system ownership.

The highest-risk item is chat turn classification. Player language will vary widely, and the runtime should tolerate indirect phrasing, roleplay prose, mixed intent, typos, questions, and vague confirmations without accidentally committing campaign mechanics.

## Core Decision

Directive should use models for language interpretation, counsel, narration, summaries, and bounded proposals. It should not use model output as direct campaign truth.

The target model-call posture is:

```text
Player language
  -> deterministic ingress and safety normalization
  -> high-precision deterministic fast path
  -> Utility semantic classification when intent is not obvious
  -> deterministic arbitration and validation
  -> deterministic Mission Director mechanics
  -> Reasoning/Reasoner narration or counsel
  -> proposal-only sidecars through allowed-root validation
```

This keeps flexible language handling without handing campaign authority to a provider.

## Implementation Checkpoint

This pass has now implemented the first robustness slice:

- generation roles declare explicit Utility/Reasoning lanes;
- provider routing and the fake host derive lane selection from the role registry;
- `sideMissionStateSignalDetector` separates side-mission state proposals from provider-assist side-mission phrasing/framing roles;
- `turn-intent-contract.mjs` owns classifier enums, slot normalization, worker-plan validation, hidden-output rejection, and deterministic arbitration;
- `utilityTurnClassifier` is the default semantic path for non-fast-path campaign messages;
- `tests/fixtures/classifier/turn-intent-language.fixture.json` covers 154 expanded player-language fixtures;
- sidecar state-delta and Command Log outputs validate through shared sidecar output contracts and schema IDs;
- `model-call-authority-matrix.mjs` is the code-owned role/domain authority matrix;
- `runtimeTracking.modelCallJournal` records sanitized model-call events without raw prompts, raw player text, hidden context, or raw provider output;
- Settings renders recent sanitized model-call diagnostics in the Providers section.

## Current Brittle Items

### 1. Provider Lane Routing Is Implicit

Current behavior:

- `providerKindForRole()` uses a hardcoded Utility allowlist.
- Every role not in that set silently routes to the Reasoning/Reasoner provider.
- The role definitions in `src/generation/generation-roles.mjs` describe behavior but do not own an explicit provider lane field.

Why this is brittle:

- New roles can silently land on the Reasoner lane.
- A role can advertise low-cost or utility-like preferences while routing elsewhere.
- Tests can cover known examples without proving that every role is intentionally assigned.
- Settings diagnostics can show configured providers, but not a complete role-to-lane map.

Robust target:

- Every generation role has an explicit `providerKind: 'utility' | 'reasoning'`.
- Role normalization fails if the field is missing or invalid.
- Provider routing derives only from the role registry, not from a separate allowlist.
- Tests fail when a role is added without a lane.
- Settings exposes the role matrix: role, provider lane, configured provider type, model/profile label, blocking behavior, fallback, and state authority.

Implementation items:

1. Add `providerKind` to every default generation role.
2. Replace `UTILITY_ROLE_IDS` with registry-derived routing.
3. Update SillyTavern provider client tests to assert every role has an explicit lane.
4. Add a settings diagnostic helper that lists role routing.
5. Update docs that describe Utility/Reasoning routing.

Acceptance criteria:

- No generation role can be registered without a provider lane.
- `test-directive-provider-routing.mjs` fails on missing or unknown `providerKind`.
- Utility and Reasoning/Reasoner provider statuses include role coverage diagnostics.

### 2. Turn Classification Depends Too Much On Broad Heuristics

Current behavior:

- `classifyChatTurn()` first runs deterministic phrase and regex checks.
- It calls `utilityTurnClassifier` only when deterministic confidence is below the threshold.
- The deterministic classifier returns one classification, one response strategy, reasons, and a worker plan.
- Worker scheduling depends heavily on that single classification result.

Why this is brittle:

- Player language is varied and indirect.
- A sentence can be both roleplay color and a command.
- A player can ask advice and give an order in the same message.
- "Do it" can be clear after a pending interaction and dangerously vague otherwise.
- Regex confidence can be high for familiar wording and low for semantically equivalent wording.
- Worker plans are coupled to keyword hits instead of extracted intent slots.
- The model fallback is treated as a fallback for low confidence instead of the normal language-understanding path for non-obvious campaign-bound text.

Robust target:

The classifier becomes a layered intent arbitration system.

#### Layer A: Ingress Normalization

Normalize the player message before classification:

- trim and compact whitespace,
- preserve original text for audit,
- detect message provenance and bound campaign state,
- attach pending interaction context,
- attach active phase, available decision points, player-safe known facts, formal objectives, simulation mode, and recent player-safe chat.

This layer should not decide outcome. It only builds the classifier packet.

#### Layer B: High-Precision Deterministic Fast Path

Deterministic classification should handle only cases that are genuinely obvious:

- empty message,
- Directive-owned message,
- clear scene color,
- clear no-op,
- clear routine low-risk command,
- known pending-interaction confirmations or cancellations,
- explicit high-risk terms that require confirmation.

The fast path should prefer precision over coverage. If it is not clearly safe, it should fall through to Utility classification.

#### Layer C: Utility Semantic Classifier

For most campaign-bound player messages that are not obvious, call the Utility provider.

The Utility classifier should produce a structured interpretation, not just a label:

```json
{
  "kind": "directive.turnIntentClassification",
  "classification": "consequentialCommand",
  "responseStrategy": "directivePosted",
  "confidence": 0.82,
  "ambiguity": "low",
  "speechAct": "order",
  "action": "authorize",
  "target": "boarding-team-medical-access",
  "targetConfidence": 0.76,
  "domainSignals": ["mission", "crew", "relationship"],
  "riskSignals": ["medical-risk", "diplomatic-risk"],
  "missingInformation": [],
  "pendingInteractionResolution": null,
  "mixedIntent": false,
  "workerPlan": {
    "missionDirector": true,
    "relationship": true,
    "crew": true,
    "ship": false,
    "commandBearing": true,
    "sideMission": true,
    "continuity": true,
    "promptUpdate": true,
    "narrator": true
  },
  "reasons": [
    "The player gives an operational order that can change crew and mission state."
  ]
}
```

The Utility classifier contract:

- It may interpret speech act and routing.
- It may identify ambiguity and missing information.
- It may recommend worker plans.
- It must not adjudicate success, reveal hidden truth, invent facts, or mutate state.
- It must use only player-safe context.

#### Layer D: Deterministic Arbitration

After deterministic or Utility classification, run an arbitrator that validates the result before the runtime acts.

Arbitration rules:

- If classification is `consequentialCommand` but no action or target is stable, pause for clarification.
- If classification is `routineCommand` but risk signals are present, upgrade to `riskConfirmationNeeded` or `consequentialCommand`.
- If the player asks for advice and gives an order, split or pause based on explicitness.
- If a pending interaction exists, resolve that interaction before treating the message as a new command.
- If confidence is below the action threshold, pause.
- If the worker plan omits required workers for a classification, add them deterministically.
- If the Utility result contains hidden-state language or non-player-safe references, reject and fall back to deterministic safe behavior.

Recommended confidence policy:

- `>= 0.85`: can proceed if no missing information or risk conflict exists.
- `0.65` to `0.84`: can proceed only for non-destructive routing or with stable target slots.
- `< 0.65`: pause for clarification unless a deterministic pending-interaction rule applies.

#### Layer E: Decision Output

The final classifier output should distinguish:

- `rawClassification`: deterministic or Utility result,
- `validatedDecision`: runtime-safe decision after arbitration,
- `providerAttempted`,
- `providerRejected`,
- `clarificationReason`,
- `slotDiagnostics`,
- `workerPlanBeforeValidation`,
- `workerPlanAfterValidation`.

This makes misroutes debuggable.

Implementation items:

1. Create a `turn-intent-contract.mjs` module for classification enums, schema, slot normalization, and worker-plan normalization.
2. Split deterministic fast paths from broad deterministic classification.
3. Make Utility classification the default for non-obvious active-campaign player messages.
4. Add deterministic arbitration after provider classification.
5. Preserve current fast behavior for obvious scene color and routine procedures.
6. Add pending-interaction-specific handling before general classification.
7. Add sanitized diagnostics to the ingress ledger.
8. Add Settings or Log diagnostics for latest turn classification in developer/operator mode.

Acceptance criteria:

- Consequential mechanics are never committed from an ambiguous classification without either stable slots or a pending confirmation.
- The classifier can explain why it used deterministic, Utility, or pause routing.
- Worker plans are validated after classification and are not solely provider-authored.
- Hidden or Director-only provider output is rejected.

### 3. Classifier Coverage Is Not Yet Language-Diverse Enough

Current behavior:

- Tests cover the current classifier contracts but do not yet represent the range of natural player phrasing needed for a chat-native command RPG.

Why this is brittle:

- Regressions will only show up when real players phrase something unexpectedly.
- It is easy to improve one phrase family while breaking another.
- Confidence calibration cannot be trusted without a large fixture set.

Robust target:

Build a language fixture suite organized by phase, speech act, risk level, and expected routing. Tests should validate slots and bands, not only exact reasons.

Fixture categories:

- direct orders: "Authorize the boarding team."
- indirect orders: "Let's get medical aboard, but keep security close."
- command through dialogue: `"Bronn, secure the bay and keep me informed."`
- questions asking counsel: "What are our options here?"
- questions that are orders: "Can we hail them and offer terms?"
- thinking aloud: "I do not like this signal."
- scene color: "I fold my arms and wait."
- vague confirmations: "Do it."
- pending-interaction confirmations: "Confirm the order."
- mixed intent: "Ask Bronn what he thinks, then prepare security."
- high-risk orders: "Override safety and vent the compartment."
- relationship-sensitive orders: "Tell Whitaker I am countermanding that."
- ship-sensitive orders: "Divert power to shields and cut sensors."
- side-work triggers: "Schedule the hardware audit with Priya."
- typo-heavy casual input: "tell bronn secure tha bay n keep docs safe"

Implementation items:

1. Add `tests/fixtures/classifier/` with grouped JSON fixtures.
2. Add a fixture runner script, for example `tools/scripts/test-turn-intent-classifier-fixtures.mjs`.
3. Let fixtures assert:
   - accepted classification set,
   - response strategy,
   - required and forbidden worker-plan keys,
   - minimum confidence band,
   - required slots,
   - whether Utility should be attempted,
   - whether clarification should occur.
4. Add targeted fixtures for each mission phase already covered by runtime tests.
5. Add regression fixtures whenever a real misclassification is found.

Acceptance criteria:

- The classifier suite contains at least 150 player-language fixtures before alpha.
- Fixture failures identify the phrase, expected routing, actual routing, and slot deltas.
- The alpha gate includes the fixture suite.

### 4. Sidecar JSON Contracts Are Too Prompt-Dependent

Current behavior:

- Sidecars prompt for JSON and parse provider output.
- Some paths can recover fenced JSON.
- State gateway validation protects authoritative state after parsing.

Why this is brittle:

- Invalid JSON is expected provider behavior, not a rare exception.
- Prompt wording can drift away from parser expectations.
- A sidecar can fail due to transport success but feature-level invalid output.
- Each sidecar prompt may define contracts differently.

Robust target:

Every model-returning sidecar should have:

- an explicit output schema,
- a shared structured-response parser,
- a no-op valid response example,
- feature-level success criteria,
- sanitized diagnostics,
- role-specific validation before state-gateway validation.

Implementation items:

1. Add JSON schemas for sidecar proposals:
   - continuity tracker,
   - relationship evaluator,
   - crew director,
   - ship director,
   - Command Bearing evaluator,
   - side-mission signal detector,
   - side-mission candidate builder,
   - side-mission scene framer,
   - command log summarizer.
2. Reuse the shared structured parser pattern for all sidecar JSON.
3. Update prompts to include exact schema names and no-op examples.
4. Make all sidecars distinguish:
   - transport success,
   - parse success,
   - schema validation success,
   - state-gateway application success.
5. Persist sanitized diagnostics by stage and role.

Acceptance criteria:

- No sidecar can report `ok: true` unless its role-specific output validates and either applies or validly no-ops.
- Invalid JSON produces clear diagnostics without mutating campaign state.
- All sidecar tests include valid output, no-op output, invalid JSON, hidden-leak rejection, stale revision, and forbidden path coverage.

### 5. Relationship, Command Bearing, And Side-Mission Boundaries Are Split Across Too Many Surfaces

Current behavior:

- Deterministic mission code can write relationship descriptions, Command Bearing awards, pressure records, and Command Log entries.
- Sidecars can propose updates for specific allowed roots.
- Narrative Thread Engine design separates `threadLedger`, `pressureLedger`, Open Orders, and Command Bearing, but runtime and docs are still catching up to the full boundary map.

Why this is brittle:

- It is not always obvious whether a change belongs in the Mission Director, a sidecar, the thread ledger, the pressure ledger, or the Command Bearing system.
- A worker plan can imply a domain update without a single source of truth for that domain's authority.
- Future developers can add model involvement in the wrong layer.

Robust target:

Create a gameplay model-call matrix that is treated as a contract.

The matrix should include:

- role id,
- provider lane,
- trigger,
- blocking or background,
- may propose state,
- allowed roots,
- owning module,
- parser/schema,
- fallback behavior,
- player-visible output,
- hidden-state policy,
- tests.

Recommended authority split:

| Domain | Authoritative Owner | Model Role |
| --- | --- | --- |
| Mission outcome | Mission Director deterministic code | None |
| Narration | Reasoning/Reasoner `narration` | Prose only after commit |
| Relationship memory | Deterministic deltas plus Reasoner `relationshipEvaluator` proposals | Proposal-only |
| Command Bearing awards/spends | Deterministic Command Bearing system | Reasoner proposal/evaluation only for journaled insight |
| Pressure ledger | Deterministic pressure seeding and allowed sidecar proposals | Utility/Reasoner proposal-only depending on role |
| Open Orders | Package-authored deterministic selector and scene handlers | Optional phrasing/framing assistance |
| Thread ledger | Narrative Thread Engine lifecycle rules | Future scouting proposals only |
| Command Log summary | Deterministic log packet plus Utility summary sidecar | Presentation-only |

Implementation items:

1. Add the role/domain matrix to a code-owned data structure or generated doc.
2. Connect role definitions, worker allowed roots, and docs to that matrix.
3. Add tests that compare worker allowed roots to matrix allowed roots.
4. Add tests that reject provider attempts to author deterministic-only domains.
5. Add code comments only at domain boundaries where future model-call additions are likely.

Acceptance criteria:

- There is one authoritative matrix for model-call roles and domain authority.
- Sidecar allowed roots, provider lanes, and docs cannot drift silently.
- Command Bearing and side-mission provider roles cannot mutate authoritative completion or reward state.

### 6. Observability Is Not Yet Strong Enough For Live Misroutes

Current behavior:

- Runtime ledgers record ingress, sidecar, response, and recovery events.
- Provider diagnostics exist in several paths.
- The operator can inspect some runtime status in Settings.

Why this is brittle:

- A live player misclassification needs fast diagnosis.
- It should be easy to see whether deterministic code, Utility classification, Reasoner counsel, narration, or a sidecar caused an issue.
- Provider failures and rejected outputs should be visible without exposing raw hidden state or raw provider output.

Robust target:

Add model-call observability that is player-safe and operator-useful.

For each model call, track:

- role id,
- provider lane,
- configured provider type,
- model/profile label,
- trigger source,
- campaign revision,
- input packet hash,
- output parse status,
- validation status,
- applied/no-op/rejected status,
- sanitized reason,
- latency,
- retryability.

Implementation items:

1. Add a `modelCallJournal` or unify role diagnostics under runtime tracking.
2. Record structured diagnostics from generation router for every runtime model call.
3. Add a Settings diagnostics surface with latest calls by role.
4. Add a redaction policy that never stores raw hidden-state context or raw model output by default.
5. Add an export/debug function for sanitized call summaries.

Acceptance criteria:

- A misrouted turn can be diagnosed from sanitized runtime state.
- Diagnostics show whether Utility was attempted and whether arbitration changed the decision.
- Sidecar failures are visible without being player-facing campaign facts.

## Implementation Sequence

### Phase 1: Role Routing Contract

Files likely involved:

- `src/generation/generation-roles.mjs`
- `src/providers/directive-provider-settings.mjs`
- `src/hosts/sillytavern/provider-client.mjs`
- `src/hosts/fake/fake-host.mjs`
- `tools/scripts/test-directive-provider-routing.mjs`
- `tools/scripts/test-generation-router.mjs`
- `docs/architecture/CHAT_NATIVE_RUNTIME.md`

Work:

1. Add explicit provider lanes to role definitions.
2. Make routing registry-derived.
3. Add complete role-lane tests.
4. Update provider diagnostics.

Verification:

```powershell
node tools\scripts\test-generation-router.mjs
node tools\scripts\test-directive-provider-routing.mjs
node tools\scripts\test-dual-host-scaffold.mjs
```

### Phase 2: Classifier Contract And Arbitration

Files likely involved:

- `src/adjudication/utility-turn-classifier.mjs`
- new `src/adjudication/turn-intent-contract.mjs`
- `src/runtime/chat-turn-orchestrator.mjs`
- `src/runtime/state-delta-gateway.mjs`
- `tools/scripts/test-chat-turn-orchestrator.mjs`
- new `tools/scripts/test-turn-intent-classifier-fixtures.mjs`

Work:

1. Define the richer classification schema.
2. Split deterministic fast paths from semantic classification.
3. Add Utility classifier prompt and parser for slot output.
4. Add deterministic arbitration.
5. Persist sanitized diagnostics.
6. Add fixture coverage.

Verification:

```powershell
node tools\scripts\test-chat-turn-orchestrator.mjs
node tools\scripts\test-chat-native-runtime-flow.mjs
node tools\scripts\test-turn-intent-classifier-fixtures.mjs
```

### Phase 3: Sidecar Contract Hardening

Files likely involved:

- `src/jobs/campaign-sidecar-scheduler.mjs`
- `src/jobs/sidecar-job-runner.mjs`
- `src/jobs/command-log-summary-sidecar.mjs`
- `src/side-missions/provider-assist.mjs`
- `src/providers/structured-output-parser.mjs`
- `schemas/`
- `tools/scripts/test-sidecar-job-runner.mjs`
- `tools/scripts/test-command-log-summary-sidecar.mjs`
- `tools/scripts/test-side-mission-provider-assist.mjs`

Work:

1. Add sidecar output schemas.
2. Normalize all sidecar parsing through shared parser helpers.
3. Add role-specific schema validation.
4. Split diagnostics by transport, parse, schema, validation, and apply stage.
5. Add no-op output support across every sidecar.

Verification:

```powershell
node tools\scripts\test-sidecar-job-runner.mjs
node tools\scripts\test-command-log-summary-sidecar.mjs
node tools\scripts\test-side-mission-provider-assist.mjs
```

### Phase 4: Domain Authority Matrix

Files likely involved:

- `src/generation/generation-roles.mjs`
- `src/jobs/campaign-sidecar-scheduler.mjs`
- `src/threads/thread-ledger.mjs`
- `src/pressures/`
- `src/command/command-bearing.mjs`
- `docs/architecture/CHAT_NATIVE_RUNTIME.md`
- `docs/design/NARRATIVE_THREAD_ENGINE.md`
- `docs/design/COMMAND_BEARING_SYSTEM.md`

Work:

1. Create the gameplay model-call matrix.
2. Connect role definitions, worker allowed roots, and docs to that matrix.
3. Add drift tests.
4. Tighten side-mission and Command Bearing provider boundaries.

Verification:

```powershell
node tools\scripts\test-command-bearing.mjs
node tools\scripts\test-thread-ledger.mjs
node tools\scripts\test-side-mission-opportunity-detector.mjs
node tools\scripts\test-open-orders-review.mjs
```

### Phase 5: Observability And Alpha Gate Integration

Files likely involved:

- `src/generation/generation-router.mjs`
- `src/runtime/state-delta-gateway.mjs`
- `src/ui/settings-panel.js`
- `tools/scripts/run-alpha-gate.mjs`
- `docs/testing/TESTING_STRATEGY.md`

Work:

1. Add sanitized model-call diagnostics.
2. Surface latest role diagnostics in Settings.
3. Add fixture and routing tests to alpha gate.
4. Update testing docs.

Verification:

```powershell
node tools\scripts\test-runtime-host-injection.mjs
node tools\scripts\test-chat-native-runtime-flow.mjs
node tools\scripts\test-visual-system-foundation.mjs
node tools\scripts\run-alpha-gate.mjs
```

## Turn Classifier Detailed Plan

### Desired Behavior By Message Type

| Message Type | Example | Target Behavior |
| --- | --- | --- |
| Scene color | "I stare at the tactical display and wait." | Inject and continue; no mechanics commit. |
| Routine command | "Log the transmission and keep monitoring." | Deterministic routine commit or inject and continue. |
| Consequential command | "Authorize medical boarding under quarantine restrictions." | Preview/commit through Mission Director. |
| Counsel request | "What are our options?" | Reasoner counsel, no mechanics commit. |
| Mixed counsel and command | "What does Bronn think, and prepare security teams." | Either split counsel/order or pause if unstable. |
| Vague confirmation | "Do it." | Resolve pending interaction if one exists, otherwise clarify. |
| Risky order | "Override safety and vent the compartment." | Pause for explicit confirmation. |
| Relationship-sensitive order | "Tell Whitaker I am countermanding her." | Mission Director plus relationship worker plan. |
| Side-work command | "Schedule the hardware audit with Priya." | Route to side-mission opportunity/open-order controls if eligible. |

### Classifier Packet

The classifier should receive a player-safe packet:

```json
{
  "playerText": "...",
  "recentChat": [],
  "pendingInteraction": null,
  "activeMissionId": "...",
  "activePhaseId": "...",
  "availableDecisionPoints": [],
  "knownFacts": [],
  "formalObjectives": [],
  "commandAuthority": "...",
  "simulationMode": "Command",
  "campaignRevision": 12
}
```

It should not receive:

- hidden truth,
- raw relationship values,
- unrevealed pressure scores,
- Director-only notes,
- raw provider diagnostics from prior calls.

### Final Decision Contract

Runtime should consume a validated decision:

```json
{
  "kind": "directive.validatedTurnDecision",
  "classification": "consequentialCommand",
  "responseStrategy": "directivePosted",
  "confidence": 0.82,
  "source": "utility-provider",
  "arbitration": {
    "status": "accepted",
    "changedClassification": false,
    "requiresClarification": false,
    "requiresWarningConfirmation": false
  },
  "slots": {
    "speechAct": "order",
    "action": "authorize",
    "target": "medical boarding under quarantine restrictions",
    "domains": ["mission", "crew"]
  },
  "workerPlan": {
    "missionDirector": true,
    "relationship": false,
    "crew": true,
    "ship": false,
    "commandBearing": true,
    "sideMission": true,
    "continuity": true,
    "promptUpdate": true,
    "narrator": true
  },
  "diagnostics": {
    "providerAttempted": true,
    "providerRejected": false,
    "deterministicFastPath": false
  }
}
```

### Clarification Policy

Clarification is not a failure. It is the correct behavior when committing would be unsafe.

Clarify when:

- action is present but target is missing,
- target is present but action is missing,
- the message references "it", "that", or "the first one" without a pending interaction,
- the Utility result is below confidence threshold,
- model and deterministic risk assessment disagree,
- mixed counsel/order cannot be split safely,
- the player seems to be describing what might happen instead of issuing an order.

### Worker Plan Validation

Worker plan validation should be deterministic.

Rules:

- `consequentialCommand` always requires `missionDirector`, `continuity`, `promptUpdate`, and `narrator`.
- `riskConfirmationNeeded` always requires `missionDirector`, `continuity`, `promptUpdate`, and `narrator`.
- `counselRequest` uses `missionDirectorAdvisor` and may schedule continuity sidecars, but does not commit mechanics.
- Relationship terms or command-authority conflict require `relationship`.
- Ship/system terms require `ship`.
- Crew/medical/security/casualty terms require `crew`.
- Command-style award/spend possibilities require `commandBearing`.
- Consequential commands after pressure-bearing chapters can schedule `sideMission`.

The provider can suggest workers; the runtime finalizes workers.

### Testing Strategy

Classifier tests should be fixture-driven and tolerant of reasonable classification equivalents only where safe.

Each fixture should include:

```json
{
  "id": "chapter1.indirect-order.medical-quarantine.001",
  "text": "Let's get medical aboard, but keep the quarantine field up.",
  "context": {
    "activePhaseId": "chapter-1-first-response",
    "pendingInteraction": null
  },
  "expect": {
    "classificationAnyOf": ["consequentialCommand", "riskConfirmationNeeded"],
    "responseStrategyAnyOf": ["directivePosted", "pause"],
    "mustAttemptUtility": true,
    "requiredDomains": ["mission", "crew"],
    "requiredWorkers": ["missionDirector", "crew", "continuity", "promptUpdate"],
    "forbiddenWorkers": [],
    "clarificationAllowed": false
  }
}
```

The fixture runner should report:

- deterministic fast-path result,
- Utility result,
- arbitration result,
- final decision,
- slot differences,
- worker-plan differences.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Utility classifier adds latency to many turns. | Use deterministic fast path for obvious messages, low max tokens, low temperature, and compact player-safe context. |
| Provider classification is wrong. | Deterministic arbitration validates slots, risk, pending interactions, and worker plan before acting. |
| More clarifications make play feel stiff. | Clarify only when mechanics would commit from unstable intent; otherwise inject and continue or ask counsel. |
| Fixtures become too rigid. | Assert safe bands, required domains, and worker keys instead of exact reason text. |
| Sidecar schemas slow iteration. | Pre-alpha status allows updating all role prompts and tests in place without legacy support. |
| Observability leaks hidden state. | Store hashes, role ids, statuses, sanitized messages, and player-safe summaries only. |

## Definition Of Done

This robustness pass is done when:

1. Every model role has an explicit provider lane and routing cannot drift silently.
2. Turn classification uses layered deterministic plus Utility semantic handling for varied player language.
3. Ambiguous commands pause instead of committing mechanics.
4. The classifier fixture suite covers broad player phrasing and runs in the alpha gate.
5. Every sidecar has a schema, parser path, no-op output, and staged diagnostics.
6. Domain authority for Mission Director, relationships, Command Bearing, pressure, Open Orders, thread ledger, and Command Log is documented and test-checked.
7. Settings or operator diagnostics can explain the latest model calls without leaking hidden state.
8. Dual-host tests still pass for SillyTavern and Lumiverse generation clients.
