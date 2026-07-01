# Runtime Architecture Schemas

These schemas define the first Architecture Redesign contracts for Frame, CORE transaction, external prompt-environment diagnostics, architecture metrics, Recall Index, and LENS prompt budget traces.

They are Stage 1 contracts only. Runtime code may normalize matching objects before a full schema validator is introduced. The schemas intentionally forbid raw external prompt bodies, vector payloads, API keys, and full transcript text in external context diagnostics.

Recall Index and LENS prompt budget trace schemas are also Stage 1 contracts. They store refs, hashes, facets, token estimates, included/omitted refs, and omission reasons; they do not archive prompt block bodies, raw transcript text, provider output, generated external memories, Summaryception summaries, vector hits, embeddings, or secrets. LENS cache inputs include Recall Index, scene-seal, and pressure/arc digest revisions so FORGE background settlement can invalidate prompt packets without copying digest prose into the prompt-cache record.
