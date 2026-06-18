# Future Creator Tools

## Status

Starship Creator and Mission Creator are planned future capabilities. They are not part of the first playable release, but the initial architecture should avoid choices that make them expensive or awkward later.

## Starship Creator

The Starship Creator would let players create or draft a playable starship package with:

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

The Starship Creator should produce the same loadable JSON package schema that bundled packages use. It should not create a separate internal format that later requires conversion. Export can wrap the finalized JSON and passive assets in `.directive-starship.zip` when sharing is needed.

## Mission Creator

The Mission Creator would let players create or draft authored main campaign missions, side mission templates, or reusable mission packages for an active starship package or for compatible package families.

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
- Command Moment candidates.
- End states and aftermath rules.
- Package compatibility requirements.

The Mission Creator should create loadable JSON mission graph data, not fixed scene scripts.

## Architecture Implications

Plan for creators by keeping:

- Package schemas explicit and documented.
- Validation reusable outside the UI.
- Import/export transport separate from internal storage.
- Bundled package loading and user-created package loading on the same normalized path.
- Mission templates separate from campaign mission state.
- Passive assets handled through a shared asset-storage layer.
- Provider-backed drafting separate from final validation.

## Initial Release Boundary

The first release should not include full creator workflows. It may include:

- Stable package schemas.
- Validation utilities.
- Manual bundled Breckinridge package data.
- Import/export skeletons if needed for architecture.
- Documentation that explains future creator constraints.

Do not build Starship Creator or Mission Creator UI until the core package loader, campaign state, turn transactions, and one authored mission are stable.

## Open Questions

- Should Starship Creator be a staged wizard, a form-based editor, an LLM-assisted drafting workflow, or a hybrid?
- Should Mission Creator be limited to a loaded starship package, or can it create generic missions with compatibility tags?
- Should created packages be shareable immediately, or require validation/readiness gates first?
- How much generated content should be review-gated before it can affect play?
- Should Creator drafts live in the same storage domain as finalized packages, or in separate draft-project storage?
