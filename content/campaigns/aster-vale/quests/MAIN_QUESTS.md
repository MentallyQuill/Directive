# Unseen Border Main Quests

These templates are authored open-world structures. They provide situations, questions, pressures, facts, likely outcome families, and state effects. They do not prescribe a scene order or limit valid player approaches. The first three have bespoke tactical graphs; later operations use the systemic quest contract and can be approached through current world state.

## The Blank Route

**ID:** `prelude-the-blank-route`  

**Kind:** onboarding  

**Typical duration:** 1-2 sessions  

**Dramatic question:** What does the new Executive Officer treat as authoritative when the chart and the inhabited universe disagree?

Use the apparent navigational error to establish command culture, route uncertainty, and the difference between absent records and absent people. The route may be bypassed, marked unsafe, or investigated through multiple methods; no single scan is mandatory.

**Availability:** Always available when the Director can causally frame it.

**Anchors:** locations aster-vale, meridian-beacon, halloway-colony; actors idris-kellan, lyra-chen, sima-taren, neral-thzor, rear-admiral-caris-holt; factions starfleet-border-service, ilyran-colonial-council. 

**Objectives**

- Assume acting command and establish the player's operational priorities.
- Determine why the Halloway approach is absent from the current navigation layer.
- Prevent following traffic from entering an unsafe or politically compromised route.

**Pressures**

- Captain Kellan is ashore under inquiry and cannot absorb the first command decision.
- The official chart insists the approach does not exist while local traffic uses it daily.
- Any warning, closure, or correction will tell the March what kind of Starfleet presence has arrived.

**Revelations and clue resilience**

- The Aster Vale carries at least three mutually inconsistent route layers signed by valid Starfleet authorities. [campaign-required; alternate routes allowed]
- Courier pilots use a physical marker chain that crosses the blank area safely. [alternate routes allowed]
- A recent checksum is associated with Commander Halden's emergency credentials. [alternate routes allowed]

**Illustrative approaches, not limits**

- Hold position and compare route layers
- Follow local pilots under controlled conditions
- Dispatch a shuttle or probe chain
- Publish a temporary hazard notice
- Refuse the route and proceed by another corridor

**Authored outcome families**

- **The player publishes a bounded discrepancy notice, gaining candor but exposing the route to attention.** (`prelude.transparent-notice`): chart-restoration +1; institutional-scrutiny +1; crew-trust +1; set opening-doctrine-transparent = True; reveal fact.valid-charts-conflict: Multiple valid Starfleet chart layers contradict one another in the Lacuna March..
- **The player preserves the local route while beginning a private audit.** (`prelude.protected-passage`): regional-legitimacy +1; institutional-scrutiny +1; set opening-doctrine-protective = True; route.meridian-halloway; status=conditional; confidence=local.
- **The player closes the disputed route pending verification, improving formal control at immediate civilian cost.** (`prelude.formal-closure`): refugee-pressure +1; chart-restoration -1; clock.halloway-port-closure +1; set opening-doctrine-formal = True.
- **The Aster Vale declines to enter the route. The campaign continues with less evidence and a reputation for caution.** (`prelude.withdrawn`): crew-trust -1; institutional-scrutiny -1; advance front.refugee-surge by 1 stage(s); set opening-route-bypassed = True.

**Delegation:** Not permitted for the decisive command judgment, though supporting tasks may still be assigned.

**Tactical graph:** `packages/bundled/aster-vale/mission-graphs/prelude-the-blank-route.mission-graph.json`
## The Missing Colony

**ID:** `chapter-1-the-missing-colony`  

**Kind:** main  

**Typical duration:** 2-3 sessions  

**Dramatic question:** Can Starfleet restore a community to the map without turning recognition into exposure?

The colony is not a mystery box waiting for one reveal. Its people have adapted to living outside formal systems: some want restored recognition, some depend on obscurity, and some profit from it. The player must separate legal status, safety, taxation, asylum, and criminal investigation.

**Availability:** All of: quest prelude-the-blank-route is resolved

**Anchors:** locations halloway-colony, meridian-beacon, meridian-refugee-annex; actors governor-lise-talar, rear-admiral-caris-holt, lio-marek, mara-dey; factions ilyran-colonial-council, starfleet-border-service, free-passage-network. 

**Objectives**

- Establish lawful contact without presuming the colony's desired status.
- Verify life-support, population, and immediate security conditions.
- Decide what is entered into Starfleet records and under what access controls.

**Pressures**

