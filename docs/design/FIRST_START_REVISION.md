# First Start Revision

## Status

Approved pre-alpha design revision.

This document supersedes the earlier first-start assumption that a new campaign may begin by binding into an existing chat history. The runtime may keep rebinding as a recovery/admin capability, but first campaign creation should be opinionated: a new campaign starts in a fresh host chat.

Related docs:

- [Target User Flow](TARGET_USER_FLOW.md)
- [Character Creator Guided Flow Improvement](CHARACTER_CREATOR_GUIDED_FLOW_IMPROVEMENT.md)
- [Chat-Native Runtime](../architecture/CHAT_NATIVE_RUNTIME.md)
- [Storage And State Safety](../user/STORAGE_AND_STATE_SAFETY.md)

## Decision

When the player starts a new campaign, Directive should create a fresh chat and bind that chat to the campaign. The user should not be asked whether to bind the current chat or choose an existing chat during the first-start path.

The first-start path is:

1. The user completes Character Creator review.
2. The user chooses **Start Campaign**.
3. Directive verifies that the host has a selected character or group capable of owning a chat.
4. Directive creates a fresh chat for that host character or group.
5. Directive names the chat.
6. Directive binds the fresh chat to the campaign.
7. Directive generates or composes the campaign intro.
8. Directive ensures the intro is the first Directive campaign message in the fresh chat.
9. Directive installs player-safe prompt context.
10. Directive opens the campaign chat and marks activation complete.

## Rationale

Fresh chat creation is the clearest user model:

- a new campaign has a new play surface;
- no old messages need to be treated as pre-campaign history;
- no campaign-start marker is needed inside an unrelated transcript;
- chat snapshot, sync, export, repair, and reconciliation can assume the bound chat belongs to the campaign;
- the player does not accidentally bind a random active chat;
- the start button can stay simple.

Binding into an existing chat history is brittle for Directive's state model. It creates ambiguity around which messages belong to the campaign, which messages should be copied into Directive-owned storage, and how later chat-sync repair should treat edits or deletions before the campaign boundary.

## Chat Naming

The front-facing chat name should be concise and campaign-owned:

```text
Directive - Ashes of Peace
```

If the host rejects that title or the name exceeds a host limit, fall back to:

```text
Directive
```

The visible chat name should not include the player character name, save id, campaign id, package id, or revision. Those belong in Directive metadata and storage records, not in the host chat title.

For other packages, use:

```text
Directive - {Campaign Title}
```

with the same `Directive` fallback.

## Host Context Gate

Directive should block **Start Campaign** when it cannot identify a selected host character or group for chat creation.

The user-facing recovery should be direct:

```text
Select the character or group Directive should use for this campaign chat, then start the campaign.
```

This is not a choice between chat histories. It is only the host entity selection required to create a fresh chat.

## Intro Message

Directive should treat the campaign intro as the campaign's opening chat message.

For a fresh chat, the target is:

- no unrelated existing messages;
- no reused previous transcript;
- exactly one Directive-owned `campaignIntro` message;
- intro posting protected by the activation idempotency key;
- prompt context installed after binding and intro preparation;
- the newly created chat opened for the player.

If the host automatically inserts the character card's default greeting when a new chat is created, Directive should suppress, replace, or remove that greeting where the host API permits. The desired first visible campaign message is the Directive campaign intro, not a generic character-card opener.

If a host cannot reliably suppress or remove an automatic greeting, the adapter should record that limitation in diagnostics and tests. The campaign intro still remains the first Directive-owned campaign message.

## Rebind Chat

Manual rebinding remains useful, but it is not a first-start option.

Directive should expose **Rebind Chat** as a maintenance/recovery action on an active campaign. It exists for cases such as:

- the user duplicated or restored the host chat outside Directive;
- the host changed chat ids;
- a binding was lost or corrupted;
- an alpha tester deliberately needs to resume from another host chat.

The control should be named **Rebind Chat**, not **Bind Current Chat**, because the campaign already has a binding and the user is changing it.

Minimum rebind behavior:

1. User opens the target host chat.
2. User chooses **Rebind Chat**.
3. Directive asks for confirmation.
4. Directive updates the campaign chat binding to the current chat.
5. Directive rebuilds prompt context for the rebound chat.
6. Directive records a recovery/admin journal entry.
7. Directive runs a lightweight chat-sync check where available.

Confirmation copy:

```text
Rebind this campaign to the currently open chat? Directive will use this chat for future campaign turns and prompt context.
```

Rebind should not post a new campaign intro by default. The existing campaign state remains authoritative.

## Non-Goals

- No first-start option to bind an existing chat history.
- No campaign-start marker inside an old transcript as the normal path.
- No user-facing chat selection wizard during first start.
- No visible chat title packed with player, save, package, or revision metadata.
- No legacy compatibility layer for old pre-alpha first-start semantics.

## Implementation Requirements

- `Start Campaign` should always request fresh chat creation during initial activation.
- The chat adapter should require a selected host character or group before fresh chat creation.
- The generated chat name should prefer `Directive - {Campaign Title}` and fall back to `Directive`.
- Activation should fail recoverably if fresh chat creation fails.
- Activation should not mark the campaign active until binding, intro posting, prompt installation, and chat open are complete.
- Rebind should remain available only after campaign state exists.
- Rebind should rebuild prompt context but not recreate the campaign intro.
- Campaign saves should persist the binding, intro message id, prompt revision, and rebind journal details.

## Verification Targets

Focused tests should cover:

- first start always passes `createNewChat: true`;
- no first-start path binds an existing chat history;
- first-start chat naming prefers `Directive - Ashes of Peace`;
- fallback name is `Directive`;
- missing selected host character/group blocks activation with recoverable guidance;
- exactly one `campaignIntro` message is posted;
- activation retry does not duplicate the intro;
- rebind updates the binding and rebuilds prompt context;
- rebind does not post a second intro;
- chat-sync checks ignore pre-rebind history unless an explicit repair/import operation says otherwise.

## Documentation Updates

When this revision is implemented, update release-facing docs to describe:

- first start creates a fresh chat;
- existing chat binding is recovery/admin only;
- **Rebind Chat** is the maintenance control;
- the campaign chat title format is `Directive - {Campaign Title}`;
- active campaign play happens only in the bound chat.
