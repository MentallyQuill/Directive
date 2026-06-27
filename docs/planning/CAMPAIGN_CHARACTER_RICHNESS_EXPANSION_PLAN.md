# Campaign Character Richness Expansion Plan

## Purpose

This plan defines how Directive raises every bundled campaign crew to the same characterization standard now established for Breckenridge / Ashes of Peace.

The work has two major stages:

1. Expand the non-Ashes senior-staff character bibles using Ashes as the quality reference and the Character Bible Shaping Guide as the authoring contract.
2. After those bibles are enriched, update each campaign's crew dataset using the Crew Dataset Rich Character Design doc so runtime prompts, internal directors, narration, sidecars, and retrieval can use the richer character source without injecting whole bibles.

Do not collapse these stages. A rich crew dataset should be distilled from a rich bible, not invented directly in JSON.

## Source Standards

Authoring references:

- `docs/source/Directive_Breckenridge_Senior_Staff_Character_Bible.md`
- `docs/authoring/CHARACTER_BIBLE_SHAPING_GUIDE.md`
- `docs/packages/CREW_DATASET_RICH_CHARACTER_DESIGN.md`
- `docs/packages/CREW_DATASET_CONTRACT.md`

Ashes is the calibration baseline for depth, not a style to clone. Other campaigns should match the level of personality, relationship pressure, reveal discipline, voice specificity, and ensemble behavior while preserving their own setting, command premise, moral pressures, humor, and social texture.

## Campaign Inventory

| Campaign | Bible source | Officers | Current cards | Current shape | Expansion need |
|---|---|---:|---:|---|---|
| Breckenridge / Ashes of Peace | `docs/source/Directive_Breckenridge_Senior_Staff_Character_Bible.md` | 7 | 42 | Reference baseline | Maintain as calibration source. |
| Glass Harbor / Drowned Constellation | `content/campaigns/glass-harbor/crew/GLASS_HARBOR_SENIOR_STAFF_CHARACTER_BIBLE.md` | 8 | 32 | Profile, voice, relationship, development | Bible expansion, then add reveal/style cards and rich voice capsules. |
| Serein / Black Current | `content/campaigns/serein/crew/SEREIN_SENIOR_STAFF_CHARACTER_BIBLE.md` | 8 | 32 | Profile, voice, relationship, development | Bible expansion, then add reveal/style cards and rich voice capsules. |
| Eudora Vale / Broken Accord | `content/campaigns/eudora-vale/crew/EUDORA_VALE_SENIOR_STAFF_CHARACTER_BIBLE.md` | 8 | 32 | Profile, voice, relationship, development | Bible expansion, source metadata cleanup, then add reveal/style cards and rich voice capsules. |
| Aster Vale / Unseen Border | `content/campaigns/aster-vale/crew/ASTER_VALE_SENIOR_STAFF_CHARACTER_BIBLE.md` | 8 | 48 | Six-card structure already present | Deepen bible, then enrich existing cards with rich voice capsules and stronger payloads. |
| Celandine / Enemy's Garden | `content/campaigns/celandine/crew/CELANDINE_SENIOR_STAFF_CHARACTER_BIBLE.md` | 8 | 48 | Six-card structure already present, but uneven source | Deepen bible, remove or reframe player-voice blanks, then enrich existing cards. |

## Stage 0: Baseline Audit

Goal: prove the current source state before editing.

For each non-Ashes campaign:

- inventory every officer in the bible and crew dataset;
- confirm every dataset officer has a matching bible section;
- confirm every bible officer maps to a stable dataset id;
- record current card types per officer;
- identify missing source metadata roles;
- identify blank, placeholder, or player-authorship sections that should not become NPC personality;
- list campaign-specific command pressures and ensemble pressures.

Deliverable:

- one audit note per campaign, either in the planning issue/thread or in a short implementation checklist;
- no runtime JSON changes yet unless an obvious metadata bug blocks later validation.

Acceptance gate:

