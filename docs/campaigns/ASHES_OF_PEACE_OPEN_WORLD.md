# Ashes of Peace: Open-World Campaign Implementation

## Campaign identity

- Campaign: Ashes of Peace.
- Ship: U.S.S. Breckenridge, Intrepid-class, NCC-74638.
- Opening stardate: 53049.2.
- Opening year: 2376.
- Theater: Asterion Reach.
- Runtime architecture: `directive.openWorldCampaign.v2`.
- Authored campaign scope: 19 quests, 12 locations, 4 arcs, 14 thread templates, 21 reaction rules, and 45 Director cards.

The campaign thesis remains: peace is not merely the absence of an enemy; it is the work of deciding what must be repaired, what must change, and who participates in that decision.

## Regional world

The Asterion Reach is persistent world data rather than a prose-only theater label.

| Location | Function |
|---|---|
| Breckenridge in transit | Prelude onboarding, crew integration, shakedown work |
| Asterion Station | Regional command, negotiation, relief coordination, public legitimacy |
| Galen Passage | Convoys, navigation failures, civilian traffic, rescue |
| Pelion System | Colony politics, agriculture, evacuation history |
| Orison Belt | Industry, traffic control, defense platforms, Compact security |
| Helix Yard and Karth | Ship repair, labor, industrial recovery |
| Demeris System | Archive, jurisdiction, wartime collaboration evidence |
| Suvek Relief Enclave | Medical relief, Cardassian logistics, displaced populations |
| Hecate Drift | Hazardous relay recovery and counterfeit-routing evidence |
| Farwatch Annex Six | Classified Starfleet intelligence and evidence control |
| Hespera Colony | Environmental science and reconstruction |
| Reach Quiet Edge | Long-range signals, calm scientific and personal material |

Routes carry travel hours. Travel advances stardate and may advance fronts before the next scene.

## Factions and actors

The world defines Starfleet Reconstruction Command, the Asterion Mutual Aid Compact, Compact Security Directorate, Cardassian Relief Authority, Project Farwatch, and Pale Lantern as autonomous factions with persistent state.

Recurring regional actors include Helena Tolland, Elias Rourke, Nia Kessler, Darius Holt, Leona Marr, Mira Solenn, Asha Prel, Nella Ivers, Varrik Tonn, and Eren Vos. Their location, status, posture, and bounded knowledge belong to world state.

No actor begins with complete campaign truth.

## Active regional fronts

- Lantern Integration: hidden progression of counterfeit authentication and Nightfall preparation.
- Humanitarian Strain: visible shortages, fatigue, displacement, and medical pressure.
- Compact Fracture: visible political disagreement over emergency power and postwar authority.
- Farwatch Evidence Purge: hidden institutional effort to control or destroy compromising evidence.
- Infrastructure Recovery: visible improvement or deterioration of shared systems.

Fronts can advance through elapsed time and reaction rules. They are not simply escalation meters attached to the current quest.

## Story arcs

### Pale Lantern

The main arc tracks distributed counterfeit authority, its use of real grievances, Starfleet complicity, and the Nightfall convergence. Its milestones are completed from facts and quest outcomes rather than chapter position.

### A Peace of Their Own

The regional-legitimacy arc tracks whether the Compact remains coherent, how authority is shared, and which institutions enter the finale with lawful credibility.

### Work Worth Doing

The recovery arc tracks infrastructure, relief, scientific, and civilian work that may remain unrelated to Pale Lantern while still changing finale readiness.

### A Ship Underway

The command-and-crew arc tracks the player's integration into the Breckenridge, crew confidence, technical honesty, and personal continuity.

## Main questline

### A Ship Underway

Onboarding remains the initial foreground quest. It establishes command style, delegation, technical debt, crew trust, and the ordinary Hesperus rescue. It begins active and uses a bespoke tactical mission graph.

### The Empty Convoy

Available after the Prelude. The player responds to Relief Convoy Twelve, separates rescue from evidence custody, and discovers authentic code fragments inside a counterfeit order. It uses a bespoke tactical graph.

### False Colors

Available after The Empty Convoy. A counterfeit Breckenridge attack creates public accusation, tactical secrecy, and a dispute over who may verify Starfleet innocence. It uses a bespoke tactical graph.

### Dead Letters

Available after False Colors. Hecate Seven contains a hazardous relay, private intercepted communications, and evidence that the hostile system is distributed.

