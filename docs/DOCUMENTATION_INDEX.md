# Directive V1 documentation

This repository documents one runtime: Directive V1. Historical runtime designs, migration paths, compatibility shims, and retired tracking systems are not part of the documentation set.

## Architecture authority

- [V1 Gameplay Architecture](architecture/V1_GAMEPLAY_ARCHITECTURE.md) — the whole system and its invariants.
- [Semantic Authority](architecture/SEMANTIC_AUTHORITY.md) — which components may interpret, validate, commit, and project truth.
- [Story Settlement](architecture/STORY_SETTLEMENT.md) — aggregate-first story memory and source mutation.
- [People and Relationships](architecture/PEOPLE_AND_RELATIONSHIPS.md) — named-contact creation, source-backed updates, qualitative relationships, and bounded recall.
- [Mission State](architecture/MISSION_STATE.md) — objectives, evidence, clocks, outcomes, and transitions.
- [Fair Discovery](architecture/FAIR_DISCOVERY.md) — spoiler-safe knowledge, Duty Reports, and crew initiative.
- [UI Runtime Surface](architecture/UI_RUNTIME_SURFACE.md) — five deliberate player pages and the composer launcher.

## Product and authoring

- [Command Bearing](design/COMMAND_BEARING_SYSTEM.md)
- [Interface Design Bible](design/DIRECTIVE_INTERFACE_DESIGN_BIBLE.md)
- [Campaign Authoring Guide](authoring/CAMPAIGN_AUTHORING_GUIDE.md)
- [Campaign Package Structure](authoring/CAMPAIGN_PACKAGE_STRUCTURE.md)
- [Ashes of Peace V1 Reference](authoring/ASHES_OF_PEACE_AUTHORING_REFERENCE.md)

## Runtime and operations

- [Player Turn Sequence](technical/PLAYER_TURN_SEQUENCE.md)
- [Model Calls and Provider Routing](technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md)
- [Directive Datasets](technical/DIRECTIVE_DATASETS.md)
- [Host Integration Manual](technical/HOST_INTEGRATION_MANUAL.md)
- [V1 Test Contract](testing/V1_GAMEPLAY_ARCHITECTURE_TEST_PLAN.md)
- [Operator Manual](user/DIRECTIVE_OPERATOR_MANUAL.md)
- [First Campaign Workflow](user/FIRST_CAMPAIGN_WORKFLOW.md)
- [Storage and State Safety](user/STORAGE_AND_STATE_SAFETY.md)
- [SillyTavern Preset](user/SILLYTAVERN_PRESET.md)

## Creative source material

Files under `docs/source/` are authoring references, not runtime contracts. When source prose and a V1 mission definition disagree, the V1 package is authoritative in play.
