# Directive Operator Manual

This manual describes Directive's implemented pre-alpha chat-native runtime.

## Runtime Shell

Open Directive from the SillyTavern extensions menu. Desktop and tablet use a left command spine with six routes: **Campaign**, **Mission**, **Crew**, **Ship**, **Log**, and **Settings**. Phone width uses a full-screen shell with bottom navigation.

The shell controls navigation, drawer geometry, and full-screen escalation. It is not the source of campaign truth. The active save and its tracked transaction state are authoritative.

## Campaign

Use **Campaign** to select packages, start Character Creator, inspect the active campaign, manage chat binding, load saves, conclude play, and archive completed records.

### No active campaign

The package surface shows the title, premise, player role, ship context, tone, expected length, package health, and available records. A ready package exposes **New Campaign**. Resume and load actions appear only when matching drafts or saves exist.

Package browsing does not install campaign prompt context.

### Active campaign

The Command snapshot shows:

- campaign, player, ship, mission, phase, stardate, and simulation mode;
- bound chat identity;
- activation state;
- prompt-context revision;
- latest committed moment;
- current save and Open Orders status.

Use **Open Campaign Chat** to return to play. Use **Rebind Chat** to repair or deliberately change the binding to the currently open host chat after duplicating, restoring, or repairing a campaign chat. Rebinding persists the new host identity, records a recovery/admin journal entry, and rebuilds player-safe prompt context.

Interrupted activation exposes **Finish Chat Setup**. Activation failures expose **Retry Chat Setup**. Incomplete conclusions expose **Retry Conclusion**. Completed campaigns expose **Archive Campaign**.

## Character Creator

The package-owned Character Creator covers identity, service history, personality, dossier review, and simulation mode. **Save Draft** preserves setup without creating campaign state. **Start Campaign** accepts the draft and begins the activation transaction.

Activation creates a fresh chat for the selected host character or group, posts the introduction once, installs prompt context, writes the activation journal, and opens the play chat. The process is idempotent: recovery resumes completed steps rather than repeating them.

## Mission

Mission is a support surface, not the default input surface.

It shows:

- **Active Context:** campaign, bound chat, mission, phase, stardate, visible pressures, and current objectives;
- **Pending Review:** clarification, serious-risk confirmation, authority review, or Command Bearing choices;
- **Committed Outcome:** latest mechanics, narration, and response status;
- **Side Work:** Open Orders and follow-up opportunities.

Mission play continues through the bound campaign chat. Mission shows current state, pending reviews, committed outcome status, and side work. Save, branch, load, and delete controls live in **Campaign > Records**.

## Chat-Native Turn Processing

Directive observes user-message, edit, delete, and chat-change events for the bound chat. It also uses the SillyTavern generation interceptor to arbitrate whether ordinary generation should continue.

Each player message receives a normalized ingress record containing host message identity, chat and campaign binding, text hash, state revision, classification, worker plan, turn identity, and response strategy. Processing is serialized per campaign and duplicate events are ignored.

### Utility lane

The cheap utility gate first uses deterministic fast paths. Ambiguous cases may call the configured Utility provider. It classifies the post and selects only the workers required for that turn.

### Consequential lane

Consequential intent enters the existing deterministic-first Mission Director. Directive applies Command Competence, authority and capability checks, pressure selection, outcome resolution, state deltas, Command Bearing eligibility, sidecar recommendations, narrator constraints, and response arbitration.

### Exactly-one response

For inject-and-continue turns, Directive synchronizes prompt context and allows SillyTavern to generate normally. For Directive-owned turns, it aborts default generation, persists mechanics, generates from the committed packet, and posts one idempotent assistant response.

## Prompt Context

Directive builds prompt context from explicit player-safe selectors rather than serializing and redacting the full campaign state.

The standard blocks are:

1. Campaign Frame
2. Player Character
3. Active Scene
4. Known Facts
5. Crew Context
6. Ship Status
7. Command Log Continuity
8. Active Pressures
9. Narrator Constraints

Each packet has stable block IDs, placement/depth metadata, a content hash, and a monotonic revision. Prompt context is installed only for an active campaign in its bound chat. It is suspended on chat change and cleared on completion, archive, or extension disable.

## Crew, Ship, And Log

**Crew** exposes known continuity and qualitative relationship posture, never raw hidden metrics. **Ship** combines package baseline data with campaign-owned condition, damage, repair, restrictions, and technical debt. **Log** presents player-safe committed outcomes and visible consequences.

All authoritative mutations pass through validated campaign deltas. Sidecars propose updates; they do not write campaign state directly.

## Sidecars

The scheduler can route continuity, relationship, crew, ship, Command Bearing, side-mission, recap, and prompt-context work. A proposal must:

- target an authorized root domain;
- match the current campaign revision;
- pass path and value validation;
- apply atomically through the state-delta gateway.

Accepted proposals increment the campaign revision, create a recovery snapshot, persist, and rebuild prompt context. Stale or cross-domain proposals are rejected and journaled.

## Utility And Reasoning Providers

Settings exposes separate **Utility Provider** and **Reasoning Provider** cards plus a per-role model-call routing map.

Supported source modes:

- Current Host Model
- Host Connection Profile
- OpenAI-Compatible Endpoint

Each lane has independent temperature, top-p, and token limits. Utility is the default for classifications, compact summaries, continuity, prompt-context assistance, and bounded relationship/crew/ship/command-bearing proposal sidecars. Reasoning remains the default for narration, counsel, introductions, conclusions, quest architecture, and character-creator drafting. The role routing map can move any call between Utility and Reasoning when a campaign needs speed, cost control, or stronger interpretation.

Direct endpoint keys are session-only. The persisted configuration stores only a boolean indicating whether a key is present, never the secret itself.

## Saves, Transactions, And Recovery

The tracked runtime maintains:

- monotonic campaign revision;
- bounded deep-cloned history snapshots;
- ingress ledger;
- response ledger;
- sidecar journal;
- recovery journal;
- pending interaction records;
- last stable and last committed turn metadata.

Mechanics are checkpointed before narration or chat posting. Narration retries use the same outcome ID and cannot rerun mechanics. Response posting uses idempotency keys to prevent duplicate introductions, committed outcomes, or conclusions.

Message edits and deletions use tracked snapshots. A safe dependent-free edit/delete can roll back. A change affecting committed dependent turns is marked for review instead of silently corrupting continuity.

## Campaign Conclusion

**Conclude Campaign** commits the closing record before generation. It settles active pressures, records the completion reason, generates or composes the final scene, posts it idempotently, marks the save complete, and clears prompt injection. A failed finalization resumes from the saved recap and mechanics.

**Archive Campaign** changes a completed campaign to inactive archived state and preserves the final save.

## Diagnostics

Settings includes provider tests, prompt inspection/rebuild/clear controls, storage diagnostics, active-save verification, state settle, export, reload, stale-preview cleanup, and missing-record cleanup.

Use diagnostics to distinguish:

- provider configuration failure;
- chat binding mismatch;
- suspended prompt context;
- failed response posting;
- stale sidecar revision;
- recoverable message reconciliation;
- storage corruption or missing payloads.

## Pre-Alpha Limits

- Automated host-contract tests cannot replace a live browser smoke against every SillyTavern release, character/group mode, provider, streaming configuration, and third-party interceptor order.
- Lumiverse retains its separate adapter and fallback shell while the same chat-native contracts are ported to its interceptor APIs.
- Package import is data-only. Rich export, package update comparison, and package deletion remain separate product work.
