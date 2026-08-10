# Runtime Source

The V1 orchestration boundary.

- `runtime-app.mjs` loads Ashes, owns the exact active state, publishes one narration context packet, and sequences accepted-pair settlement.
- `v1-accepted-pair-source.mjs` captures the selected assistant response only when the next player message accepts it.
- `v1-mission-runtime.mjs` coordinates closed interpretation, mission reduction, Story Settlement, Duty Reports, source invalidation, and transitions.
- `state-delta-gateway.mjs` is the sole persisted mutation gateway.
- `v1-campaign-state.mjs`, `v1-state-spine.mjs`, and `v1-semantic-authority.mjs` enforce state shape and writer ownership.
- `runtime-shell.js` and `runtime-actions.js` connect the five-route UI to the runtime.

No runtime module may hydrate, translate, or repair a prior Directive state format.
