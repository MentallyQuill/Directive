# Outcome Integrity

## Status

Planned pre-alpha design. This document defines the target contract for protecting committed Directive outcomes while still letting players repair bad or overlong assistant prose.

Because Directive is still pre-alpha, implementation may update existing edit, recovery, and message-action behavior in place rather than preserving legacy semantics.

## Purpose

Outcome Integrity protects the difference between three things:

- The player's authored order.
- Directive's committed outcome and campaign state.
- The assistant prose used to narrate that outcome in the SillyTavern chat.

The player should be able to fix awkward model prose, trim verbosity, and clarify narration. The player should not be able to edit an assistant message into a better mission result, erased cost, new relationship state, free Command Bearing award, refunded point, or hidden-fact reveal.

Outcome Integrity is not an anti-cheat label in the UI. It is a campaign-state trust contract.

## Core Decision

Directive may allow edits to Directive-owned assistant messages when those edits pass an integrity review.

An accepted edit can replace the displayed narration for that message as a selected cosmetic swipe/revision. It cannot directly mutate authoritative campaign state.

If the edit changes the meaning of the committed outcome, Directive rejects it or marks it for explicit review. Mechanical changes must go through existing recovery tools such as `Rerun Outcome`, `Delete Outcome`, save branching, or future scene reconciliation.

## Player-Facing Setting

Recommended setting name:

```text
Outcome Integrity
```

Recommended default:

```text
Strict
```

Recommended player-facing description:

```text
Check edits to Directive narration so committed outcomes, costs, rewards, relationships, and Command Bearing stay intact.
```

Outcome Integrity is a campaign-specific setting. Settings should say this plainly so players do not assume it behaves like Directive's global extension settings.

Recommended setting note:

```text
Campaign-specific setting.
```

Modes:

| Mode | Behavior |
|---|---|
| `strict` | Directive-owned assistant edits require integrity review before they become the selected narration. Rejected edits are not applied, and the player cannot force-apply them while Strict is active. |
| `relaxed` | Native assistant edits are allowed, but edits that fail review are marked non-authoritative and do not affect Directive state. |
| `off` | Directive does not protect assistant narration from player edits. Committed state still remains the source of truth unless another explicit recovery operation changes it. |

`strict` should be the campaign default. `relaxed` is useful for players who value SillyTavern transcript freedom but still want clear state boundaries. `off` is an opt-out for players who want full host-native editing behavior.

## Authority Rules

Outcome Integrity applies only to Directive-owned assistant responses in a bound campaign chat.

V1 should protect Directive-owned assistant responses that have response-ledger entries and committed outcome context. `campaignIntro` should stay on the existing intro rewrite path unless a later pass explicitly adds intro-edit review. Untracked host assistant messages remain native SillyTavern messages in v1.

It does not block normal player-message editing. Player-message edits remain consequential because they may change the action that produced an outcome. Those edits should continue to use the pre-outcome snapshot, recovery journal, and replacement flow defined by turn transactions.

Directive-owned assistant prose has these authority limits:

- It may describe the already committed outcome.
- It may change wording, length, formatting, and non-mechanical color.
- It may not create, remove, or change committed facts.
- It may not alter outcome tier, costs, injuries, obligations, clocks, mission progress, relationship state, crew state, ship state, pressure state, Command Log entries, Command Bearing eligibility, Command Bearing awards, or Command Bearing spends.
- It may not reveal hidden Director-only facts.
- It may not claim a future sidecar result has already happened.

## Edit Outcomes

An integrity review returns one of three results:

| Result | Meaning | Runtime behavior |
|---|---|---|
| `accepted` | The edited prose preserves the committed outcome. | Apply the edited text as a selected cosmetic swipe/revision and record an accepted cosmetic edit. |
| `needsReview` | The edit is probably cosmetic but introduces ambiguous facts, unclear consequence wording, or relationship-sensitive tone. | Keep the original selected text by default and offer retry or restore inside the editor. |
| `rejected` | The edit changes authoritative meaning or violates hidden-state boundaries. | Reject or restore the edit and explain the first concrete reason. |

The first implementation should bias toward false negatives over false positives. Rejecting a borderline edit is annoying; accepting a disguised mechanical rewrite damages the core campaign contract.