- Recognition unlocks aid and rights but also tax, extradition, and military access claims.
- Governor Talar must answer to residents who survived by remaining officially absent.
- Hadran intelligence monitors Starfleet traffic around the colony.

**Revelations and clue resilience**

- The evacuation completion record was signed after the last official transport departed without most residents. [campaign-required; alternate routes allowed]
- A Starfleet officer later suppressed evidence of continued habitation to prevent Hadran targeting. [alternate routes allowed]
- Some residents and outside brokers use the colony's absent status for unregulated trade. [alternate routes allowed]

**Illustrative approaches, not limits**

- Negotiate a protected provisional status
- Restore full recognition
- Maintain absence while formalizing aid channels
- Conduct a limited census
- Separate criminal warrants from civil recognition

**Authored outcome families**

- **Halloway gains provisional recognition with restricted dissemination and a review timetable.** (`halloway.protected-recognition`): regional-legitimacy +2; chart-restoration +1; institutional-scrutiny +1; grant asset asset.halloway-port (Halloway Protected Port); set halloway-protected-recognition = True.
- **The colony returns to public charts and normal Federation administration.** (`halloway.full-restoration`): chart-restoration +2; regional-legitimacy +1; civil-war-spillover +1; advance front.hadran-incursion by 1 stage(s); set halloway-public = True.
- **The player preserves Halloway's practical absence while creating an unofficial support arrangement.** (`halloway.continued-obscurity`): refugee-pressure -1; institutional-scrutiny +2; criminal-exploitation +1; set halloway-hidden = True.
- **Talks fail or Starfleet withdraws. The colony closes its port and local actors choose their own alignments.** (`halloway.breakdown`): clock.halloway-port-closure +3; regional-legitimacy -2; advance front.black-ledger-consolidation by 1 stage(s); set halloway-talks-failed = True.

**Delegation:** Not permitted for the decisive command judgment, though supporting tasks may still be assigned.

**Tactical graph:** `packages/bundled/aster-vale/mission-graphs/chapter-1-the-missing-colony.mission-graph.json`
## Halden's Shuttle

**ID:** `chapter-2-haldens-shuttle`  

**Kind:** main  

**Typical duration:** 2-3 sessions  

**Dramatic question:** Who may be endangered in order to learn what happened to a missing Starfleet officer?

The shuttle is a contested scene, not a single clue container. Physical rescue, forensic custody, route safety, witness protection, and hostile pursuit proceed at once, and Halden herself is not aboard.

**Availability:** All of: quest chapter-1-the-missing-colony is resolved

**Anchors:** locations gravesend-veil, sable-crossing, nysas-lantern; actors commander-senka-halden, major-kael-renn, nyra-voss, sima-taren, neral-thzor; factions starfleet-border-service, black-ledger-syndicate, hadran-transitional-authority. 

**Objectives**

- Stabilize the shuttle and separate life-safety work from evidence custody.
- Determine who survived the crash and where they went.
- Prevent the investigation from exposing civilian rescuers to retaliation.

**Pressures**

- The Veil shifts while the Aster Vale, civilian craft, and covert observers maneuver.
- Starfleet, Hadran, and Black Ledger actors each claim a basis to seize the shuttle.
- The easiest reconstruction would wrongly treat a deliberately incomplete log as the whole truth.

**Revelations and clue resilience**

- Medical and transporter residue show Halden left the shuttle alive. [campaign-required; alternate routes allowed]
- An unidentified civilian craft recovered at least two people. [alternate routes allowed]
- The shuttle carried a distributed route-audit cache rather than one complete archive. [alternate routes allowed]
- A professional team boarded after the rescue and before Starfleet arrival. [alternate routes allowed]

**Illustrative approaches, not limits**

- Secure the shuttle in place
- Tow it out of the Veil
- Negotiate joint custody
- Prioritize the witness trail over the wreck
- Destroy sensitive components after preserving selected evidence

**Authored outcome families**

- **The Aster Vale secures an auditable evidence chain and a credible survivor trail.** (`halden.secure-custody`): halden-trail +2; institutional-scrutiny +1; crew-trust +1; reveal fact.halden-alive: Commander Halden survived the shuttle crash and continued into the March.; set halden-shuttle-secure = True.
- **The ship protects rescuers and follows Halden's human trail, accepting weaker physical custody.** (`halden.witness-priority`): halden-trail +2; regional-legitimacy +1; institutional-scrutiny +1; set halden-witnesses-protected = True.
- **Custody is shared with a local or Hadran authority, creating access and compromise.** (`halden.shared-custody`): regional-legitimacy +1; civil-war-spillover +1; clock.halden-exposure +1; set halden-shuttle-shared = True.
- **The shuttle is destroyed, seized, or stripped, but survivor evidence keeps the investigation alive.** (`halden.evidence-lost`): halden-trail +1; criminal-exploitation +1; advance front.halden-audit by 1 stage(s); set halden-shuttle-lost = True.

