# Disabled `top_k` Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Directive from sending a disabled non-positive `top_k` while preserving intentional positive values and meaningful zero values for other samplers.

**Architecture:** Keep `pickSafeDirectiveSamplerPayload()` as the single provider-boundary normalizer. Add one field-specific semantic guard before the existing clone-and-allowlist behavior; both Connection Profile and Current Model routes already consume this helper.

**Tech Stack:** Node.js ESM, `node:assert/strict`, existing Directive alpha-gate scripts.

## Global Constraints

- Omit `top_k` when its numeric value is less than or equal to zero.
- Preserve positive `top_k` values.
- Preserve zero for every other allowlisted sampler.
- Do not inspect model names, provider names, or provider error strings.
- Do not add compatibility retries or mutate SillyTavern-owned settings.
- Preserve unrelated dirty work and synchronize only the changed production file to `default-user`.

---

### Task 1: Normalize disabled `top_k` at the sampler boundary

**Files:**
- Modify: `tools/scripts/test-directive-provider-routing.mjs:1-148`
- Modify: `src/hosts/sillytavern/profile-samplers.mjs:23-29`
- Verify install: `F:/SillyTavern/SillyTavern/data/default-user/extensions/Directive/src/hosts/sillytavern/profile-samplers.mjs`

**Interfaces:**
- Consumes: `pickSafeDirectiveSamplerPayload(payload: object): object`
- Produces: The same function contract, with non-positive numeric `top_k` omitted from the returned payload.

- [ ] **Step 1: Write the failing boundary tests**

Import the real projection helper:

```js
import { pickSafeDirectiveSamplerPayload } from '../../src/hosts/sillytavern/profile-samplers.mjs';
```

Add literal behavior assertions near the other top-level provider assertions:

```js
assert.deepEqual(
  pickSafeDirectiveSamplerPayload({ temperature: 0, top_p: 0.9, top_k: 0, frequency_penalty: 0 }),
  { temperature: 0, top_p: 0.9, frequency_penalty: 0 },
  'disabled top_k must be omitted without removing meaningful zero samplers'
);
assert.deepEqual(
  pickSafeDirectiveSamplerPayload({ top_k: -1 }),
  {},
  'negative top_k disable sentinels must be omitted'
);
assert.deepEqual(
  pickSafeDirectiveSamplerPayload({ top_k: 40 }),
  { top_k: 40 },
  'positive top_k must remain an intentional sampler override'
);
```

Change the fake SillyTavern preset materialization to return `top_k: 0`, and change the first Connection Profile request expectation to omit `top_k`:

```js
return { ...basePayload, temperature: 0.6, top_p: 0.9, top_k: 0, custom_url: 'DO_NOT_PROJECT' };
```

```js
payload: { temperature: 0.6, top_p: 0.9 }
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node tools/scripts/test-directive-provider-routing.mjs
```

Expected: assertion failure showing actual `{ top_k: 0 }` where the expected payload omits `top_k`.

- [ ] **Step 3: Implement the minimal semantic guard**

In `pickSafeDirectiveSamplerPayload()`, insert the guard after cloning the allowlisted field and before emitting it:

```js
const numericValue = Number(value);
if (field === 'top_k' && Number.isFinite(numericValue) && numericValue <= 0) return [];
```

Do not change cloning or any other sampler behavior.

- [ ] **Step 4: Run focused verification and verify GREEN**

Run:

```powershell
node tools/scripts/test-directive-provider-routing.mjs
```

Expected: exit code `0` and the provider-routing success message.

- [ ] **Step 5: Run full source verification**

Run:

```powershell
npm.cmd test
git diff --check
```

Expected: the complete alpha gate passes, `git diff --check` exits `0`, and no unrelated dirty file is staged.

- [ ] **Step 6: Commit the implementation**

```powershell
git add -- src/hosts/sillytavern/profile-samplers.mjs tools/scripts/test-directive-provider-routing.mjs docs/superpowers/plans/2026-08-15-disabled-top-k-hardening.md
git commit -m "fix(providers): omit disabled top-k sampler"
```

- [ ] **Step 7: Synchronize and verify `default-user`**

Copy only `src/hosts/sillytavern/profile-samplers.mjs` to the installed Directive tree. Compare SHA-256 hashes for exact parity, reload the local SillyTavern page, and verify no new browser console errors. Do not send a provider request or modify profile settings during this verification.

- [ ] **Step 8: Push and verify main**

Run:

```powershell
git push origin main
git status --short
```

Expected: `origin/main` advances to the implementation commit; only the user's pre-existing unrelated dirty paths remain.
