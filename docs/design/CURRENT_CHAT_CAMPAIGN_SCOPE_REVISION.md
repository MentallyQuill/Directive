# Current Chat Campaign Scope Revision

## Status

Implemented pre-alpha revision.

This document turns the multi-campaign UI concern into an implementation-facing feature contract. It supersedes the current assumption that a loaded campaign save may populate Mission, Crew, Ship, and Log even when the host has no matching active campaign chat selected.

Related docs:

- [Target User Flow](TARGET_USER_FLOW.md)
- [First Start Revision](FIRST_START_REVISION.md)
- [UI-UX Simplification Review](UI_UX_SIMPLIFICATION_REVIEW.md)
- [Active Chat Save Guard Plan](../planning/ACTIVE_CHAT_SAVE_GUARD_PLAN.md)
- [Chat-Native Runtime](../architecture/CHAT_NATIVE_RUNTIME.md)
- [Storage And State Safety](../user/STORAGE_AND_STATE_SAFETY.md)

## Problem

Directive can have more than one playable campaign or save branch. The host chat is the player's actual play surface, while Directive is the control, inspection, and recovery surface.

If Directive renders a loaded campaign's Mission, Crew, Ship, and Log when no host chat is selected, or when a different campaign chat is selected, the UI implies the wrong campaign is live. With several active campaigns, this creates three failure modes:

- the player cannot tell which campaign the drawer is describing;
- the player may believe they are saving or reviewing the chat they are reading;
- Directive appears to have one global active campaign even though campaigns are chat-affine.

The UI needs to scale to dozens of active campaign sessions without making the live route panels ambiguous.

## Decision

Campaign is the campaign inventory and control route. Mission, Crew, Ship, and Log are current-chat campaign routes.

The rule is:

```text
Campaign shows what exists.
Mission, Crew, Ship, and Log show only what belongs to the currently selected host chat.
```

If no host chat is selected, those live routes should not hydrate from the most recently loaded save. If the selected host chat has no Directive campaign binding, those live routes should show an empty current-chat state. If the selected host chat belongs to a different Directive campaign than the save currently loaded in Records, the current chat wins for live route rendering.

## Terms

**Campaign session** means a playable Directive branch identified by campaign id, save id, and bound host chat id. A future campaign may have multiple branches, and each branch may have a different bound chat.

**Campaign inventory** means listable metadata for campaign packages, creator drafts, saves, autosaves, branches, imports, and hidden campaign-session rows. It does not require the host chat to be open.

**Current chat campaign** means the campaign session whose saved `campaignChatBinding` and host chat metadata match the currently selected host chat.

**Loaded save** means a save selected or restored through Records. It may be useful for inspection, load/open actions, or recovery, but it is not enough to populate live route data unless it also matches the selected host chat.

**Hidden from Command** means a user preference that removes a campaign session from the default Campaign Command list without deleting saves, unbinding chats, clearing prompt context, or changing campaign state.

## Target User Model

The player should learn this model quickly:

1. Open a campaign chat to play that campaign.
2. Open Mission, Crew, Ship, or Log to inspect the campaign attached to that chat.
3. Open Campaign to manage all campaigns, saves, branches, drafts, imports, and records.
4. Hide inactive campaign sessions from the default Command list when the list gets noisy.
5. Use Records to restore, inspect, load, delete, or branch saves without pretending they are live in the current chat.

There should be no generic **Continue Campaign** action. Continuing play means opening the bound campaign chat.

## Campaign Command List

Campaign Command should become a scalable campaign-session index rather than a single campaign dashboard.

Default list behavior:

- show non-hidden active campaign sessions first;
- collapse every session row by default when more than one session exists;
- keep the list internally scrollable;
- sort by attention state, then currently selected chat, then most recently updated;
- support search by campaign title, player, ship, chat name, package title, and save name;
- expose filters for **Current Chat**, **Needs Attention**, **Recent**, **Hidden**, and **Completed** once volume requires them.

Collapsed row content:

- campaign title;
- player name;
- ship name;
- bound chat name or chat id fallback;
- active save or branch name;
- last updated time;
- current-chat marker when this row matches the selected host chat;
- attention marker for missing chat, mismatched metadata, activation failure, pending review, or package problem.

Expanded row content:

- latest player-safe summary or last playable moment;
- active mission or phase label when available from indexed metadata;
- package title and version;
- save branch metadata;
- prompt or activation status only when it changes the next safe action;
- row actions.

Row actions:

- **Open Campaign Chat** when a bound chat exists and the host can open it;
- **Load Save** when the save exists and is not already mounted for the current chat;
- **Records** to inspect the save or branch;
- **Hide From Command** for visible rows;
- **Show In Command** for hidden rows;
- **Rebind Chat** only inside explicit recovery/admin affordances;
- **Archive** or **Delete Save** only where existing Records semantics already support them.

The expanded row should not become a second Mission dashboard. It is an index card with routing and recovery actions.

## Hide From Command