## Allowed Edits

Typical accepted edits:

- Shortening a verbose response while preserving the same result.
- Removing repetition.
- Fixing typos, malformed names, grammar, or formatting.
- Rephrasing the same consequence more clearly.
- Adjusting tone without changing what characters know, decide, feel, owe, suffer, or gain.
- Removing model boilerplate that is not part of the scene.

Examples:

```text
Original: The Hesperus accepts the evacuation corridor, but the delay costs the Breckenridge its first clean sensor window.
Accepted edit: Hesperus accepts the corridor. The delay costs Breckenridge its first clean sensor window.
```

```text
Original: Commander Nayar frowns, then nods. "I'll give you ten minutes, Captain. No more."
Accepted edit: Nayar nods reluctantly. "Ten minutes, Captain. No more."
```

## Rejected Edits

Typical rejected edits:

- Turning failure or partial success into success.
- Removing a cost, injury, delay, complication, obligation, resource spend, or exposed risk.
- Adding mission progress that the committed outcome did not grant.
- Adding relationship trust, loyalty, fear, resentment, romance, respect, or forgiveness not present in state.
- Claiming a Command Mark, Inspiration Point, Resolve Point, refund, rank increase, or free intervention.
- Changing who gave an order or who accepted responsibility.
- Revealing hidden motives, hidden clocks, hidden factions, concealed crew facts, or Director-only causal links.
- Contradicting the outcome packet, public campaign state, or selected difficulty mode.

Examples:

```text
Rejected edit: Hesperus accepts the corridor immediately, and the Breckenridge keeps a perfect sensor lock.
Reason: removes the committed delay cost.
```

```text
Rejected edit: The crew is inspired by your decisiveness, earning one Resolve Mark.
Reason: creates an uncommitted Command Bearing award.
```

## Review Inputs

The review should compare the proposed edit against:

- Current selected assistant text.
- Original Directive response text when available.
- Response ledger entry.
- Outcome packet and final outcome band.
- Committed state delta summary.
- Command Bearing spend and award records tied to the outcome.
- Player-safe campaign projection.
- Public facts already known in the chat.
- Response kind, such as `committedOutcome`, `narration`, `commandBearing`, or recovery response.

The review must not expose hidden state to the player. If hidden-state comparison is needed, the model or deterministic reviewer may inspect hidden state internally, but rejection text must describe only player-safe reasons.

## Review Method

The target implementation should use a structured review as the normal gate. The edited prose is usually short, and the task is semantic equivalence against a committed outcome, not deterministic keyword matching.

The review provider defaults to the Utility Provider lane. Players can switch the campaign's Outcome Integrity review provider to the Reasoning Provider lane in Settings when they want deeper semantic review. Both lanes must use the same schema, authority limits, deterministic validation, and mutation boundary.

The runtime sequence should be:

1. Validate basic inputs without judging prose meaning.
2. Send the original or currently selected assistant text, proposed edit, committed outcome summary, committed costs/consequences, Command Bearing records, public campaign facts, and response kind to the configured Outcome Integrity review provider.
3. Require structured review output.
4. Deterministically validate the review output schema.
5. Apply the edit only when the validated result is `accepted`.
6. Use a safe fallback when the review provider call fails or returns invalid output.

Deterministic preflight should stay microscopic. It may reject empty edits, identical no-op submissions, missing committed outcome context, or unreasonable payload size. It should not try to classify ordinary prose for words like "success", "trust", "cost", or "point"; that belongs to the configured review provider.

The review output should be structured, for example:

```json
{
  "schema": "directive.outcomeIntegrityReview.v1",
  "result": "accepted",
  "risk": "low",
  "reasons": [],
  "changedClaims": [],
  "preservedClaims": [
    "Hesperus accepts the evacuation corridor",
    "The delay costs the first clean sensor window"
  ],
  "blockedStateClaims": []
}
```

If the review cannot complete, Outcome Integrity `strict` should not silently accept the edit. It should keep or restore the prior selected narration and offer retry or restore inside the editor.

Switching from Utility to Reasoning changes only model depth and cost. It does not make edits more authoritative and does not allow force-apply in Strict mode.

