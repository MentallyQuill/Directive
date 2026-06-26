# Active Chat Save Guard Plan

## Status

Implemented pre-alpha feature.

Verified on 2026-06-23 with:

```text
node tools\scripts\run-alpha-gate.mjs
$env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'; $env:DIRECTIVE_SILLYTAVERN_BROWSER='1'; $env:DIRECTIVE_SILLYTAVERN_SAVE_FLOW='1'; $env:DIRECTIVE_SILLYTAVERN_BROWSER_TIMEOUT_MS='45000'; node tools\scripts\smoke-sillytavern-live.mjs
```

Live SillyTavern verification covered the no-active-chat prompt, `Open Campaign Chat` recovery, `Save Game`, `Save Game As...`, active branch selection, branch payload binding, active chat binding metadata, and branch load.

User-facing feature name:

```text
Active Chat Save Guard
```

Primary action labels affected:

- `Save Game`
- `Save Game As...`
- `Open Campaign Chat`
- `Rebind Chat`

## Purpose

Directive saves structured campaign state while SillyTavern hosts the active play transcript. A player can run multiple save branches from the same campaign package, and those branches may have different host chats. Future hosts should implement the same semantic guard before they are treated as active targets.

Manual save must not write whichever campaign happens to be loaded in the Directive drawer if the user is looking at a different host chat. The save action should prove that the active host chat is the chat bound to the save being written.

The feature protects this failure case:

```text
The player is reading campaign branch B's chat, opens Directive, and clicks Save Game while Directive has branch A loaded.
```

That action must be blocked or redirected. Directive should not silently save branch A while the player thinks they saved branch B.

## Product Decision

Manual save is chat-affine.

`Save Game` and `Save Game As...` require the currently active host chat to match the loaded campaign state's `campaignChatBinding`. The guard compares concrete binding identity, not campaign title or package title:

- host id;
- chat id;
- campaign id;
- save id, except during the deliberate `Save Game As...` branch transition;
- current host chat metadata when available.

The loaded save remains authoritative for structured state. The active host chat is the evidence that the player is saving the branch they are currently playing.

## Existing Contract Anchors

Primary runtime anchors:

- `src/runtime/runtime-app.mjs`
- `src/runtime/campaign-start-controller.mjs`
- `src/runtime/chat-turn-orchestrator.mjs`
- `src/runtime/campaign-activation-coordinator.mjs`
- `src/hosts/host-contract.mjs`
- `src/hosts/sillytavern/chat-adapter.mjs`
- `src/ui/campaign-panel.js`

Primary docs:

- [Target User Flow](../design/TARGET_USER_FLOW.md)
- [First Start Revision](../design/FIRST_START_REVISION.md)
- [Chat-Native Runtime](../architecture/CHAT_NATIVE_RUNTIME.md)
- [Storage And State Safety](../user/STORAGE_AND_STATE_SAFETY.md)
- [Scene Reconciliation Plan](SCENE_RECONCILIATION_PLAN.md)

Existing behavior to preserve:

- first campaign start creates a fresh campaign chat;
- `Rebind Chat` remains a recovery/admin action, not an automatic save-time fix;
- chat-native turn ingestion only processes messages from the bound chat;
- prompt installation refuses to install campaign context into an unbound active chat;
- `Load Save` opens the save's bound chat when the host can do so.

## Save Action Contract

### Save Game

Before writing the active save, Directive must:

1. ensure campaign state exists;
2. ensure the campaign has a `campaignChatBinding`;
3. read the current host chat identity;
4. compare the current host chat id to `campaignChatBinding.chatId`;
5. read current host chat Directive metadata when the host exposes it;
6. compare metadata `campaignId` and `saveId` to the loaded campaign binding;
7. save only when the active host chat and loaded campaign save describe the same branch.

If the host cannot report a current chat id, Directive should fail closed for manual save and show a host capability error. Pre-alpha does not need a legacy fallback that guesses from the drawer state.

### Save Game As

`Save Game As...` starts from the same active-chat guard as `Save Game`.

After the guard passes, `Save Game As...` creates a new branch and makes that branch the active save for the current chat. That means:

