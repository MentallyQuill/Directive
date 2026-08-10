# Character Creator JSON Repair Design

## Goal

Reduce broken Character Creator drafts by enforcing the section contract at every available provider boundary, repairing only eligible damaged structured output once, and using targeted regeneration instead of repeating the same request.

## Current Failure

Directive asks for structured output but only the current SillyTavern `generateRaw` transport forwards the JSON schema. Direct OpenAI-compatible and Connection Manager profile calls rely on prompt instructions. The local parser repairs a small set of common defects, and invalid output currently causes the original generation request to repeat without a failure-specific instruction.

## Contract

Each request receives a section-specific JSON schema. The top-level object permits only `kind`, `sectionId`, `mode`, `fields`, `notes`, and `warnings`. `kind`, `sectionId`, `mode`, and `fields` are required. `fields` permits only paths belonging to the requested section, uses exact option IDs for select fields, uses strings for text fields, and requires at least one proposed field. Missing optional section fields may still be supplemented by Directive's package-safe local fallback.

Directive validates the parsed object locally even when a provider claims schema support. Validation returns only bounded diagnostics: path, keyword, and a safe field/detail token. Raw output is never written to diagnostics, persistence, or user-visible errors.

## Recovery Flow

1. Generate the section draft with the Reasoning provider.
2. Normalize visible output and run existing deterministic JSON cleanup.
3. Parse and validate the section contract locally.
4. On `json_invalid`, `json_not_object`, or `json_schema_invalid`, scan the damaged text for hidden/unsafe terms. Unsafe output is discarded and never sent to another provider.
5. For eligible safe output, make one Utility-provider repair request containing only a bounded damaged response, the section schema, and sanitized validation diagnostics. Do not include package context, campaign context, original prompts, prior sections, or player input.
6. Parse and validate the repair result. Never recursively repair a repair response.
7. If repair fails, make one Reasoning regeneration request using the original player-safe request plus a bounded diagnostic-specific correction. Do not repeat rejected prose or attach damaged output.
8. If all provider work fails, retain the existing package-safe local fallback.

Transport, authentication, quota, timeout, empty-output, reasoning-only, token-limit, cancellation, and unsafe-output failures are not repair eligible. They continue through bounded provider retry/fallback behavior without attaching damaged output.

## Provider Transport

The current SillyTavern model continues receiving `jsonSchema` through `generateRaw`. Direct OpenAI-compatible requests send an OpenAI-style strict `json_schema` response format whenever `request.jsonSchema` is present. Connection Manager profiles remain prompt-constrained because their API does not expose a schema parameter; local validation and repair cover that path.

## Progress And Cancellation

The existing modal reports exact phases such as `Repairing malformed draft with Utility...` and `Regenerating draft with corrected JSON instructions...`. The same abort signal is passed into primary generation, repair, and targeted regeneration. Closing the modal or Directive cancels the active call, prevents later calls, and ignores late results.

## Safety And Limits

- At most three provider calls per user action.
- At most one repair-only call.
- Repair input is capped at 12,000 characters.
- Repair diagnostics are capped at 12 entries.
- No dynamic evaluation or execution of model output.
- No hidden campaign data or original semantic context enters the repair request.
- A failed repair preserves the original failure category for diagnostics and fallback warnings.

## Verification

Tests cover strict transport formatting, section schema construction, local contract validation, malformed-output repair, schema-invalid repair, repair failure followed by targeted regeneration, unsafe-output isolation, cancellation during repair, progress phases, bounded inputs, and unchanged local fallback behavior. The full Directive alpha gate must pass on the feature branch and merged `main`.
