# Campaign Difficulty Consequence Policy

**Status:** Approved direction, awaiting written-spec review

**Date:** 2026-08-10

## Purpose

Make Exploration and Command produce materially different consequence behavior across narration models, including models with strong positive or survival bias. Command must be brutal but causally fair. Exploration must preserve its explicit player and senior-staff fatality protection.

The selected SillyTavern preset must not be part of the difficulty mechanism. Directive's runtime injection is the complete difficulty contract. The bundled Directive preset may cooperate with that contract, but campaign difficulty must remain correct when the player selects an unrelated preset.

## Product Decisions

- Do not use model-generated dice or randomness.
- Do not add deterministic dice as part of this change. Dice would make ordinary Directive play more mechanical without addressing the actual defect: models soften causally established consequences.
- Keep freeform causal adjudication grounded in accepted Directive state, visible chat, authority, evidence, expertise, leverage, time, resources, and established risk.
- Preserve Story Settlement as the sole durable semantic authority. Narration may portray a causally supported permanent or terminal result provisionally; the selected-response acceptance flow and Story Settlement determine whether that result becomes accepted state.
- Command does not maximize suffering or secretly increase difficulty. It removes protagonist protection and requires honest follow-through.
- Exploration changes the consequence ceiling, not the underlying facts or competence of the world.

## Architecture

### Runtime-owned difficulty contract

`src/simulation/simulation-mode-policy.mjs` remains the single source for mode-specific player copy and narration policy. Each mode will expose a complete, self-contained narrator instruction rather than a short sentence that depends on the bundled preset for interpretation.

`src/runtime/runtime-app.mjs` will continue to place the selected mode's narrator instruction directly in `DIRECTIVE V1 CAMPAIGN CONTEXT`, before the serialized state packet. The packet will retain the concise `simulationMode` and `consequencePolicy` fields for inspection, while the prose instruction carries the full behavioral contract.

The runtime instruction must work under any active completion preset. It must not refer to another Directive preset prompt by name, assume that prompt is installed, or rely on a preset-provided definition of causality, mortality, provisional narration, or consequence acceptance.

### Bundled preset accommodation

`presets/sillytavern/directive.json` will remain campaign- and mode-neutral. Its `Directive Command Causality` block will:

- preserve accepted state, committed outcomes, visible causal support, and ordinary professional competence;
- treat player declarations as attempted actions rather than automatic success;
- allow causally supported provisional outcomes, including durable or terminal outcomes, without declaring them accepted state;
- defer the consequence ceiling and fatality policy to `DIRECTIVE V1 CAMPAIGN CONTEXT` when present; and
- avoid imposing a reversible-only ceiling that conflicts with Command.

This is accommodation, not dependency. If the bundled preset is absent, the injected mode policy still defines all required behavior. If the runtime packet is absent, the preset provides ordinary state-respecting narration without inventing a campaign difficulty.

The preset metadata version will advance because the installed prompt asset has materially changed.

## Command: Full Simulation Contract

The injected Command instruction will use direct imperative language and cover five obligations.

### 1. No protected protagonists

The player, named characters, senior officers, beloved characters, and characters important to future plot receive no implicit survival or success privilege. The model must not preserve them for campaign continuity, player satisfaction, emotional comfort, or future usefulness.

### 2. Causal adjudication before prose

Before composing the scene, the narrator determines what the accepted state, visible action, demonstrated competence, available resources, established danger, and elapsed opportunity support. Player claims of success remain attempted actions. Adequate preparation and professional competence work when they genuinely address the danger; inadequate action, impossible action, or knowingly unmitigated exposure does not become successful because success would be kinder.

The narrator then commits to that causal result while writing. It must not revise the result downward after recognizing that the result would injure, kill, capture, disgrace, defeat, or permanently cost a favored character.

### 3. Explicit anti-softening rules

When unsupported by accepted state and visible causality, the narrator must not use:

- miraculous rescue or last-second intervention;
- enemy hesitation, incompetence, voluntary retreat, warning, or convenient miss;
- fatal injury converted into unconsciousness or a survivable close call;
- destruction converted into cosmetic damage;
- capture converted into immediate convenient escape;
- irreversible loss quietly restored;
- an unnamed substitute casualty used to protect a favored character;
- unsupported medical, technological, telepathic, or Command Bearing salvation;
- fake-out death, ambiguous survival language, or an implied off-screen escape; or
- delayed consequences that disappear once the immediate scene ends.