**Delegation:** Not permitted for the decisive command judgment, though supporting tasks may still be assigned.

**Tactical graph:** `packages/bundled/aster-vale/mission-graphs/chapter-2-haldens-shuttle.mission-graph.json`
## The Halloway Ledger

**ID:** `chapter-3-the-halloway-ledger`  

**Kind:** main  

**Typical duration:** 2-3 sessions  

**Dramatic question:** Can accountability preserve the people whose protection depended on secrecy?

The ledger can support recognition, prosecution, asylum, or extortion. Make custody, interpretation, and selective disclosure distinct decisions; no single authority is entitled to every name.

**Availability:** Any of: quest chapter-2-haldens-shuttle is resolved; factKnown (factId=fact.halden-alive)

**Anchors:** locations halloway-colony, meridian-refugee-annex, far-lantern; actors governor-lise-talar, rear-admiral-caris-holt, nyra-voss, tavra-nesh; factions ilyran-colonial-council, starfleet-border-service, black-ledger-syndicate. 

**Objectives**

- Secure the ledger without allowing a panic-driven mass seizure.
- Distinguish voluntary protection, coerced disappearance, and criminal alteration.
- Establish a durable custody and appeal process.

**Pressures**

- Each copied name can save a person, expose a sanctuary, or validate a warrant.
- Black Ledger cells are moving to destroy or steal related records.
- Starfleet demands a complete transfer while local officials demand local control.

**Revelations and clue resilience**

- The ledger contains entries from Starfleet officers, colony officials, Free Passage pilots, and criminal brokers. [campaign-required; alternate routes allowed]
- Some people were erased to control them, not protect them. [alternate routes allowed]
- Kellan authorized a small protected category but not the broader system. [alternate routes allowed]

**Illustrative approaches, not limits**

- Create a sealed joint archive
- Transfer the ledger to Starfleet JAG
- Return custody to Halloway with oversight
- Digitize only consented categories
- Destroy identifiers while preserving aggregate evidence

**Authored outcome families**

- **A layered archive gives courts evidence without giving any one faction unrestricted access.** (`ledger.joint-archive`): regional-legitimacy +2; institutional-scrutiny +2; grant asset asset.layered-ledger (Layered Halloway Archive); set ledger-joint-custody = True.
- **Starfleet takes the complete record under formal seal.** (`ledger.starfleet-custody`): institutional-scrutiny +1; regional-legitimacy -1; criminal-exploitation -1; set ledger-starfleet-custody = True.
- **Halloway retains the ledger with negotiated review rights.** (`ledger.local-custody`): regional-legitimacy +1; institutional-scrutiny +2; set ledger-local-custody = True.
- **The ledger is partly destroyed, copied, or dispersed; the campaign continues through witness testimony and secondary records.** (`ledger.fragmented`): criminal-exploitation +2; advance front.black-ledger-consolidation by 1 stage(s); clock.black-ledger-purge +2; set ledger-fragmented = True.

**Delegation:** Not permitted for the decisive command judgment, though supporting tasks may still be assigned.
## Routes Without Records

**ID:** `chapter-4-routes-without-records`  

**Kind:** main  

**Typical duration:** 3-5 sessions  

**Dramatic question:** Who should own a route when publishing it changes what the route is for?

This chapter is a campaign-wide survey operation. The player chooses where to travel, what to record, what to leave under local custody, and which communities gain or lose practical access.

**Availability:** All of: quest chapter-2-haldens-shuttle is resolved

**Anchors:** locations gravesend-veil, sable-crossing, nysas-lantern, varins-rest, kestrel-system; actors lio-marek, councilor-eme-saar, prior-ael-varin, sima-taren, ilan-korev; factions free-passage-network, sable-civic-assembly, nysas-lantern-council. 

**Objectives**

- Survey at least three route families through distinct methods.
- Negotiate who may use each route and under what conditions.
- Create redundancy that does not depend on one ship, one pilot, or one archive.

**Pressures**

- Every high-confidence chart improves rescue and pursuit simultaneously.
- Travel advances Hadran, refugee, criminal, and Halden fronts.
- Taren and Korev disagree about whether a map can be ethically incomplete.

