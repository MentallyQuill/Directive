# Extension Coexistence Certification Plan

**Goal:** Prove that Directive participates in SillyTavern's canonical narration pipeline without removing representative extension prompts or taking ownership of host narration.

**Architecture:** Directive owns one namespaced `setExtensionPrompt` entry and one generation interceptor. The prompt adapter must mutate only `directive.campaign.v1`; the interceptor may delay for durable settlement but otherwise returns control to SillyTavern without aborting or generating narration. Every unbound generation boundary clears the Directive prompt defensively.

## Tasks

1. Add prompt-registry coexistence coverage for representative VectFox, Summaryception, and Memory Books entries.
2. Clear the Directive prompt on every unbound interceptor path, including a generation event that arrives before chat-change reconciliation.
3. Certify pass-through interceptor behavior: no abort, no host narration mutation, and normal downstream extension participation.
4. Run the full V1 gate, deploy to the isolated Directive soak profile, and verify the installed artifact and bound/unbound prompt lifecycle without touching active user data.
