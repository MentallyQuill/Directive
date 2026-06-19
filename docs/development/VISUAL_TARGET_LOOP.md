# Visual Target Loop

The Visual Target Loop is Directive's UI iteration workflow for turning concept art into verified runtime UI. It applies to whole pages, windows, feature sections, control groups, and state variants.

The loop uses GPT Image 2 to produce 2-3 concept images for each target unit, then compares those concepts against live Directive screenshots in SillyTavern before the UI is accepted. Every concept prompt must be led by Directive's [LCARS Visual Identity](../design/LCARS_VISUAL_IDENTITY.md), with UX as the acceptance gate.

## Purpose

Directive should use concept art as an implementation target, not as decorative inspiration. The goal is to make the SillyTavern UI more deliberate, LCARS-led, Saga-informed, and easier to audit visually while keeping the runtime grounded in working controls, clear UX, and player-safe state.

The process should:

- define the job of each UI surface before generating art,
- explore multiple visual directions quickly,
- select a concrete target direction,
- implement toward that target in the actual runtime,
- compare the live SillyTavern result against the target,
- record what changed and why,
- iterate until the surface is accepted.

## Visual Target Unit

A Visual Target Unit is the smallest UI scope being designed or reviewed in one loop.

Valid units include:

- **Page:** Mission, Crew, Ship, Starships, Log, Settings.
- **Window or modal:** Character Creator, package import, save/load, State Safety.
- **Feature section:** Mission Log, Command Brief, Follow-Up Opportunities, Open Orders, Save As, provider diagnostics.
- **Control group:** mobile bottom navigation, Mission action row, Settings safety controls.
- **State variant:** empty state, active campaign, pending preview, narration failure, completed Chapter 1.

Large pages may be split into smaller units when one section is weak but the rest of the page is already acceptable.

## Artifact Layout

Use one folder per target unit:

```text
docs/design/visual-targets/
  mission/
    brief.md
    iteration-01/
      prompt.md
      concept-a.png
      concept-b.png
      concept-c.png
      selected-target.md
      runtime-desktop.png
      runtime-phone.png
      comparison-notes.md
```

Generated concept art is a design artifact. It is not a package-owned runtime asset unless it is explicitly promoted into a package asset record and validated through the normal asset path.

## Loop Steps

### 1. Surface Brief

Write a short brief before generating images.

The brief should include:

- Visual Target Unit name.
- Parent surface, if any.
- Primary user task.
- Information hierarchy.
- Required controls and states.
- UX goal and failure risks.
- Saga reference behavior or visual qualities.
- LCARS visual identity requirements.
- Desktop, phone-width, and host constraints.
- Hidden-state or player-safety rules.
- What must not change.

Example:

```text
Visual Target Unit: Mission Log section
Parent Surface: Mission page
Goal: Help the player understand recent committed outcomes without reading raw state.
Required controls: expand/collapse, latest outcome, narration recovery status.
UX goal: let the player scan the last committed outcome and recovery state in under a few seconds.
Player safety: no hidden faction names, raw relationship values, or unrevealed source truth.
Saga reference: compact mobile-friendly rows, clear active state, touch-safe actions.
LCARS target: dark command-console canvas, curved segmented rail, amber/lavender status accents, dense operational rows.
```

### 2. Concept Set

Generate 2-3 GPT Image 2 concepts for the same brief. Every concept must be an original UX-first LCARS-inspired Star Trek command UI direction for Directive.

Default concept spread:

- **A: Conservative/Saga-close LCARS:** closest to existing Saga mobile density and Directive runtime constraints, expressed through LCARS paneling.
- **B: Rich command-console LCARS:** stronger LCARS geometry, hierarchy, imagery, and atmosphere without changing the product goal.
- **C: Compact/mobile-first LCARS:** optimized for phone-width SillyTavern with compressed rails, bottom navigation, and touch-safe LCARS controls.

Prompts should describe layout, hierarchy, interaction density, LCARS geometry, and visual tone. They should state how the LCARS treatment improves the user's task. They should not ask the image model to invent mechanical state, hidden facts, exact production copy, or final asset names. Prompts must also reject official logos, screenshots, exact episode displays, unreadable filler text, and decorative panels that look like unusable controls.

### 3. Target Selection

Select one target direction or combine specific traits from multiple concepts.

Record what is binding:

- layout hierarchy,
- UX behavior and affordance model,
- visual density,
- image treatment,
- route/control placement,
- state grouping,
- mobile behavior,
- LCARS geometry and color-blocking traits,
- mood and tone.

Record what is not binding:

- generated text,
- exact colors,
- fictional data,
- impossible controls,
- image-model artifacts.

### 4. Implementation Pass

