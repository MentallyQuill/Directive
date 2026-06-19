# Dual Host Support Plan

## Purpose

This plan defines the path toward first-class support for both SillyTavern and Lumiverse without splitting Directive into two products.

Directive should become a host-neutral command RPG engine with thin host adapters. SillyTavern and Lumiverse should provide lifecycle, storage, UI mounting, chat events, generation access, and host-specific prompt integration. They should not own mission state, adjudication, package semantics, or transaction truth.

The plan assumes Directive is still pre-alpha. We do not need to preserve legacy compatibility with current internal module names, save paths, or host-specific shortcuts if changing them now produces the better architecture.

## Repository And Artifact Strategy

Directive should remain one repo and one product.

The intended packaging model is:

- One shared engine source tree for mission state, packages, adjudication, transactions, retrieval, generation roles, sidecar job contracts, and tests.
- One SillyTavern host adapter and install artifact, described by `manifest.json`.
- One Lumiverse host adapter and install artifact, described by `spindle.json`.
- Host-specific build or packaging files only where the host requires them.

This means Directive should have two host extensions but not two forks. SillyTavern and Lumiverse are delivery/runtime adapters for the same game engine.

Splitting into separate repos should be a last resort only if a host distribution mechanism requires a separate repository root, release history, or update channel. Even then, the preferred fallback is a generated package folder or release artifact from this repo, not manually maintained duplicate source.

Current packaging choice: Lumiverse support lives beside the SillyTavern artifact at the repo root. `manifest.json` remains the SillyTavern descriptor, and `spindle.json` is the Lumiverse descriptor. If a future host distribution rule requires a separate package root, generate it from this repo rather than maintaining a second source tree.

## Integration Boundary With Stage 29 And Stage 30

Stage 29 and Stage 30 are no longer an active parallel constraint. The dual-host path can now touch runtime injection, the alpha gate, and Lumiverse packaging as long as Stage 29/30 pressure-handoff behavior keeps passing its tests.

The completed boundary decision remains useful as a rule for future parallel work:

- If a story/content track is active in parallel, dual-host work should stay in docs, fake adapters, and isolated tests.
- Once that track is closed, host abstraction work can move into the runtime and gate.
- Stage package data, pressure ledgers, and mission fixtures should only change when the host work directly requires it.

Current integration now includes runtime host injection, main-gate dual-host checks, a root `spindle.json`, and real Lumiverse backend/frontend source entrypoints.