Utility review keeps the fast 45 second timeout. Reasoning review gets a longer 120 second timeout because the player has explicitly chosen the deeper, higher-latency lane for this campaign.

## Deterministic Guardrails

The deterministic component must not decide whether edited prose means the same thing as the committed outcome. That is the configured review provider's job. Deterministic code makes Outcome Integrity robust by controlling scope, inputs, structured output, mutation, and fallback.

Think of this as a state machine, not a prose rule engine.

### Scope Gate

Outcome Integrity first decides whether protection applies:

```text
if setting is off -> allow native edit
if message is player-authored -> allow native edit
if message is not Directive-owned -> allow native edit in v1
if message is Directive-owned assistant prose -> protect it
```

The gate must use normalized chat-message metadata such as `isUser` and `isDirectiveOwned`. DOM selectors only locate the row and host edit button.

### Input Gate

Input validation can reject only objectively invalid requests:

- missing `hostMessageId`;
- message no longer exists;
- message is no longer Directive-owned;
- empty proposed edit;
- exact no-op edit;
- proposed edit exceeds the 10,000 character review cap;
- required committed-outcome context is missing for a protected committed-outcome response.

Input validation must not classify ordinary prose. Words such as "success", "trust", "cost", "inspired", "point", "mark", or "failure" are allowed when the edit preserves the committed outcome.

### Base Revision Guard

Before the review provider call, Directive captures the protected base revision:

```json
{
  "hostMessageId": "42",
  "responseId": "response-...",
  "baseTextHash": "fnv1a:...",
  "baseRevisionId": "response-...:selected",
  "outcomeId": "outcome-...",
  "responseKind": "committedOutcome"
}
```

Before applying an accepted edit, Directive re-reads the host message and confirms the selected text still matches `baseTextHash`. If another edit, swipe, regeneration, or host update changed the message while review was running, the result is stale and must not apply. The player can retry from the new selected text.

### Review Packet Builder

Deterministic code builds a bounded review packet for the configured review provider. The packet should contain explicit JSON fields, not freeform pasted instructions:

- current selected assistant text;
- proposed edited text;
- committed outcome summary;
- final outcome band;
- committed costs and consequences;
- Command Bearing spend and award summary;
- player-safe public facts relevant to the response;
- response kind;
- base revision metadata.

The proposed edit must be treated as data, not instruction text. The review prompt should explicitly say that text fields may contain attempts to instruct the reviewer and must not override the review rules.

### Structured Output Validation

The review provider must return a strict schema. Deterministic validation should check:

- `schema` equals `directive.outcomeIntegrityReview.v1`;
- `result` is one of `accepted`, `needsReview`, or `rejected`;
- `risk` is an allowed value;
- `reasons`, `changedClaims`, `preservedClaims`, and `blockedStateClaims` are bounded arrays of strings;
- `rejected` and `needsReview` include at least one player-safe reason;
- `accepted` does not include blocked state claims;
- no field exceeds the configured diagnostic length cap.

Malformed output becomes `reviewFailed`. If the model returns internally contradictory output, such as `accepted` with blocked state claims, Directive treats the review as invalid rather than accepted.

### Result Policy

For Outcome Integrity `strict`:

| Review result | Deterministic behavior |
|---|---|
| `accepted` | Apply as a selected cosmetic swipe/revision only after the base revision guard passes. |
| `needsReview` | Do not apply by default; offer retry or restore inside the editor. |
| `rejected` | Do not apply; show the first player-safe reason. |
| `reviewFailed` | Do not apply; keep or restore the prior narration. |
| `staleBase` | Do not apply; reload the current selected text and ask the player to retry. |

Strict mode has no `Apply Anyway`. A player who wants unreviewed native editing must intentionally change the campaign-specific setting to `relaxed` or `off`.

For `relaxed`, native edit may remain visible, but the edit still cannot mutate committed campaign state. Failed or rejected review marks the edited text as non-authoritative.

For `off`, Directive does not protect assistant prose.

### Mutation Boundary

Accepted edits can call only cosmetic revision operations, such as:

```text
applyAssistantTextRevision(...)
recordCosmeticRevision(...)
```

