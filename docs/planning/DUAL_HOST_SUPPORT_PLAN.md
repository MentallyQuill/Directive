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

Open packaging question: whether Lumiverse support should live beside the SillyTavern artifact at the repo root or under a package subfolder. That is a layout decision, not a product split.

## Integration Boundary With Stage 29 And Stage 30

Dual-host work should not interrupt the current Stage 29 and Stage 30 track.

Stage 29 and Stage 30 remain focused on Chapter 1 consequence/pressure handoff, robustness, documentation hardening, and alpha-readiness gates. The dual-host plan is cross-cutting architecture work that should be queued behind that active path unless the change is documentation-only or test-scaffold-only.

Until Stage 30 is complete, dual-host integration should be limited to:

- Documentation references and architecture notes.
- Fake-host contract sketches that do not change runtime behavior.
- Unwired host adapter wrappers that use fake or injected host APIs and do not register entrypoints.
- Import-boundary or planning tests that are not wired into the main gate yet.
- Naming and directory planning that does not require moving current SillyTavern files.

It should not yet:

- Move `src/extension/*`.
- Rewrite storage paths.
- Change `createDirectiveRuntimeApp(...)` defaults.
- Add `spindle.json` or Lumiverse entrypoints.
- Change `run-alpha-gate.mjs`.
- Change Stage 29/30 package data, pressure ledgers, Chapter 1 fixtures, or runtime mission flow.

The first runtime integration phase for dual-host support should start after the Stage 30 gate is stable, or in a separate branch/worktree if it must begin earlier. Pre-Stage-30 work may include isolated host-contract, adapter, storage, generation, prompt-safety, and sidecar scaffolds only when they compile independently and do not alter SillyTavern runtime behavior.

## Current Scaffold Status

The following isolated pieces now exist and are intentionally not wired into the active runtime or alpha gate:

- [host-contract.mjs](../../src/hosts/host-contract.mjs) defines the first `DirectiveHost` capability and adapter contract scaffold.
- [fake-host.mjs](../../src/hosts/fake/fake-host.mjs) provides a test-only host, in-memory JSON storage, event emitter, UI message sink, and fake generation client.
- [generation-client.mjs](../../src/hosts/sillytavern/generation-client.mjs) wraps the current SillyTavern generation surface behind the host generation client shape without changing runtime defaults.
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
- [sidecar-job-contracts.mjs](../../src/jobs/sidecar-job-contracts.mjs) and [sidecar-job-runner.mjs](../../src/jobs/sidecar-job-runner.mjs) define background job packets, stale-result detection, sequential execution, and concurrent execution.
- [logical-storage-paths.mjs](../../src/storage/logical-storage-paths.mjs) defines concrete logical storage keys and first-pass host mapping helpers.
- [logical-storage-adapter.mjs](../../src/storage/logical-storage-adapter.mjs) wraps a host storage adapter so future repository code can use logical keys while host adapters own physical path mapping.
- [test-host-import-boundaries.mjs](../../tools/scripts/test-host-import-boundaries.mjs) is a transitional verifier that allows known SillyTavern baseline files while failing new host-global leakage into core modules.

These files are safe pre-Stage-30 scaffolding. They should stay isolated until the Stage 30 gate is stable, then become the migration target for the real SillyTavern extraction and Lumiverse adapter spike.

## Current Baseline

Directive already has several boundaries that make dual-host support realistic:

- The Mission Director core is deterministic and host-independent: [director-turn-runtime.mjs](../../src/runtime/director-turn-runtime.mjs), [director.mjs](../../src/mission/director.mjs), and [transaction-state.mjs](../../src/campaign/transaction-state.mjs).
- Narration is post-commit and provider-injected: [narration.mjs](../../src/generation/narration.mjs) accepts a provider object and records provider failure without losing committed mechanics.
- The runtime app already accepts a storage adapter and narration provider: [runtime-app.mjs](../../src/runtime/runtime-app.mjs).
- Storage repository logic is mostly adapter-driven: [directive-storage-repository.mjs](../../src/storage/directive-storage-repository.mjs).
- Tests already assert state safety, provider failure behavior, transaction rollback, storage adapter behavior, and package/mission contracts.