**Revelations and clue resilience**

- Safe passage depends on agreements, timing, and trusted handoffs as much as geometry. [campaign-required; alternate routes allowed]
- Refugee crews maintain navigational markers Starfleet classified as random debris. [alternate routes allowed]
- The Lacuna Protocol consists of many locally maintained exceptions rather than one master database. [alternate routes allowed]

**Illustrative approaches, not limits**

- Embed Starfleet observers with Free Passage crews
- Create escrowed route fragments
- Install public rescue beacons only
- Build a tiered chart with access controls
- Leave some routes unrecorded and support local pilots

**Authored outcome families**

- **A tiered navigation network separates public rescue data from protected passage detail.** (`routes.tiered-network`): chart-restoration +3; regional-legitimacy +2; grant asset asset.tiered-route-network (Tiered Route Network); set routes-tiered = True.
- **Starfleet publishes a broad high-confidence chart.** (`routes.public-chart`): chart-restoration +4; civil-war-spillover +2; criminal-exploitation +1; advance front.chart-exposure by 2 stage(s); set routes-public = True.
- **Local pilots retain route custody while Starfleet supports rescue and maintenance.** (`routes.local-custody`): chart-restoration +1; regional-legitimacy +3; institutional-scrutiny +2; grant asset asset.free-passage-guides (Free Passage Guides); set routes-local = True.
- **The survey remains fragmented; enough routes work to continue, but critical blind zones persist.** (`routes.incomplete`): chart-restoration +1; clock.gravesend-instability +1; advance front.refugee-surge by 1 stage(s); set routes-incomplete = True.

**Delegation:** Not permitted for the decisive command judgment, though supporting tasks may still be assigned.
## The Price of Passage

**ID:** `chapter-5-the-price-of-passage`  

**Kind:** main  

**Typical duration:** 3-4 sessions  

**Dramatic question:** How can Starfleet attack coercion without collapsing the transport system people use to survive?

The syndicate is entwined with necessary transport. A direct strike may scatter captives and destroy records; negotiation may legitimize ownership of people; replacing its services requires capacity and time.

**Availability:** Any of: quest chapter-3-the-halloway-ledger is resolved; criminal-exploitation gte 5

**Anchors:** locations sable-crossing, gravesend-veil, nysas-lantern; actors nyra-voss, magistrate-rina-esh, lio-marek, neral-thzor, mara-dey; factions black-ledger-syndicate, sable-civic-assembly, free-passage-network. 

**Objectives**

- Separate coercive contracts and captive movement from ordinary black-market transport.
- Protect debtors, witnesses, and crews before enforcement changes the network.
- Provide or authorize a lawful alternative to Black Ledger passage.

**Pressures**

- The syndicate will destroy records and move captives if it detects a broad operation.
- Sable Crossing fears Starfleet occupation more than it trusts its own fragmented courts.
- Closing syndicate routes strands refugees and medical transfers immediately.

**Revelations and clue resilience**

- Black Ledger is a franchise of cells held together by debt standards and access, not one ship or headquarters. [campaign-required; alternate routes allowed]
- Nyra Voss believes coercive control is the only way to keep route knowledge from armies. [alternate routes allowed]
- Halden traded obsolete access codes for witness movement after her crash. [alternate routes allowed]

**Illustrative approaches, not limits**

- Target specific cells and protect witnesses
- Negotiate debt cancellation for route transfer
- Build a public transport alternative first
- Seize records through a limited boarding action
- Empower Sable courts and local enforcement

**Authored outcome families**

- **A lawful transport network undercuts coercive passage while targeted cases proceed.** (`price.lawful-alternative`): criminal-exploitation -3; regional-legitimacy +2; grant asset asset.lawful-passage (Lawful Passage Capacity); set black-ledger-displaced = True.
- **Starfleet and local partners dismantle key coercive cells without declaring a general blockade.** (`price.targeted-enforcement`): criminal-exploitation -2; crew-trust +1; clock.black-ledger-purge +1; set black-ledger-targeted = True.
- **Voss accepts a coercive but functional settlement under surveillance.** (`price.compelled-settlement`): criminal-exploitation -1; regional-legitimacy -1; set voss-settlement = True; grant asset asset.black-ledger-intelligence (Black Ledger Intelligence).
- **A broad operation triggers record destruction and captive dispersal; rescue and prosecution continue through harder routes.** (`price.purge-and-dispersal`): clock.black-ledger-purge +3; criminal-exploitation +2; advance front.black-ledger-consolidation by 1 stage(s); set black-ledger-purge-triggered = True.

