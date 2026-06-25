# Character Creator Guided Flow Improvement

## Status

This is a pre-alpha design improvement plan and implementation record for the runtime Character Creator. It is a companion to [Character Creator Model](CHARACTER_CREATOR_MODEL.md), [Target User Flow](TARGET_USER_FLOW.md), and [Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md).

The existing model remains the product direction: Directive should create a credible player character quickly, without becoming a tabletop character sheet. This document focuses on the current runtime gaps, the guided-flow UX revision, compact command hierarchy, draft lifecycle cleanup, and section-level model assistance.

Current implementation status:

- Draft lifecycle and resume eligibility are implemented.
- The Character Creator now uses a guided stepper with locked future steps, compact route/save/navigation controls, **Campaign Library**, and **Discard Character**.
- Review dossier fallback is implemented locally and does not require a provider.
- Section-header wand generation is implemented through the Reasoning-lane `characterCreatorSectionDraft` role, with local fallback, field validation, hidden-term redaction, and preview/apply behavior for partial sections.
- Player portrait import is implemented for hosts with passive media storage support. SillyTavern supports it through `/user/files`; Lumiverse currently reports portrait import as unsupported until a binary/passive media storage route exists.
- Crew can change or remove only the player-character portrait. Bundled senior-staff portraits remain package-owned and read-only.

## Goals

- Make Character Creator feel like a guided Starfleet personnel workflow, not a set of tabs.
- Show one creation section at a time with a clear primary next action.
- Keep creator buttons compact, clearly ranked, and labeled by the surface they actually open.
- Stop showing **Continue Character Setup** for an empty draft created by merely opening the creator.
- Add an explicit way to discard/reset an in-progress character draft.
- Let the player import, replace, or remove a custom player-character portrait during creation and later from Crew.
- Add a small section-header wand action that can draft or refine the active section through the Reasoning provider.
- Preserve package-driven character options and campaign context.
- Keep generated material player-owned, editable, replaceable, and non-authoritative until **Start Campaign**.

## Non-Goals

- No numerical attributes, point-buy, equipment selection, class tables, feats, or long skill lists.
- No legacy migration layer for old draft records. Directive is pre-alpha, so the runtime can update current draft semantics in place.
- No campaign-state mutation during character creation.
- No hidden Director facts, raw simulation values, or ordinary chat prompt injection during creator assistance.
- No mutation of bundled package image records for player portraits.
- No image-to-character inference. The Director, narrator, and Reasoning provider must not infer identity, species, history, relationships, or personality from the portrait.
- No automatic provider image upload or multimodal prompt use in the first implementation.
- No automatic invention of major personal facts such as secret ancestry, hidden powers, severe trauma, canonical relationships, current-crew friendships, or old romances unless the player explicitly asks for them.

## Source Inputs

### Directive Contracts

[Target User Flow](TARGET_USER_FLOW.md) says clicking **New Campaign** opens a guided Character Creator that should feel like Starfleet personnel setup, not a tabletop sheet. It also says Directive writes recoverable character-creator drafts as the user progresses, but those drafts are not campaign state. Provider help during setup must receive only Character Creator context and explicit user-provided inputs.

[Character Creator Model](CHARACTER_CREATOR_MODEL.md) already defines the intended shape:

- Three creation steps plus review.
- A small number of meaningful choices.
- A generated, editable dossier.
- No point-buy system.
- No long skill list.
- Provider failure must not block campaign start.
- Generated material is draft material.

[Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md) defines draft records as separate from campaign saves. Accepting review creates campaign state and the first save.

### Saga Loredeck Image Import Reference

Saga's Loredeck Library cover-image import is the closest implemented reference pattern.

Relevant Saga files, if the sibling Saga checkout is available:

- `F:/git/Saga/src/loredecks/loredeck-library-panel.js`
- `F:/git/Saga/src/storage/saga-lorepack-payload-storage.js`
- `F:/git/Saga/tools/scripts/test-visual-smoke-harness.mjs`
- `F:/git/Saga/docs/user/STORAGE_AND_STATE_SAFETY.md`

The important transferable pattern is not the Loredeck-specific UI. It is the storage and safety sequence:

- accept only image files;
- reject oversized inputs;
- decode the file into an image;
- redraw it through canvas to strip metadata and bound dimensions;
- encode to webp, jpeg, or png;
- write the image as a passive asset file under the host storage layer;
- store only an asset reference and metadata in JSON;
- register the asset in the storage index;
- delete stale owned assets when replaced, removed, or when the owner record is deleted;
- flush storage writes before rerendering previews.

