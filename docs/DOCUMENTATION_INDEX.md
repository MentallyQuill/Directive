# Directive V1 documentation

This repository documents one active runtime: Directive V1.
Older migration schemes and retired internal systems are intentionally out of scope.

If you are a player, start with the user docs in this order:

- [First Campaign Workflow](user/FIRST_CAMPAIGN_WORKFLOW.md)
- [Operator Manual](user/DIRECTIVE_OPERATOR_MANUAL.md)
- [Storage and State Safety](user/STORAGE_AND_STATE_SAFETY.md)
- [SillyTavern Preset](user/SILLYTAVERN_PRESET.md)

If you want deeper architecture details, use these documents:

- [V1 Gameplay Architecture](architecture/V1_GAMEPLAY_ARCHITECTURE.md)
- [Semantic Authority](architecture/SEMANTIC_AUTHORITY.md)
- [Story Settlement](architecture/STORY_SETTLEMENT.md)
- [People and Relationships](architecture/PEOPLE_AND_RELATIONSHIPS.md)
- [Mission State](architecture/MISSION_STATE.md)
- [Fair Discovery](architecture/FAIR_DISCOVERY.md)
- [UI Runtime Surface](architecture/UI_RUNTIME_SURFACE.md)
- [Player Turn Sequence](technical/PLAYER_TURN_SEQUENCE.md)
- [Model Calls and Provider Routing](technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md)
- [Directive Datasets](technical/DIRECTIVE_DATASETS.md)
- [Host Integration Manual](technical/HOST_INTEGRATION_MANUAL.md)
- [V1 Test Contract](testing/V1_GAMEPLAY_ARCHITECTURE_TEST_PLAN.md)

For writers and campaign builders:

- [Command Bearing](design/COMMAND_BEARING_SYSTEM.md)
- [Interface Design Bible](design/DIRECTIVE_INTERFACE_DESIGN_BIBLE.md)
- [Campaign Authoring Guide](authoring/CAMPAIGN_AUTHORING_GUIDE.md)
- [Campaign Package Structure](authoring/CAMPAIGN_PACKAGE_STRUCTURE.md)
- [Ashes of Peace V1 Reference](authoring/ASHES_OF_PEACE_AUTHORING_REFERENCE.md)

Creative source files under `docs/source/` are references.
At runtime, V1 package data is the source of truth.