Implement toward the selected target in the actual Directive runtime.

Implementation must use:

- existing Directive route and panel boundaries,
- Directive's LCARS Visual Identity,
- UX-first interaction behavior,
- package-owned assets where appropriate,
- Theme Pack and Icon Pack tokens,
- stable responsive dimensions,
- touch-safe controls,
- SillyTavern-first behavior,
- Lumiverse-compatible patterns where feasible.

Do not add a visual element that contradicts the target unit's workflow, leaks hidden state, or bypasses the runtime's authoritative campaign state.

Do not keep an LCARS element only because it looks authentic. If it harms comprehension, scanability, text fit, control clarity, keyboard or pointer use, touch behavior, or responsive layout, revise or remove it.

### 5. Runtime Capture

Open Directive in the real SillyTavern host at:

```text
http://127.0.0.1:8000/
```

Capture:

- desktop screenshot,
- phone-width screenshot,
- relevant state variant screenshots,
- notes on any failed interaction.

Prefer the repeatable live smoke scripts when they cover the surface. Use manual in-app browser inspection when the target unit needs a specific state that automation does not yet create.

### 6. Visual Comparison

Compare the selected concept against the runtime screenshots.

Ask:

- Does the runtime surface communicate the same goal?
- Is the hierarchy as clear as the selected target?
- Are required controls visible and usable?
- Does the LCARS treatment improve the workflow instead of slowing it down?
- Are decorative panels clearly non-interactive?
- Does the mobile layout preserve the target's intent?
- Does it still feel Saga-informed?
- Does it read as LCARS at a glance?
- Are LCARS rails, curves, segmented blocks, and color accents structural rather than decorative noise?
- Are touch targets stable?
- Does text fit without overlap?
- Are image anchors present and useful?
- Are hidden values and unrevealed facts still absent?
- Is the implementation too plain, too crowded, or too decorative?
- Would a first-time player know what to do next?

### 7. Iteration Notes

Write a short comparison note after every implementation pass.

Use this structure:

```text
# Comparison Notes

## Keep

- ...

## Change

- ...

## Reject

- ...

## Next Prompt

- ...

## Next Code Pass

- ...
```

### 8. Acceptance

A Visual Target Unit is accepted only when:

- the selected concept direction is documented,
- the selected LCARS direction is documented,
- the live SillyTavern desktop and phone-width screenshots are captured,
- the implemented UI supports the required workflow,
- the LCARS treatment improves or preserves usability,
- hidden-state and player-safety rules still hold,
- relevant deterministic tests pass,
- relevant live smoke checks pass or the manual evidence is recorded,
- remaining deviations are explicitly accepted.

## Prompt Template

```text
Create an original UX-first LCARS-inspired Star Trek command UI concept image for Directive, a Star Trek command RPG extension inside SillyTavern.

Visual Target Unit:
Parent Surface:
Primary User Task:
UX Goal:
UX Failure Risks:
Required Information:
Required Controls:
Current State Variant:
Saga Reference Qualities:
LCARS Requirements:
Desktop Constraints:
Phone Constraints:
Visual Tone:
Do Not Include:

The concept should show layout, visual hierarchy, density, LCARS panel geometry, and interaction shape. Use dark terminal-like negative space, curved segmented rails, asymmetrical panel frames, amber/orange/lavender/blue command accents, dense operational rows, and touch-safe controls. The LCARS treatment must improve navigation, scanability, affordance clarity, and task completion instead of acting as decoration. Do not include official logos, screenshots, exact production copy, hidden campaign facts, unreadable filler text, or decorative panels that look like unusable controls.
```

## Comparison Template

```text
# Visual Target Comparison

Visual Target Unit:
Iteration:
Selected Concept:
Runtime Evidence:

## Match

- ...

## Mismatch

- ...

## Runtime Problems

- ...

## UX Check

- ...

## LCARS Check

- ...

## Player-Safety Check

- ...

## Next Iteration

- ...
```

## Agent Coordination

Agent-0 owns target selection, implementation acceptance, and final integration.

Worker agents may help with:

- writing target briefs,
- generating alternate prompt drafts,
- reviewing runtime screenshots,
- preparing comparison notes,
- implementing isolated UI slices with assigned file ownership.

Agents should not overwrite each other's target-unit folders, generated concepts, or runtime screenshots.

## MVP Priority Order

Run the loop first on the surfaces most important to the SillyTavern MVP:

1. Starships package/home surface.
2. Crew roster and detail surface.
3. Mission active loop.
4. Mission Log or Command Log section.
5. Settings and State Safety.
6. Mobile shell/navigation states.

The rule is simple: concept art guides the UI, but live runtime screenshots decide completion.
