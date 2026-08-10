# Ashes V1 Epilogue and Conclusion Readiness

Status: **non-UI thirteen-entry Ashes journey and authored conclusion receipt ready; UI projection, narrator cutover, legacy-writer retirement, and live certification remain incomplete**

Date: 2026-08-09

## Certified Scope

`epilogue-the-terms-we-keep` is the thirteenth and final V1-native Ashes mission entry. Terminal Chapter 8 activates it through exact package, version, source, transition, and derived-entry authority. The existing epilogue quest remains package identity and migration input; its legacy progress and conclusion triggers do not become V1 mission authority.

The epilogue contains four visible responsibilities:

- preserve the established Nightfall aftermath;
- settle authority and defense terms;
- settle evidence, custody, and accountability terms;
- complete Whitaker's command review.

It uses three aggregate facts and reports, three causal events, nine bounded outcomes, fifteen evidence policies, seven persistent settlement dimensions, three terminal dispositions, three proven entry capabilities, and no clock. Political axes remain outcomes and dimensions inside one mission; they are not seven objectives or seven separate story entries.

## Choice Without Hidden Moral Grading

The authority, defense, Compact, Farwatch, Lantern, Cardassian, public-record, and command-future results can settle in non-linear order where causally valid. Two freeform position markers establish what the player advocates. World-owned reports establish what was actually adopted.

All four objective rows complete when their responsibility is genuinely settled. Objective disposition does not label one political choice morally correct. The terminal disposition distinguishes accountable peace, managed settlement, and contested aftermath from the accumulated record without turning the epilogue into a scorecard.

Crew exchanges and personal consequences remain Story Settlement material unless they meet the existing significance contract. There is no per-officer epilogue objective and no automatic character-memory row for every farewell.

## Exact Campaign Conclusion Receipt

The terminal epilogue transition targets phase `ashes-authored-conclusion` and explicitly references package end condition `completion.ashes.terms-we-keep-resolved`. Only an authored `phase` target with this metadata and exactly one matching `authoredCompletion` end condition is activatable. Ordinary phase targets remain safely pending.

Activation commits one immutable `directive.campaignConclusion.v1` receipt at `mission.v1Conclusion`. The receipt binds the package and version, branch, phase, end condition, source mission run and revision, terminal disposition, transition, journey revision, and completion time. It does not rewrite legacy quest status, attention flags, generic conclusion state, or end-condition ledgers, and it does not call a model.

Repeated activation is a no-op. Forged, stale, drifted, branch-mismatched, package-mismatched, or source-mismatched receipts are rejected. Changing accepted epilogue evidence clears the receipt and reopens the mission. Changing historical Chapter 8 evidence clears the receipt, prunes the epilogue, and returns to rebuilt Chapter 8 authority. Re-conclusion requires newly proven terminal authority and produces a new receipt identity.

## Runtime and Journey Proof

The runtime proves exact thirteen-entry activation, reload, entry-capability reconstruction, required report custody, non-linear epilogue completion, one-commit conclusion, legacy-root isolation, replay idempotency, and current or historical source invalidation without provider calls.

The journey retains one accepted source identity across all thirteen mission runs. The handoff proof represents Chapter 8 as a sealed Story Settlement episode before opening the epilogue episode, preserving historical provenance for descendant invalidation rather than replacing prior story custody. Live episode-boundary quality remains a separate certification concern.

## Robustness Boundaries

The conclusion contract is deliberately not a general phase engine. It supports one narrow authored-completion operation and fails closed when metadata or package authority is unavailable. This avoids coupling V1 mission completion to older campaign-conclusion workflows whose UI, checkpoint, terminal-decision, and narration behavior have different authority assumptions.

The remaining high-risk boundary is integration, not deterministic mission state: the narrator must eventually express committed results without inventing them, the UI must render the concise projections without recreating legacy trackers, and live model interpretation must prove acceptable recall across real prose and swipes.

## Verification Record

Focused schema, contract, epilogue mission, validator, accepted-pair runtime, source-rebuild, and thirteen-entry handoff suites passed. The complete deterministic gate passed:

```text
node tools/scripts/run-alpha-gate.mjs
Exit code: 0
310 checks
194.3 seconds
```

## Deliberate Non-Claims

- The player-facing Campaign and Mission pages do not yet render this conclusion receipt or the V1 epilogue projection.
- Narrator prompts and transition narration do not yet consume the V1 terminal packet.
- The older generic campaign-conclusion service is not silently treated as this receipt's authority.
- Legacy writers are not yet retired for V1-native scope.
- Other campaigns are not V1-native and must remain unavailable previews in the eventual launcher.
- Live SillyTavern behavior, semantic extraction quality, recovery UX, and full campaign pacing remain uncertified.
- Deterministic gates do not replace the isolated 20-turn rehearsal or the 25-turn/five-user certification.

## Explicit UI Approval Boundary

The non-UI Ashes mission journey now reaches a deterministic authored conclusion. Player-facing projection, conclusion ceremony, archival controls, narrator cutover, and launcher behavior remain stopped pending the separate UI and prompt implementation phase.
