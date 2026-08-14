# Ship Command Assignment Copy Design

## Goal

Give the Ship route's Cohesion work the concise, authoritative vocabulary of a command-focused AAA science-fiction RPG. Replace conversational tutorial headings with a consistent operational hierarchy while preserving the meaning and authority of every source-backed task field.

## Player-Facing Vocabulary

The task detail hierarchy uses these exact labels:

| Current label | Approved label |
| --- | --- |
| `Level {n} command task` | `Level {n} Command Assignment` |
| `What needs your attention` | `Situation` |
| `Your objective` | `Objective` |
| `Why it matters to you` | `Command Impact` |
| `How to pursue it` | `Course of Action` |
| `While it remains unresolved` | `Operational Risk` |
| `What completion looks like` | `Resolution Criteria` |

Supporting interface copy follows the same register:

- `Available command tasks` becomes `Available command assignments`.
- `Ship task locations` becomes `Command assignment locations`.
- `Ready for closure` becomes `Ready for resolution`, and the matching detail fallback reads `This assignment is ready for resolution.`
- `{completed} of {total} steps complete` becomes `Progress · {completed} of {total} objectives complete`.
- `Completed work ({count})` becomes `Resolved assignments ({count})`.
- The empty state becomes `No command assignments require attention.`
- The queued-work line becomes `{count} additional assignments queued · {cohesion} Cohesion to restore`.

`Next: {phase}` remains unchanged because it is concise, actionable, and already reads naturally within `Course of Action`. Task titles, task descriptions, phase labels, approach text, computer-help text, rewards, Command Bearing controls, and Cohesion terminology remain source-owned or mechanics-owned and are not rewritten in this pass.

## Implementation Boundary

This is a presentation-only change in `src/ui/ship-journal.js`. It does not rename CSS classes, JavaScript variables, projection fields, task IDs, persistence records, package schemas, or internal `task` terminology. The existing desktop selection, mobile disclosure, callout, accessibility, Command Bearing, history, and backlog behavior remain unchanged.

The certified Ship-panel and visual-conformance tests will assert the new vocabulary and reject the retired visible labels. The expanded-interface design contract will describe the current Cohesion command-assignment surface rather than the obsolete operational-board wording.

## Accessibility

Visible labels and matching ARIA labels use `command assignment` consistently. Heading levels, live-region behavior, button relationships, focus behavior, and reward descriptions remain unchanged.

## Verification

Verification covers:

1. A red/green focused certified Ship-panel test for all exact vocabulary changes and retired-label absence.
2. The focused Cohesion Ship visual test to confirm desktop and mobile detail copy.
3. The repository's certified UI authority and full test gates.
4. A final diff and working-tree review that excludes unrelated `debug.log` and attachment changes.
