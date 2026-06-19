# Comparison Notes

Status: implemented for the active Crew route.

Evidence:

- Desktop before screenshot: [crew-before-desktop.png](crew-before-desktop.png)
- Phone before screenshot: [crew-before-phone.png](crew-before-phone.png)
- Desktop after screenshot: [crew-after-desktop.png](crew-after-desktop.png)
- Phone after screenshot: [crew-after-phone.png](crew-after-phone.png)

Concept-art note: Concepts A, B, and C were generated inline from [prompt.md](prompt.md). The built-in image tool did not expose new project-copyable PNG files in this environment, so the durable artifact for this iteration is the prompt set, selected target, and runtime before/after evidence.

## Keep

- Bottom route navigation from the shared shell.
- Player-safe rank, billet, species, role, and continuity labels.
- Read-only Crew route behavior.

## Change

- Replace tall generic officer cards with compact LCARS roster rows.
- Add crew readiness/status blocks above the roster.
- Reduce repeated metadata labels.
- Make the Captain/XO/bridge-role hierarchy easier to scan.
- Prevent phone-width cutoff, squished text, and awkward label wrapping.

## Reject

- Do not restore top route navigation.
- Do not add fake crew-management controls.
- Do not show hidden relationship state or raw relationship values.
- Do not use fictional portraits or official Star Trek imagery as runtime assets.

## Next Prompt

- Generate follow-up variants only if roster density, continuity summaries, or long-role text still fail visually in later route-wide reviews.

## Implemented Code Pass

- Implemented Crew LCARS personnel-manifest structure.
- Added compact readiness status blocks for senior crew, continuity, casualties, and reassignments.
- Replaced generic metadata cards with compact officer rows.
- Kept the page read-only and player-safe.
- Captured desktop and phone screenshots in real SillyTavern.
- Verified live DOM state: 8 roster rows, 4 readiness blocks, Crew active route, zero visible overflow; phone showed 4 roster rows in the viewport scan.

## Next Code Pass

- Apply the same Visual Target Loop process to Ship or Log.
- Revisit Crew only if later active campaign states introduce longer names, non-human species labels, casualties, or reassignment strings that need extra text-fit handling.
