# Crew Public Service Record Design

## Goal

Expand each non-player senior officer's Crew detail panel with ordinary personnel-record information that the player character could retrieve before play. The panel must not expose secrets, private relationships, personality notes, central flaws, campaign functions, narration guidance, or undisclosed story facts.

## Source authority

Every displayed value must be copied from existing Ashes of Peace campaign material:

- Species already appears in `ashes-of-peace.campaign-package.json` for every senior officer.
- Age, birthplace, and Starfleet background appear in each officer's `At a glance` table in `Directive_Breckenridge_Senior_Staff_Character_Bible.md`.
- Previous posting or Breckenridge tenure/status appears only where the authored record states it.

The runtime crew dataset becomes the explicit player-safe source. No UI code may read the character bible, infer facts from names or portraits, or expose the full campaign-package role descriptions.

## Considered approaches

1. Add species only. This is the smallest change, but it leaves several equally public and useful dossier facts unavailable.
2. Add a fixed schema whose every field is required. This creates consistent rows, but would force invented or misleading values for officers whose source records use tenure/status instead of a previous posting.
3. Add common required public fields plus optional source-backed service facts. This preserves consistency without fabrication and is the selected approach.

## Data model

Each crew-dataset officer gains:

- `species`: a player-safe display string.
- `publicRecord.age`: the authored age or age description at campaign start.
- `publicRecord.birthplace`: the authored birthplace.
- `publicRecord.serviceBackground`: the authored professional specialties.
- `publicRecord.assignmentHistory`: an optional short, authored previous-posting or current-tenure fact.

All values are display text because the panel does not calculate with them. `assignmentHistory` is omitted when no concise authored fact is available. The crew dataset manifest receives a minor version bump because its public record contract gains optional additive data; the campaign package and mission binding versions remain unchanged because mission semantics and save authority do not change.

## Projection and UI

`createPeoplePlayerProjection()` copies only `species` and `publicRecord` from the crew dataset into each player-facing person record. It continues to derive relationship posture and defining moments exclusively from accepted Story Settlement evidence.

The detail header displays species in the same position already used by the player character. A new `Service record` definition block displays labeled rows for Age, Birthplace, Service background, and Assignment history. Empty values are omitted. Rank and billet remain in the header and are not repeated.

The existing Profile, Current posture, and Defining moments blocks remain unchanged.

## Safety rules

- Only fields explicitly present in the player-safe crew dataset may render.
- Do not copy public reputation, central strength, central flaw, campaign function, private biography, relationships, narration guidance, or distinguishing history into `publicRecord`.
- Do not derive or guess missing data.
- Do not use authored world facts or mission data as a substitute for accepted/disclosed player knowledge.

## Verification

Tests will prove:

- all seven senior-officer dataset records contain species and the required public-record fields;
- the values match approved source-backed snapshots;
- the player projection exposes only the allowed public-record fields;
- desktop and mobile details render species and labeled service facts;
- absent optional values do not create blank rows;
- narration guidance and other private dataset material remain excluded from the player projection;
- existing campaign, projection, Crew panel, and visual-conformance checks continue to pass.
