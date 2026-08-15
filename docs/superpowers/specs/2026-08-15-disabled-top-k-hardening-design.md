# Disabled `top_k` Hardening Design

## Problem

SillyTavern can materialize a disabled `top_k` sampler as the numeric value `0`. Directive's isolated Connection Profile path currently retains every allowlisted sampler that is present, so it forwards `top_k: 0` to providers. Models that no longer accept `top_k` reject the request even though the user has not enabled the sampler.

Directive needs a model-agnostic defensive boundary while leaving SillyTavern's profiles, presets, credentials, and provider ownership unchanged.

## Decision

Normalize `top_k` in Directive's sampler projection boundary:

- omit `top_k` when its numeric value is less than or equal to zero;
- preserve positive `top_k` values;
- preserve zero for all other allowlisted samplers because zero can be meaningful for fields such as temperature and penalties;
- do not inspect model names, provider names, or error strings;
- do not retry a rejected request with altered parameters.

A vocabulary count cannot meaningfully be zero or negative. Treating non-positive `top_k` as disabled therefore expresses sampler semantics rather than provider-specific compatibility policy.

## Components and Data Flow

`pickSafeDirectiveSamplerPayload()` remains the single normalization boundary. `projectSillyTavernSamplerPayload()` will continue to ask SillyTavern to materialize the selected preset, then pass that payload through the normalized allowlist. Both Connection Profile and Current Model provider paths already consume this projection, so the rule applies consistently without changes to transport code.

The rest of the payload remains unchanged. Positive `top_k` values continue to express an intentional user choice and may still be rejected by a model that does not support the sampler; Directive will surface that provider error normally.

## Error Handling

No compatibility retry is added. Retrying would issue a second billable request and conceal that an explicitly enabled sampler is unsupported. Directive only omits the disabled sentinel before the first request.

## Verification

Regression coverage will prove that:

1. `top_k: 0` is omitted.
2. A negative disabled sentinel is omitted.
3. A positive `top_k` is preserved.
4. Meaningful zero values for other allowlisted samplers are preserved.
5. A Connection Profile request created from a SillyTavern payload containing `top_k: 0` reaches `sendRequest()` without the field.

The focused provider-routing suite will run first for the red-green cycle, followed by the full project test gate and `git diff --check`. The production file will then be synchronized to `default-user` and verified by exact hash parity without changing user settings, chats, profiles, or credentials.