**Delegation:** Not permitted for the decisive command judgment, though supporting tasks may still be assigned.
## The People Between Maps

**ID:** `chapter-6-the-people-between-maps`  

**Kind:** main  

**Typical duration:** 3-5 sessions  

**Dramatic question:** What does a border owe people whose legal identities were defined by the conflict they escaped?

Treat the movement as a distributed humanitarian and legal problem. Different groups can be received, moved, registered, protected, exchanged, or refused under different arrangements; the chapter should create persistent obligations rather than one mass choice.

**Availability:** Any of: quest chapter-4-routes-without-records is resolved; refugee-pressure gte 6

**Anchors:** locations meridian-refugee-annex, nysas-lantern, varins-rest, kestrel-homesteads, hadran-perimeter; actors colonel-varek-sorn, major-kael-renn, councilor-eme-saar, prior-ael-varin, tavra-nesh; factions hadran-transitional-authority, nysas-lantern-council, free-passage-network. 

**Objectives**

- Separate urgent protection, medical, family, security, and legal needs.
- Create distributed shelter and transport capacity.
- Establish how Hadran warrants and Starfleet asylum duties will be handled.

**Pressures**

- Nysa's Lantern cannot absorb another major convoy without exposing additional sites.
- Some arrivals carry weapons, intelligence tasks, or coercive orders.
- Family members often hold incompatible statuses and testimony.

**Revelations and clue resilience**

- Many warrants were generated from association and residence data rather than individual evidence. [campaign-required; alternate routes allowed]
- Refugee communities already operate schools, clinics, dispute councils, and route maintenance. [alternate routes allowed]
- Major Renn has a short high-priority extraction list hidden inside the larger warrant demand. [alternate routes allowed]

**Illustrative approaches, not limits**

- Distribute arrivals across multiple communities
- Create a protected review site
- Negotiate limited repatriation with monitoring
- Recognize refugee councils as operational partners
- Refuse Hadran access and prepare for incursion

**Authored outcome families**

- **The March establishes distributed protection with review, family reunification, and local representation.** (`people.distributed-protection`): refugee-pressure -2; regional-legitimacy +3; grant asset asset.refugee-councils (Refugee Councils); set distributed-protection = True.
- **Starfleet centralizes screening and protection at Meridian.** (`people.centralized-annex`): refugee-pressure -1; institutional-scrutiny +1; regional-legitimacy -1; set centralized-refugee-annex = True.
- **A monitored agreement returns some persons and recognizes selected asylum cases.** (`people.hadran-arrangement`): civil-war-spillover -1; regional-legitimacy -1; set hadran-return-arrangement = True.
- **Capacity or trust fails and a refugee convoy departs through dangerous unrecorded routes.** (`people.exodus`): refugee-pressure +2; civil-war-spillover +2; advance front.refugee-surge by 2 stage(s); set refugee-exodus = True.

**Delegation:** Not permitted for the decisive command judgment, though supporting tasks may still be assigned.
## The Officer in the Veil

**ID:** `chapter-7-the-officer-in-the-veil`  

**Kind:** main  

**Typical duration:** 3-4 sessions  

**Dramatic question:** Can an officer be protected as a witness while being held accountable for the methods that made the evidence possible?

Halden is neither a captive to rescue nor a flawless whistleblower. She continued altering records after her crash, accepted dangerous private bargains, and believes delay was necessary to preserve lives. The player decides her custody, authority, and evidentiary role.

**Availability:** All of: halden-trail gte 4; quest chapter-3-the-halloway-ledger is resolved

**Anchors:** locations nysas-lantern, gravesend-veil, kestrel-system; actors commander-senka-halden, idris-kellan, rear-admiral-caris-holt, major-kael-renn, nyra-voss; factions starfleet-border-service, nysas-lantern-council, lacuna-protocol-network. 

**Objectives**

- Secure the witnesses and route custodians Halden identifies.
- Make direct contact without enabling hostile triangulation.
- Set Halden's command, legal, and evidentiary status.

**Pressures**

- Each communication increases hostile confidence in Halden's location.
- Kellan's command status and prior decisions become inseparable from Halden's case.
- Halden will act independently if she believes formal custody will expose witnesses.

**Revelations and clue resilience**

