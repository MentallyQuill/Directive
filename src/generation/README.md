# Generation Source

Generation job orchestration and reusable asynchronous generation helpers.

`narration.mjs` composes narrator-safe prompts from committed Director turn packets and normalizes provider narration responses. It rejects narrator packets that expose hidden raw values or Director-only data.

`generation-roles.mjs` defines host-neutral model-call roles such as narration, continuity tracking, Mission Director advice, and utility JSON.

`generation-router.mjs` is the first isolated router scaffold for invoking those roles through a host generation client. It is not wired into the active runtime until the Stage 30 work is stable.

`prompt-injection-safety.mjs` defines host-neutral prompt block validation for future context handlers and interceptors. It rejects unsafe audiences, hidden-data flags, and unsafe hidden/director-only content keys before a host adapter can inject Directive context into chat generation.
