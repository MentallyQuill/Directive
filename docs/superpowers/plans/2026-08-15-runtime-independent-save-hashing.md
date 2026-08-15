# Runtime-Independent Save Hashing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Directive campaign saving work over normal LAN HTTP by removing every Web Crypto dependency from segmented-save hashing.

**Architecture:** Keep the existing asynchronous `sha256Json(value)` interface and canonical JSON input, but compute its digest exclusively with the existing browser-safe `stableSha256Hex()` implementation. Prove runtime independence by making any access to `globalThis.crypto` throw during the regression test while asserting the pre-change digest literal.

**Tech Stack:** JavaScript ESM, Node.js assertion scripts, canonical JSON, repository-owned SHA-256.

## Global Constraints

- There is one SHA-256 implementation for segmented saves: `stableSha256Hex()`.
- There is no Web Crypto path, feature detection, fallback behavior, or crypto-unavailable error.
- Existing segmented-save hashes remain byte-for-byte compatible and require no migration.
- Every save-integrity and delta-chain validation remains mandatory.
- Preserve unrelated work, including the existing `debug.log` modification.

---

### Task 1: Remove the Web Crypto dependency

**Files:**
- Modify: `tools/scripts/test-v1-state-delta-codec.mjs`
- Modify: `tools/scripts/test-v1-storage-repository.mjs`
- Modify: `src/storage/v1-state-delta-codec.mjs`

**Interfaces:**
- Consumes: `stableSha256Hex(value = '')` from `src/runtime/v1-stable-hash.mjs`.
- Preserves: `sha256Json(value): Promise<string>` and every existing storage-repository caller.
- Produces: lowercase, 64-character SHA-256 hex over UTF-8 canonical JSON without reading `globalThis.crypto`.

- [ ] **Step 1: Write the failing runtime-independence test**

Remove the Web Crypto digest-count helper and its assertion from `tools/scripts/test-v1-state-delta-codec.mjs`. Add this regression immediately after the canonical hash-equivalence assertion:

```js
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  get() {
    throw new Error('segmented-save hashing must not access Web Crypto');
  },
});
try {
  assert.equal(
    await sha256Json({ probe: true }),
    'c775500ea34eded73c2a3c3bede193f0d839e6c14b36f21b6cc31472e0720a91',
    'segmented-save SHA-256 must work without reading Web Crypto',
  );
} finally {
  if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
  else delete globalThis.crypto;
}
```

This test catches any production change that reads or restores a Web Crypto branch. The expected digest is a pre-change literal, not computed by the code under test.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node tools/scripts/test-v1-state-delta-codec.mjs
```

Expected: FAIL with `segmented-save hashing must not access Web Crypto`, proving the existing implementation reads `globalThis.crypto`.

- [ ] **Step 3: Implement the single repository-owned hash path**

At the top of `src/storage/v1-state-delta-codec.mjs`, import the existing implementation:

```js
import { stableSha256Hex } from '../runtime/v1-stable-hash.mjs';
```

Replace `sha256Json()` with:

```js
export async function sha256Json(value) {
  return stableSha256Hex(canonicalJson(value));
}
```

Remove the obsolete `DIRECTIVE_V1_STATE_DELTA_CRYPTO_UNAVAILABLE` branch. Do not retain feature detection or an alternative implementation.

- [ ] **Step 4: Update the bounded-hashing test instrumentation**

In `tools/scripts/test-v1-storage-repository.mjs`, preserve the bounded hydration performance assertion through the repository-owned SHA-256 implementation's `TextEncoder.encode()` boundary. Assert exactly six whole-object encodes: two segment byte-length checks plus hashes of the base, two segments, and final manifest head. Remove the obsolete `crypto.subtle.digest()` monkeypatch so the test suite itself has no Web Crypto requirement.

- [ ] **Step 5: Run focused verification and verify GREEN**

Run:

```powershell
node tools/scripts/test-v1-state-delta-codec.mjs
node tools/scripts/test-v1-storage-repository.mjs
node tools/scripts/test-browser-runtime-safety.mjs
```

Expected: all three scripts exit 0 and print their pass messages.

- [ ] **Step 6: Run the complete Directive alpha gate**

Run:

```powershell
npm.cmd test
```

Expected: exit 0 with every alpha-gate script passing.

- [ ] **Step 7: Review and commit the implementation**

Review `git diff --check`, the scoped diff, and the final status. Stage only the two implementation files and commit:

```powershell
git add -- src/storage/v1-state-delta-codec.mjs tools/scripts/test-v1-state-delta-codec.mjs tools/scripts/test-v1-storage-repository.mjs docs/superpowers/plans/2026-08-15-runtime-independent-save-hashing.md
git commit -m "fix(storage): remove Web Crypto dependency"
```

- [ ] **Step 8: Reconcile and push `main`**

Verify local and remote ancestry without overwriting divergent work, rerun the full gate on the exact tree being pushed if reconciliation changes it, then push `main` to `origin`. Confirm the remote `main` SHA equals local `HEAD`.