Directive should copy that pattern for player portraits, but should not copy Saga's Loredeck payload model directly. Directive's owner record is the character-creator draft before campaign start and `campaignState.player` after campaign start.

### RPG Character Creator References

DnD character creation is explicitly step-based: choose class, determine origin, determine ability scores, choose alignment, then fill details. It also emphasizes campaign context and table expectations before creation begins. See [D&D Beyond Basic Rules: Creating a Character](https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character).

Pathfinder character creation is also sequential. Its sample flow starts from a concept and then records ancestry, background, class, attributes, proficiencies, equipment, and final details. It also treats beliefs and edicts as material that can evolve during play, not as permanently locked personality machinery. See [Archives of Nethys: Pathfinder 2e Character Creation](https://2e.aonprd.com/Rules.aspx?ID=2027).

Directive should borrow the interaction lesson, not the mechanics. The right analogue is:

```text
Campaign briefing -> identity -> service -> personality -> review dossier -> start campaign
```

The player is not building a stats block. They are commissioning a credible officer for a specific campaign package.

## Resolved Runtime Gaps

### Empty Drafts Become Resume Actions

The Campaign view previously used the latest non-accepted draft for `resumeDraft`, without checking whether the draft contained meaningful character details. A fresh draft could be persisted as soon as **New Campaign** was clicked, so an empty draft could surface as **Continue Character Setup**.

Implemented relevant code:

- [campaign-start-controller.mjs](../../src/runtime/campaign-start-controller.mjs) builds package actions and sets `resumeDraft`.
- [campaign-panel.js](../../src/ui/campaign-panel.js) renders **Continue Character Setup** when `pack.actions.resumeDraft` exists.
- [character-creator-draft.mjs](../../src/creators/character-creator-draft.mjs) creates an empty `inProgress` draft with no meaningful-input marker.

### No Focused Draft Delete Or Discard Flow

`cancelCreatorDraft()` returned the user to Campaign and cleared the active creator view, but it did not delete or abandon the draft. Storage had low-level delete support and cleanup machinery, but there was no focused draft-delete API exposed through repository, service, controller, runtime app, and shell actions.

Implemented relevant code:

- [runtime-app.mjs](../../src/runtime/runtime-app.mjs) clears UI state in `cancelCreatorDraft()`.
- [campaign-start-service.mjs](../../src/campaign/campaign-start-service.mjs) has start, save, resume, and accept flows, but no discard/delete flow.
- [directive-storage-repository.mjs](../../src/storage/directive-storage-repository.mjs) can delete JSON if the adapter supports it, but only uses that path for cleanup and autosave pruning.

### Step Controls Read As Tabs

The creator rendered only one active section, but the step row exposed all steps as direct buttons. The labels were `Complete`, `Active`, and `Open`, and clicking a step saved then switched immediately. That interaction read as tabs, even though inactive sections were hidden.

Implemented relevant code:

- [character-creator-panel.js](../../src/ui/character-creator-panel.js) renders direct step buttons in `renderCreatorStepButtons()`.
- [directive.css](../../styles/directive.css) hides inactive creator sections and displays the active section.
- [test-visual-system-foundation.mjs](../../tools/scripts/test-visual-system-foundation.mjs) currently asserts that only one section is active, but not that the flow is gated or guided.

### Review Is Still Too Manual

The model called for generated dossier material, but the runtime expected the player or tests to fill `briefBiography` and `publicReputation` manually. Review now receives a local fallback dossier when Identity, Service, and Personality are complete.

### No Player Portrait Import

The runtime had package-owned ship and senior-staff portraits, but no player-owned portrait override.

Implemented relevant code:

- [directive-media.js](../../src/ui/directive-media.js) resolves package images through `createPackageImage()`.
- [package-image-resolver.mjs](../../src/packages/package-image-resolver.mjs) reads package `assets.images`.
- [crew-panel.js](../../src/ui/crew-panel.js) synthesizes the `player-commander` row from `campaignState.player` and then asks the package image resolver for `crew.portrait.formal`.
- [campaign-start.mjs](../../src/campaign/campaign-start.mjs) creates `campaignState.player` without a portrait field.

[Directive Interface Design Bible](DIRECTIVE_INTERFACE_DESIGN_BIBLE.md) currently says Character Creator should have no implied player portrait, and Crew may use a neutral commander placeholder until custom portrait support exists. This improvement replaces that placeholder with an explicit user-import path.

## Target Experience

### Campaign Surface

Campaign should treat character creation as a recoverable workflow, but only after the player has done meaningful work.

- **New Campaign** remains the primary action for the selected campaign package.
- **Continue Character Setup** appears only for a meaningful in-progress draft.
- Empty drafts created by opening and immediately leaving the creator should not produce a resume action.
- If the draft has a name, the resume label may become `Continue [Name]` or the title/tooltip may include the name.
- Saved campaign records remain managed from Records, not from the creator draft workflow.

### Creator Shell

The creator should have a stable commissioning context:

- Campaign package, ship, role, and campaign premise remain visible in compact form.
- A player portrait tile is available throughout the process, visually paired with the campaign ship context without implying that the package owns the player image.
- The stepper shows progress, not alternate tabs.
- The active step has one primary action.
- Completed previous steps can be revisited.
- Future steps are locked or visibly pending until prerequisites are complete.
- **Campaign Library** is the route-level exit and preserves a meaningful draft.
- **Back** is reserved for previous-step movement inside the guided flow.
- **Discard Character** deletes the active in-progress draft after confirmation.

### Player Portrait Surface

The Character Creator should include a persistent **Player Portrait** tile near the commissioning overview.

Recommended layout:

- Desktop: Breckenridge ship image on the left, player portrait tile to its right or beside the overview copy.
- Tablet: two compact media cells if width permits.
- Phone: ship image first, player portrait tile stacked below it.

The tile should be available from every creator step because portrait selection is independent of Identity, Service, Personality, and Review.

Controls:

- **Import Portrait** when no portrait exists.
- **Change Portrait** when a portrait exists.
- **Remove Portrait** when a portrait exists.

The visible affordance should be icon-led and compact. Use a clear file-import or image icon, not a generic text-only button. The tile should show a neutral commander placeholder when no portrait exists.

### Crew Portrait Editing

After campaign start, the Crew route should let the player change or remove only the `player-commander` portrait.

Rules:

- Bundled senior-staff portraits remain read-only package assets.
- `player-commander` uses `campaignState.player.portrait` when present.
- If no player portrait is present, Crew falls back to the neutral commander placeholder.
- Changing the portrait from Crew updates campaign state and the active save path, not the original campaign package.
- Removing the portrait deletes the owned portrait asset if the host supports delete.

### Stepper States

Use these step states:

```text
active     The section currently being edited.
complete   The section meets its required-field contract.
available  The next section that can be started.
locked     A future section blocked by prior incomplete sections.
```

Avoid `Open` as a state label. It makes future steps sound equally available.

### Primary Flow

1. Campaign Briefing
   - Already mostly exists in Campaign.
   - Establishes package, ship, role, premise, and senior crew.
   - Primary action: **New Campaign**.

2. Identity
   - Name.
   - Pronouns or form of address.
   - Species.
   - Age band.
   - Appearance.
   - Optional first impression when package data supports it.
   - Primary action: **Next: Service**.

3. Service
   - Locked or selected role display.
   - Career background.
   - Formative service experience.
   - Assignment reason.
   - Editable service summary generated from selected choices.
   - Optional must-be-true fact when package data supports it.
   - Primary action: **Next: Personality**.

4. Personality
   - Insight trait.
   - Connection trait.
   - Execution trait.
   - Command flaw.
   - Editable command-style summary generated from selected choices.
   - Optional generation note when package data supports it.
   - Primary action: **Next: Review**.

5. Review
   - Generated or locally synthesized dossier.
   - Editable brief biography.
   - Editable public reputation.
   - Optional open thread when package data supports it.
   - Simulation mode.
   - Primary action: **Start Campaign**.

## Draft Lifecycle Contract

### Meaningful Draft Detection

Add a deterministic meaningful-input check. A draft is meaningful if any creator-owned character field has a non-empty value, or if any step is complete.

Do not count these by themselves:

- `activeStep`
- `revision`
- timestamps
- autosave history
- default simulation mode
- empty nested objects

A custom portrait does count as meaningful input. A player who imports a portrait before filling text fields should be able to return later through **Continue Character Setup**.

Recommended helper:

```text
getCharacterCreatorDraftProgress(draft).hasMeaningfulInput
```

or equivalent progress field computed alongside `completedSteps`, `reviewReady`, and `readyForCampaignStart`.

### Resume Eligibility

Campaign package actions should derive `resumeDraft` from the latest draft that satisfies all of these:

- status is `inProgress`;
- package id matches the selected package;
- `hasMeaningfulInput` is true.

Accepted drafts should never be resumable. Empty in-progress drafts should not be resumable.

### Discard Behavior

Add a focused discard path:

```text
deleteCharacterCreatorDraftFromStorage(adapter, draftId)
discardCharacterCreatorDraft({ adapter, draftId })
controller.discardCreatorDraft({ draftId })
runtimeApp.discardCreatorDraft()
runtime-shell action: discardCreatorDraft()
```

The repository method should:

- load the draft index;
- locate the draft path;
- remove the draft index entry;
- remove the storage index file entry;
- delete the payload if the adapter supports deletion;
- return a small result object with `draftId`, `path`, and `deleted`.

Because Directive is pre-alpha, hard deletion is acceptable for discarded in-progress drafts. There is no need to preserve an `abandoned` status unless diagnostics later need an audit trail.

### Library Exit Behavior

Recommended behavior:

- Rename the current **Return to Campaign** control to **Campaign Library**.
- **Campaign Library** saves and preserves a meaningful draft.
- **Campaign Library** from a truly empty draft may auto-discard it.
- **Discard Character** always deletes the active in-progress draft after confirmation.

If auto-discard feels too implicit, the minimum acceptable behavior is to hide empty drafts from Campaign resume actions and expose **Discard Character** clearly in the creator.

The visible route-level exit should not be labeled only **Back**. In the guided creator, **Back** means "previous step." If extra width is available, **Back to Library** is acceptable, but the compact preferred label is **Campaign Library** with an arrow-left icon and a tooltip or accessible label of `Return to Campaign Library`.

### Portrait Asset Cleanup

Discard and replacement paths must clean up portrait assets owned by the draft or player record.

Required cases:

- Replacing a draft portrait deletes the previous draft-owned asset after the new asset is saved.
- Removing a draft portrait deletes the draft-owned asset.
- Discarding a draft deletes the draft-owned portrait asset.
- Starting a campaign either transfers the draft portrait reference into `campaignState.player.portrait` or rewrites ownership to the accepted campaign/player record.
- Replacing a campaign player portrait deletes the previous campaign-owned asset after the new asset is saved.
- Removing a campaign player portrait deletes the campaign-owned asset.

If the host cannot delete files, Directive should remove JSON references and report the stale asset as host-cleanup-limited rather than blocking the user.

## Guided UI Contract

### Command Bar Hierarchy

The creator command bar should not give every control equal weight. The current equal-column pattern makes **Save Draft**, **Start Campaign**, the simulation mode selector, and the route exit read as peer actions, even though they have different jobs.

Required hierarchy:

- Route-level exit: **Campaign Library**, arrow-left icon, muted science/teal or blue-grey tint, and no orange primary fill.
- Step movement: **Back** and **Next** tied to the active creator step.
- Final primary action: **Start Campaign**, shown only in Review and enabled only when the campaign-start contract is satisfied.
- Persistence action: **Save Draft**, secondary or quiet, compact, and not visually competitive with the primary step action.
- Simulation mode: a setting, not a command. Prefer placing it in Review or a compact settings control rather than making it a peer button in the command bar.
- Destructive reset: **Discard Character**, coral/red warning treatment, separated from ordinary navigation.

Layout rules:

- Use content-sized controls or asymmetric grid tracks instead of stretching every button to the same width.
- Keep desktop command buttons compact; preserve comfortable hit targets on phone layouts through wrapping or stacking rather than oversized desktop tracks.
- Keep one visually dominant primary action per step.
- Use icon-led controls where the icon is familiar, with accessible labels and titles for icon-only variants.
- Do not use the same color treatment for route exit, save, start, and discard.

### Step Navigation

Replace direct tab-style step switching with guided movement:

- **Next** saves the active section and advances only when the current step meets its required fields.
- **Back** saves the active section and returns to the previous step.
- Completed prior steps can be clicked or selected from the stepper.
- Locked future steps cannot be clicked.
- The next available step can be clicked only if all prior required steps are complete.

The stepper can still be visually compact, but it must communicate sequence. It should behave like a progress rail, not a tablist.

### Required Field Feedback

When a player tries to advance without required fields:

- keep them on the active section;
- mark missing fields;
- use concise, field-local copy;
- avoid a modal unless the platform lacks inline affordances.

### Review Entry

When the player enters Review:

- if review fields are empty, create a local fallback dossier immediately;
- if the Reasoning provider is available and the player triggers the wand, replace or refine the dossier through a preview;
- never block **Start Campaign** on provider availability.

## Player Portrait Import Contract

### Ownership

Player portraits are user-owned campaign media, not package assets.

Before campaign start, the portrait belongs to the character-creator draft. After campaign start, it belongs to the accepted player character in campaign state.

Recommended draft shape:

```json
{
  "input": {
    "identity": {
      "portrait": {
        "kind": "directive.playerPortrait",
        "source": "userUpload",
        "asset": {
          "path": "/user/files/directive-player-portrait-draft-creator-draft-1.webp",
          "mimeType": "image/webp",
          "width": 768,
          "height": 768,
          "aspect": "1:1",
          "fit": "cover",
          "focalPoint": { "x": 0.5, "y": 0.5 },
          "alt": "Player character portrait",
          "updatedAt": "2026-06-22T00:00:00.000Z"
        }
      }
    }
  }
}
```

Recommended accepted player shape:

```json
{
  "player": {
    "id": "player-commander",
    "portrait": {
      "kind": "directive.playerPortrait",
      "source": "userUpload",
      "asset": {
        "path": "/user/files/directive-player-portrait-campaign-campaign-1.webp",
        "mimeType": "image/webp",
        "width": 768,
        "height": 768,
        "aspect": "1:1",
        "fit": "cover",
        "focalPoint": { "x": 0.5, "y": 0.5 },
        "alt": "Player character portrait",
        "updatedAt": "2026-06-22T00:00:00.000Z"
      }
    }
  }
}
```

### Storage

Do not store long-lived base64 image data in draft records or campaign saves. Base64 is acceptable only as a transient browser-side input before upload.

Add a focused media asset layer that can:

- validate file type and size;
- normalize image dimensions through canvas;
- encode to webp, jpeg, or png;
- generate a Directive-owned flat filename;
- write the passive image asset through the host storage adapter;
- register the asset in the storage index;
- delete stale owned assets where supported;
- return a compact asset descriptor for draft or campaign state.

The SillyTavern path can build on [file-api.mjs](../../src/hosts/sillytavern/file-api.mjs), which already wraps `/api/files/upload`, `/api/files/verify`, and `/api/files/delete`. The repository-facing contract should still keep UI panels from calling host upload endpoints directly.

The Lumiverse path should use the host storage/media capability available there. If Lumiverse only supports JSON storage in the first slice, the portrait action should be disabled or reported as unsupported in that host until binary/passive media storage is implemented.

### Image Processing

Start with Saga's cover-image constraints unless Directive has a stronger reason to diverge:

- accepted input types: png, jpeg, webp;
- rejected input types: svg, html, executable files, and active/scriptable formats;
- optional gif rejection in the first slice to avoid animated portrait handling;
- input cap: 12 MB;
- maximum output dimension: 768 px on the longest side;
- output quality: webp or jpeg around 0.86 when available;
- fallback output: png;
- strip metadata by redrawing through canvas;
- store `width`, `height`, `aspect`, `mimeType`, `fit`, `focalPoint`, `alt`, and `updatedAt`.

The UI should not require manual cropping in the first slice. Use `object-fit: cover` for portrait crops and preserve center focal point. A later enhancement can add focal-point adjustment.

### Rendering

Add a player-aware image resolver before falling back to package imagery:

```text
resolvePlayerPortrait(campaignState.player.portrait || creator.input.identity.portrait)
  -> uploaded image
  -> neutral commander placeholder
```

Use the uploaded portrait in:

- Character Creator overview portrait tile;
- Crew roster `player-commander` thumbnail;
- Crew detail `player-commander` portrait.

Do not use the portrait in Mission, Log, or prompt context by default. Those surfaces can reference the player by name/rank and dossier text.

### Safety

Portraits are visual personalization only.

- Do not send portrait images to the Reasoning provider by default.
- Do not include portrait paths in model prompts unless a future explicit feature needs it.
- Do not infer species, age, gender, appearance, uniform, rank, history, competence, relationships, or personality from the image.
- Do not let uploaded portraits override structured text fields.
- Do not treat portraits as canon evidence for Director adjudication.

## Section Wand Assistance

### Control

Each creator section header should include a small icon-only wand button:

```text
icon: fa-solid fa-wand-magic-sparkles
aria-label examples:
  Draft Identity
  Draft Service Record
  Draft Personality
  Draft Dossier
```

The button belongs in the section header, not in the global command bar. It should feel like help for this section, not a separate app mode.

### Modes

The wand has two inferred modes:

```text
create   The section has no meaningful values. Generate a complete section draft.
refine   The section has partial values. Treat those values as authoritative inspiration.
```

The UI does not need a visible mode toggle. The tooltip can change:

- Empty section: `Draft this section`.
- Partial section: `Use current details as inspiration`.

### Provider Routing

Add a Reasoning-lane generation role, for example:

```text
characterCreatorSectionDraft
```

Do not add it to the Utility role set. It is creative, player-facing character synthesis. It should default to Reasoning provider settings like campaign intro, narration, and conclusion.

### Request Shape

The request should include only player-safe creator context:

```json
{
  "kind": "directive.characterCreatorSectionDraftRequest",
  "sectionId": "identity",
  "mode": "create",
  "package": {
    "title": "U.S.S. Breckenridge: Ashes of Peace",
    "version": "0.1.0-pre-alpha.1"
  },
  "campaignContext": {},
  "ship": {},
  "role": {},
  "allowedOptions": {},
  "priorSections": {},
  "currentSection": {},
  "generationRules": [],
  "continuityGuardrails": []
}
```

Do not include hidden campaign state, mission graph secrets, raw relationship values, pressure values, or Director-only notes.

### Response Shape

The provider should return structured JSON. The runtime should accept only a patch for the requested section.

```json
{
  "kind": "directive.characterCreatorSectionDraftResult",
  "sectionId": "identity",
  "mode": "create",
  "fields": {
    "identity.name": "Talia Serrin",
    "identity.pronounsOrAddress": "she/her",
    "identity.speciesId": "human",
    "identity.ageBandId": "mid-career",
    "identity.appearance": "A composed officer with a quiet voice and a habit of watching the room before speaking."
  },
  "notes": [],
  "warnings": []
}
```

For select fields, values must be valid option ids from the active package. For text fields, values must be bounded by the package dossier and field-length expectations.

### Validation Rules

Validation owns authority. Provider output must be rejected or reduced when it:

- patches a field outside the requested section;
- returns a select value not present in package options;
- mutates accepted drafts;
- adds hidden Director facts;
- references unavailable campaign secrets;
- invents current-crew friendships or canonical relationships;
- makes the character universally admired or impossibly competent;
- creates severe trauma, secret ancestry, hidden powers, or criminal history without explicit player input;
- exceeds text-length limits.

Reuse the response-normalization and structured-parser pattern used by Directive Assist and side-mission provider assistance. Provider output is evidence, not authority.

### Apply Model

Prefer a preview/apply flow:

1. Player clicks wand.
2. Button enters loading state.
3. Provider or local fallback produces a section patch.
4. Runtime validates the patch.
5. UI shows the proposed changes.
6. Player applies, edits, regenerates, or dismisses.

For the first implementation, direct fill is acceptable only if the fields are empty. For partial/refine mode, preview is strongly preferred because the player has already expressed intent.

## Local Fallback

Provider failure must not block creation. Add deterministic fallback builders:

- Identity fallback can propose neutral phrasing only when package options are known.
- Service fallback can combine selected background, formative experience, and assignment reason labels.
- Personality fallback can summarize selected traits and flaw without simulating behavior.
- Review fallback can produce a compact biography and public reputation from completed sections.

Fallback text should be conservative and short.
Fallback returned from a section wand should preview before applying, even when the section is empty, so the user can see that the provider failed or was unavailable. Provider output may still directly fill an empty section.

## Target User Flow Alignment

| Target User Flow Requirement | Current State | Improvement |
| --- | --- | --- |
| Guided Character Creator | One active section renders, but controls read as tabs | Replace direct step buttons with a gated wizard stepper and Back/Next flow |
| Drafts recoverable but not campaign state | Drafts persist correctly | Add meaningful-draft filtering and explicit discard |
| New Campaign as main Campaign action | Present | Keep as primary action |
| Player-created officer identity | Structured identity exists, but no user portrait import | Add a player-owned portrait tile during creation and editable player portrait in Crew |
| Creator navigation clarity | Route exit is labeled **Return to Campaign** and styled like peer actions | Rename to **Campaign Library**, reserve **Back** for step movement, and separate button hierarchy by color and weight |
| Provider help receives only creator context and explicit inputs | Not yet implemented for creator | Add section-scoped Reasoning provider request with strict input boundaries |
| Final action is Start Campaign | Present | Keep only on Review and enable after required review data exists |
| Provider failure must not block startup | Model says this, runtime review is manual | Add local fallback dossier and provider-failure recovery |

## Implementation Slices

### Slice 1: Draft Lifecycle And Resume Eligibility

Code targets:

- [character-creator-draft.mjs](../../src/creators/character-creator-draft.mjs)
- [directive-storage-repository.mjs](../../src/storage/directive-storage-repository.mjs)
- [campaign-start-service.mjs](../../src/campaign/campaign-start-service.mjs)
- [campaign-start-controller.mjs](../../src/runtime/campaign-start-controller.mjs)
- [runtime-app.mjs](../../src/runtime/runtime-app.mjs)
- [runtime-shell.js](../../src/runtime/runtime-shell.js)
- [campaign-panel.js](../../src/ui/campaign-panel.js)
- [character-creator-panel.js](../../src/ui/character-creator-panel.js)

Required behavior:

- Empty newly created draft does not show **Continue Character Setup**.
- Meaningful partial draft does show **Continue Character Setup**.
- Portrait-only draft does show **Continue Character Setup**.
- Accepted draft does not show **Continue Character Setup**.
- **Discard Character** deletes active in-progress draft and returns to Campaign.
- Discarding a draft removes any draft-owned portrait asset where the host supports deletion.
- `Reset Window` remains non-destructive for meaningful stored drafts.

Tests:

- Update [test-runtime-campaign-start-controller.mjs](../../tools/scripts/test-runtime-campaign-start-controller.mjs).
- Update [test-campaign-start-and-save.mjs](../../tools/scripts/test-campaign-start-and-save.mjs).
- Update [test-directive-storage-repository.mjs](../../tools/scripts/test-directive-storage-repository.mjs).
- Update [test-runtime-shell-creator-flow.mjs](../../tools/scripts/test-runtime-shell-creator-flow.mjs).

### Slice 2: Guided Wizard UI

Code targets:

- [character-creator-panel.js](../../src/ui/character-creator-panel.js)
- [directive.css](../../styles/directive.css)
- [test-visual-system-foundation.mjs](../../tools/scripts/test-visual-system-foundation.mjs)
- [test-runtime-shell-creator-flow.mjs](../../tools/scripts/test-runtime-shell-creator-flow.mjs)

Required behavior:

- Stepper states are active, complete, available, and locked.
- Future locked steps cannot be clicked.
- **Next** validates the active step and advances.
- **Back** returns to the previous step.
- Route-level exit is labeled **Campaign Library**, not **Back** or **Return to Campaign**.
- **Campaign Library** uses a distinct route-exit tint and does not share the primary-action treatment.
- **Save Draft** is secondary and compact.
- Simulation mode is treated as a setting, not an equal command-button peer.
- Review is reached through Personality completion, not by tabbing around the process.
- Mobile layout keeps the active section, command row, and stepper readable.

### Slice 3: Player Portrait Import

Code targets:

- new media asset helper under `src/media/` or `src/storage/`
- [directive-storage-filenames.mjs](../../src/storage/directive-storage-filenames.mjs)
- [directive-storage-repository.mjs](../../src/storage/directive-storage-repository.mjs)
- [file-api.mjs](../../src/hosts/sillytavern/file-api.mjs)
- [character-creator-draft.mjs](../../src/creators/character-creator-draft.mjs)
- [campaign-start.mjs](../../src/campaign/campaign-start.mjs)
- [runtime-app.mjs](../../src/runtime/runtime-app.mjs)
- [runtime-shell.js](../../src/runtime/runtime-shell.js)
- [character-creator-panel.js](../../src/ui/character-creator-panel.js)
- [crew-panel.js](../../src/ui/crew-panel.js)
- [directive-media.js](../../src/ui/directive-media.js)
- [directive.css](../../styles/directive.css)

Required behavior:

- Character Creator shows a persistent Player Portrait tile.
- Import accepts png, jpeg, and webp image files.
- Import rejects non-image, oversized, and active/scriptable inputs.
- Imported portrait is resized, re-encoded, stored as a passive asset, and referenced from the draft.
- Replacing or removing a draft portrait cleans the previous draft-owned asset where supported.
- Starting a campaign copies the portrait to `campaignState.player.portrait`.
- Crew uses the player portrait for `player-commander`.
- Crew can change or remove only the player portrait.
- Bundled senior-staff portraits remain read-only.

Tests:

- Add focused image-processing tests where browser/canvas support can be mocked or isolated.
- Update [test-sillytavern-file-api.mjs](../../tools/scripts/test-sillytavern-file-api.mjs) if new raster upload helpers are added.
- Update [test-runtime-shell-creator-flow.mjs](../../tools/scripts/test-runtime-shell-creator-flow.mjs) for creator portrait controls and portrait-as-meaningful-draft behavior.
- Update [test-visual-system-foundation.mjs](../../tools/scripts/test-visual-system-foundation.mjs) for creator and Crew player portrait affordances.

### Slice 4: Review Fallback Generation

Code targets:

- [character-creator-draft.mjs](../../src/creators/character-creator-draft.mjs)
- new creator generation helper under `src/creators/`
- [character-creator-panel.js](../../src/ui/character-creator-panel.js)

Required behavior:

- Entering Review with completed Identity, Service, and Personality creates a local fallback dossier if review fields are empty.
- The fallback does not invent major personal facts.
- The player can edit the generated text before **Start Campaign**.

### Slice 5: Section Wand Provider Contract

Code targets:

- [generation-roles.mjs](../../src/generation/generation-roles.mjs)
- new creator provider-assist module under `src/creators/`
- [runtime-app.mjs](../../src/runtime/runtime-app.mjs)
- [runtime-shell.js](../../src/runtime/runtime-shell.js)
- [character-creator-panel.js](../../src/ui/character-creator-panel.js)
- [directive.css](../../styles/directive.css)

Required behavior:

- Each active section header shows a small wand icon.
- Empty section triggers create mode.
- Partial section triggers refine mode.
- Provider response is structured JSON.
- Validation accepts only the requested section patch.
- Provider failure returns a local fallback or a visible non-blocking warning.

Tests:

- Add focused creator provider-assist tests.
- Add shell test coverage for wand button rendering.
- Add validation tests for illegal field patches and invalid option ids.

### Slice 6: Documentation And Release-Facing Updates

After implementation:

- Update [Character Creator Model](CHARACTER_CREATOR_MODEL.md) only if the product contract changes.
- Update [Directive Operator Manual](../user/DIRECTIVE_OPERATOR_MANUAL.md) once the runtime behavior exists.
- Update [Testing Strategy](../testing/TESTING_STRATEGY.md) if new tests become alpha-gate fixtures.

## Acceptance Criteria

- A fresh user can click **New Campaign**, immediately return to Campaign, and does not see **Continue Character Setup**.
- A user who enters meaningful details can return later and resume the draft.
- A user who imports only a portrait can return later and resume the draft.
- A user can discard/reset an in-progress character and the draft is removed from the Campaign resume path.
- Discarding, replacing, or removing a portrait cleans stale owned portrait references and deletes stale files where supported.
- The creator presents Identity, Service, Personality, and Review as a guided process.
- The creator reserves **Back** for previous-step movement and uses **Campaign Library** for the route-level exit.
- Creator command buttons are compact and visually ranked: one primary action, secondary save, distinct route exit, and warning-styled discard.
- The creator has a persistent Player Portrait tile available throughout the process.
- Crew lets the player change or remove only the player-character portrait.
- Bundled package portraits remain read-only.
- Future steps do not read as available tabs.
- Review can be populated by local fallback without a provider.
- Each section exposes a small wand action.
- The wand creates from scratch when the section is empty.
- The wand refines from existing details when the section is partial.
- Provider output cannot patch unrelated sections.
- Provider output cannot expose hidden or Director-only information.
- Provider failure does not block **Start Campaign**.
- The flow remains usable on a phone-sized display.

## Verification

Focused checks after each implementation slice:

```powershell
node tools\scripts\test-campaign-start-and-save.mjs
node tools\scripts\test-directive-storage-repository.mjs
node tools\scripts\test-sillytavern-file-api.mjs
node tools\scripts\test-runtime-campaign-start-controller.mjs
node tools\scripts\test-runtime-shell-creator-flow.mjs
node tools\scripts\test-visual-system-foundation.mjs
```

Full release gate after the complete revision:

```powershell
node tools\scripts\run-alpha-gate.mjs
```
