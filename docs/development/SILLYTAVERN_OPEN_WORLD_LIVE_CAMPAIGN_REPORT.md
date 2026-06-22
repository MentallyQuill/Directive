# SillyTavern Open-World Live Campaign Report

## Scope

This report records the June 22, 2026 live SillyTavern verification pass for the open-world conversion. It used the installed extension copy at `F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive` against `http://127.0.0.1:8000` with real model calls.

## Result

The open-world runtime can create and activate a fresh `Ashes of Peace` campaign, bind a SillyTavern campaign chat, open that chat, process multiple chat-native player turns, commit Director outcomes, post Directive-owned responses, record model-call journals, and run sidecar workers.

Primary live evidence:

- Save: `F:\SillyTavern\SillyTavern\data\default-user\user\files\directive-saves-save-1782156615623-3-e6f19aac.v1.json`
- Chat: `F:\SillyTavern\SillyTavern\data\default-user\chats\Albus Dumbledore\Albus Dumbledore - 2026-06-22@13h30m15s725ms.jsonl`
- Campaign: `campaign-1782156615623-2-ad136cec`
- Binding: `entityId: "0"`, `entityName: "Albus Dumbledore"`, `creationMethod: "slash:/newchat"`
- Final runtime tracking for the first full campaign run: 3 ingresses, 3 Directive responses, 20 model-call journal entries, 11 sidecar records, 0 pending interactions.
- Transcript shape: intro plus three alternating user turns and Directive `committedOutcome` messages. No non-Directive host assistant reply was appended after the fixed interceptor path.
- The `Albus Dumbledore` binding was later diagnosed as Directive inheriting SillyTavern's currently selected character during fresh chat creation. This was not caused by campaign-state identity data, but it was still the wrong first-start contract because an alphabetically/default-selected host character could own the campaign chat.

Follow-up live evidence after sidecar and classifier fixes:

- Save: `F:\SillyTavern\SillyTavern\data\default-user\user\files\directive-saves-save-1782157765284-3-65b83133.v1.json`
- Chat: `F:\SillyTavern\SillyTavern\data\default-user\chats\Albus Dumbledore\Albus Dumbledore - 2026-06-22@13h49m25s399ms.jsonl`
- Campaign: `campaign-1782157765284-2-e0174100`
- Final observed runtime tracking: 4 ingresses, 4 responses, 12 sidecar records, 0 pending interactions.
- Final observed turn: `consequentialCommand`, `directivePosted`, `committedOutcome`, response message `8`; final sidecar records persisted ingress, turn, and outcome ids.
- The live run also reproduced the host-character continuation risk for routine/relationship orders. Directive-owned response posting and host-generation suppression now keep committed turns from continuing as the selected SillyTavern shell.

## Fixes Made During Verification

- Fixed SillyTavern prompt-array normalization so generation interceptors preserve the original host message index embedded in `coreChat` messages.
- Fixed the owned-generation race: normal SillyTavern host generations now still dedupe and call `abort(true)` while a Directive provider call is already in flight from `MESSAGE_SENT`.
- Hardened SillyTavern chat binding when `this_chid` is hidden or stale by resolving the entity from globals, `name2`, and chat filename prefix.
- Fixed `openCampaignChat()` for fresh browser sessions by selecting the bound character id before calling SillyTavern `openCharacterChat(file_name)`.
- Extended the live smoke harness with opt-in chat-native campaign play, send-idle waits, and detection for stray non-Directive assistant messages after Directive-handled turns.
- Tightened sidecar prompts with worker boundary notes and added scheduler-local dropping of out-of-scope proposal operations while preserving strict parser rejection by default.
- Increased campaign sidecar role timeouts from 30s to 45s, including the Lumiverse bridge sidecar policy.
- Fixed classifier fallback for embedded crew/relationship command clauses so utility timeouts do not delegate command-bearing campaign posts to the host persona.
- Preserved provider-requested `directivePosted` for routine commands and made the routine handler post a Directive-owned acknowledgement instead of delegating to host generation when that strategy is selected.
- Persisted sidecar journal anchors (`ingressId`, `turnId`, `outcomeId`, source anchor metadata) instead of dropping them at `recordSidecarEvent()`.

## Remaining Risks

- Utility provider calls are still latency-sensitive. The live runs repeatedly exercised deterministic fallback for utility classifier timeouts; the final run also rejected one provider classifier result for hidden-state language and fell back safely.
- Sidecars are robustly journaled but not uniformly successful under real provider latency. The final follow-up run recorded anchored final-turn sidecars, including applied/no-change outcomes and one `relationshipEvaluator` timeout.
- Browser automation can lag during SillyTavern extension initialization. A 15s browser wait failed before the Directive settings dropdown mounted; rerunning the same non-mutating smoke with `DIRECTIVE_SILLYTAVERN_BROWSER_TIMEOUT_MS=90000` passed in about 30s through the Chromium CDP fallback.
- Full standalone Edge CDP campaign-chat smoke remains unstable around campaign chat selection and previously failed with `CDP socket error`. The in-app browser plus filesystem evidence completed the multi-turn verification, and the non-mutating browser shell smoke now passes with the longer initialization timeout.
- The historical campaign-chat shell inheritance has been fixed in the SillyTavern adapter: first-start now creates and selects a Directive-owned character card before creating the campaign chat. Future live runs should verify the card/chat name uses `Directive - Ashes of Peace`, or the next available numbered suffix when that card already exists.

## Commands

Focused checks:

```powershell
node tools\scripts\test-chat-turn-orchestrator.mjs
node tools\scripts\test-sillytavern-chat-prompt-adapters.mjs
node tools\scripts\test-sillytavern-runtime-lifecycle.mjs
node --check tools\scripts\smoke-sillytavern-live.mjs
```

Non-mutating live smoke:

```powershell
$env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
$env:DIRECTIVE_SILLYTAVERN_BROWSER='1'
$env:DIRECTIVE_SILLYTAVERN_HEADLESS='1'
$env:DIRECTIVE_SILLYTAVERN_BROWSER_TIMEOUT_MS='90000'
node tools\scripts\smoke-sillytavern-live.mjs
```

Full live campaign smoke entry point:

```powershell
$env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
$env:DIRECTIVE_SILLYTAVERN_BROWSER='1'
$env:DIRECTIVE_SILLYTAVERN_HEADLESS='1'
$env:DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN='1'
$env:DIRECTIVE_SILLYTAVERN_GENERATION='1'
$env:DIRECTIVE_SILLYTAVERN_STRICT='1'
$env:DIRECTIVE_SILLYTAVERN_BROWSER_TIMEOUT_MS='180000'
$env:DIRECTIVE_SILLYTAVERN_GENERATION_TIMEOUT_MS='120000'
$env:DIRECTIVE_SILLYTAVERN_CHAT_TIMEOUT_MS='240000'
node tools\scripts\smoke-sillytavern-live.mjs
```
