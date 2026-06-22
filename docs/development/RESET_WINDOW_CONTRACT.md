# Reset Window Contract

The SillyTavern Extensions menu exposes **Reset Window** through the `runtime.resetLayout` runtime action. This action is the extension-wide reset point for transient UI state.

Reset Window must be non-destructive. It may reset view chrome and in-memory UI affordances, but it must not delete campaign saves, imported packages, stored Character Creator drafts, package records, campaign state, or storage indexes.

## Required Reset Scope

When `runtime.resetLayout` runs, Directive should restore:

- command shelf position to the default left-side placement;
- command drawer width and height to layout defaults;
- command shelf mode to compact;
- route selection to Campaign;
- drawer/full-screen state to closed/non-full-screen unless a user explicitly reopens it afterward;
- current drag or resize gestures to inactive;
- route-local UI selections, filters, inspectors, and sub-shelf state to their default state;
- transient runtime workspace state that can force the shell out of its default layout, such as an active Character Creator workspace.

The current reset path is:

```text
ST Extensions menu Reset Window
  -> runtime.resetLayout
  -> resetDirectiveRuntimeLayout()
  -> resetDirectiveShellLayout()
  -> route-local reset hooks
  -> runtimeApp.resetRuntimeUiState()
```

## Module Rule

Any UI module that keeps state outside a render call must provide a reset hook and that hook must be called from `resetDirectiveRuntimeLayout()`.

Examples:

- `campaign-panel.js` keeps selected sub-shelf, selected package, campaign briefing, and selected save state, so it exports `resetCampaignPanelState()`.
- `crew-panel.js` keeps the selected roster officer, so it exports `resetCrewPanelState()`.
- Mission, Settings, Character Creator, and Command Log currently recreate their local section/filter state during render or from draft/campaign data, so they do not need module reset hooks unless that changes.

If a new panel adds module-level state such as `activeSectionId`, `selectedRecordId`, `expandedGroupId`, `activeFilter`, or transient diagnostics, add the reset hook in the same change.

## Test Rule

Reset-related changes should update at least one focused shell test. The test should prove the visible UI state is reset, not only that a function exists.

Minimum coverage for new resettable state:

- mutate the state through the rendered UI or public runtime action;
- run `runtime.resetLayout` or the module reset hook;
- re-render or inspect the shell;
- assert the default visible state is restored.

Run:

```powershell
node tools\scripts\test-extension-shell.mjs
node tools\scripts\run-alpha-gate.mjs
```
