# Host Integration Manual

This document explains how Directive integrates with SillyTavern and the fake test host.

## Plain-Language Model

Directive keeps its campaign engine behind host contracts. Host adapters are translators. They know how to open UI, read/write storage, observe chat, call generation, install prompt context, and post responses in a specific host. They should not contain campaign rules.

## Shared Host Contract

Host adapters should provide these services:

| Service | Responsibility |
| --- | --- |
| Lifecycle | Enable, disable, update, clean, delete, refresh. |
| Storage | Map logical Directive records to host storage. |
| Generation | Run role-based generation requests and batch sidecars if supported. |
| Prompt | Install, update, rebuild, inspect, suspend, and clear Directive-owned prompt blocks. |
| Chat | Identify current chat, create/open campaign chat, post assistant messages, store binding metadata. |
| Events | Observe player message, edit, delete, and chat switch events. |
| Shell | Mount the Directive runtime shell into the host UI. |
| Diagnostics | Report capabilities, failures, and host-specific state without leaking hidden campaign facts. |

## SillyTavern Adapter

Primary source folder: `src/hosts/sillytavern`.

Current responsibilities:

- extension lifecycle through `lifecycle.js`;
- feature enablement through `feature-toggle.mjs` and settings store;
- host factory in `host-factory.mjs`;
- file API and logical storage mapping;
- prompt adapter over `setExtensionPrompt`;
- chat adapter for chat identity and fresh campaign chat creation;
- event wiring for player messages, edits, deletes, chat changes, and extension disable;
- generation client and narration provider;
- provider client for current host model, Connection Profile, and direct OpenAI-compatible endpoints;
- runtime bridge and generation interceptor;
- message actions for reconciliation;
- Assist button integration beside the SillyTavern input.

### Context-Extension Coexistence

SillyTavern users may run native World Info / Lorebooks, Memory Books, Summaryception, VectFox, and other context-extension tools while playing a Directive campaign. The SillyTavern adapter must coexist with those systems without turning them into Directive subsystems.

Rules for the adapter:

- clear, rebuild, and overwrite only Directive-owned prompt keys;
- preserve host-owned prompt keys such as World Info surfaces, `summaryception`, `3_vectfox*`, Memory Books-produced World Info, and unknown third-party keys;
- observe host-visible prompt keys, chat metadata, settings hashes, visibility markers, disabled/unavailable states, and timing hints only as compact diagnostics;
- avoid private extension APIs as runtime dependencies unless a future reviewed interop flow explicitly approves that dependency;
- classify evidence honestly as browser-confirmed, disk-confirmed, settings-only, disabled, not-installed, unavailable, or indeterminate;
- redact raw prompt bodies, lorebook text, generated Memory Books text, Summaryception summaries, vector payloads, embeddings, collection names, endpoint URLs, provider errors, API keys, Qdrant secrets, and hidden Director material.

External context may influence generation, but it is not Directive authority. Host adapters should surface `externalPromptEnvironmentRef`, target summaries, unavailable reasons, fixture-depth labels, and external latency/privacy diagnostics without committing external content to campaign state.

## Fake Host

Primary source folder: `src/hosts/fake`.

The fake host is for repeatable tests. It should model the host contract without importing SillyTavern globals.

## Future Hosts

Future host adapters, including possible Lumiverse support, should be added only after the SillyTavern alpha contract is stable. They should reuse the host contract, route-panel view models, logical storage boundary, and sidecar orchestration without forking campaign rules.

## Host Boundary Diagram

```mermaid
flowchart TB
  subgraph Shared["Shared Directive engine"]
    Runtime["runtime-app"]
    Director["Director and adjudication"]
    StorageLogic["logical storage paths"]
    GenerationRoles["generation roles"]
    State["state transactions"]
    UI["route panels and view models"]
  end

  subgraph ST["SillyTavern adapter"]
    STEvents["events/interceptor"]
    STPrompt["setExtensionPrompt"]
    STFiles["/user/files storage"]
    STShell["extension shell mount"]
  end

  ST --> Shared
```

## Integration Rules

- Host adapters may reference host globals; shared engine modules should not.
- Host adapters may translate storage paths; shared runtime should use logical keys.
- Host adapters may call host generation; shared runtime should call generation roles.
- Host adapters may mount UI; shared UI route order and view models should stay host-neutral.
- Host adapters may expose diagnostics; diagnostics should be sanitized.

## Render Slots

Runtime shell examples:

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-campaign-command.png" alt="SillyTavern-hosted Directive command spine">
</p>

<p align="center">
  <img src="../../assets/documentation/renders/docs-mobile-directive-campaign.png" alt="Mobile Directive shell">
</p>

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-host-specific-surfaces.png" alt="SillyTavern launcher, message actions with Directive reconciliation commands, and Directive Assist beside the composer">
</p>