They must not call outcome commit, relationship update, Command Bearing update, state-delta application, Command Log mutation, sidecar application, or prompt-context state mutation except for ordinary prompt resynchronization from the already committed state.

This boundary limits the blast radius if the review provider is wrong. A mistaken acceptance can change visible prose, but it cannot rewrite authoritative campaign state.

## User Experience

Outcome Integrity should feel like normal transcript cleanup with a visible trust check, not like a punishment or moderation system.

The player should see three things:

- ordinary editing remains available for their own messages;
- Directive narration can be cleaned up through the same native edit button, with Outcome Integrity appearing only when the selected assistant message is protected;
- committed outcomes remain stable unless the player chooses a recovery tool that reruns or removes mechanics.

## UI Surfaces

### Message Row

Directive-owned assistant responses should use the host's native edit affordance as the public edit entry point. Directive should not add a second visible edit command to its message-action menu, because that asks the player to learn which edit button is safe for which row.

Directive message actions remain for non-edit tools such as intro rewrite and Scene Reconciliation. The internal Outcome Integrity runtime action still exists, but it is opened by native edit interception rather than advertised as a parallel row command.

The row should not show a standing warning badge for ordinary accepted messages. A transient toast or compact inline result is enough after an edit attempt.

### Native SillyTavern Edit Button

Outcome Integrity `strict` should intercept the host `.mes_edit` button only for protected assistant rows.

The interception rule:

1. Listen in capture phase for `.mes_edit`.
2. Resolve the nearest `.mes[mesid]`.
3. Use `mesid` to read the real chat message from the SillyTavern chat adapter.
4. Allow native edit for player messages.
5. Allow native edit for untracked non-Directive assistant messages in v1.
6. If the message is a Directive-owned assistant response and Outcome Integrity is `strict`, prevent the native edit and open the protected message editor.
7. If the mode is `relaxed`, allow native edit, then review or mark the result after the `MESSAGE_EDITED` event.
8. If the mode is `off`, allow native edit and do not protect the assistant prose.

The filter should not depend on DOM styling beyond finding the row. The source of truth is the normalized chat message:

```js
if (message.isUser) return allowNativeEdit();
if (!message.isDirectiveOwned) return allowNativeEdit();
if (outcomeIntegrityMode === 'off') return allowNativeEdit();
if (outcomeIntegrityMode === 'relaxed') return allowNativeEditWithAfterReview();

event.preventDefault();
event.stopPropagation();
event.stopImmediatePropagation?.();
openOutcomeIntegrityEditor({ hostMessageId });
```

This keeps the player's own SillyTavern edit behavior intact and avoids taking over unrelated assistant messages that Directive does not own.

### Protected Message Editor

The protected message editor should open as a Directive-owned modal or modal-like focused panel over the current chat after the player clicks the native SillyTavern edit button on a protected assistant response. It should not send the player to Settings or Mission unless the edit produces a recovery state. A row popover is too cramped for prose editing, and the Mission drawer is too heavy for a quick transcript cleanup.

The editor must support verbose model replies in the 500-800 word range. The default panel can be compact enough for short cleanup, but it needs an `Expand Editor` control that opens a fullscreen or near-fullscreen editing workspace. On phone-width layouts, the editor should default to fullscreen.

The editor must teach the boundary at the point of action. The player should not discover Outcome Integrity only after a rejection.

Persistent editor guidance:

```text
This response has a committed outcome. Dialogue and wording can change; committed outcomes, costs, facts, relationships, and Command Bearing cannot.
```

The editor should also show a compact public outcome anchor:

```text
Locked outcome: [short committed outcome summary]
```

This summary gives the player a fair target: they can reshape presentation, but they can see the outcome that must remain true.

Suggested layout:

- Title: `Edit Message`
- Small status line: `Outcome Integrity Strict`
- Persistent guidance line: `This response has a committed outcome. Dialogue and wording can change; committed outcomes, costs, facts, relationships, and Command Bearing cannot.`
- Textarea seeded with the current selected assistant text.
- Compact public reference line: `Locked outcome: [short committed outcome summary]`
- Word count or approximate length indicator.
- `Expand Editor` control with a tooltip such as `Open full editing workspace`.
- Primary button: `Review And Apply`
- Secondary buttons: `Cancel`, `Restore Original`

