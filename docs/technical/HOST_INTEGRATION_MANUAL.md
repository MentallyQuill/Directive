# Host Integration Manual

This document explains how Directive integrates with SillyTavern, Lumiverse, and the fake test host.

## Plain-Language Model

Directive tries to keep its game engine portable. Host adapters are translators. They know how to open UI, read/write storage, observe chat, call generation, install prompt context, and post responses in a specific host. They should not contain campaign rules.

## Shared Host Contract

Host adapters should provide these services:

| Service | Responsibility |
| --- | --- |
| Lifecycle | Enable, disable, update, clean, delete, refresh. |
| Storage | Map logical Directive records to host storage. |
| Generation | Run role-based generation requests and batch sidecars if supported. |
| Prompt | Install, update, rebuild, inspect, suspend, and clear prompt blocks. |
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

## Lumiverse Adapter

Primary source folder: `src/hosts/lumiverse`.

Current responsibilities:

- Spindle backend/frontend entrypoints;
- scoped storage adapter;
- generation client;
- tool adapter;
- event adapter;
- interceptor adapter;
- prompt block projection from runtime summaries;
- runtime bridge for app actions;
- frontend app-overlay mounting.

Lumiverse currently shares engine services but still has different smoke coverage and host lifecycle constraints than SillyTavern.

## Fake Host

Primary source folder: `src/hosts/fake`.

The fake host is for repeatable tests. It should model the host contract without importing SillyTavern or Lumiverse globals.

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

  subgraph LV["Lumiverse adapter"]
    LVBridge["runtime bridge"]
    LVPrompt["prompt blocks"]
    LVStorage["Spindle storage"]
    LVApp["app overlay"]
  end

  ST --> Shared
  LV --> Shared
```

## Integration Rules

- Host adapters may reference host globals; shared engine modules should not.
- Host adapters may translate storage paths; shared runtime should use logical keys.
- Host adapters may call host generation; shared runtime should call generation roles.
- Host adapters may mount UI; shared UI route order and view models should stay host-neutral.
- Host adapters may expose diagnostics; diagnostics should be sanitized.

## Render Slots

Runtime shell examples:

![SillyTavern-hosted Directive command spine](../../assets/documentation/renders/docs-directive-campaign-command.png)

![Mobile Directive shell](../../assets/documentation/renders/docs-mobile-directive-campaign.png)

Host-specific renders pending: SillyTavern launcher, message actions with Directive reconciliation commands, Directive Assist beside the composer, and Lumiverse overlay if it differs materially from SillyTavern.