- Halden has continued changing records to test who exploits each alteration. [campaign-required; alternate routes allowed]
- The Protocol emerged from overlapping emergency decisions rather than one central conspiracy. [campaign-required; alternate routes allowed]
- Admiral Holt knew protected chart categories existed but not their scale or criminal penetration. [alternate routes allowed]

**Illustrative approaches, not limits**

- Bring Halden aboard under protective custody
- Recognize her as a field investigator with limits
- Transfer her to independent JAG custody
- Keep her at Nysa under Starfleet protection
- Compel surrender after evacuating witnesses

**Authored outcome families**

- **Halden enters protected Starfleet custody with independent evidence controls.** (`officer.protected-custody`): institutional-scrutiny +2; halden-trail +2; crew-trust +1; grant asset asset.halden-testimony (Halden Testimony); set halden-protected-custody = True.
- **Halden continues a bounded field audit under the player's operational authority.** (`officer.field-authority`): chart-restoration +1; institutional-scrutiny +2; clock.halden-exposure +1; set halden-field-authority = True.
- **Halden remains at Nysa with negotiated Starfleet protection and no formal surrender.** (`officer.local-sanctuary`): regional-legitimacy +2; institutional-scrutiny +3; set halden-local-sanctuary = True.
- **Halden is captured, flees, or breaks contact; her distributed evidence survives through alternate custodians.** (`officer.lost-contact`): halden-trail -1; advance front.halden-audit by 2 stage(s); clock.halden-exposure +2; set halden-unavailable = True.

**Delegation:** Not permitted for the decisive command judgment, though supporting tasks may still be assigned.
## Far Lantern

**ID:** `chapter-8-far-lantern`  

**Kind:** main  

**Typical duration:** 3-5 sessions  

**Dramatic question:** What should survive when one archive contains both the truth and the coordinates of everyone the truth could endanger?

Far Lantern is an archival and infrastructure crisis. The player may repair, isolate, filter, duplicate, destroy, or transfer it, but every choice changes navigation, accountability, and the safety of named communities.

**Availability:** Any of: quest chapter-7-the-officer-in-the-veil is resolved; chart-restoration gte 6

**Anchors:** locations far-lantern, kestrel-system, hadran-perimeter; actors keeper-jalen-or, rear-admiral-caris-holt, colonel-varek-sorn, nyra-voss, omar-venn; factions starfleet-border-service, hadran-transitional-authority, black-ledger-syndicate, lacuna-protocol-network. 

**Objectives**

- Stabilize the beacon before automatic restoration or failure.
- Classify records by safety, legal value, and consent where possible.
- Choose an archive and navigation-custody model.

**Pressures**

- Automatic restoration is making more of the archive discoverable over time.
- Starfleet, Hadran, Black Ledger, and local custodians converge on the beacon.
- The beacon's damaged memory cannot preserve every category through every repair strategy.

**Revelations and clue resilience**

- Far Lantern retained signed deltas for nearly every route alteration in the March. [campaign-required; alternate routes allowed]
- The same technical mechanism was used for sanctuary, intelligence, smuggling, and coercion. [campaign-required; alternate routes allowed]
- No complete public restoration can avoid exposing people still at risk. [alternate routes allowed]

**Illustrative approaches, not limits**

- Create a compartmented archive
- Broadcast the full historical record
- Preserve evidence but delete live coordinates
- Transfer custody to a multi-party commission
- Destroy the archive after extracting selected proof

**Authored outcome families**

- **Far Lantern becomes a compartmented archive and public safety beacon under plural custody.** (`far-lantern.layered-custody`): chart-restoration +2; regional-legitimacy +3; institutional-scrutiny +2; grant asset asset.far-lantern-archive (Far Lantern Archive); set far-lantern-layered = True.
- **The full archive is broadcast and mirrored.** (`far-lantern.full-disclosure`): chart-restoration +3; institutional-scrutiny +3; civil-war-spillover +3; advance front.chart-exposure by 2 stage(s); set far-lantern-public = True.
- **Live route detail is destroyed while a legal record of decisions and abuses survives.** (`far-lantern.evidence-only`): chart-restoration -1; institutional-scrutiny +3; set far-lantern-evidence-only = True.
- **The beacon is destroyed, seized, or rendered unreadable; testimony and distributed fragments become the remaining route to truth.** (`far-lantern.lost`): chart-restoration -2; institutional-scrutiny +1; advance front.protocol-inquiry by 1 stage(s); set far-lantern-lost = True.

**Delegation:** Not permitted for the decisive command judgment, though supporting tasks may still be assigned.
## A Border Without Witnesses