Large-edit mode requirements:

- full-height textarea with stable line wrapping;
- sticky header showing `Edit Message`, Outcome Integrity mode, and collapse/close controls;
- sticky footer with `Review And Apply`, `Cancel`, and `Restore Original`;
- optional collapsible `Original` section for comparing against the generated text;
- draft text preserved when expanding, collapsing, retrying review, or handling provider failure;
- no horizontal scrolling for normal prose;
- keyboard focus remains inside the editor until closed.

The editor should not display hidden state, raw outcome ids, model-call details, or Command Bearing internals. If an edit fails, the reason should be concrete and player-safe.

### First-Use Guidance

The first time the player opens the protected message editor in a campaign, show a dismissible note:

```text
You can shorten, reword, or adjust dialogue here. If you want the result itself to change, use outcome recovery instead.
```

This is a campaign-level reminder. It should not appear every time.

### Dialogue Boundary

Dialogue edits are allowed when they preserve the same commitments, knowledge, attitude shift, relationship implications, and outcome constraints.

Allowed dialogue edits:

- shorten a line;
- make a character sound more in-character;
- remove repetition or boilerplate;
- fix unnatural phrasing;
- adjust style while preserving intent.

Examples:

```text
Original: "I will give you ten minutes, Captain. No more."
Accepted edit: "Ten minutes, Captain. No more."
```

Held or rejected dialogue edits:

- changing refusal into agreement;
- adding a promise, concession, or obligation;
- removing a warning, cost, condition, or deadline;
- making a suspicious officer suddenly trusting;
- revealing information the speaker should not know;
- adding relationship movement or Command Bearing recognition.

The review provider should not ask whether dialogue changed. It should ask whether the changed dialogue preserves the same commitments, knowledge, attitude shift, relationship implications, and outcome constraints.

### Result States

Accepted:

```text
Edit accepted. Outcome unchanged.
```

Needs review:

```text
Edit needs review. It may add facts beyond the committed outcome.
```

Rejected:

```text
Edit rejected. It removes a committed cost from this outcome.
```

Provider failure:

```text
Review unavailable. Keeping the prior narration.
```

The accepted path should feel quick: edit, review, apply, continue playing. The rejected path should feel explanatory, not disciplinary: explain the first state-changing claim and offer a useful next action.

Failure feedback should be specific by category:

```text
Edit rejected. The new dialogue changes Nayar's refusal into agreement.
```

```text
Edit needs review. The new line may add a promise not present in the committed outcome.
```

```text
Edit rejected. The new dialogue removes the delay cost from this outcome.
```

### Settings

Settings should expose Outcome Integrity as an editable runtime control, not as a status dashboard.

Recommended placement:

```text
Settings > Systems
```

Recommended control:

```text
Outcome Integrity: Strict / Relaxed / Off
```

Recommended review provider control:

```text
Review Provider: Utility Provider / Reasoning Provider
```

Recommended help text:

```text
Checks edits to Directive narration before they can replace protected assistant prose.
```

Recommended review provider help text:

```text
Chooses which provider lane reviews protected prose edits. Utility is the default; Reasoning may be slower but can handle subtler dialogue changes.
```

Recommended campaign-specific note:

```text
This setting applies only to the current campaign.
```

Both controls should be compact, probably segmented controls or selects. They should not add permanent counts, recent review logs, or model-call status rows to Settings.

The review provider control changes provider lane only. It must not change the Outcome Integrity authority rules, validation schema, or mutation boundary.

## Primary User Flow

Preferred edit path:

1. The player clicks the native SillyTavern edit button.
2. Outcome Integrity intercepts protected Directive assistant edits and opens the protected message editor.
3. The player edits the prose.
4. The player clicks `Review And Apply`.
5. Directive runs the configured review provider, defaulting to Utility.
6. Directive applies the edit, holds it for review, or rejects it with a player-safe reason.

Recommended result copy:

```text
Edit accepted. Outcome unchanged.
```

```text
Edit needs review. It may add facts beyond the committed outcome.
```

```text
Edit rejected. It removes a committed cost from this outcome.
```

