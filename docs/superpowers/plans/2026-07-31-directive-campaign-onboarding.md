# Directive Campaign Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended; or superpowers:executing-plans) to implement this plan task-by-task. Steps use checkbox syntax (- [ ]) for tracking.

**Goal:** Restore campaign discovery as a browse-and-compare flow: selecting a package reveals canonical artwork and useful player-safe details, while Start, Continue Character Setup, Import Package, and Cancel remain explicit actions.

**Architecture:** Keep the existing campaign route and runtime actions. Expand the canonical package-to-view projection, extract the New Campaign presentation into a focused campaign browser renderer, and mount its blocking dialog through the body-level modal helper created by Slice A. The browser is presentation-only until an action invokes the existing runtime API.

**Tech Stack:** src/ui/view-models/campaign-view.mjs, src/runtime/runtime-app.mjs, src/ui/campaign-panel.js, new src/ui/campaign-browser.js, existing package media helpers, Directive CSS, Node DOM-contract scripts, Playwright live checks.

## Global Constraints

- The package's canonical campaign hook is campaign.highConcept; projection may expose it as premise for backward compatibility but must not invent content when absent.
- Preserve package-owned assets.images and resolve hero artwork through createPackageImage()/resolvePackageImage().
- The master list shows title, image/thumbnail, concise status, and an identity cue.
- The detail pane shows hook, theater/setting, era, ship, player role, campaign shape, and the strongest available opening hook.
- Clicking a campaign changes selection only. It must not call startCreatorDraft, resumeCreatorDraft, importCampaignPackageArchive, or mutate storage.
- Start/Continue/Import actions call existing runtime APIs and close only after action succeeds; Cancel/Back closes without mutation.
- Empty, malformed, and unavailable-package states remain visible and actionable.
- Desktop uses master/detail; phones use cards/accordion with the same detail information before Start.

## Files and interfaces

- Modify src/ui/view-models/campaign-view.mjs.
  - Update packagePremise() to prefer pack.campaign.highConcept, then legacy premise, summary, and description.
  - Add player-safe fields to each package/campaign row: hook, theater, eraLabel, ship, playerRole, structure, openingHook, and assets while preserving current premise, image, and mediaPackage fields.
- Modify src/runtime/runtime-app.mjs in campaignIndexView().
  - Project context.campaign.highConcept, thesis, theater, eraLabel, structure, playerRole, quests, and context.assets from getPackageContext({ packageId }).
  - Keep existing packageId, ship, and assets fallbacks when enrichment fails.
- Modify src/ui/campaign-panel.js.
  - Replace title/summary-only openNewCampaignDialog() body with a call to renderCampaignBrowser().
  - Change shared openDialog() to use appendDirectiveModal() from directive-overlay-root.js.
  - Preserve existing invoke() refresh behavior and opener focus restoration.
- Add src/ui/campaign-browser.js.
  - Export renderCampaignBrowser(dialog, { packages, actions, close }).
  - Export campaignBrowserSelection(packages, selectedId) as a pure selection helper for tests.
  - Renderer must expose stable attributes: data-campaign-browser, data-campaign-package-id, data-campaign-detail, data-campaign-action=start, continue, import, and cancel.
- Modify styles/directive.css for master/detail, artwork, metadata rows, action row, empty/error states, and mobile accordion behavior.
- Update tools/scripts/test-expanded-campaign-panel-contract.mjs and tools/scripts/test-expanded-campaign-view.mjs; add tools/scripts/test-campaign-browser.mjs.
- Update tools/scripts/test-runtime-shell-creator-flow.mjs only for the body-level modal fixture and explicit action assertions.

## Implementation tasks

### 1. Write red projection and browser tests

- [ ] Extend tools/scripts/test-expanded-campaign-view.mjs with campaign.highConcept, campaign.theater, campaign.eraLabel, campaign.structure, playerRole, and two image descriptors. Assert these values reach the built view and the high concept is used as the hook.
- [ ] Extend tools/scripts/test-expanded-campaign-panel-contract.mjs to require campaign-browser data attributes, explicit action labels, and modal-root mounting.
- [ ] Create tools/scripts/test-campaign-browser.mjs using the existing stub DOM. Assert selection changes only detail presentation; detail contains artwork, hook, setting, era, ship, role, shape, and opening hook; Start invokes actions.startCreatorDraft with the selected id; Continue invokes actions.resumeCreatorDraft with actions.resumeDraft; Import invokes actions.importCampaignPackageArchive only when an import payload exists; Cancel closes without invoking an action; and no-package/malformed-package states render a visible message.
- [ ] Run:

      node tools/scripts/test-expanded-campaign-view.mjs
      node tools/scripts/test-expanded-campaign-panel-contract.mjs
      node tools/scripts/test-campaign-browser.mjs

  Expected result: the new fields/data attributes and action semantics fail against the current title/summary-only chooser.