The main host-specific seams are still too implicit:

- [bootstrap.js](../../src/extension/bootstrap.js) directly looks for `globalThis.SillyTavern.getContext()`.
- [events.js](../../src/extension/events.js) directly wires SillyTavern-style event sources.
- [directive-file-api.mjs](../../src/storage/directive-file-api.mjs) directly assumes SillyTavern `/api/files/*` paths and request headers.
- [sillytavern-narration-provider.mjs](../../src/providers/sillytavern-narration-provider.mjs) is the runtime default provider.
- [manifest.json](../../manifest.json) is a SillyTavern manifest, not a host-neutral extension descriptor.
- Public docs still describe Directive as a SillyTavern extension rather than a host-portable engine with a SillyTavern adapter.

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

Reference points:

- Lumiverse repo: <https://github.com/prolix-oc/Lumiverse>
- Lifecycle docs: <https://github.com/prolix-oc/Lumiverse/blob/main/developer-docs/docs/lifecycle.md>
- Generation docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/backend-api/generation.md>
- Events docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/backend-api/events.md>
- Interceptor docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/backend-api/interceptors.md>
- Tool docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/backend-api/llm-tools.md>
- Storage docs: <https://raw.githubusercontent.com/prolix-oc/Lumiverse/main/developer-docs/docs/backend-api/storage.md>

These references were reviewed on 2026-06-19. Lumiverse is active, so the exact API surface should be re-checked before implementation.

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
      spindle.json
      backend.ts
      frontend.ts
      storage-adapter.ts
      generation-client.ts
      events.ts
      interceptors.ts
      tools.ts
      ui-bridge.ts

  runtime/
    runtime-app.mjs
    runtime-actions.js
    runtime-shell.js
    director-turn-runtime.mjs

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

The current repository uses SillyTavern-shaped paths such as `/user/files/directive-save-index.v1.json`. That should become a host adapter detail.

Core storage should use logical keys:

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
- Tests should not assert SillyTavern paths except inside the SillyTavern adapter tests.

Because Directive is pre-alpha, we should not write complex migration code for old internal dev saves. Add a dev reset note if needed.

## Runtime App Changes

[runtime-app.mjs](../../src/runtime/runtime-app.mjs) should accept a host object instead of separate ad hoc defaults:

```ts
createDirectiveRuntimeApp({
  host,
  packageLoader,
  idFactory,
  now
})
```

Then derive:

- `adapter` from `host.storage`
- `narrationProvider` from `host.generation.role('narration')` or a `GenerationRouter`
- diagnostics from `host.capabilities`
- progress messages through `host.ui` or `host.jobs`

The app should not import `createSillyTavernNarrationProvider` directly.

## SillyTavern Adapter Plan

Stage goals:

1. Move `src/extension/*` to `src/hosts/sillytavern/*`.
2. Move [sillytavern-narration-provider.mjs](../../src/providers/sillytavern-narration-provider.mjs) to the SillyTavern host adapter or wrap it as `sillytavern/generation-client.mjs`.
3. Move [directive-file-api.mjs](../../src/storage/directive-file-api.mjs) into the SillyTavern adapter or split it into generic helpers plus a SillyTavern-specific implementation.
4. Update [manifest.json](../../manifest.json) to point to the new SillyTavern entry.
5. Keep runtime shell rendering unchanged for the first pass.
6. Add a no-host fake adapter for unit tests.
7. Add an import-boundary test that fails if non-host core modules import `globalThis.SillyTavern` or `SillyTavern`.

SillyTavern remains the baseline host until Lumiverse reaches parity.

## Lumiverse Adapter Plan

Stage goals:

1. Add a Lumiverse package descriptor plan and then a real `spindle.json`.
2. Build a backend entrypoint that creates a `DirectiveHost` using `spindle`.
3. Build a frontend entrypoint that mounts the Directive runtime UI or a Lumiverse-specific shell.
4. Implement storage over `spindle.storage` and `spindle.userStorage`.
5. Implement generation roles over `spindle.generate.quiet`, `raw`, and `batch`.
6. Implement event subscriptions for chat lifecycle and generation lifecycle.
7. Implement backend-to-frontend progress messages.
8. Register initial Directive tools:
   - `directive_get_active_situation`
   - `directive_search_command_log`
   - `directive_get_crew_context`
   - `directive_get_ship_status`
9. Mark safe tools council-eligible once output boundaries are proven.
10. Implement a context handler or interceptor for player-safe Directive context.
11. Add tests using a fake `spindle` object before testing inside a live Lumiverse instance.

The first Lumiverse milestone should not require every SillyTavern UI detail to be perfect. It should prove install, storage, generation, parallel jobs, event observation, and safe prompt integration.

## Tool And Council Strategy

Lumiverse tools should expose query surfaces, not mutation surfaces.

Good first tools:

- `directive_get_active_situation`: returns player-safe mission phase, visible pressures, available orders, and recent Command Log continuity.
- `directive_search_command_log`: retrieves visible command history.
- `directive_get_crew_context`: returns player-safe crew context for named officers.
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

The user-facing UI should stay compact.

Required host-neutral panels:

- Mission
- Crew
- Ship
- Command Log
- Starships
- Settings
- Diagnostics, possibly hidden behind an advanced affordance

Host-specific differences:

- SillyTavern mounts the existing DOM panel.
- Lumiverse can use a frontend module with backend-to-frontend messages.
- Lumiverse can show background job progress more naturally.

Settings should avoid a large platform matrix. Prefer:

- Connection status
- Narration model role
- Background intelligence level:
  - Off
  - Standard
  - Full
- Advanced role overrides later

Do not expose every sidecar as a visible toggle in the first iteration.

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
   - After repository migration, expand it to prove storage repository code uses logical keys instead of host paths.

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

8. `test-sillytavern-generation-client.mjs`
   - Current scaffold uses stub SillyTavern contexts to prove narration, utility role generation, message prompt conversion, `generateText` fallback, and provider-unavailable errors.

9. `test-sillytavern-host-adapter.mjs`
   - Current scaffold is `test-sillytavern-host-factory.mjs`.
   - Uses a stub SillyTavern context.
   - Proves logical storage path mapping, event subscription cleanup, current-provider narration, UI progress forwarding, and shared host contract validation.
   - Future live host tests should add real extension menu mounting, disable cleanup, file API calls, and current runtime smoke coverage after extraction.

10. `test-lumiverse-host-adapter.mjs`
   - Uses a stub `spindle`.
   - Current scaffold is split across `test-lumiverse-storage-adapter.mjs`, `test-lumiverse-generation-client.mjs`, `test-lumiverse-events-adapter.mjs`, `test-lumiverse-interceptor-adapter.mjs`, `test-lumiverse-tools-adapter.mjs`, and `test-lumiverse-host-factory.mjs`.
   - Storage tests prove user-scoped storage options, shared storage, JSON convenience methods, text fallback methods, list, verify, delete, and unsafe path rejection.
   - Generation tests prove quiet generation, raw generation, generation observation, connection/tool parameter passthrough, concurrent batch requests, and failed batch item diagnostics.
   - Event tests prove aliases, subscription cleanup, many-event subscriptions, and full disposal.
   - Interceptor tests prove shared prompt safety, breakdown attribution, and fail-open behavior.
   - Tool tests prove registration, council eligibility, invocation routing, unknown-tool handling, and cleanup.
   - Host factory tests prove a fake-Spindle Lumiverse host validates against the shared host contract.
   - Future live host tests should add real backend startup, frontend module loading, manifest permissions, and lifecycle cleanup.

11. `test-lumiverse-prompt-safety.mjs`
   - Proves context handler/interceptor outputs use the shared prompt block safety contract.
   - Proves timeout behavior is fail-open and logs diagnostics.

