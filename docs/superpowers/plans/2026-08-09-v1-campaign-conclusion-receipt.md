# V1 Campaign Conclusion Receipt Plan

> **Status:** Approved implementation plan. This closes the non-UI Ashes authored-completion boundary; it does not authorize UI or narrator-prompt changes.

**Goal:** Consume an authored terminal mission phase target into one immutable V1 campaign-conclusion receipt. Do not fake completion by mutating legacy quest status, attention flags, phase IDs, end-condition ledgers, or the generic `conclusion` root.

## Why This Is Necessary

The V1 journey correctly leaves ordinary `phase` targets pending because no typed phase contract existed. The Ashes epilogue is now a real terminal V1 mission, so leaving `ashes-authored-conclusion` permanently pending would mean the campaign can finish narratively but cannot complete deterministically.

This plan adds only the smallest contract needed for authored campaign completion. It does not create a general phase engine, chapter scheduler, post-game UI, or terminal-decision workflow.

## Authored Link

Extend a mission transition target with optional `campaignConclusion` metadata:

```json
{
  "kind": "phase",
  "id": "ashes-authored-conclusion",
  "playerSafeSetup": "...",
  "campaignConclusion": {
    "endConditionId": "completion.ashes.terms-we-keep-resolved"
  }
}
```

Only a `phase` target may carry this metadata. The referenced package end condition must exist exactly once and have family `authoredCompletion`. A phase target without this metadata remains unsupported and pending under the existing contract.

## Receipt

Store one `directive.campaignConclusion.v1` receipt at `mission.v1Conclusion` containing:

- deterministic receipt identity;
- package ID and version;
- branch ID;
- target phase and end-condition ID;
- source run, definition, definition version, mission revision, terminal disposition, and transition ID;
- journey revision;
- completion timestamp.

Do not duplicate every mission outcome dimension into the receipt. The V1 journey history and terminal current mission remain the authority for those values. The receipt proves that one exact terminal transition was consumed.

## Runtime Rules

- A valid authored phase target with no receipt is `ready`.
- Activation performs one mission-domain commit and no provider call.
- Repeated activation is an idempotent no-op.
- A forged, stale, package-mismatched, branch-mismatched, or source-mismatched receipt is invalid.
- An ordinary phase target remains `phase-target-contract-unavailable`.
- A mission target continues through the existing successor activation path.
- Source invalidation clears `mission.v1Conclusion`; reconstruction must prove terminal authority again before the conclusion can be recommitted.
- Legacy campaign-completion roots remain byte-for-byte unchanged.

## Verification

- [ ] Add red schema and contract tests for authored conclusion metadata and receipts.
- [ ] Add the receipt constructor and validator.
- [ ] Add runtime inspection, activation, idempotency, package binding, and invalidation behavior.
- [ ] Bind the Ashes epilogue to the exact authored-completion end condition.
- [ ] Extend epilogue runtime and thirteen-entry handoff proof through committed campaign conclusion.
- [ ] Register the tests in the alpha gate and update architecture documentation after the full deterministic gate passes.

