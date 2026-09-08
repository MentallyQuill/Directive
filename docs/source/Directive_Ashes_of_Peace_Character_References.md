# Ashes of Peace character references

These are performance references for the original campaign cast. Borrow the selected qualities while preserving each character's own profession, species, history, knowledge, relationships, and decisions. Reference names are authoring guidance and must not appear in story prose. A reference does not supply events, abilities, catchphrases, guilt, or future outcomes.

The runtime source of truth is [the crew and campaign cast dataset](../../packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json). Each `narrationGuide.characterReference` records `character`, `source`, `drawFrom`, and `boundaries`. The tables below summarize those entries; update the data when changing a reference.

## Senior staff

| Character | Reference | Selected qualities |
|---|---|---|
| Mara Whitaker | Kathryn Janeway — Voyager | Direct authority, scientific curiosity, economical exchanges, selective warmth |
| Kieran Vale | Tom Paris — Voyager | Quick humor, piloting confidence, charm, talent ahead of judgment |
| Priya Nayar | Samantha Carter — SG-1 | Composure, earnest competence, clear explanations, quiet warmth |
| Hadrik Bronn | Worf — TNG / DS9 | Economical speech, serious objections, preparedness, understated humor |
| Rowan Saye | Rodney McKay — Atlantis | Prickly brilliance, defensive corrections, pressure-driven certainty, vulnerability |
| Miriam Sato | Miles O'Brien — DS9 | Plainspoken reliability, dry humor, practical care, experienced authority |
| Imani Cross | B'Elanna Torres — Voyager | Technical conviction, forceful precision, fierce investment in the work |

## Supporting cast

| Character | Reference | Selected qualities |
|---|---|---|
| Helena Tolland | George Hammond — SG-1 | Steady authority, restrained warmth, institutional responsibility |
| Elias Rourke | William Ross — DS9 | Sincere duty, reasonable delivery, uncomfortable compromises |
| Nia Kessler | Elizabeth Weir — Atlantis | Diplomatic composure, firm civilian authority, workable terms |
| Darius Holt | Michael Eddington — DS9 | Earnest conviction, disciplined defiance, attention to who bears the cost |
| Leona Marr | Laura Roslin — Battlestar Galactica (2004) | Civilian resolve, controlled anger, political responsibility |
| Mira Solenn | Radek Zelenka — Atlantis | Resourcefulness, dry exasperation, bounded technical competence |
| Asha Prel | Kira Nerys — DS9 | Dignity, practical compassion, skepticism of distant authority |
| Nella Ivers | Kasidy Yates — DS9 | Independent freight-captain competence, warmth, direct boundaries |
| Varrik Tonn | Saul Tigh — Battlestar Galactica (2004) | Abrasive veteran authority, stubborn preparedness |
| Eren Vos | Julian Bashir — DS9 | Medical idealism, intellectual confidence, personal investment |
| Lysa Chen | Harry Kim — Voyager | Conscientious competence, sincerity, respectful courage |
| Anika Rhee | Harry Maybourne — SG-1 | Conversational resourcefulness and informal bargaining only; no villain cues |
| Daro Tem | Reginald Barclay — TNG / Voyager | Technical promise, vulnerable earnestness, fear of disappointing others |
| Samira Nadi | Janet Fraiser — SG-1 | Practical compassion, understated clinical authority, firm boundaries |
| Olan Brin | Walter Harriman — SG-1 | Administrative competence, concise reports, pride in dependable work |
| Tov Saren | Thy'lek Shran — Enterprise | Forceful candor, protective loyalty, earned cooperation |
| Jexa Renn | Tuvok — Voyager | Disciplined precision, restrained delivery, patient evidence handling |
| Joelle Mercer | Edward Jellico — TNG | Operational focus, clear expectations, tactical preparation |
| Ren Tal | Malcolm Reynolds — Firefly | Independent resolve, practical loyalty, obligations to real people |
| Shala Venn | Susan Ivanova — Babylon 5 | Protective competence, skeptical directness, disciplined attention |

## Runtime behavior

Senior staff remain in `officers`. Supporting cast live in `supportingCharacters`, with only identity and narration guidance. They are not automatically added to People, the ship's company, or available duty-report actors. Existing scene and accepted-story rules still determine introductions and knowledge.

The narration packet includes both sets of guides and a shared reference policy. Authored voices govern dialogue ahead of generic prose flavor. Supporting entries do not establish presence or authorize an introduction. They contain no director-only biographies or mission solutions.

Source-document character histories and mission evidence remain authoritative within their existing boundaries. These references change portrayal guidance, not the campaign's facts. Their effect on generated dialogue requires a separate model comparison; serialization tests establish delivery, not literary quality.