12. Update [run-alpha-gate.mjs](../../tools/scripts/run-alpha-gate.mjs)
   - Include host contract, import boundary, router, and sidecar tests once they exist.

## Documentation Updates

After the first host extraction:

- Update [README.md](../../README.md) from "SillyTavern extension project" to "host-portable extension engine with first SillyTavern support".
- Update [Source Architecture](../architecture/SOURCE_ARCHITECTURE.md) to include `src/hosts`, `src/jobs`, and generation roles.
- Update [Testing Strategy](../testing/TESTING_STRATEGY.md) with host adapter tests and Lumiverse-specific smoke coverage.
- Add a Lumiverse installation document once `spindle.json` exists.
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
- Add a compact UI status surface for active and recent jobs.

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

Work:

- Add `spindle.json`.
- Add Lumiverse backend and frontend entrypoints.
- Implement storage over `spindle.storage` or `spindle.userStorage`.
- Implement quiet narration generation.
- Implement batch sidecar generation with fake or low-risk sidecar prompts.
- Implement basic event subscription.
- Implement backend-to-frontend status messages.
- Mount a minimal Directive UI or bridge to the existing runtime panels.

Exit:

- Lumiverse can install Directive.
- Directive can create/load a save.
- Directive can run one panel-led Mission turn.
- Directive can generate narration.
- Directive can run at least two sidecar jobs in parallel and record their results without committing unsafe state.

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
- Lumiverse can open the Directive UI.
- Lumiverse can create/load a campaign save.
- Lumiverse can run a panel-led Mission turn.
- Lumiverse can generate narration through `spindle.generate.quiet`.
- Lumiverse can run at least two background sidecar calls concurrently.
- Sidecar results are visible as job records or diagnostics.
- No sidecar can directly mutate state.
- Prompt injection is either disabled or passes hidden-data safety tests.
- The alpha gate includes host boundary tests.

## Open Decisions

- Should Lumiverse support live in the same source tree or a generated package folder?
- Should the Lumiverse adapter be TypeScript-first because Lumiverse is TypeScript/Bun, or should Directive stay JavaScript-first and bundle only adapter glue?
- How should host-specific CSS/theme tokens be mapped?
- Should `spindle.userStorage` or `spindle.storage` own campaign saves for operator-scoped installs?
- Which Lumiverse permissions are acceptable for the first release?
- Should Lumiverse chat-observed play auto-create pending outcomes, or should it require explicit user review every time?
- How much of the existing runtime shell should be reused versus rewritten as a Lumiverse-native frontend module?
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

1. Done pre-Stage-30: add `src/hosts/host-contract.mjs`, fake host utilities, and fake host tests.
2. Done pre-Stage-30: add import-boundary tests with explicit transitional SillyTavern allowlist.
3. Done pre-Stage-30: add `generation-router.mjs` and generation role definitions without runtime wiring.
4. Done pre-Stage-30: add prompt injection safety contracts without adding host interceptors.
5. Done pre-Stage-30: add unwired SillyTavern storage, event, generation, UI-progress, and host-factory wrappers under `src/hosts/sillytavern`.
6. Done pre-Stage-30: add sidecar job contracts and fake deterministic sidecar runner tests without runtime wiring.
7. Done pre-Stage-30: add logical storage key mapping and logical storage adapter tests without changing active storage paths.
8. Done pre-Stage-30: add Lumiverse storage, generation, event, interceptor, tool, UI-progress, and host-factory adapter spikes behind tests with fake `spindle`.
9. After Stage 30: move SillyTavern boot/event/provider/storage code under `src/hosts/sillytavern`.
10. After Stage 30: update `createDirectiveRuntimeApp` to consume `host`.
11. After Stage 30: convert storage repository paths to logical keys.
12. After Stage 30: convert narration to the generation router.
13. After Stage 30: add real Lumiverse backend/frontend entrypoints, permissions, lifecycle cleanup, and live-host smoke tests.
14. After fake and live Lumiverse adapter tests pass: add the first real `spindle.json`.

This sequence preserves momentum while keeping the hardest Lumiverse-specific work behind a clean host contract.