**ID:** `chapter-9-border-without-witnesses`  

**Kind:** main  

**Typical duration:** 2-4 sessions  

**Dramatic question:** What does lawful command require when a lawful order would make accountability and protection mutually exclusive?

This is an institutional convergence, not a reveal scene. The player must decide whether to obey, challenge, narrow, or reinterpret the order while still protecting civilians and preparing a durable border arrangement.

**Availability:** All of: quest chapter-8-far-lantern is resolved

**Anchors:** locations meridian-beacon, sable-crossing, nysas-lantern, far-lantern; actors rear-admiral-caris-holt, idris-kellan, commander-senka-halden, colonel-varek-sorn, magistrate-rina-esh; factions starfleet-border-service, hadran-transitional-authority, sable-civic-assembly, nysas-lantern-council. 

**Objectives**

- Establish the order's scope, urgency, legal basis, and operational consequences.
- Protect witnesses and evidence through the period of command dispute.
- Create the authority structure that can enter the finale with practical legitimacy.

**Pressures**

- Disobedience may end the player's command before the regional crisis resolves.
- Hostile actors exploit the reporting dispute to raid sites and remove people.
- Senior officers need a clear boundary between lawful challenge and improvised rebellion.

**Revelations and clue resilience**

- Holt believes uncontrolled disclosure will collapse border cooperation and destroy careers needed for reform. [campaign-required; alternate routes allowed]
- One centralized transfer would create a single point of seizure or suppression. [alternate routes allowed]
- Local councils can hold defined custody responsibilities if Starfleet recognizes them. [alternate routes allowed]

**Illustrative approaches, not limits**

- Comply with a compartmented transfer
- Seek immediate JAG review
- Refuse centralization and preserve distributed custody
- Transfer selected duties to local councils
- Return Kellan to command while the player leads field protection

**Authored outcome families**

- **The player secures a review and preserves evidence through a lawful distributed chain.** (`witnesses.lawful-challenge`): institutional-scrutiny +3; regional-legitimacy +2; crew-trust +2; grant asset asset.protected-evidence-chain (Protected Evidence Chain); set lawful-command-challenge = True.
- **Starfleet receives defined categories while protected local custody survives.** (`witnesses.compartmented-compliance`): institutional-scrutiny +1; regional-legitimacy +1; set compartmented-compliance = True.
- **The player refuses the order and preserves the network, accepting immediate command jeopardy.** (`witnesses.refusal`): institutional-scrutiny +4; regional-legitimacy +3; set centralization-refused = True; set player-command-jeopardy = True.
- **The complete record transfers to Starfleet; the border gains formal clarity but loses local trust and resilience.** (`witnesses.centralized`): chart-restoration +2; regional-legitimacy -2; set evidence-centralized = True.

**Delegation:** Not permitted for the decisive command judgment, though supporting tasks may still be assigned.
## Draw the Border

**ID:** `finale-draw-the-border`  

**Kind:** finale  

**Typical duration:** 3-6 sessions  

**Dramatic question:** Can the March become visible enough to protect people without becoming legible enough to control them?

Assemble the finale from actual state. Use the player's route regime, allies, evidence custody, Halden status, ship condition, and unresolved obligations to configure simultaneous fronts. The finale is not a predetermined battle or council vote.

**Availability:** All of: quest chapter-9-border-without-witnesses is resolved; at least 4 known fact(s) tagged protocol

**Anchors:** locations meridian-beacon, gravesend-veil, sable-crossing, nysas-lantern, kestrel-system, far-lantern, hadran-perimeter; actors rear-admiral-caris-holt, commander-senka-halden, colonel-varek-sorn, major-kael-renn, nyra-voss, governor-lise-talar, lio-marek; factions starfleet-border-service, hadran-transitional-authority, free-passage-network, black-ledger-syndicate, sable-civic-assembly, nysas-lantern-council. 

**Objectives**

- Prevent mass seizure, disappearance, or exposure of protected populations.
- Keep enough routes functioning for rescue, withdrawal, and lawful access.
- Prevent or survive the armed convergence without surrendering all border authority to force.
- Commit a durable post-crisis navigation, asylum, evidence, and enforcement regime.

**Pressures**

- No ship can personally cover every route, site, and convoy.
- Every use of the full archive changes the tactical map and the political settlement.
- Kellan, Halden, Holt, and the player may each hold different forms of lawful or practical authority.
- The ship is capable but not large enough to dominate the theater; alliances and delegated assets determine reach.