### 2. Project the canonical package summary

- [ ] In src/ui/view-models/campaign-view.mjs, update packagePremise() and add pure helpers for packageHook, packageOpeningHook, and packageShape so fallback order is deterministic and testable.
- [ ] In buildCampaignView(), copy canonical campaign summary into each package-backed row without serializing hidden source content or whole package datasets.
- [ ] In src/runtime/runtime-app.mjs, enrich campaignIndexView() from getPackageContext() using the exact canonical fields above; retain existing summary fallbacks when lookup fails.
- [ ] Verify Ashes of Peace and one non-Ashes package expose real image descriptors in the resulting view.

### 3. Implement the master/detail browser

- [ ] Create src/ui/campaign-browser.js with a pure selection model and DOM renderer.
- [ ] Render the master list with title, thumbnail/hero crop, status, and identity cue; mark the selected item with aria-current and aria-selected.
- [ ] Render the detail pane from the selected row, including artwork, high concept/hook, theater, era, ship, player role, campaign-shape counts, opening hook, and available actions.
- [ ] Ensure package selection updates only local selection state and detail DOM; do not call invoke() from the selection handler.
- [ ] Render Continue only when pack.actions.resumeDraft exists and actions.resumeCreatorDraft is available.
- [ ] Render Import only when the row includes an import payload/record expected by actions.importCampaignPackageArchive; do not fabricate bytes or filenames.
- [ ] Keep Cancel/Back available in desktop and mobile layouts.

### 4. Integrate the browser with existing runtime actions

- [ ] Replace openNewCampaignDialog() in src/ui/campaign-panel.js with the browser renderer and existing invoke() wrapper.
- [ ] Pass startCreatorDraft, resumeCreatorDraft, and importCampaignPackageArchive from the existing campaign panel action object; do not add a second storage path.
- [ ] Mount the dialog with appendDirectiveModal() so it appears above the Slice A runtime overlay.
- [ ] Preserve focus trap, Escape, click-away, opener restoration, and refresh behavior.

### 5. Style and responsive behavior

- [ ] Add desktop master/detail CSS with a readable detail column and bounded artwork crop; avoid a title-only list.
- [ ] Add mobile card/accordion styles where expanding a card exposes the same detail fields before Start.
- [ ] Add clear action hierarchy for Start, Continue, Import, and Cancel; disabled/unavailable actions must explain why.
- [ ] Add visible empty/error states for no packages, missing image, and failed package enrichment.

### 6. Run focused deterministic verification

- [ ] Run:

      node tools/scripts/test-expanded-campaign-view.mjs
      node tools/scripts/test-expanded-campaign-panel-contract.mjs
      node tools/scripts/test-campaign-browser.mjs
      node tools/scripts/test-runtime-shell-creator-flow.mjs

- [ ] Run git diff --check and inspect that selection does not call a runtime action.

### 7. Prove the installed SillyTavern campaign flow

- [ ] Open Directive in the installed host and capture the New Campaign browser at desktop and phone widths.
- [ ] Verify Ashes of Peace and one other package show artwork and player-safe detail before any action.
- [ ] Verify the dialog is visibly above the shell, blocks clicks to the shell, and restores focus after Cancel/Escape.
- [ ] Verify Start enters character setup, Continue resumes the matching draft, Import uses the existing import flow, and selection alone leaves saves/chat bindings unchanged.
- [ ] Store screenshots and action/transcript evidence under artifacts/directive-recovery/campaign/.
- [ ] If the installed host cannot be exercised, record the blocker and leave Slice B uncertified.

### 8. Commit the slice

- [ ] Run git status --short --branch and confirm only campaign-slice files are changed.
- [ ] Commit with fix(campaign): restore campaign discovery flow.
- [ ] Record commit SHA and screenshot paths for the story-slice handoff.

## Exit evidence

- [ ] Deterministic projection/browser tests pass.
- [ ] Campaigns are comparable before commitment, with real artwork and useful detail.
- [ ] Start/Continue/Import/Cancel semantics are proven in the installed host.
- [ ] Modal layering and focus behavior are proven.
- [ ] Human reviewer approves the campaign browser against the approved recovery design before Slice C begins.