Native SillyTavern edit interception should be best-effort. If the host only exposes an after-the-fact edit event, Directive should record the attempted edit, restore or mark the message according to the active setting, and keep the committed outcome unchanged.

## Relationship To Existing Recovery Tools

Outcome Integrity does not replace recovery.

| Player intent | Correct tool |
|---|---|
| Fix wording, length, typo, or repetition | Native edit button; Outcome Integrity review opens automatically for protected Directive assistant responses |
| Get alternate prose for the same committed outcome | `Rewrite Narration` |
| Change the mechanical result | `Rerun Outcome` |
| Remove a committed outcome | `Delete Outcome` |
| Explore a different branch | `Save Game As` or future branch tools |
| Reconcile several changed messages | Future scene reconciliation |

`Rewrite Narration` remains provider-generated prose from the same committed mechanics, but it does not need to be part of the normal edit control. A protected native edit is player-authored prose that must pass integrity review.

## Command Bearing Boundary

Outcome Integrity exists partly to protect Command Bearing.

Assistant-message edits cannot:

- create Command Marks;
- remove or refund Command Bearing spends;
- change Inspiration or Resolve eligibility;
- recast the player's decisive method after the outcome is committed;
- turn a routine moment into a Command Decision;
- remove an Anchored Consequence that blocked or limited a point spend.

If a player believes Command Bearing was adjudicated incorrectly, the path is review or rerun, not assistant prose editing.

## State And Ledger Direction

Accepted edits should be recorded as cosmetic narration revisions, not outcome replacements.

In SillyTavern, accepted edits should become a selected assistant swipe/revision with `playerEdit` Outcome Integrity metadata. The original Directive-generated swipe remains available so the player can revert through the host's ordinary swipe history or a future restore control.

Candidate fields:

```json
{
  "responseId": "response-...",
  "hostMessageId": "42",
  "revisionId": "response-...:prose-edit:1",
  "source": "playerEdit",
  "hostRevisionType": "selectedSwipe",
  "sourceSwipeId": 0,
  "selectedSwipeId": 1,
  "integrityResult": "accepted",
  "reviewedAt": "2026-06-25T00:00:00.000Z",
  "textHash": "fnv1a:...",
  "summary": "Trimmed narration; outcome unchanged."
}
```

The response ledger should retain:

- original generated text hash;
- current selected text hash;
- source and selected swipe ids when the host supports swipes;
- accepted cosmetic revision ids;
- rejected or held edit attempts;
- integrity review summaries;
- whether the host message had to be restored after a rejected native edit.

The turn ledger and committed campaign state should not be rewritten by an accepted prose edit.

## Host Boundary

SillyTavern is the first target host. Outcome Integrity should still be host-neutral in concept:

- The host adapter owns detecting assistant edit attempts and applying or restoring message text.
- Runtime owns review policy, state authority, ledgers, and player-facing action results.
- UI owns the editor, action menu entries, warnings, and Settings controls.

Lumiverse can later implement the same host contract with its own message edit surfaces.

SillyTavern implementation details:

- Use a capture-phase listener for `.mes_edit`, parallel to the existing native-delete intent capture.
- Resolve the target row through `.mes[mesid]`.
- Resolve message ownership through the chat adapter, not DOM class names.
- Treat `isUser` as native-editable.
- Treat non-Directive assistant messages as native-editable in v1.
- Treat `isDirectiveOwned` assistant messages as protected when Outcome Integrity is `strict`.
- Preserve the existing `MESSAGE_EDITED` reconciler path as fallback and for `relaxed` mode.
- Keep message-action controls in the host's `.mes_buttons` / `.extraMesButtons` structure so they remain visible inside SillyTavern's overflow behavior.

The eventual host-neutral capability can be described as:

```js
host.chat.inspectMessage(hostMessageId)
host.chat.openProtectedAssistantEdit(hostMessageId)
host.chat.applyAssistantTextRevision(hostMessageId, text, metadata) // selected cosmetic swipe where supported
host.chat.restoreAssistantTextRevision(hostMessageId, revisionId)
```

## Initial Implementation Slices