1. create the new save record;
2. promote the new save as current;
3. update `campaignState.campaignChatBinding.saveId` to the new save id;
4. update current host chat metadata with the new binding;
5. rebuild or resynchronize prompt context if the prompt packet includes save identity;
6. refresh the Records view without changing the active host chat.

This resolves the ambiguity documented in [Scene Reconciliation Plan](SCENE_RECONCILIATION_PLAN.md): the branch save and chat transcript should not become separate records unless a future explicit feature supports detached branches.

### Autosaves

Autosaves are not a manual drawer action. They should remain tied to chat-native committed turns and should inherit the bound chat identity from the accepted ingress. If an autosave is requested outside a bound-chat turn flow, it should use the same guard as manual save.

### Load Save

`Load Save` is a library action. It should not require the user to already be on that save's chat.

The load flow should:

1. load the selected campaign state;
2. open the save's bound host chat;
3. install or resynchronize prompt context for that chat;
4. show a clear failure if the host cannot open the chat.

### Delete Save

`Delete Save` is a Records/library action. It should not require the active host chat to match the save being deleted.

Guardrails:

- deleting the active save should clear prompt context and loaded campaign state as it does today;
- deleting a save whose chat is currently open should not silently rebind another save to that chat;
- deleting selected autosaves or old branches should remain possible from Records.

## Mismatch Handling

Directive should distinguish mismatch cases because each has a different safe recovery path.

| Case | Condition | Save Behavior | Primary Recovery |
|---|---|---|---|
| Correct chat | current `chatId` equals loaded binding `chatId`, metadata matches when present | Save allowed | None |
| Different Directive save | current chat metadata has a different `saveId` | Save blocked | Load the active chat's save |
| Different Directive campaign | current chat metadata has a different `campaignId` | Save blocked | Open Campaign Chat for loaded save |
| Unbound chat | current chat has no Directive metadata and does not match loaded binding | Save blocked | Open Campaign Chat |
| No active chat selected | host reports no current chat id even though chat identity is supported | Save blocked | Open Campaign Chat or select the bound campaign chat |
| Missing host identity capability | host cannot report current chat id at all | Save blocked | Host capability diagnostic |
| Corrupt metadata | chat id matches but metadata conflicts | Save blocked | Rebind Chat or repair metadata |

## User-Facing Copy

Use direct, specific copy. Do not expose internal state names unless they are useful for debugging.

Wrong active chat:

```text
The active chat is not linked to this save. Open this save's campaign chat before saving.
```

Different save from the same campaign:

```text
The active chat is linked to a different save branch of this campaign. Load that branch, or open this save's campaign chat before saving.
```

Different campaign:

```text
The active chat is linked to a different Directive campaign. Open this save's campaign chat before saving.
```

No active chat selected:

```text
Choose the campaign chat for this save before saving. Save Game is disabled until that chat is active.
```

Missing host chat identity capability:

```text
This host cannot tell Directive which chat is active, so Save Game is disabled here.
```

Save As branch transition:

```text
Save branch created. This chat now points to the new branch.
```

## UI Requirements

### Records Inspector

When the selected save is not bound to the active host chat:

- disable `Save Game`;
- disable `Save Game As...`;
- keep `Load Save` enabled;
- keep `Delete Save` enabled;
- show a compact status row explaining whether the active host chat matches the selected save.

Primary recovery should be `Open Campaign Chat` when the loaded save has a binding.

When the host reports that no chat is currently selected, use the same disabled state and show a direct prompt:

```text
Choose the campaign chat for this save before saving. Save Game is disabled until that chat is active.
```

If the loaded save has a binding, `Open Campaign Chat` should be the primary action. If the host cannot open chats programmatically, instruct the user to select the campaign chat in the host and return to Directive.

When the active host chat belongs to another Directive save, the inspector may show `Load Active Chat Save` after the runtime can resolve metadata back to a save id.

### Mission

Mission remains the play surface. If manual save is blocked because the active chat does not match, Mission should use the same explanation and offer `Open Campaign Chat`.

### Settings

No new operator setting is planned. This is a safety invariant, not a preference.

## Runtime API Requirements

Add a shared runtime helper, conceptually:

```text
requireActiveCampaignChatForManualSave(campaignState, options)
```

The helper returns a structured result:

- `ok`;
- `reason`;
- `activeChatId`;
- `boundChatId`;
- `activeMetadata`;
- `boundCampaignId`;
- `boundSaveId`;
- `activeCampaignId`;
- `activeSaveId`;
- user-facing `summary`;
- recommended recovery action ids.

`saveCurrentGame` and `saveCurrentGameAs` should call this helper before writing.

Host adapters should expose:

- current chat id;
- current chat Directive metadata;
- ability to update current chat Directive metadata after `Save Game As...`;
- ability to open a binding's chat.

SillyTavern already has most of this shape through `getCurrentChatId`, `getBindingMetadata`, `updateBindingMetadata`, and `open`. Future hosts should provide the same semantic contract before they are considered active save-guard targets.

## Persistence Requirements

`campaignChatBinding` must continue to store:

- `hostId`;
- `entityType`;
- `entityId`;
- `entityName`;
- `chatId`;
- `chatName`;
- `campaignId`;
- `saveId`;
- prompt-context revision fields;
- rebind journal details.

After `Save Game As...`, the binding saved into the new branch and the metadata written into the active host chat must use the new save id.

## Implementation Stages

### Stage 1: Runtime Guard

- Add the shared active-chat save guard.
- Apply it to `saveCurrentGame`.
- Return structured blocked-save results instead of throwing generic errors.
- Add focused fake-host coverage for correct chat, wrong chat, missing chat id, and mismatched metadata.

### Stage 2: Save As Branch Ownership

- Apply the guard to `saveCurrentGameAs`.
- Update `campaignChatBinding.saveId` to the new save id after branch creation.
- Update host chat metadata for the active chat.
- Resynchronize prompt context when save identity changes.
- Add tests proving the new branch is current and the chat metadata points to the branch.

### Stage 3: Records UI

- Surface active-chat match status in the save inspector.
- Disable manual save commands when the active chat does not match.
- Keep load/delete available.
- Add recovery action wiring for `Open Campaign Chat`.
- Add visual-system assertions for the new status and disabled-state contract.

### Stage 4: Host Verification

- Prove SillyTavern guard behavior in the fake-host and live-smoke paths.
- Keep future-host requirements documented as semantic contract notes, not active pre-alpha work.
- Update [Storage And State Safety](../user/STORAGE_AND_STATE_SAFETY.md) only after behavior exists.
- Update [Chat-Native Runtime](../architecture/CHAT_NATIVE_RUNTIME.md) only after behavior is implemented and verified.

## Verification Plan

Focused tests:

- correct active chat allows `Save Game`;
- wrong active chat blocks `Save Game`;
- active chat for same campaign but different save blocks `Save Game`;
- active chat for different campaign blocks `Save Game`;
- missing host chat identity blocks manual save;
- `Save Game As...` updates the active chat metadata to the new save id;
- `Load Save` still opens the selected save's bound chat;
- `Delete Save` remains available from Records without active-chat matching;
- autosave from a committed bound-chat turn still writes at the configured cadence.

Likely test files:

- `tools/scripts/test-runtime-shell-creator-flow.mjs`;
- `tools/scripts/test-chat-native-runtime-flow.mjs`;
- `tools/scripts/test-sillytavern-chat-prompt-adapters.mjs`;
- `tools/scripts/test-visual-system-foundation.mjs`;
- `tools/scripts/smoke-sillytavern-live.mjs`.

Full gate after implementation:

```powershell
node tools\scripts\run-alpha-gate.mjs
```

## Non-Goals

- No automatic save-time `Rebind Chat`.
- No user-facing chat picker.
- No detached branch/chat workflow in this feature.
- No legacy compatibility path for manual saving without host chat identity.
- No change to package import, draft save, or storage diagnostics behavior.

## Acceptance Criteria

The feature is complete when:

- manual save cannot write a loaded save from the wrong active host chat;
- `Save Game As...` creates a branch and moves the active chat binding to that branch;
- Records clearly explains blocked manual save actions and keeps safe library actions available;
- host metadata, campaign save metadata, prompt context, and active save identity agree after Save As;
- SillyTavern and fake-host contracts expose the active save-guard semantics, with future hosts required to match them before activation;
- focused tests and the alpha gate pass.
