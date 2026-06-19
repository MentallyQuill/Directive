# Lumiverse Installation And Smoke Testing

Directive's Lumiverse support lives in this repo beside the SillyTavern extension. The shared engine is the same; Lumiverse uses the root `spindle.json` descriptor and the host adapter under `src/hosts/lumiverse`.

This guide describes the current pre-alpha local workflow. It is not a public marketplace release process yet.

## Requirements

- A running Lumiverse server.
- A Lumiverse account with permission to install, enable, and grant permissions for Spindle extensions.
- The Directive repo available locally or from a Git URL Lumiverse can install.
- A valid Lumiverse generation connection only if you intend to run live narration or sidecar model-call smoke tests.

## Install Or Refresh

1. Open Lumiverse.
2. Import or install Directive through Spindle.
3. Confirm Lumiverse reads the root `spindle.json`.
4. Grant the requested permissions:
   - `generation`
   - `interceptor`
   - `tools`
5. Enable or restart Directive.
6. Open the **Directive** drawer tab.

The Directive tab should render the shared bottom-navigation compact shell. Its bottom route bar should include **Starships**, **Mission**, **Crew**, **Ship**, **Log**, and **Settings**.

## Runtime Smoke

From the repo root, run the default no-generation smoke:

```powershell
$env:LUMIVERSE_BASE_URL='http://localhost:7860'
$env:LUMIVERSE_USERNAME='<username>'
$env:LUMIVERSE_PASSWORD='<password>'
$env:DIRECTIVE_LIVE_GENERATION='0'
node tools\scripts\smoke-lumiverse-live.mjs
```

The default smoke checks:

- Sign-in.
- Spindle import or restart, while preserving an existing local-dev/dev-mode Directive extension by default.
- Permission grant.
- Frontend bundle serving from `dist/frontend.js`.
- Registered Directive tools.
- Runtime initialize.
- Quick campaign creation.
- Manual save.
- Load by save id.
- Deterministic Director preview.
- Commit without narration.
- Prompt dry-run injection with player-safe Directive context when a local chat is available.

Use `DIRECTIVE_LUMIVERSE_IMPORT=0` when you want the smoke to reuse the currently installed extension without calling Lumiverse's import-local endpoint. Use `DIRECTIVE_LUMIVERSE_PRESERVE_DEV_MODE=0` only when you intentionally want import-local to run even though the existing Directive extension row looks like a local-dev install.

## Optional Live Generation Smoke

Live narration and sidecar model calls are opt-in:

```powershell
$env:DIRECTIVE_LIVE_GENERATION='1'
node tools\scripts\smoke-lumiverse-live.mjs
```

This path exercises:

- `spindle.generate.quiet` narration.
- `spindle.generate.batch({ concurrent: true })` sidecar calls.

If the configured Lumiverse provider rejects the request, treat that as a host/provider credential issue unless the error points to a Directive bridge failure. The default smoke should continue to pass without model calls.

## Tool Coverage

Directive currently registers these player-safe read-only tools:

- `directive_get_active_situation`
- `directive_search_command_log`
- `directive_get_crew_context`
- `directive_get_ship_status`

Lumiverse exposes direct REST listing through `/api/v1/spindle/tools`. Extension tool invocation is routed through Council/generation internals via `TOOL_INVOCATION`, not through a direct non-generation REST endpoint. Fake-Spindle tests cover tool invocation; live non-spending invocation coverage requires a Lumiverse test hook or an intentional Council/generation smoke.

## Expected Storage Behavior

Lumiverse campaign data should use user-scoped Spindle storage through host-neutral logical keys such as:

```text
indexes/saves.v1.json
saves/{saveId}.v1.json
```

The Directive runtime and docs should not require Lumiverse users to know SillyTavern `/user/files` paths.

## Troubleshooting

| Problem | First check |
| --- | --- |
| Directive does not appear in the drawer | Verify the extension is enabled and `GET /api/v1/spindle` lists `directive` as running. |
| The frontend does not load | Verify `GET /api/v1/spindle/{id}/frontend` serves `dist/frontend.js`. |
| Runtime actions fail to save | Verify the request is authenticated; Directive runtime actions use per-user Lumiverse storage. |
| Prompt dry-run lacks Directive context | Verify the `interceptor` permission is granted and Directive is running. |
| Live narration or sidecars fail with provider errors | Verify the Lumiverse generation connection and API key outside Directive. |
