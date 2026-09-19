# Persisted Transcript Readback Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development with TDD and independent review. No host/provider calls or installation in this slice.

**Goal:** Read complete saved character/group transcript data through native storage endpoints, without substituting current in-memory chat.

**Architecture:** Add a read-only chat-adapter capability that resolves exact entity/chat/binding, fetches the saved transcript and normalizes it through the existing bounded snapshot contract. The future finalization owner will compare this result to its durable planned snapshot and recheck selection before further actions.

**Tech Stack:** SillyTavern chat adapter, existing snapshot copier, native character/group endpoints, fake fetch tests.

**Spec:** artifacts/stabilization-20260914/native-finalization-durable-design.md. Native save wrappers swallow errors; current getMessage and verifyCampaignChatSnapshot fast paths prove memory only. Actual source is F:/SillyTavern/SillyTavern.

## Task

Files: own src/hosts/sillytavern/chat-adapter.mjs and new tools/scripts/test-persisted-transcript-snapshot.mjs. A small new helper is allowed if needed; do not edit runtime-app or storage/repository. Root owns gate registration.

- [x] Add failing public adapter tests for readPersistedTranscriptSnapshot(binding, { signal } = {}). Even when the named chat is selected and memory differs, it must return server-saved rows. Preserve RED evidence.
- [x] Validate/detach complete requested binding before the first await without invoking accessors. Resolve exact native character/group identity; no name-only or current-chat fallback. Verify stored header/Directive binding against the requested host/campaign/save/chat/entity identity before returning captured data. Preserve actual stored binding in the result, not caller-spoofed metadata.
- [x] Fetch characters through /api/chats/get and groups through the actual native group read endpoint/shape verified from source. Use no-cache and optional AbortSignal; HTTP/transport/abort/missing or malformed data returns explicit non-success, never empty successful history. No writes, save calls, selection changes or metadata repair.
- [x] Normalize full persisted rows with captureHostTranscriptSnapshot, matching captureCurrentTranscriptSnapshot representation and limits. Success returns the same {status:'captured',snapshot} shape. Failure returns supported non-success shape with a reason code distinguishing unavailable persisted readback; document the exact union in source/tests.
- [x] Test characters/groups, selected-memory divergence, exact body/headers, saved binding mismatch, wrong entity/chat, malformed/oversized data, missing/corrupt header, getter rejection without invocation, caller mutation across held fetch, abort/read failure and no native side effects. Avoid claiming disk durability beyond the exact server read observed.
- [x] Run focused new tests plus existing host snapshot/context/checkpoint tests. Independently review endpoint identity, normalization and no-memory-fallback. Do not wire or change global saveChat behavior; finalization obligation + V2 publication integration remain required next.

## Limit

This capability alone does not prove finalization, authorize overwrite, prevent future native/extension writes or clear a lifecycle barrier. Runtime must compare the immutable expected full snapshot and verify operation/selection ownership, and persist the finalization obligation before mutation.