The Lumiverse baseline is now `1.0.4`, following the 2026-06-19 LumiHub release note [Lumiverse 1.0.4 - Lot Better, Lot Faster](https://lumi.spot/blog/posts/lumiverse-1-0-4-lot-better-lot-faster). Directive keeps the current `generation`, `interceptor`, and `tools` permissions for the MVP slice; newer extension APIs that require broader permissions stay planned until there is a concrete runtime need.

## Current Integration Status

The following pieces now exist and are wired far enough to protect the dual-host path in the normal alpha gate:

- [host-contract.mjs](../../src/hosts/host-contract.mjs) defines the first `DirectiveHost` capability and adapter contract scaffold.
- [fake-host.mjs](../../src/hosts/fake/fake-host.mjs) provides a test-only host, in-memory JSON storage, event emitter, UI message sink, and fake generation client.
- [generation-client.mjs](../../src/hosts/sillytavern/generation-client.mjs) wraps the current SillyTavern generation surface behind the host generation client shape without changing runtime defaults.
- [narration-provider.mjs](../../src/hosts/sillytavern/narration-provider.mjs) owns SillyTavern current-chat narration calls for the generation client.
- [file-api.mjs](../../src/hosts/sillytavern/file-api.mjs) owns SillyTavern `/api/files/*` and `/user/files` physical storage calls.
- [storage-adapter.mjs](../../src/hosts/sillytavern/storage-adapter.mjs) maps logical Directive storage keys to SillyTavern `/user/files` paths through the existing file storage adapter shape.
- [events-adapter.mjs](../../src/hosts/sillytavern/events-adapter.mjs) wraps SillyTavern context event subscriptions without calling runtime actions directly.
- [host-factory.mjs](../../src/hosts/sillytavern/host-factory.mjs) composes stubbed SillyTavern surfaces into a contract-valid `DirectiveHost`.
- [storage-adapter.mjs](../../src/hosts/lumiverse/storage-adapter.mjs) adapts injected Lumiverse `spindle.storage` or `spindle.userStorage` objects to Directive's JSON storage adapter shape.
- [generation-client.mjs](../../src/hosts/lumiverse/generation-client.mjs) adapts injected Lumiverse `spindle.generate.quiet`, `raw`, and `batch` methods to Directive's host generation client shape.
- [events-adapter.mjs](../../src/hosts/lumiverse/events-adapter.mjs) wraps injected Lumiverse `spindle.on(...)` subscriptions with aliases and cleanup.
- [interceptor-adapter.mjs](../../src/hosts/lumiverse/interceptor-adapter.mjs) builds fail-open Lumiverse prompt interceptors from Directive's shared prompt safety contract.
- [tools-adapter.mjs](../../src/hosts/lumiverse/tools-adapter.mjs) registers read-only Directive query tools and routes `TOOL_INVOCATION` payloads to handlers.
- [host-factory.mjs](../../src/hosts/lumiverse/host-factory.mjs) composes injected fake-Spindle surfaces into a contract-valid `DirectiveHost`.
- [generation-roles.mjs](../../src/generation/generation-roles.mjs) defines host-neutral model-call roles for narration and future sidecars.
- [generation-router.mjs](../../src/generation/generation-router.mjs) invokes a host generation client by role with timeout handling and provider diagnostics.
- [prompt-injection-safety.mjs](../../src/generation/prompt-injection-safety.mjs) validates host prompt blocks before future context handlers or interceptors can inject Directive context into chat generation.
- [sidecar-job-contracts.mjs](../../src/jobs/sidecar-job-contracts.mjs) and [sidecar-job-runner.mjs](../../src/jobs/sidecar-job-runner.mjs) define background job packets, stale-result detection, sequential execution, concurrent execution, and batch generation when the host exposes it.
- [host-sidecar-orchestrator.mjs](../../src/jobs/host-sidecar-orchestrator.mjs) chooses sequential or concurrent sidecar scheduling from host capabilities and forwards progress to host UI adapters.
- [logical-storage-paths.mjs](../../src/storage/logical-storage-paths.mjs) defines concrete logical storage keys and first-pass host mapping helpers.
- [logical-storage-adapter.mjs](../../src/storage/logical-storage-adapter.mjs) wraps a host storage adapter so repository code uses logical keys while host adapters own physical path mapping.
- [directive-routes.mjs](../../src/ui/directive-routes.mjs) defines host-neutral primary route metadata for the shared top-control compact shell.
- [directive-compact-shell.js](../../src/ui/directive-compact-shell.js) defines the shared top-control compact shell frame, top navigation, top-right action cluster, disabled shell-action contract, and route body slot.
- [directive.css](../../styles/directive.css) anchors the SillyTavern runtime panel as a top-right desktop surface and keeps phone-width layout full-screen, preserving the same top-control schema used in Lumiverse's shelf.
- [spindle.json](../../spindle.json) declares Directive as a Lumiverse Spindle extension with generation, interceptor, and tools permissions.
- [frontend.ts](../../src/frontend.ts) is the Lumiverse browser-bundle entry wrapper. Lumiverse builds it to `dist/frontend.js`, which keeps the served frontend bundle-safe while the source continues to reuse shared UI modules.
- [runtime-bridge.mjs](../../src/hosts/lumiverse/runtime-bridge.mjs) routes targeted Lumiverse frontend messages into the shared runtime app for initialization, quick campaign creation, save/load, panel-led Director turns, Open Orders review/scene/scene-beat/resolution, narration, and diagnostic sidecars while returning player-safe summaries.
- [prompt-blocks.mjs](../../src/hosts/lumiverse/prompt-blocks.mjs) converts the sanitized Lumiverse runtime summary into player-safe prompt blocks for active situation, recent command-log continuity, and crew/ship context.
- [backend.js](../../src/hosts/lumiverse/backend.js) is the first Lumiverse backend entrypoint. It creates an operator-level Lumiverse `DirectiveHost` for tools/events/interceptors, creates per-user runtime contexts for user-scoped campaign storage, registers player-safe read-only tools, installs a fail-open player-safe prompt-block interceptor, observes host events, routes runtime bridge requests, and replies to frontend messages only with targeted user messages.
- [frontend.js](../../src/hosts/lumiverse/frontend.js) is the first Lumiverse frontend source module. It registers the Directive drawer tab, mounts the shared top-control compact shell, renders backend/runtime status by route, and exposes controls for initialize, quick start, load latest, preview/commit turn, sidecars, Open Orders candidate/assignment/scene-beat actions, and save.
- [smoke-lumiverse-live.mjs](../../tools/scripts/smoke-lumiverse-live.mjs) is the repeatable local live-host smoke. It imports/restarts Directive in a running Lumiverse server, grants required permissions, verifies frontend serving, top-control, Open Orders, and Advance Scene control markers, and tools, runs WebSocket runtime actions including quick start, manual save, load, preview, and commit, and attempts prompt dry-run injection. Real narration and concurrent sidecar model calls are opt-in with `DIRECTIVE_LIVE_GENERATION=1`; provider-auth failures are reported as structured external blockers.
- [test-dual-host-scaffold.mjs](../../tools/scripts/test-dual-host-scaffold.mjs) runs the dual-host scaffold tests from the alpha gate.
- [test-lumiverse-prompt-blocks.mjs](../../tools/scripts/test-lumiverse-prompt-blocks.mjs) proves sanitized Lumiverse runtime summaries produce safe host prompt blocks without hidden/director-only keys.
- [test-lumiverse-entrypoints.mjs](../../tools/scripts/test-lumiverse-entrypoints.mjs) proves the manifest, backend entrypoint, bundle-safe frontend source path, targeted replies, tool registration, prompt-block interceptor injection, shared top-control drawer-tab shell, top-right Back/action cluster behavior, runtime initialization, Lumiverse logical save creation, manual save, load, a panel-led Director turn, Open Orders candidate review, scene activation, and scene beat progress through the Lumiverse bridge, narration through `spindle.generate.quiet`, two diagnostic sidecars through `spindle.generate.batch({ concurrent: true })` with resolved Lumiverse connection metadata, and frontend dispatch for Open Orders candidate/assignment controls.
- [test-host-import-boundaries.mjs](../../tools/scripts/test-host-import-boundaries.mjs) is a transitional verifier that allows known SillyTavern baseline files while failing new host-global leakage into core modules.
- [test-runtime-host-injection.mjs](../../tools/scripts/test-runtime-host-injection.mjs) proves `createDirectiveRuntimeApp({ host })` can initialize through a `DirectiveHost`, expose host metadata, run a Director turn, and generate narration through the host generation client.

This is still not full Lumiverse parity. The current tested slice proves packaging, host construction, status UI, safe event observation, read-only tools, fail-open prompt-block integration, logical storage keys, SillyTavern physical-path mapping at the host edge, Lumiverse runtime bridge actions, create/manual-save/load, a panel-led turn, Open Orders candidate review, scene activation, and scene beat progress, quiet narration, concurrent batch sidecars with real connection metadata, the shared top-control shell, and the bundle-safe frontend source path under fake Spindle and local browser-bundle smoke. Default live Lumiverse smoke now proves import/enable/frontend/tool registration, rebuilt bundle serving with top-control, Open Orders, and Advance Scene control markers, quick campaign creation, explicit manual save, explicit load, deterministic Director preview, commit without narration, and prompt-block dry-run injection. Local Lumiverse source review shows Spindle exposes direct REST listing for registered tools, while extension tool invocation is routed through Council/generation internals via `TOOL_INVOCATION`; live tool registration plus prompt dry-run is the current non-spending coverage. The next parity work is to run opt-in live generation once the Lumiverse provider connection is valid.

Local Lumiverse smoke on 2026-06-19:

- Copied the current Directive package into the local Lumiverse extension import layout at `F:\git\Lumiverse\data\extensions\directive\repo`.
- Imported Directive through `POST /api/v1/spindle/import-local`.
- Granted `generation`, `interceptor`, and `tools`.
- Enabled Directive successfully; Lumiverse reported the extension as `running`.
- Verified `GET /api/v1/spindle/{id}/manifest` returned identifier `directive`.
- Verified `GET /api/v1/spindle/{id}/frontend` served the frontend entrypoint.
- Verified `GET /api/v1/spindle/tools` included `directive_get_active_situation`.
- The in-app browser exposed a `Directive` drawer tab, but the browser tab handle went stale before reliable tab-body inspection. API and WebSocket checks remain the authoritative live smoke result for this pass.
- After the logical-storage migration, refreshed the local Lumiverse extension copy and re-ran the API smoke: sign-in succeeded, import-local returned 200, `generation`/`interceptor`/`tools` remained granted, Directive restarted/enabled as `running`, the manifest identifier was `directive`, the frontend bundle returned 200 with 10710 bytes, and `directive_get_active_situation` remained registered.
- Live WebSocket smoke exposed and fixed an operator-scope storage issue: runtime actions need per-user Lumiverse runtime contexts so `spindle.userStorage` receives the authenticated `userId`.
- After the fix, live WebSocket smoke passed `initialize`, `startQuickCampaign`, `previewDirectorTurn`, and `commitProvisionalDirectorTurn` with `generateNarration: false`. The live campaign loaded as Ashes of Peace with Talia Serrin aboard the U.S.S. Breckinridge, created one save, previewed a Partial Success outcome, and committed that outcome into the next phase.
- After the bundle-safe frontend change, refreshed the local Lumiverse extension copy, removed only the stale generated `dist/frontend.js`, re-ran `import-local`, and verified Lumiverse rebuilt and served `dist/frontend.js` with the shared top-control shell markers.
- Live browser smoke opened the Directive shelf, verified `data-directive-shell="top-control"`, verified `data-directive-shell-actions="top-right"`, saw the top route bar (`Starships`, `Mission`, `Crew`, `Ship`, `Log`, `Settings`), clicked `Quick Start`, and clicked `Preview Turn`. The shelf displayed Talia Serrin aboard the U.S.S. Breckinridge, two local saves, and a pending Director outcome.
- After adding the expanded read-only tools, refreshed the local Lumiverse extension copy and re-ran `import-local`/restart. Live Lumiverse reported Directive as `running` and the tool registry included `directive_get_active_situation`, `directive_search_command_log`, `directive_get_crew_context`, and `directive_get_ship_status`.
- After replacing the no-op interceptor with player-safe prompt blocks, refreshed the local Lumiverse extension copy and re-ran `import-local`/restart. Live Lumiverse reported Directive as `running` with the expanded tool registry still intact; the repeatable live smoke now verifies prompt-block injection through Lumiverse dry-run without spending a model call.
- Added a repeatable live smoke runner at [smoke-lumiverse-live.mjs](../../tools/scripts/smoke-lumiverse-live.mjs). The default path avoids model spend while checking import/restart, permission grant, frontend serving, top-control, Open Orders, and Advance Scene control markers, tools, WebSocket runtime actions, and prompt dry-run injection when a local chat is available. `DIRECTIVE_LIVE_GENERATION=1` exercises live narration and concurrent sidecar generation and reports provider-auth failures as structured external blockers.
- After adding the live smoke runner, refreshed the local Lumiverse extension copy and ran the default smoke against `http://localhost:7860/`. It passed import/restart, permission grant, frontend serving (`dist/frontend.js`, 19854 bytes), all four tool registrations, WebSocket `initialize`, `startQuickCampaign`, `previewDirectorTurn`, `commitProvisionalDirectorTurn` without narration, and prompt dry-run injection for chat `90402fc9-4473-4ac0-bd06-2fc5522de0fc`.
- The first opt-in live generation smoke exposed a Directive gap: operator-scoped Lumiverse generation calls require the authenticated `userId`. [generation-client.mjs](../../src/hosts/lumiverse/generation-client.mjs) now attaches `userId` to quiet/raw/batch RPCs, and fake-Spindle tests assert it.
- After the `userId` fix, the opt-in live generation smoke reached Lumiverse's configured provider, then failed on the host connection with `nanogpt API error 401` / `invalid_api_key`. That leaves live narration and live sidecar model output waiting on a valid Lumiverse generation connection, not a Directive bridge error.
- After adding explicit manual save/load to the live smoke runner, re-ran the default smoke against `http://localhost:7860/`. It passed import/restart, permission grant, frontend serving (`dist/frontend.js`, 19854 bytes), all four tool registrations, WebSocket `initialize`, `startQuickCampaign`, `saveCurrentGame`, `loadGame`, `previewDirectorTurn`, `commitProvisionalDirectorTurn` without narration, and prompt dry-run injection for chat `90402fc9-4473-4ac0-bd06-2fc5522de0fc`.
- Reviewed local Lumiverse tool execution surfaces. `GET /api/v1/spindle/tools` lists registered tools, but extension tool invocation is handled by Council/generation services through `TOOL_INVOCATION` and `invokeExtensionTool(...)`, not a direct non-generation REST endpoint. Live direct invocation coverage is therefore not currently available without running a Council/generation path or adding a Lumiverse test hook.
- Re-ran the opt-in live generation smoke after the current docs/status refresh. It still reached the Lumiverse provider path and failed on provider auth with `nanogpt API error 401` / `Invalid session` / `invalid_api_key`, before sidecar generation could run.
- Re-ran the current local Lumiverse smoke against `http://localhost:7860/` after the latest integration pass. The default no-generation path still passed with Directive `running`, frontend `dist/frontend.js` served at 19854 bytes, all four read-only tools registered, top-control frontend markers intact, runtime initialize/quick-start/manual-save/load/preview/commit working, and prompt dry-run injection passing for chat `90402fc9-4473-4ac0-bd06-2fc5522de0fc`. The opt-in live-generation path still reached Lumiverse's provider and failed with `nanogpt API error 401` / `Invalid session` / `invalid_api_key`, so live narration plus real sidecar model output remain an external provider-credential dependency.

## Current Baseline

Directive already has several boundaries that make dual-host support realistic:

- The Mission Director core is deterministic and host-independent: [director-turn-runtime.mjs](../../src/runtime/director-turn-runtime.mjs), [director.mjs](../../src/mission/director.mjs), and [transaction-state.mjs](../../src/campaign/transaction-state.mjs).
- Narration is post-commit and provider-injected: [narration.mjs](../../src/generation/narration.mjs) accepts a provider object and records provider failure without losing committed mechanics.
- The runtime app accepts a `DirectiveHost` and derives storage plus default narration generation from host adapters: [runtime-app.mjs](../../src/runtime/runtime-app.mjs).
- Storage repository logic uses host-neutral logical keys through adapter-driven persistence: [directive-storage-repository.mjs](../../src/storage/directive-storage-repository.mjs).
- Tests already assert state safety, provider failure behavior, transaction rollback, storage adapter behavior, and package/mission contracts.

The main remaining host-specific seams are now narrower:

- [index.js](../../src/extension/index.js), [bootstrap.js](../../src/extension/bootstrap.js), [events.js](../../src/extension/events.js), and [lifecycle.js](../../src/extension/lifecycle.js) are now manifest-facing SillyTavern entrypoint shims. Their active host implementation lives under [src/hosts/sillytavern](../../src/hosts/sillytavern).
- [file-api.mjs](../../src/hosts/sillytavern/file-api.mjs) is now a SillyTavern host detail; `src/storage` owns logical repository mechanics and filename/path guards only.
- [narration-provider.mjs](../../src/hosts/sillytavern/narration-provider.mjs) is now adapter-owned and consumed through [generation-client.mjs](../../src/hosts/sillytavern/generation-client.mjs); `src/providers` no longer owns SillyTavern current-chat calls.
- [manifest.json](../../manifest.json) is a SillyTavern manifest, not a host-neutral extension descriptor.
- Release notes and older design/source documents still describe earlier SillyTavern-only scope. Keep historical source briefs intact, but promote release-facing docs toward the host-portable engine framing as they are touched.

## Lumiverse Capabilities To Design Around

Lumiverse is not just another DOM host. Its Spindle extension model gives Directive a better substrate for background intelligence:

- Extensions install from GitHub and are described by `spindle.json`.
- Extensions can have backend and frontend modules.
- Backend runtimes can run as worker or process-style runtimes, depending on Lumiverse support and settings.
- `spindle.storage` and `spindle.userStorage` provide scoped extension storage.
- `spindle.generate.raw`, `quiet`, `batch`, `rawStream`, and `quietStream` support programmatic model calls.
- `spindle.generate.batch({ concurrent: true })` supports real parallel sidecar model calls.
- `spindle.generate.observe(chatId)` can observe in-flight main chat generation.
- Events such as `MESSAGE_SENT`, `MESSAGE_EDITED`, `CHAT_CHANGED`, `GENERATION_STARTED`, `STREAM_TOKEN_RECEIVED`, `GENERATION_ENDED`, and `GENERATION_STOPPED` are available with permissions.
- Context handlers run before prompt assembly.
- Interceptors run after prompt assembly and can inject messages and Prompt Breakdown attribution.
- Extension tools can be registered and marked council-eligible.
- Backend-to-frontend messages let the worker report progress without blocking the visible chat.
- Lumiverse 1.0.4 adds drawer tab mobility through `TabLocation`, extension-owned per-character display resolution, extension-controlled regex and macro resolution, `spindle.chat.setStyleMode(chatId, 'extension-relaxed', userId)` for viewport-relaxed chat content, DOM registry references for stable message/listing targeting, source index/id in interceptor context, world-book attachment APIs, UI Automation, preset-variable controls, shared app/extension components, `dev_mode` protection for local extension directories, and unified LumiHub install paths.

Directive integration notes for the 1.0.4 surface:

- Keep the current drawer-tab shell in the main drawer for MVP; use `ctx.ui.requestTabLocation(...)` only when Directive has a real second-container workflow.
- Do not request `app_manipulation` just to access `spindle.chat.setStyleMode`; the current shelf does not need viewport-fixed chat content. If a future in-chat Directive overlay needs it, call `spindle.chat.setStyleMode(chatId, 'extension-relaxed', userId)` only for the active chat and revert with `'bounded'` on cleanup.
- Use the new interceptor source index/id fields for future audit trails, but continue to reject hidden/director-only state before prompt injection.
- Treat UI Automation as the preferred way to open Connections or Settings during onboarding/provider repair, instead of instructing the user to navigate manually.
- Treat world-book APIs as a future package-export/install path for Directive lore/context material; campaign truth still remains in Directive saves.

Reference points:

- Lumiverse repo: <https://github.com/prolix-oc/Lumiverse>
- Lifecycle docs: <https://github.com/prolix-oc/Lumiverse/blob/main/developer-docs/docs/lifecycle.md>
- Generation docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/backend-api/generation.md>
- Events docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/backend-api/events.md>
- Interceptor docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/backend-api/interceptors.md>
- Tool docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/backend-api/llm-tools.md>
- Storage docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/backend-api/storage.md>
- Chat mutation docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/backend-api/chat-mutation.md>
- UI Automation docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/backend-api/ui-automation.md>
- UI placement docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/frontend-api/ui-placement.md>

These references and the 1.0.4 release note were reviewed on 2026-06-19. Lumiverse is active, so the exact API surface should be re-checked before implementation.

## Product Direction

Directive should support two host modes:

1. Panel-led play.
   - The player enters the turn through the Directive UI.
   - Directive previews a Provisional Outcome, accepts a Final Outcome, then generates narration.
   - This is close to the current runtime path and remains the safest first slice for SillyTavern.

2. Chat-observed play.
   - The player acts in the ordinary host chat.
   - Directive observes the player message, builds sidecar analysis, injects safe context where the host supports it, and records state changes through explicit transaction paths.
   - This is where Lumiverse can shine because sidecar calls can run beside the main chat call instead of making the player wait.

The engine must support both ingress modes. The host adapter decides which are enabled.

## Architecture Principles

- Host-neutral core first. Mission, campaign, packages, retrieval, adjudication, command mechanics, and transaction state cannot import SillyTavern or Lumiverse APIs.
- Host adapters own host globals. `globalThis.SillyTavern`, `spindle`, host request headers, extension manifests, and DOM mounting belong only under `src/hosts/<host>/`.
- Sidecars advise, transactions decide. Model calls may propose continuity notes, pressure suggestions, Mission Director advice, or summary text. They cannot directly mutate campaign state.
- Structured output is preferred for any sidecar that affects state. Free prose is allowed for narration and player-facing summaries only.
- Capability negotiation beats platform branching. Core modules should ask for `host.capabilities.generation.batch`, not `if host.id === "lumiverse"`.
- All long-running work must be cancellable or timeout-bound. Lumiverse sidecars should not stall main generation; SillyTavern sidecars should not make the UI feel frozen.
- Progress should be observable. Background work should emit status and partial summaries through a small job event contract.
- Storage keys should be logical. Core save/index code should not know `/user/files/` or Lumiverse storage roots.
- Prompt injection must be auditable. If context is injected into host chat generation, it must have source attribution and hidden-data checks.
- Dual support should not add many visible knobs. Prefer internal budgets and role defaults, with advanced overrides later.

## Target Source Layout

The exact layout can change, but this is the intended ownership shape:

```text
manifest.json
spindle.json
src/
  hosts/
    host-contract.mjs
    host-capabilities.mjs
    host-errors.mjs
    fake/
      fake-host.mjs
    sillytavern/
      manifest-entry.js
      bootstrap.js
      events.js
      storage-adapter.mjs
      generation-client.mjs
      ui-mount.js
      theme-adapter.js
    lumiverse/
      backend.js
      frontend.js
      storage-adapter.mjs
      generation-client.mjs
      events-adapter.mjs
      interceptor-adapter.mjs
      tools-adapter.mjs
      host-factory.mjs

  runtime/
    runtime-app.mjs
    runtime-actions.js
    runtime-shell.js
    director-turn-runtime.mjs

  ui/
    directive-compact-shell.js
    directive-routes.mjs

  generation/
    generation-router.mjs
    generation-roles.mjs
    narration.mjs
    structured-output.mjs

  jobs/
    sidecar-job-runner.mjs
    sidecar-job-contracts.mjs
    sidecar-job-store.mjs
    sidecar-reconciler.mjs

  storage/
    directive-storage-repository.mjs
    logical-storage-paths.mjs
    save-records.mjs
```

Because the project is pre-alpha, we should move files in place rather than leaving duplicate compatibility modules. For example, `src/extension/*` can become `src/hosts/sillytavern/*`, and `manifest.json` can point to the new SillyTavern entry.

## Host Contract

The first concrete step is to define a host interface that core code depends on.

Draft shape:

```ts
interface DirectiveHost {
  id: 'sillytavern' | 'lumiverse' | 'fake'
  displayName: string
  capabilities: DirectiveHostCapabilities
  logger: DirectiveLogger
  storage: DirectiveStorageAdapter
  events: DirectiveEventAdapter
  generation: DirectiveGenerationClient
  chat: DirectiveChatAdapter
  ui: DirectiveUiAdapter
  theme?: DirectiveThemeAdapter
  jobs?: DirectiveJobAdapter
}
```

Capabilities should be explicit:

```ts
interface DirectiveHostCapabilities {
  storage: {
    json: boolean
    binary: boolean
    list: boolean
    delete: boolean
    verify: boolean
    userScoped: boolean
  }
  generation: {
    currentChatModel: boolean
    quiet: boolean
    raw: boolean
    batch: boolean
    batchConcurrent: boolean
    stream: boolean
    observeMainGeneration: boolean
    connectionProfiles: boolean
    structuredOutput: boolean | 'provider-dependent'
    toolCalling: boolean | 'provider-dependent'
  }
  prompt: {
    contextHandlers: boolean
    interceptors: boolean
    promptBreakdownAttribution: boolean
  }
  tools: {
    registerTools: boolean
    councilEligibleTools: boolean
  }
  ui: {
    panelMount: boolean
    frontendModule: boolean
    backendToFrontendMessages: boolean
  }
  lifecycle: {
    install: boolean
    update: boolean
    enable: boolean
    disable: boolean
    delete: boolean
  }
}
```

Core modules should depend on this contract, not host globals.

## Host Capability Matrix

| Capability | SillyTavern Adapter | Lumiverse Adapter |
|---|---|---|
| Extension descriptor | `manifest.json` | `spindle.json` |
| Main entry | Browser JS extension entry | Spindle backend and frontend entrypoints |
| Storage | `/api/files/upload`, `/api/files/verify`, `/api/files/delete`, and `/user/files/*` reads through a storage adapter | `spindle.storage` for shared extension data and `spindle.userStorage` for user-scoped saves |
| Lifecycle | Manifest hooks and SillyTavern context lifecycle | Spindle install, enable, disable, update, removal lifecycle |
| Events | `ctx.eventSource` and `ctx.event_types` where available | `spindle.on(...)` event subscriptions |
| Main generation observation | Limited and host-version dependent | `spindle.generate.observe(chatId)` |
| Background generation | Current provider calls through context methods, likely sequential or resource-contentious | `spindle.generate.quiet/raw/batch`, including concurrent batch |
| Prompt assembly integration | Future SillyTavern prompt API adapter | Context handlers and interceptors |
| Prompt attribution | Host-dependent and likely weaker | Interceptor breakdown attribution |
| Tools | Future or host-specific | `spindle.registerTool`, council-eligible tools |
| UI | Directive DOM panel mounted into SillyTavern | Frontend module plus backend-to-frontend messages |
| Best first mode | Panel-led play | Panel-led play plus chat-observed sidecars |

## Generation Roles

The provider layer should become a generation role router. Each role has policy and host mapping.

| Role | Blocking | Output | Primary Use | SillyTavern Mapping | Lumiverse Mapping |
|---|---:|---|---|---|---|
| `narration` | Yes after state commit | Prose | Convert committed narrator packet into chat prose | Current provider generation | `spindle.generate.quiet` or role-selected connection |
| `missionDirectorAdvisor` | Optional, time-boxed | Structured JSON | Suggest pressure focus, ambiguity checks, mission consequences | Disabled or sequential utility call at first | `spindle.generate.raw/quiet` sidecar |
| `continuityTracker` | No by default | Structured JSON | Detect continuity deltas, unresolved promises, edits/deletes impact | Post-turn background job | Parallel sidecar job |
| `crewDirector` | No by default | Structured JSON | Track relationship/development implications | Post-turn background job | Parallel sidecar job |
| `shipDirector` | No by default | Structured JSON | Track system strain, ship-state implications | Post-turn background job | Parallel sidecar job |
| `commandLogSummarizer` | No | Prose/JSON | Improve player-facing Command Log text | Post-commit utility call | Sidecar or batch call |
| `recapSummarizer` | No | Structured summary | Long-term memory and save summaries | Deferred job | Deferred job |
| `utilityJson` | Maybe | Structured JSON | Character Creator dossier, import analysis, data repair | Current context provider | `raw/quiet` with structured output where supported |

Role config should include:

- default provider strategy
- max timeout
- max retries
- max tokens
- structured schema
- hidden-data policy
- whether output may enter a state proposal
- whether output may enter narration prompt
- whether output can run during main generation
- fallback behavior when unavailable

## Sidecar Job Contract

Sidecar jobs should be first-class. A job consumes an immutable snapshot and produces a packet.

```ts
interface DirectiveSidecarJob {
  id: string
  type: string
  source: {
    hostId: string
    chatId?: string
    messageId?: string
    turnId?: string
    campaignId?: string
    saveId?: string
  }
  snapshot: {
    campaignState: object
    sceneSnapshot?: object
    turnPacket?: object
    messages?: Array<object>
  }
  policy: {
    blocking: boolean
    timeoutMs: number
    cancelOnChatSwitch: boolean
    mayProposeState: boolean
    mayInjectPrompt: boolean
  }
}
```

Job output:

```ts
interface DirectiveSidecarResult {
  jobId: string
  type: string
  status: 'complete' | 'timeout' | 'cancelled' | 'failed'
  completedAt: string
  diagnostics: {
    providerId?: string
    model?: string
    latencyMs?: number
    tokenUsage?: object
    warningIds?: string[]
  }
  packet?: object
  proposedStateDelta?: object
  playerVisibleSummary?: string
}
```

Important rules:

- Jobs never mutate `campaignState` directly.
- Jobs must carry snapshot ids, turn ids, and message ids so stale results can be rejected.
- Jobs that propose state changes must pass the same validator style as Mission Director turn packets.
- Jobs that complete after the active chat/save has changed become journal-only unless explicitly reconciled.
- Jobs must report progress through `host.jobs` or `host.ui` where available.

## Sidecar Pipeline

The target Lumiverse pipeline:

```text
MESSAGE_SENT
  capture host chat/message ids
  load active Directive save
  build scene snapshot
  start nonblocking sidecars:
    continuityTracker
    crewDirector
    shipDirector
    commandLogSummarizer
  start optional fast blocking sidecar:
    missionDirectorAdvisor, if the host budget allows it
  inject only validated, player-safe context through context handler/interceptor
  observe main generation
  reconcile sidecar results after main generation ends
  create proposed state packets
  commit only validated and user-accepted or policy-approved packets
  update UI, Command Log, and job journal
```

The target SillyTavern pipeline:

```text
player uses Directive panel or chat event is detected
  build scene snapshot
  run deterministic Mission Director
  commit accepted Final Outcome
  generate narration through the configured provider
  run deferred continuity/crew/ship jobs only when they do not block the player
  show progress through the panel
  record sidecar output as proposals or journal notes
```

The key difference is scheduling, not semantics. Lumiverse can run more work in parallel; SillyTavern can run the same job types sequentially or defer them.

## Prompt Integration Policy

Prompt integration must be host-specific but engine-governed.

### SillyTavern

First target:

- Keep the current panel-led loop stable.
- Generate narration after commit.
- Do not depend on prompt injection for the first dual-host milestone.

Later target:

- Add a SillyTavern prompt adapter once the exact prompt API is confirmed.
- Inject only narrator-safe or player-safe context.
- Clear injected context on chat change, generation stop/failure/abort, disable, and delete.
- Add tests proving stale prompt blocks are removed.

### Lumiverse

First target:

- Use Spindle context handlers for data that must affect prompt assembly.
- Use Spindle interceptors for final message injection and Prompt Breakdown attribution.
- Return `breakdown` entries for injected Directive context.
- Set tight interceptor timeouts. A timeout should be a graceful no-op, not a broken generation.

Potential injected blocks:

- `Directive Command Brief`
- `Directive Active Situation`
- `Directive Continuity Watch`
- `Directive Crew Context`
- `Directive Ship State`
- `Directive Narration Guardrails`

Blocks must never contain:

- raw hidden relationship values
- Director-only facts
- unvalidated sidecar speculation presented as truth
- package template internals not revealed to the player

## Storage Plan

The storage repository now uses logical keys instead of SillyTavern-shaped paths such as `/user/files/directive-save-index.v1.json`. Physical paths are a host adapter detail.

Core storage uses logical keys:

```text
system/storage-index.v1.json
indexes/character-creator-drafts.v1.json
indexes/saves.v1.json
saves/{saveId}.v1.json
drafts/character-creator/{draftId}.v1.json
jobs/{campaignId}/{jobId}.v1.json
```

Host adapters map logical keys:

- SillyTavern maps logical keys to flat `directive-...v1.json` filenames under `/user/files/`.
- Lumiverse maps logical keys to `spindle.userStorage` for per-user data and `spindle.storage` for shared extension data.
- Tests assert repository logical keys and only assert SillyTavern `/user/files` paths inside SillyTavern adapter/file-API coverage.

Because Directive is pre-alpha, we should not write complex migration code for old internal dev saves. Add a dev reset note if needed.

## Runtime App Changes

[runtime-app.mjs](../../src/runtime/runtime-app.mjs) accepts a host object instead of separate ad hoc defaults:

```ts
createDirectiveRuntimeApp({
  host,
  packageLoader,
  idFactory,
  now
})
```

The app derives:

- `adapter` from `host.storage`
- `narrationProvider` from `host.generation.role('narration')` or a `GenerationRouter`
- diagnostics from `host.capabilities`
- progress messages through `host.ui` or `host.jobs`

The app no longer imports `createSillyTavernNarrationProvider` directly.

## SillyTavern Adapter Plan

Stage goals:

1. Done: move active SillyTavern bootstrap/lifecycle/event shell implementation to `src/hosts/sillytavern/*`, leaving `src/extension/*` as manifest-facing shims and shared helpers.
2. Done: move the SillyTavern current-chat narration provider to [narration-provider.mjs](../../src/hosts/sillytavern/narration-provider.mjs) and consume it through [generation-client.mjs](../../src/hosts/sillytavern/generation-client.mjs).
3. Done: move the SillyTavern `/api/files/*` physical storage implementation to [file-api.mjs](../../src/hosts/sillytavern/file-api.mjs).
4. Update [manifest.json](../../manifest.json) to point to the new SillyTavern entry.
5. Done: keep runtime shell rendering stable while moving control placement to the shared top-control shell.
6. Done: add a no-host fake adapter for unit tests.
7. Done: add an import-boundary test that fails if non-host core modules import `globalThis.SillyTavern` or `SillyTavern`.

SillyTavern remains the baseline host until Lumiverse reaches parity.

## Lumiverse Adapter Plan

Completed first slice:

1. Added root [spindle.json](../../spindle.json).
2. Added [backend.js](../../src/hosts/lumiverse/backend.js), which creates a `DirectiveHost` using `globalThis.spindle`.
3. Added [frontend.js](../../src/hosts/lumiverse/frontend.js), which registers a Lumiverse drawer-tab status surface.
4. Implemented storage adapters over `spindle.storage` and `spindle.userStorage`.
5. Implemented generation roles over `spindle.generate.quiet`, `raw`, and `batch`, including connection-profile resolution for Lumiverse's raw batch path.
6. Implemented event subscriptions for message and generation lifecycle status.
7. Implemented targeted backend-to-frontend status messaging.
8. Registered the first read-only, council-eligible `directive_get_active_situation` tool with player-safe status only.
9. Installed a fail-open, player-safe prompt-block interceptor so the live permission and timeout path exists without exposing hidden campaign state.
10. Added fake-`spindle` entrypoint tests before live Lumiverse testing.
11. Migrated repository save/draft/index paths to logical keys so Lumiverse storage can persist real campaign data once the runtime bridge calls into it.
12. Ran a first local Lumiverse import/enable/frontend/tool smoke against the active server.
13. Added [runtime-bridge.mjs](../../src/hosts/lumiverse/runtime-bridge.mjs) and wired backend/frontend runtime actions for initialize, quick campaign creation, save/load, panel-led Director turns, Open Orders candidate/assignment actions, narration, diagnostic sidecars, and player-safe summaries.
14. Expanded fake-Spindle entrypoint coverage to prove Lumiverse logical save creation, manual save, load, a panel-led turn, narration through `spindle.generate.quiet`, and two diagnostic sidecars through `spindle.generate.batch({ concurrent: true })`.
15. Added per-user Lumiverse runtime contexts so operator-scoped extension workers can persist campaign saves through `spindle.userStorage` with the authenticated user id.
16. Refreshed live Lumiverse WebSocket smoke for runtime initialize, quick campaign creation, deterministic Director preview, and commit without narration.
17. Added the shared top-control compact shell foundation under `src/ui` and wired the runtime panel to it.
18. Added a Lumiverse browser-bundle wrapper at [frontend.ts](../../src/frontend.ts), changed `spindle.json` to serve `dist/frontend.js`, and confirmed `bun build src/frontend.ts --target browser` can bundle the shared shell source.
19. Replaced the Lumiverse frontend smoke DOM with the shared top-control compact shell under fake-Spindle coverage.
20. Refreshed live Lumiverse import/build smoke, verified rebuilt `dist/frontend.js`, opened the Directive shelf in the browser, and confirmed the shared top-control shell can quick-start and preview a deterministic turn.
21. Replaced the initial no-op interceptor with player-safe prompt blocks built from sanitized Lumiverse runtime summaries under fake-Spindle coverage.
22. Added repeatable live Lumiverse smoke automation with opt-in model-call coverage.
23. Hardened Lumiverse batch sidecars against the real host contract by resolving a connection profile and attaching provider/model metadata before `spindle.generate.batch`.
24. Fixed operator-scoped Lumiverse generation by forwarding the authenticated `userId` into quiet/raw/batch RPCs.
25. Moved active SillyTavern bootstrap, lifecycle, and shell-event implementation under [src/hosts/sillytavern](../../src/hosts/sillytavern), leaving the manifest-facing `src/extension` files as shims.

Next Lumiverse adapter goals:

1. Done: live-smoke registration for the expanded read-only tool set:
   - `directive_search_command_log`
   - `directive_get_crew_context`
   - `directive_get_ship_status`
2. Done: run the repeatable live smoke against the active local server and record prompt dry-run injection evidence.
3. External: run the opt-in live model-call smoke for narration and concurrent sidecars once the local Lumiverse generation connection has valid provider credentials.
4. Done: live-smoke explicit save/load through the default Lumiverse runtime path.
5. Future: live tool invocation coverage requires either a Council/generation smoke path or a Lumiverse test endpoint; local Lumiverse currently exposes direct REST listing, not direct non-generation invocation.

The first Lumiverse milestone should not require every SillyTavern UI detail to be perfect. It should prove install, storage, generation, parallel jobs, event observation, and safe prompt integration.

## Tool And Council Strategy

Lumiverse tools should expose query surfaces, not mutation surfaces.

Implemented first tools under fake-Spindle coverage:

- `directive_get_active_situation`: returns player-safe host/runtime diagnostics and active campaign summary.
- `directive_search_command_log`: searches visible command history.
- `directive_get_crew_context`: returns player-safe crew context without raw relationship values.
- `directive_get_ship_status`: returns player-safe ship state and known constraints.

Avoid early tools that:

- commit outcomes
- reveal hidden state
- rewrite saves
- rerun Mission Director logic from a council member
- make unvalidated Command Decisions

Council or agent output should be treated as counsel. The player and Directive transaction engine remain authoritative.

## State Authority And Reconciliation

Dual-host support increases race risk. The transaction model needs explicit reconciliation rules:

- Every turn, sidecar, and generated packet must carry `campaignState.revision` or equivalent snapshot identity.
- A packet produced from an old revision cannot commit automatically.
- Chat edits and deletes must restore from snapshots or create explicit replacement transactions.
- Narration swipes remain prose-only unless the player explicitly reruns the outcome.
- Sidecar results can become:
  - committed state proposals
  - pending review items
  - Command Log enrichment
  - journal-only diagnostics
  - discarded stale results

The UI should show stale or pending sidecar work as developer/diagnostic status at first, not as confident game truth.

## UI Direction

The user-facing UI should use a modified version of the Saga mobile runtime shell as the shared Directive frontend target, but with Directive-specific top-control navigation.

The top-control model is now a Directive-wide interface rule, not a host-specific preference. Lumiverse uses top-bar navigation inside shelf/sidebar surfaces, so Directive should match that muscle memory in both Lumiverse and SillyTavern. Primary navigation, open controls, close controls, collapse/back controls, refresh/save shortcuts, and overflow affordances belong in the top bar or top-right action cluster. Bottom navigation and bottom-right floating controls should not be introduced for global shell behavior.

This is a product and architecture decision:

- Build one host-neutral responsive Directive shell rather than one SillyTavern UI and one Lumiverse UI.
- Treat the current Lumiverse drawer tab as a smoke surface only; replace it with the shared shell once the panel model is ready.
- Use the Saga mobile shell pattern for compact routing and ergonomics: full-width constrained content, stacked subviews, stable scroll containment, touch-safe controls, and host theme tokens.
- Change the control placement for Directive: the primary nav bar belongs at the top. Navigation, open controls, close controls, back controls, and contextual actions belong in that top bar or a top-right action cluster, not in bottom navigation or bottom-right floating actions.
- Match Lumiverse's sidebar menu convention. The Lumiverse shelf/drawer already orients users around top-bar navigation, so Directive should feel native there rather than importing a bottom-control mobile app pattern.
- Keep desktop as an expansion of the same shell, not a separate product surface. SillyTavern can still mount a wider panel, but its compact mode should use the same route/subview model as Lumiverse.
- Design for Lumiverse's shelf constraint first: no wide-only dashboard assumptions, no separate floating control window, no nested card frames, and no actions that require dragging or resizing.

The modified shell should differ from Saga where Directive's domain requires it:

- Directive's major UI divergence from the Saga mobile model is control placement: Directive is top-control by default, not bottom-control.
- Navigation routes should map to Directive play surfaces, not Saga lore workflows.
- Top navigation should stay short and icon-led: Mission, Crew, Ship, Log, Starships, Settings.
- Subviews should handle review flows: pending outcome, Command Bearing spend, warning confirmation, save/load details, sidecar diagnostics.
- Host status, storage diagnostics, and sidecar progress should live in a compact diagnostics subview instead of competing with the primary play routes.
- Theme should use Directive/Lumiverse/SillyTavern host tokens, not Saga-specific red/gold brand assumptions.
- Mobile-first layout should be the default CSS contract even when mounted inside SillyTavern's wider panel.
- Close, open, collapse, refresh, save, and overflow actions should be designed for top-right placement. Avoid bottom-owned commands unless the action is part of a scroll-local form footer.

Required host-neutral panels:

- Mission
- Crew
- Ship
- Command Log
- Starships
- Settings
- Diagnostics, possibly hidden behind an advanced affordance

Host-specific differences:

- SillyTavern mounts the shared shell into the extension panel and supplies host theme/storage/generation events through its adapter.
- Lumiverse mounts the shared shell inside the Spindle frontend drawer/shelf surface and supplies backend-to-frontend runtime messages through its adapter.
- Lumiverse can show background job progress more naturally, but the UI component that renders progress should be shared.
- Host adapters may provide mount constraints, safe-area values, theme tokens, and transport hooks. They should not fork panel structure.

Settings should avoid a large platform matrix. Prefer:

- Connection status
- Narration model role
- Background intelligence level:
  - Off
  - Standard
  - Full
- Advanced role overrides later

Do not expose every sidecar as a visible toggle in the first iteration.

First shell implementation target:

1. Done: extract host-neutral route metadata under `src/ui`.
2. Done: add a shared compact shell renderer with top navigation, top-right action cluster, and route body slot.
3. Done: port the current SillyTavern runtime panel into that shell without changing gameplay behavior, and anchor the desktop panel at the top-right.
4. Done: replace the temporary Lumiverse `frontend.js` DOM with the same shell mounted through Spindle under fake-Spindle coverage.
5. Done: add fake DOM coverage for route switching, top-right Back behavior, tab text truncation, scroll containment, disabled shell actions, and Lumiverse backend host-message updates.
6. Done: add live Lumiverse smoke that opens the Directive shelf, quick-starts a campaign, previews/commits a turn, and verifies the visible shell state.

## Testing Plan

Add or update tests in this order:

1. `test-host-contract-fake.mjs`
   - Current scaffold proves host contract validation, fake JSON storage, fake generation, event subscriptions, UI progress messages, and capability defaults.
   - After runtime extraction, expand it to prove `createDirectiveRuntimeApp({ host })` can initialize, save, load, preview, commit, narrate, and record provider failure.

2. `test-host-import-boundaries.mjs`
   - Current scaffold allows the known pre-extraction SillyTavern baseline files.
   - Fails when new core modules outside the baseline or future `src/hosts/sillytavern` reference `SillyTavern`.
   - Fails when source modules outside future `src/hosts/lumiverse` reference `spindle`.

3. `test-logical-storage-paths.mjs`
   - Current scaffold proves safe concrete logical keys and rejects unsafe or template-shaped keys.
   - Proves SillyTavern mapping creates safe flat filenames.
   - Proves Lumiverse mapping preserves directory-like logical keys.
   - Repository coverage now proves storage repository code uses logical keys instead of host paths.

4. `test-logical-storage-adapter.mjs`
   - Current scaffold proves logical read/write, clone safety, verify result remapping, delete delegation, and unsupported optional methods.
   - Proves SillyTavern and Lumiverse mappings can sit behind the same storage adapter shape.

5. `test-generation-router.mjs`
   - Current scaffold proves role selection, role overrides, provider adaptation, timeout handling, failure mapping, and provider diagnostics.
   - After structured sidecars exist, expand it to prove structured-output validation.

6. `test-prompt-injection-safety.mjs`
   - Current scaffold proves host prompt blocks reject unsafe audiences, hidden-data flags, and hidden/director-only content keys.
   - Proves injected text and breakdown attribution are generated from player-safe or narrator-safe blocks only.
   - After Lumiverse interceptors exist, expand it to prove host-specific timeout and fail-open behavior.

7. `test-sidecar-job-runner.mjs`
   - Proves parallel execution when the host supports batch concurrency.
   - Proves sequential/deferred execution when it does not.
   - Current scaffold proves stale result rejection, timeout mapping, progress events, and provider failure mapping.
   - After host cancellation APIs exist, expand it to prove cancellation.

8. `test-host-sidecar-orchestrator.mjs`
   - Proves host capabilities choose concurrent Lumiverse-style sidecars and sequential SillyTavern-style sidecars.
   - Proves progress events are forwarded to the host UI adapter with host attribution.
   - Proves explicit force-concurrent overrides remain available for tests and later advanced scheduling.

9. `test-sillytavern-generation-client.mjs`
   - Current scaffold uses stub SillyTavern contexts to prove narration, utility role generation, message prompt conversion, `generateText` fallback, and provider-unavailable errors.

10. `test-sillytavern-host-adapter.mjs`
   - Current scaffold is `test-sillytavern-host-factory.mjs`.
   - Uses a stub SillyTavern context.
   - Proves logical storage path mapping, event subscription cleanup, current-provider narration, UI progress forwarding, and shared host contract validation.
   - Future live host tests should add real extension menu mounting, disable cleanup, file API calls, and current runtime smoke coverage after extraction.

11. `test-lumiverse-host-adapter.mjs`
   - Uses a stub `spindle`.
   - Current scaffold is split across `test-lumiverse-storage-adapter.mjs`, `test-lumiverse-generation-client.mjs`, `test-lumiverse-events-adapter.mjs`, `test-lumiverse-interceptor-adapter.mjs`, `test-lumiverse-prompt-blocks.mjs`, `test-lumiverse-tools-adapter.mjs`, `test-lumiverse-host-factory.mjs`, and `test-lumiverse-entrypoints.mjs`.
   - Storage tests prove user-scoped storage options, shared storage, JSON convenience methods, text fallback methods, list, verify, delete, and unsafe path rejection.
   - Generation tests prove quiet generation, raw generation, generation observation, connection/tool parameter passthrough, concurrent batch requests, and failed batch item diagnostics.
   - Event tests prove aliases, subscription cleanup, many-event subscriptions, and full disposal.
   - Interceptor tests prove shared prompt safety, breakdown attribution, and fail-open behavior.
   - Tool tests prove registration, council eligibility, invocation routing, unknown-tool handling, and cleanup.
   - Host factory tests prove a fake-Spindle Lumiverse host validates against the shared host contract.
   - Entrypoint tests prove `spindle.json`, backend startup under fake `spindle`, targeted frontend replies, safe tool/interceptor registration, and drawer-tab frontend setup.
   - Future live host tests should add real import/install, permission grant, backend startup, frontend module loading, and lifecycle cleanup.

12. `test-lumiverse-prompt-safety.mjs`
   - Proves context handler/interceptor outputs use the shared prompt block safety contract.
   - Proves timeout behavior is fail-open and logs diagnostics.

13. `test-runtime-host-injection.mjs`
   - Proves the active runtime can initialize from `createDirectiveRuntimeApp({ host })`, expose host metadata, run a Director turn, and narrate through the host generation client.

14. `test-dual-host-scaffold.mjs`
   - Runs the dual-host scaffold suite from the alpha gate.

15. [run-alpha-gate.mjs](../../tools/scripts/run-alpha-gate.mjs)
   - Includes Stage 29/30 pressure handoff, Stage 30 hygiene, dual-host scaffold, runtime host injection, and the existing runtime mission-flow tests.

## Documentation Updates

After the first host extraction and Lumiverse packaging slice:

- Done: update [README.md](../../README.md) from "SillyTavern extension project" to "host-portable extension engine with SillyTavern and Lumiverse host adapters".
- Done: update [Source Architecture](../architecture/SOURCE_ARCHITECTURE.md) to include `src/hosts`, `src/jobs`, and generation roles.
- Done: update [Testing Strategy](../testing/TESTING_STRATEGY.md) with host adapter tests and Lumiverse-specific smoke coverage.
- Done: add [Lumiverse Installation And Smoke Testing](../user/LUMIVERSE_INSTALLATION.md) covering local import/install, permission grant, enable/restart, smoke commands, and troubleshooting.
- Keep public-facing language simple. Users should not need to know the whole host abstraction.

## Implementation Phases

### Phase 0: Confirm Host Surface

Goal: verify the current Lumiverse API before coding against it.

Work:

- Re-check Lumiverse Spindle docs and source.
- Identify required permissions for generation, events, storage, tools, context handlers, and interceptors.
- Decide whether the Lumiverse adapter source should be TypeScript, JavaScript, or a small generated bundle.
- Decide whether Lumiverse support lives in the same repo root or a package subfolder.

Exit:

- Confirmed host API notes in this document or a follow-up architecture doc.
- Known minimum Lumiverse commit or version target.

### Phase 1: Host Contract Extraction

Goal: make the existing SillyTavern path use a formal host object.

Work:

- Add `src/hosts/host-contract.mjs`.
- Add fake host test utilities.
- Move SillyTavern lifecycle, events, storage, and generation into `src/hosts/sillytavern`.
- Update `createDirectiveRuntimeApp` to require or construct a host object.
- Replace direct app defaults for storage and provider with host-derived dependencies.
- Keep existing runtime UI behavior stable.

Exit:

- Current SillyTavern behavior still passes tests.
- Core modules no longer directly reference SillyTavern globals.

### Phase 2: Logical Storage

Goal: remove host paths from core storage semantics.

Status: implemented for repository save/draft/index paths, SillyTavern logical-to-physical mapping, Lumiverse logical storage adapter shape, focused gate coverage, and live Lumiverse runtime persistence through per-user `spindle.userStorage`.

Work:

- Add logical storage keys.
- Update save/draft/index code to use logical keys.
- Implement SillyTavern mapping.
- Add fake and Lumiverse mapping tests.
- Since this is pre-alpha, reset or rewrite dev storage assumptions rather than carrying old path compatibility.

Exit:

- Storage repository tests pass through fake and SillyTavern adapters.
- No core test asserts `/user/files/*` except SillyTavern adapter tests.

### Phase 3: Generation Router

Goal: support multiple model-call roles without hardcoding platform behavior.

Work:

- Add generation role definitions.
- Add role router.
- Convert narration provider calls to `generationRouter.generate('narration', ...)`.
- Add structured-output validation helpers.
- Add role diagnostics to narration failure records and future sidecar records.

Exit:

- Narration tests pass through the role router.
- Utility roles can be faked in tests.

### Phase 4: Sidecar Job Runner

Goal: create the async model for Mission Director, continuity, crew, ship, and summarizer sidecars.

Work:

- Add job contract and runner.
- Add progress events.
- Add cancellation and stale-result policy.
- Implement fake sidecar roles with deterministic fixtures.
- Add job journal storage.
- Add a compact shared-shell status surface for active and recent jobs.

Exit:

- Fake host can run sidecars concurrently.
- SillyTavern fake can run them sequentially.
- Stale jobs cannot commit state.

### Phase 5: SillyTavern Stabilization

Goal: ensure the existing host remains solid after abstraction.

Work:

- Re-run the full alpha gate.
- Verify lifecycle disable/delete/clean hides UI and clears host-owned prompts or jobs.
- Verify chat-change refresh and job cancellation.
- Verify provider failures remain retryable and do not damage state.
- Verify no host adapter code leaked into core modules.

Exit:

- SillyTavern support is no worse than before the extraction.
- The abstraction has not introduced a user-visible regression.

### Phase 6: Lumiverse Spike

Goal: prove the minimum Lumiverse integration.

Completed first-slice work:

- Add `spindle.json`.
- Add Lumiverse backend and frontend entrypoints.
- Implement storage over `spindle.storage` or `spindle.userStorage`.
- Implement generation adapters for quiet, raw, and batch model calls.
- Implement basic event subscription.
- Implement backend-to-frontend status messages.
- Mount a minimal Lumiverse drawer-tab status UI.
- Register one player-safe read-only tool.
- Register a no-op fail-open interceptor so permission and timeout behavior is exercised without injecting state.
- Bridge the shared runtime app into targeted backend/frontend messages.
- Create, save, and load Directive saves through Lumiverse logical user storage under fake-Spindle coverage.
- Run a panel-led Mission turn and generate narration through `spindle.generate.quiet` under fake-Spindle coverage.
- Run two diagnostic sidecars through `spindle.generate.batch({ concurrent: true })` under fake-Spindle coverage.
- Add a bundle-safe frontend wrapper that Lumiverse can build to `dist/frontend.js`.
- Mount the shared top-control compact shell in the Lumiverse drawer-tab frontend under fake-Spindle coverage.
- Register the first focused player-safe read-only query tools for command-log search, crew context, and ship status under fake-Spindle coverage.
- Replace the no-op interceptor with player-safe prompt blocks from sanitized runtime summaries under fake-Spindle coverage.

Remaining work:

- Run opt-in live Lumiverse narration and sidecar model-output smoke after provider credentials are valid.
- Add live invocation coverage for expanded player-safe read-only tools only if Lumiverse adds a non-generation test surface or we intentionally exercise a Council/generation path.

Exit:

- Lumiverse can install or import Directive.
- Lumiverse can enable Directive with the required permissions.
- Directive can render the shared top-control compact shell inside the Lumiverse shelf/drawer. Runtime-panel, fake-Spindle frontend coverage, rebuilt bundle serving, and live shelf rendering now exist.
- Directive can create/save/load a save. Fake-Spindle coverage and default live smoke now prove quick campaign save creation, manual save, and load.
- Directive can run one panel-led Mission turn. Fake-Spindle coverage exists; live smoke now proves preview and commit without narration.
- Directive can generate narration. Fake-Spindle coverage exists; live smoke still needs this action.
- Directive can run at least two sidecar jobs in parallel and record their results without committing unsafe state. Fake-Spindle coverage exists; live smoke still needs this action.

### Phase 7: Lumiverse Prompt And Agent Integration

Goal: use Lumiverse features that SillyTavern does not provide as cleanly.

Work:

- Add a context handler for active Directive state.
- Add an interceptor for player-safe Directive prompt blocks with breakdown attribution.
- Register read-only Directive tools.
- Mark safe tools council-eligible.
- Observe main generation for progress and reconciliation.
- Add prompt safety tests.

Exit:

- Lumiverse can use Directive context in normal chat generation.
- Prompt Breakdown shows Directive attribution.
- Council/agent tools can query player-safe Directive context.
- Hidden data remains protected.

### Phase 8: Chat-Observed Turn Loop

Goal: allow ordinary host chat to drive Directive, not only the panel.

Work:

- Define how a player chat message becomes a Directive scene snapshot.
- Define when a chat message creates a Provisional Outcome versus a background observation.
- Decide which outcomes require player confirmation.
- Add edit/delete/swipe reconciliation for host chat messages.
- Add UI affordances for reviewing pending outcomes.

Exit:

- A normal Lumiverse chat turn can produce Directive context, sidecar analysis, and a reviewable state proposal.
- Committing the proposal follows the same transaction rules as panel-led play.

### Phase 9: Runtime Parity And Polish

Goal: make both hosts feel intentional.

Work:

- Align panel layout, labels, and settings across hosts.
- Refresh live Lumiverse against the rebuilt shared top-control compact shell.
- Add host diagnostics.
- Add user-facing setup docs.
- Add host-specific smoke tests.
- Add release checklist items for both hosts.

Exit:

- Both hosts are documented.
- Both hosts pass the relevant gate.
- Host-specific differences are deliberate, not accidental.

## MVP Definition

The first credible dual-host milestone is not full feature parity. It is:

- SillyTavern still runs the existing panel-led flow.
- Lumiverse installs Directive through Spindle.
- Lumiverse can open the shared top-control compact Directive shell.
- Lumiverse can create/load a campaign save.
- Lumiverse can run a panel-led Mission turn.
- Lumiverse can generate narration through `spindle.generate.quiet`.
- Lumiverse can run at least two background sidecar calls concurrently.
- Sidecar results are visible as job records or diagnostics.
- No sidecar can directly mutate state.
- Prompt injection is either disabled or passes hidden-data safety tests.
- The alpha gate includes host boundary tests.

Current state: create/manual-save/load, panel-led turn, quiet narration, concurrent sidecar items, bundle-safe frontend source, Open Orders control dispatch including Advance Scene, and the shared top-control compact shell are proven under fake-Spindle entrypoint coverage. A browser-target Bun build of the frontend wrapper also succeeds. Default live Lumiverse smoke now proves install/enable/frontend/tool registration, rebuilt bundle serving with top-control, Open Orders, and Advance Scene markers, quick campaign creation, explicit manual save, explicit load, deterministic Director preview, commit without narration, and prompt-block dry-run injection. Local Lumiverse source review shows direct tool invocation is Council/generation-routed rather than a standalone REST smoke target. Live narration and live sidecars remain pending on a valid Lumiverse generation provider connection.

## Open Decisions

- How should host-specific CSS/theme tokens be mapped into the shared top-control compact shell?
- What, if anything, should use shared `spindle.storage` versus per-user `spindle.userStorage` now that campaign saves are user-scoped?
- Are `generation`, `interceptor`, and `tools` acceptable for the first public Lumiverse release, or should `interceptor` remain optional until prompt injection carries real state?
- Should Lumiverse chat-observed play auto-create pending outcomes, or should it require explicit user review every time?
- Which non-control compact-shell interaction details from the prior mobile model should be carried forward after preserving Directive's resolved top-control navigation rule?
- Should `missionDirectorAdvisor` ever be blocking, or should deterministic Mission Director remain the only blocking authority?

## Risks

- Lumiverse API churn. Mitigation: keep the adapter thin, re-check docs before implementation, and isolate all Spindle calls.
- Hidden state leakage through prompt injection. Mitigation: reuse narrator safety checks, add prompt-block validators, and require breakdown tests.
- Race conditions from parallel sidecars. Mitigation: immutable snapshots, state revisions, stale-result rejection, and explicit reconciliation.
- Increased token cost. Mitigation: role budgets, adaptive sidecar scheduling, caching, and background intelligence levels.
- User confusion from too many controls. Mitigation: internal defaults first, advanced overrides later.
- SillyTavern regression during extraction. Mitigation: fake host tests, SillyTavern adapter tests, and current runtime smoke coverage.
- Sidecar outputs contradict deterministic rules. Mitigation: sidecars produce proposals only; validators and transactions remain authoritative.
- Long-running work feels frozen. Mitigation: job progress events, heartbeat status, cancellation, and short blocking budgets.

## Near-Term Work List

Recommended next tasks:

1. Done: add `src/hosts/host-contract.mjs`, fake host utilities, and fake host tests.
2. Done: add import-boundary tests with explicit transitional SillyTavern allowlist.
3. Done: add `generation-router.mjs` and generation role definitions.
4. Done: add prompt injection safety contracts and Lumiverse fail-open interceptor adapters.
5. Done: add SillyTavern storage, event, generation, UI-progress, and host-factory wrappers under `src/hosts/sillytavern`.
6. Done: add sidecar job contracts, fake deterministic sidecar runner tests, and host-aware sidecar orchestration.
7. Done: add logical storage key mapping and logical storage adapter tests.
8. Done: add Lumiverse storage, generation, event, interceptor, tool, UI-progress, and host-factory adapters behind tests with fake `spindle`.
9. Done: update `createDirectiveRuntimeApp` and the SillyTavern bootstrap to consume a `DirectiveHost`.
10. Done: add root `spindle.json`, Lumiverse backend/frontend source entrypoints, and entrypoint tests.
11. Done: probe the local Lumiverse server for import/install, enable, permission grant, frontend bundle serving, backend startup, and drawer-tab visibility.
12. Done: move remaining SillyTavern boot/event/lifecycle shell implementation under `src/hosts/sillytavern`, leaving `src/extension` as manifest-facing shims.
13. Done: convert storage repository save/draft/index paths to logical keys and keep SillyTavern `/user/files` paths in the host adapter chain.
14. Done: bridge the runtime UI/state model into Lumiverse so it can initialize, create saves, preview a Director turn, and commit a panel-led Mission turn.
15. Done: add the shared top-control compact shell foundation and wire it into the runtime panel.
16. Done: add a bundle-safe Lumiverse frontend path and replace the temporary smoke UI with the shared top-control compact shell under fake-Spindle coverage.
17. Done: refresh live Lumiverse import/build smoke and prove the rebuilt shelf renders the shared top-control compact shell.
18. Done: add player-safe Lumiverse read-only tools for active situation, command-log search, crew context, and ship status under fake-Spindle coverage.
19. Done: live-smoke expanded read-only tool registration in Lumiverse after import/restart.
20. Done: replace the Lumiverse no-op interceptor with player-safe context blocks from sanitized runtime summaries under fake-Spindle coverage.
21. Done: live-smoke prompt-block injection from the rebuilt Lumiverse runtime path through the repeatable default smoke.
22. Done: add explicit manual save/load coverage to fake-Spindle Lumiverse entrypoint tests and the repeatable live Lumiverse smoke runner.
23. Done: live-smoke explicit manual save/load through the refreshed default Lumiverse runtime path.
24. Done: review local Lumiverse tool execution surfaces; direct registered-tool listing exists, while invocation is Council/generation-routed via `TOOL_INVOCATION` rather than a direct non-generation REST endpoint.
25. External dependency: live-smoke narration and concurrent sidecar model output once the local Lumiverse generation connection has valid provider credentials.

This sequence keeps one repo and two host adapters. Live narration and live sidecar model output are now gated by the local Lumiverse provider credentials rather than by missing Directive adapter code.