### The Colony That Stayed

Also available after False Colors. Demeris exposes local survival under compromised authority, Mira Solenn's choices, and a real wartime Starfleet failure. Dead Letters and this quest can be pursued in either order.

### Old Lessons

Available once False Colors is resolved, either Dead Letters or The Colony That Stayed is resolved, and at least three Pale Lantern-tagged facts are known. The system has learned Starfleet doctrine and can predict normal responses.

### The Cost of Knowing

Available after Old Lessons and discovery that current Starfleet credentials enabled the threat. The player confronts Farwatch authority, false recall, evidence purge, and secret institutional risk.

### A Peace of Their Own

Available after The Colony That Stayed and either Old Lessons or sufficient Compact unity. Political legitimacy and command authority are resolved through negotiation, coercion, coalition, or fragmentation.

### The Last Directive

Unlocked by convergence after The Cost of Knowing and A Peace of Their Own are resolved and at least six Pale Lantern-tagged facts are known. The finale configuration reads actual allies, assets, faction posture, location conditions, front stages, and unresolved obligations.

### The Terms We Keep

Unlocked after the finale. The epilogue handles settlement, inquiry, public narrative, accountability, crew consequences, and persistent state for a later campaign.

## Designed side assignments

Open-world quest work is a standing activity mode. Side quests are not grouped into three mandatory intervals.

### Early recovery and local trust

- The Long Repair: Breckenridge technical debt and Helix Yard support.
- Borrowed Wings: pilot recovery and a civilian rescue-wing asset.
- Quiet Channels: informal communications networks and local information reliability.

These become available after the Prelude and may be pursued, postponed, delegated where permitted, or ignored.

### Mid-campaign survival and knowledge

- The Last Watch: old defenses and the burden of keeping them active.
- Second Opinion: trauma treatment and medical cooperation.
- An Unwelcome Result: inconvenient science and a regional sensor baseline.

These become available after any major middle-act investigation has resolved.

### Late preparation and personal closure

- The Name on the Hull: memorial identity and Breckenridge goodwill.
- A Signal Toward Home: long-range communication, memory, and a relay window.
- Two Signatures: identity law, records, and the Demeris archive.

These become available after The Cost of Knowing or A Peace of Their Own.

Some designed side assignments are explicitly calm content. Reaction rules and guardrails prevent the Director from converting every ordinary problem into Pale Lantern material.

## Dynamic B-stories

Thread templates cover authored shipboard seeds and dynamic families, including:

- Relationship strain.
- Routine task difficulty.
- Professional confidence.
- Trust and delegation.
- Personal obligation or promise.
- Recurring interest or scientific curiosity.
- Recovery fatigue.
- Cultural or identity continuity.

A dynamic thread must cite observable evidence. A conversation about a crewmate's relationship trouble can create a watchlisted concern; further evidence and player engagement can make it available or active. It becomes a formal assignment only when the problem requires sustained command action or travel. Most threads remain conversations, callbacks, vignettes, or brief shipboard scenes.

## Persistent state tracks and assets

Raw values for Regional Trust, Lantern Escalation, Humanitarian Strain, Starfleet Scrutiny, and Compact Unity remain hidden. Their state is communicated through cooperation, resistance, shortages, access, public reaction, and institutional behavior.

Campaign assets begin unearned. Side-quest outcomes and main-story decisions can grant operational support, information, legal access, medical capacity, rescue craft, defense codes, archives, evidence packages, and goodwill. Only earned assets are eligible for narrator context.

## Finale assembly

The Last Directive is authored convergence, not a fixed branch. The Director reads:

- Current Lantern and regional fronts.
- Known facts and surviving evidence routes.
- Compact legitimacy and faction posture.
- Available allies and earned assets.
- Ship condition and technical debt.
- Location and infrastructure state.
- Delegated and unresolved quests.
- Crew readiness and active personal threads.

The finale retains its command mesh, weapons-grid, network-quorum, and evacuation pressures, but their exact difficulty and available responses derive from campaign state.

## Tactical graph status

The Prelude, The Empty Convoy, and False Colors have bespoke tactical graphs. The remaining 16 quests are implemented through the systemic open-world quest contract. Their templates contain authored objectives, pressures, revelations, approaches, outcomes, effects, delegation rules, and context anchors; they do not yet contain bespoke phase-by-phase tactical graphs.
