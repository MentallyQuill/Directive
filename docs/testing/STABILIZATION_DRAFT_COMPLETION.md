# Preserved stabilization drafts — completion record

Scope: finish the three code drafts preserved at the September 18 wrap-up, based on main `51515d577`. The broader six-area stabilization and live-provider soak are not resumed by this slice.

## Components

- Captured-save containment: controller/service discovery refuses ordinary publication and unsupported migrations for captured saves. Selection operations validate migration eligibility before activation and pin exact expected target state/manifest. Failed checks retain the prior controller state; guarded activation rereads the active pointer before updating it. These checks complement the existing caller timeline lease; they do not introduce a multi-file storage transaction.
- Fake persisted transcript support: explicit saved snapshots remain independent of current chat rows, use complete native identity, and reject mismatched bindings including requested avatars. This is test infrastructure for proving saved-source checks.
- Pure V2 history contracts and vector planning: structural transition/head/page validation and immutable nonprefix vector construction. Transcript transitions can retain state revision; authority transitions advance it. No storage publication, recovery, cut-reader or native edit/Continue activation is enabled here. Proof references and cumulative predecessor budgets still require an authoritative verifier at integration time.

## Verification

Independent review approved all three components and the combined diff. Regressions cover migration refusal before activation, stale target state, captured history appearing with unchanged state, overlapping selections, and a newer active pointer appearing during target verification. Fake readback tests cover unsaved divergence, full entity identity, malformed bindings and avatars. V2 tests cover complete retained graph validation, immutable reuse, truncation/revert, structural contracts, limits and detached inputs. The combined release gate passed all 255 focused checks with exit zero (`artifacts/draft-completion/final-gate-confirmation.log`). The initial run timed out in the unchanged People keyboard-reordering visual test; the isolated test then passed on both published main and this branch, and the complete rerun passed without source changes or weakened assertions. The initial diagnostics remain preserved; no UI repair is claimed.

## Remaining integration

Runtime capture enrollment, V2 durable publication/recovery, historical cut consumption, checkpoint clone derivations and native mutation ownership remain future work. These internal components must not be presented as completed player-facing timeline recovery. No installed-host changes or live model requests are part of this publication.