1. Add the campaign-specific `Outcome Integrity` runtime setting with `strict`, `relaxed`, and `off` modes.
2. Add SillyTavern protected-edit capture for `.mes_edit` on Directive-owned assistant responses only.
3. Add a Directive-owned protected message edit runtime action invoked by native edit interception, not a duplicate message-action entry.
4. Add the edit UI with `Review And Apply`, `Cancel`, `Restore Original`, `Expand Editor`, persistent prose/outcome guidance, and a public locked-outcome summary.
5. Add fullscreen or near-fullscreen large-edit mode for 500-800 word replies.
6. Add deterministic scope gate, input gate, base revision guard, stale-result handling, and mutation boundary.
7. Add the Outcome Integrity structured review role, prompt, schema, parser validation, and provider-failure fallback.
8. Apply accepted edits as selected cosmetic assistant swipes/revisions and record the review result.
9. Record held, rejected, failed, and stale edit attempts in the response/recovery ledger.
10. Add first-use campaign guidance for the protected message editor.
11. Add the campaign-specific review provider setting with Utility as default and Reasoning as the alternate lane.
12. Reconcile native SillyTavern assistant edits for `relaxed` mode and best-effort fallback.
13. Add retry and restore affordances inside the editor for failed or held edits.
14. Add tests for native edit capture scope, deterministic input guards, 10,000 character cap handling, stale base revisions, accepted trims, accepted dialogue cleanup, selected-swipe preservation, rejected outcome upgrades, rejected cost removal, rejected dialogue commitment changes, rejected Command Bearing claims, malformed review output, provider failure fallback, review provider default/switching, mutation-boundary enforcement, large-edit UI mode, and relaxed/off settings.
15. Verify in live SillyTavern that player-message edit remains native, protected assistant edit opens the protected message editor, expanded edit mode is usable for a long response, and the Directive message-action menu no longer advertises a duplicate edit command.

## Acceptance Criteria

- A player can shorten a verbose Directive response without changing committed state.
- A player sees that prose and dialogue may change, but outcomes, costs, facts, relationships, and Command Bearing cannot.
- The editor shows a player-safe locked-outcome summary before review.
- A player can comfortably edit a 500-800 word Directive response by expanding the editor.
- Proposed edits above 10,000 characters are blocked before review with a clear limit message.
- A player cannot edit a failed or costly outcome into a success.
- A player cannot edit Command Bearing rewards, spends, ranks, or eligibility into the transcript as authoritative facts.
- Dialogue edits can improve wording while preserving commitments, knowledge, attitude shift, relationship implications, and outcome constraints.
- Dialogue edits that change agreement/refusal, promises, obligations, warnings, costs, knowledge, relationship movement, or Command Bearing recognition are held or rejected with a concrete reason.
- Clicking native edit on a player message preserves normal SillyTavern editing.
- Clicking native edit on a protected Directive assistant response opens the protected message editor while Outcome Integrity is `strict`.
- Non-Directive assistant messages are not intercepted in v1.
- Accepted edits become selected cosmetic swipes/revisions while the original generated text remains available.
- Rejected edits provide a concise player-safe reason.
- Failed edits identify the first meaningful category of the problem, not a generic integrity failure.
- Ordinary words such as "success", "trust", "cost", or "point" are not blocked by brittle keyword checks when the edit preserves the committed outcome.
- Review provider failure does not silently accept a protected edit while the setting is `strict`.
- Outcome Integrity review defaults to the Utility Provider lane.
- Switching the review provider to the Reasoning Provider lane changes only provider depth/cost, not edit authority, schema validation, or mutation boundaries.
- A stale review result cannot overwrite a message that changed while review was running.
- Accepted edits can change only assistant prose revision records, not outcome, relationship, Command Bearing, Command Log, pressure, ship, crew, or sidecar state.
- Player-message edits still use the existing recovery and rerun path.
- Turning Outcome Integrity off is explicit and reversible in Settings.
- Settings labels Outcome Integrity as campaign-specific.
- Existing pre-alpha behavior is updated in place; no legacy compatibility layer is required.

## Open Questions

- How many accepted cosmetic swipes/revisions should be retained per protected response before older edit attempts are compacted?
- What is the safest player-facing label for `needsReview` that does not feel punitive?
- Should campaign packages be able to force Outcome Integrity `strict` for high-trust or competitive scenarios, or should the player always retain final control?
