# V1 Test Contract

`npm test`, `npm run verify`, and `npm run v1-gate` execute the same focused V1 gate. The gate should contain only tests that protect a current V1 contract.

## Required coverage

- exact campaign, crew, ship, mission, state, save, draft, and prompt kinds;
- rejection of unknown roots, malformed campaign/player/ship/world/time/chat records, cross-root custody mismatches, incomplete episodes, mismatched package bindings, unsafe paths, and non-V1 records;
- accepted-pair selection, swipe identity, content hashes, and chat/branch binding;
- time adjudication, invalidation, and replay;
- closed mission candidate construction, evidence validation, reducer idempotency, objective order variation, clocks, terminal dispositions, and transitions;
- Story Settlement significance, working capsule bounds, hard/soft boundaries, source repair, supersession, and concise projections;
- fair discovery and exact Duty Report delivery custody;
- Command Bearing award, spend, refund, capacity, and idempotency;
- five-route player projections, exact player identity with portrait-only runtime mutation, creator and campaign portrait storage safety, spoiler exclusion, ship aggregation, commander presentation, and people moment caps;
- SillyTavern prompt, event, preset, launcher, and responsive shell contracts;
- all thirteen Ashes mission definitions and all authored scenario fixtures.

## Live proof

Offline tests do not prove installed behavior. A release candidate also needs a fresh SillyTavern user, installed-copy verification, new Ashes campaign start, multi-turn play, swipe-before-acceptance, edit/delete recovery, checkpoint create/load/delete with host-chat cleanup, objective completion, a known clock, mission transition, restart/resume, mobile shell inspection, and confirmation that preview campaigns cannot activate.

Tests for removed runtimes, migration, compatibility, alternate ledgers, or unused UI are prohibited because they preserve the wrong architecture.
