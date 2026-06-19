# Comparison Notes

Status: implemented for the active Log route.

Evidence:

- Desktop before screenshot: [log-before-desktop.png](log-before-desktop.png)
- Phone before screenshot: [log-before-phone.png](log-before-phone.png)
- Desktop after screenshot: [log-after-desktop.png](log-after-desktop.png)
- Phone after screenshot: [log-after-phone.png](log-after-phone.png)

Concept-art note: Concepts A, B, and C were generated inline from [prompt.md](prompt.md). The built-in image tool did not expose new project-copyable PNG files in this environment, so the durable artifact for this iteration is the prompt set, selected target, and runtime before/after evidence.

## Keep

- Bottom route navigation from the shared shell.
- Player-safe assisted summary, highlights, committed inputs, and visible consequences.
- Read-only Log route behavior.

## Change

- Replace generic metadata cards with a compact LCARS command timeline.
- Parse assisted-summary JSON into real player-facing fields.
- Move latest summary above source/audit detail.
- De-emphasize long source outcome IDs.
- Prevent phone-width cutoff, squished text, and awkward label wrapping.

## Reject

- Do not restore top route navigation.
- Do not add fake log-management controls.
- Do not show hidden state, raw provider output, or raw JSON.
- Do not remove committed inputs or visible consequences from player review.

## Next Prompt

- Generate follow-up variants only if timeline density, source-state display, or assisted-summary parsing fail visually in later route-wide reviews.

## Implemented Code Pass

- Implemented Log LCARS command-history timeline structure.
- Added compact status blocks for entries, latest stardate, assisted-summary readiness, and visible consequences.
- Parsed fenced/raw assisted-summary JSON into player-facing title, summary, and highlights.
- Replaced long technical source IDs with `Source Recorded` status.
- Replaced long technical entry IDs with readable event titles such as `Campaign Start`.
- Captured desktop and phone screenshots in real SillyTavern.
- Verified live DOM state: 4 status blocks, 2 timeline cards, parsed title present, no raw JSON visible, no long outcome ID visible, zero visible overflow.

## Next Code Pass

- Apply the same Visual Target Loop process to Settings or Character Creator.
- Revisit Log when more entries exist so longer history, failed assisted summaries, and summary-free entries can be visually checked.
