# Player Turn Sequence

1. SillyTavern displays an assistant response. It is provisional and creates no Directive state.
2. The player may swipe among variants without committing any variant.
3. The player sends their next message. Directive captures the selected previous assistant variant and this player message as one exact accepted pair.
4. The pair is bound to package, save, campaign, chat, branch, mission, message IDs, selected swipe, content hashes, and source-range hash.
5. Directive builds a closed set of currently eligible mission evidence candidates. One Utility call may select candidates and propose elapsed story time from the accepted prose.
6. Deterministic validation rejects stale revisions, mismatched sources, invalid policies, failed predicates, unknown targets, and unsupported claims.
7. Deterministic planners derive time, mission, Story Settlement, and accepted Command Bearing changes without mutating state.
8. One state-gateway commit persists every changed accepted-pair authority root. A failed write rolls the entire in-memory candidate back.
9. Persistence automatically retries at most twice after the initial attempt. The validated Utility result is reused, so persistence retries issue no additional model calls.
10. If all three persistence attempts fail, Directive aborts narration and presents a manual Retry action. Manual retry resumes the same accepted-pair settlement before re-entering SillyTavern's normal generation pipeline.
11. Eligible Duty Reports, episode review, mission closure, authored Command Bearing awards, and transition activation run through their exact contracts.
12. Player projections and the chat-bound prompt packet rebuild from committed state.
13. SillyTavern's active main model generates the next provisional response through its ordinary extension prompt pipeline.

If the player reserves a Command Bearing edge, step 13 first arms it to the exact player message prompting that generation. Swipes remain provisional. The edge commits in the atomic write at step 8 of the following turn only when that prompting-message anchor matches; replay of an older pair cannot consume it. Cancelling before acceptance refunds it, as does later invalidation of its prompting, beneficiary, or accepting source.

If the player later edits, deletes, hides, changes a selected source, or reloads a chat whose source rows no longer match persisted authority, Directive reconciles against the complete active raw chat. Mission, Story Settlement, reversible time, and Command Bearing invalidation share one state-gateway commit before surviving accepted pairs replay. `is_system` rows never qualify as accepted source, and message-update events use the same invalidation path.

The time ledger retains a 128-entry reversible audit window plus an explicit pruned-history elapsed anchor. Pruning therefore cannot erase aggregate elapsed time. Invalidation recomputes from the historical anchor plus surviving retained boundaries; it never treats the bounded window as the whole timeline.