When death, permanent injury, destruction, capture, disgrace, mission failure, or irreversible loss is the most causally supported result, the narrator realizes that result plainly and completely.

### 4. Positive-bias correction

The policy explicitly identifies model softening as an error to correct. When multiple outcomes remain causally credible after a player knowingly accepts, ignores, or fails to mitigate serious danger, the narrator must not default to the safest credible branch. It selects the consequence-bearing branch that best reflects the established exposure and follows it through.

This correction does not authorize the narrator to create new hazards, hide relevant information, negate adequate preparation, ignore established expertise, or choose a worse result than the causal record supports.

### 5. Provisional narration and durable authority

The response may portray a permanent or terminal outcome as the actual event in the scene. It does not hedge merely because the response is provisional. A swipe can replace the response before acceptance. Once selected and accepted by the next player message, normal Story Settlement interpretation decides what durable meaning may commit.

## Exploration: Story-Forward Contract

The injected Exploration instruction will remain self-contained and explicit:

- keep accepted facts, competent opposition, failed actions, and nonfatal consequences intact;
- do not kill the player character or senior staff;
- convert an otherwise fatal result into the strongest causally adjacent nonfatal result, such as severe injury, incapacitation, loss of position, capture, damaged trust, lost readiness, or mission cost;
- do not erase danger, turn failure into success, or make opposition incompetent merely to enforce the fatality ceiling; and
- preserve all other causally supported consequences.

Exploration therefore provides a known fatality boundary without becoming consequence-free.

## Prompt Data Flow

1. Campaign creation stores the selected `settings.simulationMode` in validated V1 state.
2. `createSimulationModePolicy()` selects the complete mode policy.
3. `promptPacket()` injects that policy into the generation context and includes the concise mode summary in the JSON payload.
4. The active narration model produces a provisional scene under that policy, regardless of the selected SillyTavern preset.
5. Swipes remain replaceable and non-authoritative.
6. The next player message accepts the selected pair; Story Settlement and mission contracts remain the only durable semantic writers.

## Verification

Focused automated checks will cover the contract without adding a broad evaluation framework:

- Extend the simulation policy test coverage to assert that Command contains no-protagonist-protection, anti-softening, causal-fairness, and provisional-authority clauses.
- Assert that Exploration contains its fatality ceiling and explicitly preserves nonfatal failure.
- Extend the runtime prompt test to prove that the complete selected policy appears in `DIRECTIVE V1 CAMPAIGN CONTEXT`, not merely the mode name or concise summary.
- Add an unrelated-preset runtime case, or the narrowest equivalent fixture, proving the injected instruction is unchanged when the active preset is not Directive-compatible.
- Update the bundled preset contract test to reject the old reversible-only ceiling and assert neutral deferral to the injected campaign context.
- Run the focused tests followed by the existing alpha gate.

Automated string and integration checks prove wiring and authority boundaries, not model obedience. A later live model matrix may probe clearly fatal exposure, adequate mitigation, favored-character mortality, unsupported rescue, and the equivalent Exploration conversion. Live results must be reported as model-specific behavior rather than deterministic certification.

## Non-Goals

- No dice, seeded random number generator, skill-check UI, difficulty classes, hit points, or combat subsystem.
- No model-specific preset variants.
- No legacy difficulty migration or compatibility layer.
- No change to accepted-pair custody, swipe behavior, Story Settlement authority, mission contracts, or Command Bearing semantics.
- No instruction to maximize misery, punish player creativity, or make Command adversarial.

## Failure Handling

- Invalid or missing simulation modes continue to normalize through the existing Command default; this change does not add another fallback path.
- If an unrelated preset conflicts with the injected policy, Directive still supplies the complete policy but cannot guarantee that every external model/preset combination will obey conflicting same-role instructions. The bundled preset must contain no such conflict, and live claims must remain bounded to tested combinations.
- If the narrator produces an unsupported consequence, existing swipe and acceptance boundaries prevent that provisional response from becoming durable merely by being generated.