Hiding a campaign session is non-destructive.

It must not:

- delete a save;
- delete an autosave;
- remove a creator draft;
- clear campaign state;
- unbind or rebind a chat;
- clear installed prompt context for an active matching chat;
- remove host chat metadata;
- change package records.

Hidden state should be stored as user interface preference keyed by campaign session, not as gameplay state. The preferred key is:

```text
{hostId}:{campaignId}:{saveId}:{chatId}
```

If a chat id is unavailable, the key may use campaign id plus save id, but the row should be marked as needing chat repair instead of merging silently with another branch.

Hidden rows should remain reachable through a **Hidden** filter or **Show Hidden** toggle. If the current host chat matches a hidden campaign session, live routes still render that session; hiding only affects the Campaign Command list default.

## Live Route Gating

Mission, Crew, Ship, and Log should render from `currentChatCampaignState`, not from the last loaded or selected save.

The route states are:

| State | Condition | Live Route Behavior |
|---|---|---|
| Matching campaign chat | Selected host chat matches a known Directive campaign binding and save metadata | Render Mission, Crew, Ship, and Log from that campaign session |
| No active chat selected | Host supports current chat identity but reports none | Show neutral empty state and Campaign shortcut |
| Non-Directive chat | Selected host chat has no Directive metadata and does not match a known binding | Show neutral empty state and Campaign shortcut |
| Different Directive campaign | Selected host chat belongs to another Directive campaign than the loaded Records save | Render the selected chat's campaign if loadable; otherwise show load/repair guidance for that chat |
| Different Directive save | Selected host chat belongs to another save branch of the same campaign | Render the selected chat's branch if loadable; otherwise show branch load guidance |
| Missing save record | Selected chat metadata points to a missing save | Show repair guidance; do not render stale loaded state |
| Metadata conflict | Chat id matches but campaign/save metadata conflicts | Block live state and show Rebind or repair guidance |
| Missing host identity capability | Host cannot report current chat identity | Fail closed for live route hydration; show host capability diagnostic |

Live route empty copy should be concrete:

```text
No campaign chat selected.
```

```text
This chat is not linked to a Directive campaign.
```

```text
This chat is linked to a different Directive save branch. Load that branch to inspect it here.
```

## Load And Save Semantics

Records may load or inspect saves without requiring that save's chat to already be selected. Loading a save should attempt to open the save's bound chat when the host supports it. Once the bound chat is open and verified, live routes hydrate from that chat.

If a save is loaded but no matching chat is open:

- Campaign and Records may show the selected save as a record;
- Mission, Crew, Ship, and Log remain empty or mismatch-guided;
- manual save remains blocked by the active-chat guard;
- prompt context is not installed into the wrong chat.

`Save Game` and `Save Game As...` remain chat-affine. They require the active host chat to match the campaign session being written.

Autosaves remain tied to accepted chat-native turns. They inherit chat identity from the bound turn ingress and should not run from a generic drawer-loaded state.

## View Model Direction

Runtime views should separate inventory state from current-chat state.

Recommended fields:

```js
{
  campaignIndex: {
    sessions: [],
    hiddenSessionKeys: [],
    filters: {}
  },
  loadedSave: {
    saveId: null,
    campaignId: null,
    status: 'none|loaded|mismatch|missing'
  },
  currentChat: {
    capability: true,
    chatId: null,
    metadata: null,
    status: 'none-selected|non-directive|matching-campaign|different-campaign|different-save|missing-save|metadata-conflict|missing-capability'
  },
  currentChatCampaignState: null,
  currentChatCampaignGuard: null
}
```

`campaignState` should not be the default live route source unless its name and contract are narrowed to mean current-chat campaign state. During pre-alpha, prefer renaming or splitting fields over compatibility shims that preserve ambiguous behavior.

The campaign index should be buildable from save-list metadata without reading every full campaign payload. Save metadata should include enough player-safe fields to render the Command list:

- campaign id and title;
- save id, name, slot type, current marker, branch parent when present;
- package id, title, and version;
- player name;
- ship name;
- current stardate;
- active mission and phase labels when available;
- summary or last playable moment;
- campaign chat binding summary: host id, chat id, chat name if known;
- status flags for active, completed, activation failed, missing package, or hidden from Command preference.

## Prompt And Turn Processing Boundary

Prompt context remains chat-bound. Directive should install or rebuild prompt context only for the selected host chat that matches the campaign binding.

On chat change:

- clear or suspend prompt context for non-matching chats;
- refresh `currentChat` identity and metadata;
- resolve the matching campaign session from indexed save metadata;
- load the matching campaign state only when the save record exists;
- refresh live routes from `currentChatCampaignState`;
- leave Campaign and Records inventory available.

Turn ingestion should continue to ignore messages from non-bound chats. A campaign row in Command does not make that campaign active for turn processing; the selected bound chat does.

## Recovery And Repair

Rebind remains a recovery/admin action, not a normal way to switch campaigns.

Use **Rebind Chat** when:

