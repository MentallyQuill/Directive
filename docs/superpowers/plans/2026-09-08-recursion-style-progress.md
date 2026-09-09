# Recursion-style turn progress refinement

Approved scope: refine the already-approved progress feature using Recursion's actual menu as the reference. Keep every displayed action grounded in execution. No additional approvals; verify, submit PR, merge.

Reference: F:/git/Recursion/src/progress.mjs and assets/documentation/renders/recursion-operator-progress-menu-states.png. Purposeful parent rows, observed child operations, aligned state/duration, and clear model versus local work. Do not import Recursion's card pipeline into Directive.

## Runtime task
- Replace broad `preparing` wrapper with actual `activating-preset`, `building-context`, `assembling-prompt`, `installing-prompt` stages. Keep captured progressScope on all operations. Skip unsupported preset activation. Projection/lineage/duty-report/director selection = building-context; createV1RuntimePromptPacket = assembling-prompt; actual host.prompt[method] await = installing-prompt.
- Extend reporter task callback with onPhase('validating-response'); onAttempt at actual transport emits phase 'waiting-model'. Safe event phase allowlist only; no prompts, model output, or hidden story data.
- Propagate onPhase explicitly through mission wrappers to interpreter, dossier, episode evaluator, and story director. Emit validating-response only after a successful generation result and directly before actual response parsing/validation. Preserve outcomes/cancellation/retries and no-change persistence rules.
- Keep existing model root stage ids including directing-story. No fabricated independent subcalls for mission/time/people when the actual model request combines them.
- Guard the captured state, revision, and chat binding across the new awaited local stages. Cancel stale generation without clearing a newer target or showing settlement recovery; preserve normal chat-change cleanup.
- Tests first: actual prompt boundaries, model phase chronology, skipped work, invalid output, cancellation. Update relevant old `preparing` expectations to actual boundary, keeping coverage. Own runtime files and runtime-focused tests only.

## UI task (main agent)
- Group repeated observed local context operations under Turn context, with distinct child names and honest run counts instead of repeated preparing lines.
- Give each model operation a named parent with observed request/validation children and attempt counts. Never show future/pending tasks not observed. Keep concurrent active operations.
- Use compact aligned state/name/duration rows and model/local distinction, preserving the shared bevel and elapsed clock. Subsecond completed work displays <1s.
- Keep raw history/identities for ownership; group only the rendered history. Preserve failure visibility and live disclosure focus.
- Browser proof on desktop/mobile and focused lifecycle regressions; full alpha gate and independent review before commit/PR/merge.