- every campaign has a clear officer map and a known delta from the Ashes richness standard.

## Stage 1: Character Bible Expansion

Goal: make the non-Ashes bibles rich enough to become authoritative source for runtime character data.

Use the Character Bible Shaping Guide as the section contract. Each recurring senior officer should have, at minimum:

- at-a-glance identity and campaign function;
- role in the ensemble;
- formative history that still affects present judgment;
- core engine;
- central contradiction;
- default demeanor;
- values;
- strengths;
- blind spots;
- stress behavior;
- warmth and humor;
- physical tells;
- personal life and ordinary habits;
- relationship with the player;
- relationships with other senior staff;
- long-term character pressures;
- reveal ladder;
- voice guide;
- 8 to 12 natural line shapes with broad personality coverage.

The target is not equal word count. The target is enough authored material that a dataset builder can create profile, voice, relationship, reveal, development, command-reaction, and future B-plot cards without inventing personality from a billet.

### Bible Expansion Rules

- Preserve campaign premise. Do not import Breckenridge wartime-refit dynamics into other ships unless already authored.
- Do not write player-character personality, voice, feelings, or values.
- If a bible currently contains a `Player Commander` section, convert it into authority boundaries, command permissions, or campaign role constraints rather than authored player voice.
- Keep hidden material in reveal ladders. Do not make private fears or secrets player-known by default.
- Include ordinary-life texture for every major officer.
- Include warmth, humor, private ease, and off-duty specificity, not only command-pressure behavior.
- Write relationships among officers, not only officer-to-player reactions.
- Make each officer's flaw playable without turning them into an obstacle stereotype.
- Make line shapes speakable. They should sound like dialogue, not a prompt, slogan, or compressed lore note.

### Campaign-Specific Bible Focus

Glass Harbor:

- emphasize succession after Rhos, chart ethics, sanctuary, route custody, salvage, and sovereignty;
- ensure Rhos remains a person, not only a missing-captain plot device;
- make cartography, sanctuary politics, and field improvisation produce distinct voices.

Serein:

- emphasize Acting Captain succession after Lorne's injury, wreck recovery, evidence custody, rescue politics, and civilian responder tension;
- make recovery trauma and convoy history personal without reducing characters to trauma summaries.

Eudora Vale:

- emphasize known-crew continuity, Rhee's death, Ren's prospective XO pressure, water politics, Nacre access, and the difference between former-XO familiarity and independent captaincy;
- repair source metadata during the later dataset stage.

Aster Vale:

- emphasize border relationships, redacted charts, local custom versus law, inquiry pressure, and the player acting under Kellan's shadow without erasing player authority;
- preserve the existing six-card structure but deepen the personhood behind it.

Celandine:

- emphasize relief ethics, quarantine succession, K-17 responsibility, dependency, local institutions, and medical limits;
- remove or reframe blank player-character profile fields so they cannot be mistaken for NPC authoring work.

### Stage 1 Acceptance Gate

Before a campaign can enter dataset work:

- every major officer has all required shaping-guide categories;
- every major officer has 8 to 12 line shapes;
- every line-shape set passes the Personality Coverage Grid;
- every line-shape set passes the Dialogue Naturalism Gate;
- every officer has at least two warmth or trust examples;
- every officer has at least one ordinary-life or habit example;
- every officer has at least one flaw or blind-spot example;
- reveal ladders separate service record, ordinary professional conversation, high-trust or crisis disclosure, and never-automatic material;
- no runtime-facing named-style references are present;
- no player-character interiority or fixed player voice is authored.

## Stage 2: Bible Review And Cross-Campaign Calibration

Goal: make sure the enriched bibles are rich, distinct, and safe before they become structured runtime data.

Review each campaign against Ashes:

- Does the crew feel like a living command culture before the player acts?
- Can officers disagree without becoming generic obstruction?
- Can officers be warm without becoming frictionless approval sources?
- Are private scenes grounded by ordinary life, habits, and relationships?
- Do voices differ by syntax, rhythm, humor, and values rather than only by job title?
- Do reveal ladders protect secrets from first-scene leakage?
- Does the campaign have its own moral engine?

