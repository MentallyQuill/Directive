# Future Creator Tools

## Status

Starship Creator and Mission Creator are planned future capabilities. They are not part of the first playable release, but the initial architecture should avoid choices that make them expensive or awkward later.

## Starship Creator

The Starship Creator would let players create or draft a playable campaign package with:

- Ship identity, class, registry, and mission profile.
- Command structure and player role.
- Senior crew and recurring supporting crew.
- Crew backstories, relationships, values, competencies, and blind spots.
- Starting ship condition and technical constraints.
- Campaign frame, region, era, and local worldbuilding.
- Main campaign or questline structure.
- Mission-category preferences.
- Side mission interval rules and generation constraints.
- Package-local prompts, voice guidance, and guardrails.
- Passive assets such as portraits, ship images, banners, and icons.

The Starship Creator should produce the same loadable JSON package schema that bundled packages use. It should not create a separate internal format that later requires conversion. Export can wrap the finalized JSON and passive assets in `.directive-campaign.zip` when sharing is needed.

## Character Creator

The Character Creator is needed earlier than the Starship Creator or Mission Creator because starting a campaign should create the player character before the first save is written.

The active design model is [Character Creator Model](../design/CHARACTER_CREATOR_MODEL.md).

The selected campaign package defines what kind of player character the campaign supports. Ashes of Peace requires the player to be the incoming permanent XO of the U.S.S. Breckenridge. Future packages may define different player roles.

The Character Creator should follow a three-step flow plus review:

- Identity.
- Service.
- Personality.
- Review and begin.

It should collect structured fields and player-authored prose that Directors can use:

- Name.
- Pronouns or form of address.
- Species.
- Age band.
- Appearance.
- Rank and role, constrained by package requirements.
- Career background.
- Formative service experience.
- Assignment reason.
- Three positive traits.
- One flaw.
- Optional must-be-true fact or narrator note.

The creator should be guided enough to produce useful story material, but not so rigid that every player character feels prewritten.

## Mission Creator

The Mission Creator would let players create or draft authored main campaign missions, side mission templates, or reusable mission packages for an active campaign package or for compatible package families.

It should support:

- Mission premise and starting assignment.
- Mission role: main campaign beat, side mission template, or reusable mission package.
- Hidden truth.
- Command question.
- Objectives and directives.
- Fronts, actors, clocks, and escalation triggers.
- Revelations discoverable through multiple methods.
- Locations, hazards, and access conditions.
- B-plots tied to crew or campaign state.
- Command Decision candidates.
- End states and aftermath rules.
- Package compatibility requirements.

The Mission Creator should create loadable JSON mission graph data, not fixed scene scripts.

## Architecture Implications

Plan for creators by keeping:

- Package schemas explicit and documented.
- Validation reusable outside the UI.
- Import/export transport separate from internal storage.
- Character creation requirements package-defined, not hardcoded into the runtime.
- Bundled package loading and user-created package loading on the same normalized path.
- Mission templates separate from campaign mission state.
- Passive assets handled through a shared asset-storage layer.
- Provider-backed drafting separate from final validation.

## Initial Release Boundary

The first release should not include full creator workflows. It may include:

- Stable package schemas.
- A minimal package-driven Character Creator for starting a campaign.
- Validation utilities.
- Manual bundled Breckenridge package data.
- Import/export skeletons if needed for architecture.
- Documentation that explains future creator constraints.

Do not build Starship Creator or Mission Creator UI until the core package loader, campaign state, character creation, turn transactions, and one authored mission are stable.

## Open Questions

- Should Starship Creator be a staged wizard, a form-based editor, an LLM-assisted drafting workflow, or a hybrid?
- Should Mission Creator be limited to a loaded campaign package, or can it create generic missions with compatibility tags?
- Should created packages be shareable immediately, or require validation/readiness gates first?
- How much generated content should be review-gated before it can affect play?
- Should Creator drafts live in the same storage domain as finalized packages, or in separate draft-project storage?
- What exact provider prompt should the Character Creator use when turning package choices into an editable dossier?
