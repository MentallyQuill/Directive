# Settings and Provider Policy Overhaul

**Status:** Approved

**Date:** 2026-08-10

## Purpose

Make Directive's Settings page materially less cramped, remove its private OpenAI-compatible endpoint and key path, and adopt Recursion's newer SillyTavern-native provider policy controls without restoring retired V1 tutorial or recovery systems.

The implementation must preserve the certified V1 visual language and the currently supported Directive runtime. This is a hard V1 cutover: there is no compatibility UI, migration wizard, legacy transport, or retained direct-endpoint secret.

## Product contract

### Page structure

Settings is one full-width scrolling column. The redundant left-hand `Settings` navigation column is removed. Sections appear in this order:

1. Interface
2. Model Lanes
3. Directive Preset
4. Model-Call Routing
5. Diagnostics

Utility and Reasoning provider cards are always stacked vertically, including on desktop. Their controls may use compact label/value rows at wide widths, but each row collapses to a single column on narrow screens.

### Interface

Restore the certified Tooltips toggle. It controls the existing persisted tooltip engine and remains subject to its existing mobile/touch suppression rules. Provider-policy explanations use the same tooltip mechanism.

Tutorial Prompts, Startup Tips, and Help & Tutorials are intentionally absent. Their prior actions, storage, and runtime subsystems are not reintroduced.

### Provider sources

Each model lane offers exactly two sources:

- **Current Model** (default): use the model and connection already active in SillyTavern.
- **Connection Profile**: use a profile exposed by SillyTavern's connection manager and therefore its native credential handling.

The former OpenAI-compatible endpoint option, base URL, model field, session API-key control, browser secret store, and direct `fetch` transport are removed.

Persisted values outside the new source vocabulary normalize as follows:

- a valid Connection Profile selection remains a profile selection;
- every other or obsolete source becomes Current Model;
- obsolete endpoint, model, and key-presence fields are discarded when settings are normalized and saved.

No legacy provider request path remains callable.

### Provider policy controls

Both Current Model and Connection Profile expose the same policy controls:

- **Behavioral Preset:** `Isolated` (default) or `Full source preset`.
- **Instruct Formatting:** `Auto` (default), `On`, or `Off`.
- **Samplers:** `SillyTavern settings` (default) or `Directive override`.
- **Structured Output:** `Auto` (default), `Native schema`, or `Prompt JSON`.
- **Output token ceiling:** a bounded positive integer.

Temperature and Top P are shown only when Samplers is `Directive override`. They are omitted from requests in SillyTavern-settings mode.

Behavioral Preset resolves to `includePreset = true` only for Full source preset. The UI explains that this can mix the source preset's behavioral instructions into Directive's role-specific prompt.

Instruct Formatting resolves as follows:

- On: include instruct formatting.
- Off: exclude instruct formatting.
- Auto: include it for text-completion sources and exclude it for chat-completion sources.

Structured Output resolves as follows:

- Prompt JSON: use Directive's prompt-level JSON contract.
- Native schema: request SillyTavern native schema output and fail clearly when the selected configuration is not certified for it.
- Auto: use native schema only for the exact currently certified source configuration; otherwise use Prompt JSON.

Native-schema certification is scoped to a configuration fingerprint containing the lane, source kind, selected profile/current-model identity, completion mode, and the policy inputs that can change request behavior. A relevant setting change invalidates the prior test and certification state.

### Discovery, readiness, and testing

Connection profiles come from SillyTavern's `ConnectionManagerRequestService`. The picker is searchable and shows only supported chat/text completion profiles. Missing or invalid profiles produce an actionable not-ready state.

Current Model displays the active SillyTavern model/source identity when it is available. It remains usable through SillyTavern's current generation service and never asks Directive for a credential.

Settings auto-save after validation. A provider test reports readiness and detected capabilities. Changes that affect routing or request construction clear the prior success state.

### Model-call routing summary

Restore a read-only summary of the active V1 generation-role bindings. It reports which configured lane handles each currently supported Directive model-call role. It is descriptive only: it does not restore legacy editable routing, role registries, or retired prompt inspectors.

### Diagnostics

Restore Diagnostics as a collapsed disclosure containing a support-export action and a precise privacy explanation. The default export contains operational metadata, current provider readiness/status, active-save identity, storage information, and prompt-routing diagnostics needed for support.

An optional **Include Story Transcript** checkbox is allowed only if the host can supply the player-visible messages on the selected branch. When enabled, the export must still exclude system prompts, hidden messages, alternate swipes, unselected branches, secrets, raw connection-profile credentials, and obsolete endpoint data. If the host cannot prove those bounds, transcript inclusion is disabled and the export remains metadata-only.

### Failure behavior

- Unsupported or missing SillyTavern services fail with a concise actionable status; Directive does not fall back to a private endpoint.
- Native-schema requests do not silently downgrade when the user explicitly selected Native schema.
- Auto mode may choose Prompt JSON without warning when native schema is uncertified.
- Provider errors are normalized for the UI and must not contain credentials or full response bodies.
- Cancellation and bounded response handling remain in force for all supported request paths.

## Visual and accessibility requirements

- Preserve the certified typography, surfaces, dividers, control sizing, focus treatment, and responsive breakpoints.
- The Settings content uses the width previously consumed by the redundant navigation column.
- Provider cards never form a two-column card grid.
- Every input has a visible label; contextual explanations use accessible tooltip triggers.
- Dynamic rows update without focus loss, and readiness/status changes are announced through the existing status semantics.
- Mobile layouts do not overflow horizontally and do not force hover-only help.

## Verification

Tests must prove:

- obsolete direct-endpoint settings normalize to Current Model and no direct transport or secret-store API remains;
- both source kinds resolve every provider-policy combination correctly;
- temperature and Top P are persisted and sent only in Directive-override mode;
- profile discovery, current-model readiness, configuration fingerprints, certification invalidation, and explicit-native failure behave deterministically;
- the page has no redundant settings navigation and provider cards stay stacked;
- the Tooltips toggle controls the existing tooltip engine;
- the routing summary is read-only and reflects the runtime's active V1 roles;
- diagnostics never export secrets and only include a transcript when the bounded player-visible source is available and explicitly selected;
- focused provider/UI checks, the complete test suite, browser safety, and certified visual conformance all pass.

## Non-goals

- Direct OpenAI-compatible endpoints or Directive-managed API keys
- Tutorial Prompts, Startup Tips, or Help & Tutorials
- Legacy settings migration UI or compatibility transports
- Editable model-call role routing
- Continuity diagnostics, reconciliation, recovery, cleanup, tracking telemetry, or retired prompt-inspection tools