Cross-campaign anti-cloning checks:

- no campaign should read like Breckenridge with renamed officers;
- no captain should default to Whitaker's exact command texture;
- no engineer should default to Imani's exact technical-debt texture;
- no security officer should default to Bronn's failure-condition texture;
- no medical officer should default to Miriam's human-cost texture;
- no operations officer should default to Priya's dependencies-and-access texture.

Deliverable:

- a reviewed bible for each campaign;
- a short unresolved-questions list per campaign if any officer remains too thin for dataset migration.

## Stage 3: Crew Dataset Richness Migration

Goal: turn each enriched bible into compact runtime cards using the Crew Dataset Rich Character Design doc.

Only start this stage after the corresponding bible passes Stage 1 and Stage 2.

### Required Card Target

Every major officer should have these foundational cards:

```text
crew.profile
crew.voice
crew.relationship
crew.reveal
crew.development
command.styleReaction
```

Campaigns currently at 32 cards need the missing `crew.reveal` and `command.styleReaction` cards added for all eight officers:

- Glass Harbor;
- Serein;
- Eudora Vale.

Campaigns currently at 48 cards need enrichment rather than basic card creation:

- Aster Vale;
- Celandine.

### Voice Capsule Target

Every `crew.voice` card should gain `payload.voiceCapsule` with:

- `coreEngine`;
- `contradiction`;
- `speechMechanics`;
- `pressureShift`;
- `warmthHumor`;
- `physicalTells`;
- `exampleLineShapes`;
- `avoid`.

Each `exampleLineShapes` set should include 8 to 12 entries and use `bibleAxes` where practical.

Minimum axes:

- `role-pressure`;
- `warmth`;
- `humor`;
- `flaw`;
- `relationship-mode`;
- `ordinary-life`;
- `stress-shift`;
- `moral-engine`.

Do not make every line shape command-oriented. The model should see the person, not only the job.

### Non-Voice Card Target

For each officer:

- `crew.profile` should distill public role, service-record-safe identity, and campaign function;
- `crew.relationship` should identify what earns and lowers professional confidence, integrity trust, and personal rapport;
- `crew.reveal` should encode reveal-gated private or high-trust material;
- `crew.development` should identify recurring growth pressure and possible development triggers;
- `command.styleReaction` should describe how this officer reacts to player command style, mission pressure, risk, candor, delegation, and lawful boundary-setting.

Use allowlisted summaries and effects. Do not include hidden raw values in narrator-safe payloads.

### Dataset Metadata Cleanup

During migration:

- ensure every crew dataset source has `role`;
- add `role: "crew-source"` for character bibles;
- add `role: "dataset-contract"` for `CREW_DATASET_CONTRACT.md`;
- add `CREW_DATASET_RICH_CHARACTER_DESIGN.md` as a source where useful;
- keep package ids and officer ids stable unless there is a clear bug.

Known cleanup:

- Eudora Vale crew dataset sources currently omit `role`; fix during its dataset migration.

### Retrieval And Runtime Use

After dataset enrichment:

- verify `crew.voice` cards are selectable by narrator, `missionDirector`, and `crewDirector` where appropriate;
- verify narrator-safe cards do not expose director-only or locked hidden material;
- verify internal director hydration receives compact `hydratedCards`;
- verify sidecar prompts include worker-specific `directorCardHydration` only when selected cards are relevant;
- cap line-shape injection to the runtime budget defined in the rich dataset design.

## Stage 4: Verification

Run focused validation for each migrated campaign:

```powershell
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json <campaign-package>
node tools\scripts\validate-campaign-projection.mjs <campaign-projection> <campaign-package>
node tools\scripts\validate-crew-dataset.mjs schemas\packages\crew-dataset.schema.json <campaign-package> <crew-dataset>
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json <campaign-package> <crew-dataset> <mission-graph>
```

