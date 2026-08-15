# Runtime-Independent Save Hashing Design

**Date:** 2026-08-15

## Problem

Directive campaign saving currently hashes canonical save state through `globalThis.crypto.subtle.digest()`. Browsers restrict `crypto.subtle` to secure contexts, so a normal SillyTavern client opened over LAN HTTP cannot load or persist Directive's segmented saves. Campaign saving must not depend on HTTPS, localhost, browser flags, or any other secure-context configuration.

## Decision

Directive will use its existing browser-safe JavaScript SHA-256 implementation as the only implementation behind segmented-save hashing. `sha256Json(value)` will canonicalize the value exactly as it does now and pass that canonical JSON string to `stableSha256Hex()`.

There will be no Web Crypto path, runtime feature detection, fallback behavior, or crypto-unavailable error. Every supported runtime will execute the same code and produce the same SHA-256 digest.

## Compatibility and Integrity

The hash algorithm and serialized input remain unchanged: SHA-256 over UTF-8 encoded canonical JSON. Existing manifests, bases, and delta segments therefore remain readable without migration or hash rewriting. Hash-based corruption detection and delta-chain validation remain mandatory.

This change only removes an environmental API dependency. It does not remove, bypass, downgrade, or conditionally disable any save-integrity check.

## Code Boundaries

- `src/storage/v1-state-delta-codec.mjs` will import `stableSha256Hex()` from `src/runtime/v1-stable-hash.mjs` and use it inside `sha256Json()`.
- No storage repository callers or public function signatures will change.
- No new hashing implementation or dependency will be introduced.
- The obsolete `DIRECTIVE_V1_STATE_DELTA_CRYPTO_UNAVAILABLE` path will be removed.

## Tests

The codec test will temporarily make access to `globalThis.crypto` throw, then verify that `sha256Json()` still returns the expected standard SHA-256 digest. A throwing accessor proves the production path neither requires nor probes Web Crypto; merely setting it to `undefined` would permit hidden fallback logic.

Existing canonicalization, delta replay, storage repository, browser-runtime safety, and full alpha-gate tests must continue to pass. The regression is fixed when campaign save hashing works with no readable `globalThis.crypto` and produces byte-for-byte compatible hashes.

## Out of Scope

- Configuring HTTPS, reverse proxies, certificates, browser flags, or SillyTavern server settings.
- Supporting multiple hashing backends.
- Changing the segmented-save format or integrity model.
- Refactoring unrelated runtime hashing or storage code.