**Revelations and clue resilience**

- The final Lacuna Protocol is the sum of current custodians, route practices, and accepted authorities, not an artifact waiting to be switched on. [campaign-required; alternate routes allowed]
- Durable protection requires institutions able to witness and contest decisions without holding every secret. [alternate routes allowed]

**Illustrative approaches, not limits**

- Coordinate a multi-party passage compact
- Impose temporary Starfleet route control
- Defend local sanctuary autonomy
- Negotiate Hadran withdrawal through verified access
- Use limited force to break one convergence point
- Abandon selected sites to save people through mobile evacuation

**Authored outcome families**

- **Plural custody, protected passage, accountable evidence, and limited enforcement survive the convergence.** (`finale.seen-clearly`): set ending-border-seen-clearly = True; regional-legitimacy +3; chart-restoration +2; refugee-pressure -2; civil-war-spillover -2; criminal-exploitation -2.
- **The March protects most people through continued partial obscurity and trusted local custodians.** (`finale.protected-march`): set ending-protected-march = True; regional-legitimacy +2; chart-restoration -1; refugee-pressure -1.
- **Starfleet restores formal charts, patrol lines, and centralized records at significant local and humanitarian cost.** (`finale.restored-border`): set ending-restored-border = True; chart-restoration +3; regional-legitimacy -2; institutional-scrutiny +1.
- **Traffic remains open but coercion, hidden bargains, and weak accountability define the settlement.** (`finale.open-roads-closed-eyes`): set ending-open-roads-closed-eyes = True; chart-restoration +2; criminal-exploitation +2; institutional-scrutiny -1.
- **The convergence becomes sustained armed conflict and the campaign shifts to evacuation, survival, and accountability after a failed stabilization.** (`finale.line-of-fire`): set ending-line-of-fire = True; set line-of-fire-catastrophe = True; civil-war-spillover +4; refugee-pressure +3; advance front.hadran-incursion by 2 stage(s).
- **The record, route system, and local authority collapse together; survivors scatter into a border no institution can reliably see.** (`finale.unseen-border`): set ending-unseen-border = True; set sanctuary-collapse = True; chart-restoration -4; regional-legitimacy -4; criminal-exploitation +3.

**Delegation:** Not permitted for the decisive command judgment, though supporting tasks may still be assigned.
## The Lines We Keep

**ID:** `epilogue-the-lines-we-keep`  

**Kind:** epilogue  

**Typical duration:** 1-3 sessions  

**Dramatic question:** What must be recorded, protected, repaired, or relinquished for the settlement to remain a peace rather than a pause?

The epilogue must read actual state and preserve mixed outcomes. It establishes what is public, what remains protected, who governs, what happens to Kellan and Halden, and how the player's command continues or ends.

**Availability:** All of: quest finale-draw-the-border is resolved

**Anchors:** locations aster-vale, meridian-beacon, halloway-colony, sable-crossing, nysas-lantern, far-lantern; actors idris-kellan, commander-senka-halden, rear-admiral-caris-holt, governor-lise-talar, councilor-eme-saar; factions starfleet-border-service, ilyran-colonial-council, sable-civic-assembly, nysas-lantern-council. 

**Objectives**

- Complete a command and institutional review grounded in committed evidence.
- Define continuing route, asylum, patrol, and custody authority.
- Resolve crew succession, trust, injury, reassignment, and continuing duty.
- Establish the public and protected record of what occurred.

**Pressures**

- Institutions and factions seek a stable narrative that may omit inconvenient responsibility.
- Some truths remain dangerous even after the immediate crisis.
- The player's command status may be confirmed, constrained, transferred, or ended.

**Revelations and clue resilience**

- The settlement requires separate judgments about law, protection, force, privacy, and command rather than one verdict. [campaign-required; alternate routes allowed]

**Illustrative approaches, not limits**

- Hold a public review with protected annexes
- Accept a classified settlement
- Transfer authority to a regional compact
- Remain for implementation
- Request reassignment or resign command

**Authored outcome families**

- **The campaign records a final settlement and preserves the chosen continuation state.** (`epilogue.complete`): set unseen-border-complete = True; reveal fact.lines-we-keep: The Lacuna March settlement, public record, protected annexes, and command consequences are committed..
- **The review remains contested, but the campaign closes with a defined authority and record dispute.** (`epilogue.contested`): set unseen-border-complete = True; set ending-contested-record = True.

**Delegation:** Not permitted for the decisive command judgment, though supporting tasks may still be assigned.