Update or add focused tests as needed:

- expand rich voice capsule validation beyond Breckenridge once other campaigns have voice capsules;
- add one retrieval fixture per campaign proving key voice cards hydrate for narrator and crew director audiences;
- add hidden-reveal safety fixtures for at least one reveal card per campaign;
- add no-named-style-reference checks across all enriched crew datasets;
- add naturalism and coverage checks where they can be machine-tested without overfitting prose.

Before promotion:

```powershell
node tools\scripts\run-alpha-gate.mjs
```

Live verification comes after deterministic validation:

- short fresh-campaign canary for each enriched campaign;
- prompt-context inspection for first senior-staff scene;
- narrator output review for crew identity, voice, warmth, and no hidden leakage;
- sidecar journal inspection showing crew or relationship workers receive hydrated character context when relevant.

## Recommended Work Order

1. Glass Harbor: it is the second schema-v2 reference and was the highest-priority non-Ashes crew richness migration because its four-card dataset most clearly exercised missing reveal/style coverage.
2. Serein: its Acting Captain succession pressure is close enough to Ashes to benefit from the template, but distinct enough to test anti-cloning.
3. Eudora Vale: known-crew continuity and Rhee's death require richer relationship memory before dataset migration.
4. Aster Vale: six-card structure exists, so the work is mostly depth, voice capsules, and distinct border-culture texture.
5. Celandine: six-card structure exists, but the bible needs player-section cleanup and uneven-depth repair before dataset migration.

This order is pragmatic, not mandatory. If using parallel agents, keep one owner per campaign and one reviewer comparing output against Ashes and the shaping guide.

## Per-Campaign Completion Checklist

Bible complete:

- officer map verified;
- all shaping-guide sections present;
- ensemble relationships present;
- reveal ladder complete;
- line shapes complete and natural;
- player authority boundaries preserved;
- no hidden player-known leakage.

Dataset complete:

- all six foundational cards per major officer;
- every voice card has `voiceCapsule`;
- every major officer has 8 to 12 line shapes with coverage axes;
- narrator-safe payloads audited;
- source metadata roles fixed;
- retrieval hooks checked;
- validation commands pass.

Runtime proof complete:

- retrieval hydrates at least one narrator-safe voice card for the campaign;
- crew director or relationship sidecar receives worker-specific `directorCardHydration` in a relevant test;
- narrator prompt can render voice cues without named-style references;
- full alpha gate passes.

## Non-Goals

- Do not inject whole character bibles into prompts.
- Do not write fixed personality, voice, values, or interiority for the player character.
- Do not make every officer warmer by removing professional friction.
- Do not solve live-play balance before deterministic package and dataset validation pass.
- Do not promote thin dataset cards as finished simply because they validate structurally.

## Final Acceptance

This project is complete when every bundled non-Ashes campaign has:

- an Ashes-caliber senior-staff character bible;
- a rich crew dataset generated from that bible;
- all foundational cards for every major officer;
- voice capsules with natural, varied line shapes;
- reveal-gated private material;
- validated narrator and internal director hydration;
- deterministic tests and alpha gate passing.

## Execution Status

Completed:

- Glass Harbor, Serein, Eudora Vale, Aster Vale, and Celandine senior-staff bibles now include Rich Character Expansion Addenda with core engines, contradictions, warmth and humor, ordinary-life texture, relationship triggers, reveal ladders, and ten line shapes per officer.
- Celandine's blank player-character personality section is reframed as a player authority boundary so campaign data cannot author player voice, values, feelings, or interiority.
- All five non-Ashes crew datasets now have eight officers, forty-eight cards, six foundational card types per officer, voice capsules on every `crew.voice` card, reveal-gated private material, and rebuilt indexes.
- Eudora Vale crew dataset source metadata and dimension labels were normalized during migration.
- The alpha gate now validates rich voice capsules across every bundled crew dataset and includes runtime hydration coverage for narrator, crewDirector, commandDirector, and reveal-gate safety.
