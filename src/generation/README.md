# Generation Source

Generation job orchestration and reusable asynchronous generation helpers.

`narration.mjs` composes narrator-safe prompts from committed Director turn packets and normalizes provider narration responses. It rejects narrator packets that expose hidden raw values or Director-only data.

`generation-roles.mjs` defines host-neutral model-call roles such as narration, continuity tracking, Mission Director advice, and utility JSON.

`generation-router.mjs` invokes those roles through the active host generation client. The runtime app uses it for host-derived narration when no explicit test provider override is supplied, and sidecar orchestration uses its batch method when a host exposes batch generation.

`prompt-injection-safety.mjs` defines host-neutral prompt block validation for future context handlers and interceptors. It rejects unsafe audiences, hidden-data flags, and unsafe hidden/director-only content keys before a host adapter can inject Directive context into chat generation.
