# V1 Test Contract

`npm test`, `npm run verify`, and `npm run v1-gate` execute the same focused V1 gate. The gate should contain only tests that protect a current V1 contract.

## Required coverage

- exact campaign, crew, ship, mission, state, save, draft, and prompt kinds;
- rejection of unknown roots, malformed campaign/player/ship/world/time/chat records, cross-root custody mismatches, incomplete episodes, mismatched package bindings, unsafe paths, and non-V1 records;
- accepted-pair selection, swipe identity, content hashes, and chat/branch binding;
- strict native-branch proof, renamed branches, player and assistant endpoints, bookmark/copy rejection, selected-swipe retention, linear large-transcript scans, and zero reconstruction model calls;
- journal interruption at every timeline stage and external clone boundary, reentrant chat-change opens, stale cross-runtime revisions, pre/post active-pointer authority, duplicate event idempotency, immutable parent/selected saves, repeated Load Game forks, and campaign-ID save grouping;
- time adjudication, invalidation, and replay;
- closed mission candidate construction, evidence validation, reducer idempotency, objective order variation, clocks, terminal dispositions, and transitions;
- Story Settlement significance, working capsule bounds, hard/soft boundaries, source repair, supersession, and concise projections;
- fair discovery and exact Duty Report delivery custody;
- Command Bearing award, spend, refund, capacity, and idempotency;
- five-route player projections, exact player identity with portrait-only runtime mutation, creator and campaign portrait storage safety, spoiler exclusion, ship aggregation, commander presentation, and people moment caps;
- SillyTavern prompt, event, preset, launcher, and responsive shell contracts;
- all thirteen Ashes mission definitions and all authored scenario fixtures.

## Live proof

Offline tests do not prove installed behavior. A release candidate also needs installed-copy hash verification and a real SillyTavern interaction pass covering a new Ashes campaign, multi-turn play, swipe-before-acceptance, edit/delete recovery, Save Game create/delete, native branches ending on assistant and player messages, a selected-swipe branch, automatic previous-timeline naming, independent play after the fork, repeated Load Game continuations, restart/recovery, unaffected ordinary chats, mobile shell inspection, and confirmation that preview campaigns cannot activate. Existing player chats and saves must remain intact.

Tests for removed runtimes, migration, compatibility, alternate ledgers, or unused UI are prohibited because they preserve the wrong architecture.