- the user deliberately opened a replacement chat for an existing campaign;
- a host chat id changed;
- chat metadata was lost or corrupted;
- an alpha tester is repairing a saved branch.

Rebind should be exposed from expanded campaign rows only when the row is in a repair state, from Records inspectors, or from explicit recovery surfaces. It should confirm before writing, rebuild prompt context after success, and journal the rebind.

Do not offer **Bind Current Chat** as a casual row action. That would make accidental campaign reassignment too easy.

## Non-Goals

- No global current campaign that populates live route panels without a selected matching chat.
- No generic **Continue Campaign** launcher.
- No route-level fake play session outside the host chat.
- No hidden campaign deletion when the user only hides a Command row.
- No automatic rebind when a different chat is selected.
- No legacy compatibility layer for ambiguous pre-alpha loaded-state rendering.
- No raw save ids, campaign ids, hidden state, or Director-only facts in normal campaign-session rows.

## Implementation Requirements

- Add a campaign-session index for Campaign Command that can list many sessions without reading every full payload.
- Add reversible hidden-session preferences keyed by campaign session.
- Make Campaign Command render collapsed, scrollable campaign-session rows by default.
- Change Mission, Crew, Ship, and Log to use current-chat campaign state.
- Resolve current chat identity and Directive metadata on route open, refresh, and host chat-change events.
- If the selected chat maps to a known save, load that save for live routes.
- If the selected chat does not map to a known save, do not fall back to the last loaded save.
- Keep Records able to inspect, load, and delete saves without requiring their chat to already be selected.
- Keep `Load Save` opening the bound campaign chat where supported.
- Keep manual save guarded by active chat identity.
- Keep prompt injection refusing unbound or mismatched chats.
- Keep hidden rows visible through a **Hidden** filter or equivalent.

## Verification Targets

Focused coverage should prove:

- no active chat selected leaves Mission, Crew, Ship, and Log unpopulated;
- a non-Directive selected chat leaves Mission, Crew, Ship, and Log unpopulated;
- selecting campaign chat A renders campaign A even if Records last loaded campaign B;
- selecting campaign chat B renders campaign B after campaign A was loaded;
- a different save branch in the same campaign does not render the wrong branch;
- missing save metadata shows repair guidance instead of stale live state;
- Campaign Command lists multiple active campaign sessions as collapsed rows;
- hidden sessions disappear from the default Command list without deleting saves;
- hidden sessions reappear through the Hidden filter and can be restored;
- hiding the current chat's session does not prevent live routes from rendering that chat;
- Load Save opens the bound chat and then hydrates live routes;
- Save Game and Save Game As remain blocked when active chat identity mismatches;
- prompt context is cleared or suspended on non-matching chat change;
- no hidden campaign facts or raw relationship values appear in campaign-session rows.

Add a focused current-chat campaign scope test for the new guard and hidden-session behavior. Existing adjacent scripts that should remain green:

```text
node tools/scripts/test-chat-native-runtime-flow.mjs
node tools/scripts/test-runtime-shell-creator-flow.mjs
node tools/scripts/test-extension-shell.mjs
node tools/scripts/test-visual-system-foundation.mjs
node tools/scripts/run-alpha-gate.mjs
```

Add or update tests as needed if those scripts do not yet cover current-chat route gating and hidden campaign-session preferences.

## Implementation Notes

The implemented runtime splits campaign inventory from live route state:

- `campaignIndex` lists Campaign Command sessions from save metadata and UI preferences.
- `currentChatCampaignState` is the only source for Mission, Crew, Ship, and Log route hydration.
- `loadedCampaignState` remains available for Campaign and Records inspection without making that save live.
- hidden Command rows are stored in `system/ui-preferences.v1.json` and do not mutate campaign saves or chat bindings.

Implementation verification on June 23, 2026:

```text
node tools/scripts/test-current-chat-campaign-scope.mjs
node tools/scripts/test-chat-native-runtime-flow.mjs
node tools/scripts/test-runtime-shell-creator-flow.mjs
node tools/scripts/run-alpha-gate.mjs
SILLYTAVERN_BASE_URL=http://127.0.0.1:8000 node tools/scripts/smoke-sillytavern-live.mjs
```

Live SillyTavern verification covered:

- no selected campaign chat shows the scoped Mission empty state;
- Campaign lists 14 active sessions in a scrollable Command session index;
- hiding a session removes it from the visible list and `Hidden (1)` restores it without deletion;
- opening a bound `Directive - Ashes of Peace` chat hydrates Mission, Crew, Ship, and Log from that chat only.

## Documentation Updates

When this revision is implemented, update release-facing docs to explain:

- Campaign Command lists all active campaign sessions;
- Mission, Crew, Ship, and Log are scoped to the currently selected campaign chat;
- hiding a campaign from Command is reversible and non-destructive;
- loading a save opens or asks for the bound campaign chat before live route hydration;
- **Rebind Chat** remains a recovery/admin action.
