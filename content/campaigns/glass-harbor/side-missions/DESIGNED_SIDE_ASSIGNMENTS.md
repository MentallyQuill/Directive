# Designed Side Assignments


## Bell in the Dark

**ID:** `side-bell-in-the-dark`  
**Kind:** side  
**Typical duration:** one to two sessions  
**Priority:** 62  
**Calm content:** Yes  
**Delegation:** Allowed

### Player-facing premise

Recover and reposition a civilian rescue beacon that has become a trusted meeting point, knowing that moving it improves one route while breaking established routines elsewhere.

### Dramatic question

When does safer infrastructure become the loss of a community’s own geography?

### Anchors

- Locations: lantern-span, quiet-shelf
- Actors: senn-arv
- Factions: drift-concord

### Objectives

- Locate the damaged beacon.
- Recover its accumulated route and distress records.
- Consult the communities that use it.
- Repair, move, duplicate, or retire it.
- Record the new rescue procedure.

### Active pressures

- The beacon is degrading.
- Its current position is dangerous but socially established.
- Duplicating it consumes scarce buoys and power cells.

### Required revelations

- The beacon’s value comes from repeated trust and habit as much as technical range.
- Several undocumented craft depend on it without appearing in official traffic counts.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Repair it in place.
- Move it to a safer corridor.
- Duplicate it with local custody.
- Replace it with a Starfleet beacon network.

### Outcome families

### duplicate-and-share

A second beacon preserves established routines while opening a safer meeting point.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `grantAsset`: assetId=signal-lantern-chain, title=Signal Lantern Chain, playerSummary=Low-power community beacons improve rescue without publishing full routes.
### move-to-safety

The beacon becomes technically safer, but some users lose access or trust.

  - `adjustTrack`: trackId=civilian-strain, amount=0
  - `adjustTrack`: trackId=chart-exposure, amount=1
### restore-in-place

The traditional meeting point survives with improved reliability but retains its local hazard.

  - `adjustTrack`: trackId=civilian-strain, amount=-1

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## A Ship Named Twice

**ID:** `side-a-ship-named-twice`  
**Kind:** side  
**Typical duration:** one to three sessions  
**Priority:** 60  
**Calm content:** Yes  
**Delegation:** Allowed

### Player-facing premise

Mediate between two communities that claim the same wreck as their founding vessel, where technical identification cannot settle cultural ownership.

### Dramatic question

Who owns a vessel after memory has made it the beginning of two peoples?

### Anchors

- Locations: ossuary-loop, saint-caligo-wreckfield
- Actors: nema-voss, bram-ochoa
- Factions: breakwater-guild, drift-concord

### Objectives

- Stabilize the wreck.
- Authenticate its construction and service history.
- Hear both communities’ founding claims.
- Resolve salvage and memorial access.
- Preserve or divide the vessel without erasing either history.

### Active pressures

- The wreck is structurally failing.
- Both claims are sincere and supported by different forms of evidence.
- Salvage components could keep current habitats alive.

### Required revelations

- The hull changed registry and name during an undocumented refugee transfer.
- Both communities trace genuine survival events to different portions of the same vessel.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Create shared memorial custody.
- Divide the surviving hull.
- Preserve one section and salvage another.
- Recognize one legal owner while protecting the other cultural claim.

### Outcome families

### shared-memorial

Both communities share custody and a joint registry recognizes the vessel’s two continuities.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `grantAsset`: assetId=ossuary-memorial-council, title=Ossuary Memorial Council, playerSummary=A trusted council can arbitrate remains and cultural-property disputes.
### divided-hull

The vessel is physically divided, preserving material for both groups at the cost of a painful symbolic rupture.

  - `adjustTrack`: trackId=civilian-strain, amount=0
### legal-priority

One legal claim prevails while the other receives limited access or compensation.

  - `adjustTrack`: trackId=civilian-strain, amount=1

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## The Quiet School

**ID:** `side-the-quiet-school`  
**Kind:** side  
**Typical duration:** one to two sessions  
**Priority:** 58  
**Calm content:** Yes  
**Delegation:** Allowed

### Player-facing premise

Repair a habitat school’s atmosphere and establish a safer shuttle route without converting an ordinary community need into a strategic incident.

### Dramatic question

What does useful Starfleet presence look like when no conspiracy is involved?

### Anchors

- Locations: quiet-shelf, aster-basin
- Actors: lira-quell
- Factions: drift-concord

### Objectives

- Inspect the atmospheric failure.
- Allocate repair personnel and parts.
- Survey or pilot a safer school route.
- Coordinate classes during repairs.
- Leave a maintainable solution.

### Active pressures

- Parts are scarce.
- The school cannot remain closed indefinitely.
- A safer public route may expose the habitat.

### Required revelations

- The failure is ordinary deferred maintenance.
- Students and teachers already maintain a sophisticated local route log.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Repair in place.
- Relocate classes temporarily.
- Fabricate parts aboard Glass Harbor.
- Train local maintenance crews and pilots.

### Outcome families

### local-capacity

The school reopens with trained local maintainers and a protected route.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `grantAsset`: assetId=aster-community-goodwill, title=Aster Community Goodwill, playerSummary=Civilian communities provide practical support and reliable informal reporting.
### starfleet-repair

The school reopens quickly through Starfleet labor but remains dependent on outside parts.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
### temporary-relocation

Students remain safe while long-term repairs and routing stay unresolved.

  - `adjustTrack`: trackId=civilian-strain, amount=0

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## No Fixed Stars

**ID:** `side-no-fixed-stars`  
**Kind:** side  
**Typical duration:** one to three sessions  
**Priority:** 61  
**Calm content:** Yes  
**Delegation:** Allowed

### Player-facing premise

Support T’Kessa in certifying local pilots whose methods rely on embodied route memory, hull vibration, and communal practice rather than standard Starfleet instrumentation.

### Dramatic question

What counts as reproducible expertise when the environment defeats ordinary instruments?

### Anchors

- Locations: quiet-shelf, lantern-span, aster-basin
- Actors: senn-arv
- Factions: drift-concord, starfleet-survey-command

### Objectives

- Observe local pilot practice.
- Define a fair certification test.
- Run a supervised transit.
- Reconcile instrument records with embodied observations.
- Set a continuing training standard.

### Active pressures

- T’Kessa’s professional standards are legitimate.
- Local methods work but are difficult to document.
- A failed test can injure people or discredit an entire community.

### Required revelations

- Local pilots detect route changes through repeatable multisensory cues not captured by the replacement sensor pallet.
- Starfleet training can incorporate these cues without appropriating all route knowledge.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Build a hybrid certification standard.
- Require full Starfleet instrumentation.
- Recognize local licenses by reciprocity.
- Use repeated supervised transits and peer review.

### Outcome families

### hybrid-certification

Starfleet and local pilots adopt a shared standard, improving both navigation and professional respect.

  - `grantAsset`: assetId=drift-pilots, title=Drift Pilot Network, playerSummary=Trusted local pilots can guide missions and validate route changes.
  - `adjustTrack`: trackId=crew-succession-confidence, amount=1
### local-reciprocity

Starfleet recognizes local licenses without centralizing their methods, preserving autonomy but limiting standardization.

  - `adjustTrack`: trackId=chart-exposure, amount=-1
  - `grantAsset`: assetId=drift-pilots, title=Drift Pilot Network, playerSummary=Trusted local pilots can guide missions and validate route changes.
### instrument-only

A narrow Starfleet standard prevails, improving auditability while excluding several capable pilots.

  - `adjustTrack`: trackId=civilian-strain, amount=1

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## Old Mine, New Law

**ID:** `side-old-mine-new-law`  
**Kind:** side  
**Typical duration:** one to three sessions  
**Priority:** 63  
**Calm content:** No  
**Delegation:** Allowed

### Player-facing premise

Address an improvised mine cluster that protects a settlement from raiders while threatening relief and survey traffic.

### Dramatic question

Who may keep a dangerous defense when lawful protection is intermittent?

### Anchors

- Locations: crown-shoal, lantern-span
- Actors: veyra-ninth, lira-quell
- Factions: crown-of-embers, drift-concord, starfleet-survey-command

### Objectives

- Map the mine cluster.
- Identify its operators and protected community.
- Secure immediate relief passage.
- Negotiate disposal, marking, or transfer of control.
- Establish responsibility for future incidents.

### Active pressures

- The mines have deterred real Crown attacks.
- Their command links are improvised and unreliable.
- Disarmament without replacement security exposes civilians.

### Required revelations

- The protected settlement pays Crown rivals for backup security.
- Some mines are repurposed from wreck ordnance and contain evidence from the Sunken Fleet.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Mark a controlled corridor.
- Transfer control to a recognized local authority.
- Disarm the field and station patrol support.
- Upgrade authentication while retaining local custody.

### Outcome families

### marked-corridor

Relief traffic gains a safe lane while the settlement retains a bounded defense.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `adjustTrack`: trackId=raider-consolidation, amount=-1
### local-transfer

A recognized local council assumes mine custody under inspection and reporting terms.

  - `adjustTrack`: trackId=raider-consolidation, amount=-1
  - `grantAsset`: assetId=local-defense-codes, title=Local Defense Codes, playerSummary=Authenticated local defense systems can support the final crisis without hostile targeting.
### full-disarmament

The hazard is removed, but security depends on outside patrols that may not remain.

  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `adjustTrack`: trackId=kheled-intervention, amount=1

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## The Captain’s Table

**ID:** `side-the-captains-table`  
**Kind:** personal  
**Typical duration:** one to two sessions  
**Priority:** 57  
**Calm content:** Yes  
**Delegation:** Player-led

### Player-facing premise

Decide which of Captain Rhos’s rituals, standing orders, and informal practices should continue under acting command and which should change.

### Dramatic question

How does a temporary commander create continuity without becoming an imitation or an erasure?

### Anchors

- Locations: quiet-shelf
- Actors: amina-rhos
- Factions: starfleet-survey-command

### Objectives

- Review inherited standing orders.
- Hear focused department concerns.
- Choose which rituals and procedures continue.
- Communicate the command posture.
- Observe the first consequences.

### Active pressures

- Some routines are operationally useful.
- Some exist mainly because Rhos preferred them.
- The crew may interpret any change as ambition or indecision.

### Required revelations

- Crew loyalty to Rhos is compatible with support for the player.
- Different departments need different degrees of continuity.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Preserve most practices.
- Revise them openly.
- Delegate adaptation by department.
- Suspend only the practices that conflict with current operations.

### Outcome families

### deliberate-continuity

Useful practices remain while command-specific rituals are revised with clear rationale.

  - `adjustTrack`: trackId=crew-succession-confidence, amount=2
### rhos-continuity

The crew retains Rhos’s command rhythm, gaining stability while delaying the player’s independent culture.

  - `adjustTrack`: trackId=crew-succession-confidence, amount=1
  - `setFlag`: flagId=rhos-standing-orders-retained, value=True
### departmental-adaptation

Departments adapt independently, increasing ownership but producing uneven standards.

  - `adjustTrack`: trackId=crew-succession-confidence, amount=0
  - `setFlag`: flagId=departmental-command-variation, value=True

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## Signal Lanterns

**ID:** `side-signal-lanterns`  
**Kind:** side  
**Typical duration:** one to three sessions  
**Priority:** 64  
**Calm content:** Yes  
**Delegation:** Allowed

### Player-facing premise

Deploy a chain of low-power navigation beacons and decide whether their data is public, encrypted, locally keyed, or controlled by Starfleet.

### Dramatic question

Can a route be shared without giving away everything it connects?

### Anchors

- Locations: lantern-span, lagrange-gate, aster-basin
- Actors: senn-arv, tal-oren
- Factions: starfleet-survey-command, drift-concord, kheled-protectorate

### Objectives

- Select beacon sites.
- Protect deployment crews.
- Choose access and update keys.
- Test the corridor.
- Publish or withhold operating terms.

### Active pressures

- Buoys are scarce.
- Public access improves rescue and predation.
- A centrally controlled chain may fail when Glass Harbor leaves.

### Required revelations

- Low-power beacons can communicate safe timing without transmitting complete coordinates.
- Local custody can keep the chain current if update authority is genuinely shared.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Public data.
- Encrypted Starfleet data.
- Locally keyed timing signals.
- Federated verification with rotating keys.

### Outcome families

### federated-lanterns

The chain uses rotating local and Starfleet keys, balancing access and security.

  - `grantAsset`: assetId=stable-buoy-chain, title=Stable Buoy Chain, playerSummary=A maintained beacon corridor improves movement through Lantern Span.
  - `adjustTrack`: trackId=chart-exposure, amount=0
### public-lanterns

The chain becomes broadly useful and broadly visible.

  - `grantAsset`: assetId=stable-buoy-chain, title=Stable Buoy Chain, playerSummary=A maintained beacon corridor improves movement through Lantern Span.
  - `adjustTrack`: trackId=chart-exposure, amount=2
  - `adjustTrack`: trackId=civilian-strain, amount=-1
### restricted-lanterns

Starfleet retains access control, improving reliability for authorized traffic while limiting local ownership.

  - `grantAsset`: assetId=stable-buoy-chain, title=Stable Buoy Chain, playerSummary=A maintained beacon corridor improves movement through Lantern Span.
  - `setFlag`: flagId=lanterns-starfleet-controlled, value=True

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## The Longest Tow

**ID:** `side-the-longest-tow`  
**Kind:** side  
**Typical duration:** two to four sessions  
**Priority:** 66  
**Calm content:** No  
**Delegation:** Allowed

### Player-facing premise

Move a failing generation ship through a channel too narrow for safe standard tractor operations, requiring outside tugs, staged field work, or a dangerous engineering plan.

### Dramatic question

How much of the Glass Harbor may command risk to save one irreplaceable community?

### Anchors

- Locations: lagrange-gate, lantern-span, quiet-shelf
- Actors: bram-ochoa
- Factions: breakwater-guild, starfleet-survey-command

### Objectives

- Stabilize the generation ship.
- Survey the narrow channel.
- Assemble sufficient towing and power capacity.
- Complete or abort the transit.
- Repair the Glass Harbor and supporting craft afterward.

### Active pressures

- The generation ship cannot remain in its current basin.
- The Glass Harbor’s port power trunks may overheat.
- Breakwater tugs can help only if trust or terms have been established.

### Required revelations

- A staged multi-vessel tow is safer than a single heroic tractor operation.
- The generation ship carries fabrication capacity valuable to the wider Reef.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Use Breakwater tugs.
- Fabricate distributed tractor relays.
- Attempt a direct high-power tow.
- Evacuate passengers and abandon the hull.

### Outcome families

### distributed-tow

The ship and population reach safety through coordinated tugs and relays.

  - `adjustTrack`: trackId=civilian-strain, amount=-2
  - `grantAsset`: assetId=reef-fabrication-barge, title=Reef Fabrication Barge, playerSummary=The recovered generation ship can fabricate buoys, parts, and emergency habitat systems.
### direct-tow

The Glass Harbor completes the tow but incurs substantial technical debt.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `setFlag`: flagId=port-power-trunks-damaged, value=True
### evacuate-and-abandon

The population survives, but the generation ship and its industrial capacity are lost.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `setFlag`: flagId=generation-ship-lost, value=True

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## Twelve Names

**ID:** `side-twelve-names`  
**Kind:** side  
**Typical duration:** one to three sessions  
**Priority:** 59  
**Calm content:** Yes  
**Delegation:** Allowed

### Player-facing premise

Identify remains from a wreck whose passenger list was falsified, knowing that the result will affect inheritance, asylum, criminal liability, and a public memorial.

### Dramatic question

What is owed to the dead when truthful identification destabilizes the living?

### Anchors

- Locations: ossuary-loop, aster-basin
- Actors: nema-voss, lira-quell
- Factions: drift-concord, breakwater-guild, kheled-protectorate

### Objectives

- Recover and preserve the remains.
- Reconstruct the falsified passenger list.
- Notify affected families or representatives.
- Resolve evidence and identity custody.
- Support a memorial or lawful deferral.

### Active pressures

- Several identities were falsified to protect asylum claims.
- Inheritance and criminal cases depend on the result.
- Public release can expose surviving relatives.

### Required revelations

- The falsification combined humanitarian protection, smuggling, and one deliberate disappearance.
- Not every family wants the same form of truth or memorial.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Publish all verified identities.
- Use protected legal disclosure.
- Create a memorial that separates names from sensitive records.
- Defer disputed identifications while preserving evidence.

### Outcome families

### protected-truth

Identities are restored through protected disclosure and a consent-based memorial.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `grantAsset`: assetId=ossuary-memorial-council, title=Ossuary Memorial Council, playerSummary=A trusted council can arbitrate remains and cultural-property disputes.
### full-publication

The complete list enters the public record, enabling accountability while exposing some survivors and claims.

  - `adjustTrack`: trackId=chart-exposure, amount=1
  - `adjustTrack`: trackId=civilian-strain, amount=0
### preserved-deferral

Evidence is preserved and several identities remain sealed until legitimate consent or adjudication is possible.

  - `adjustTrack`: trackId=civilian-strain, amount=0

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## The Thirty-Third Buoy

**ID:** `side-recover-the-thirty-third`  
**Kind:** side  
**Typical duration:** one to two sessions  
**Priority:** 55  
**Calm content:** Yes  
**Delegation:** Allowed

### Player-facing premise

Recover a prototype gravitic buoy trapped in a recurring shear pocket or decide whether the time, crew exposure, and engineering effort are worth one additional survey asset.

### Dramatic question

When does scarcity justify risking people to recover equipment?

### Anchors

- Locations: quiet-shelf, saint-caligo-wreckfield
- Actors: bram-ochoa
- Factions: starfleet-survey-command, breakwater-guild

### Objectives

- Locate the prototype buoy.
- Evaluate recovery risk.
- Recover, repair, trade, or abandon it.
- Update survey stores.
- Record lessons for future buoy deployment.

### Active pressures

- The buoy carries valuable calibration data.
- Recovery-team fatigue is real.
- A Breakwater crew claims partial salvage rights.

### Required revelations

- The prototype’s data can compensate for the sensor pallet’s drift.
- The buoy is not campaign-critical and may be abandoned without blocking any arc.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Remote recovery.
- Joint salvage.
- Direct EVA or shuttle retrieval.
- Abandon it and fabricate conventional replacements.

### Outcome families

### safe-recovery

The buoy and calibration data are recovered without severe cost.

  - `grantAsset`: assetId=calibrated-survey-buoys, title=Calibrated Survey Buoys, playerSummary=Improved buoys reduce uncertainty and support finale route work.
  - `adjustTrack`: trackId=reef-instability, amount=-1
### joint-salvage

Breakwater helps recover the buoy and shares access to its design.

  - `grantAsset`: assetId=calibrated-survey-buoys, title=Calibrated Survey Buoys, playerSummary=Improved buoys reduce uncertainty and support finale route work.
  - `grantAsset`: assetId=breakwater-tug-group, title=Breakwater Tug Group, playerSummary=Guild tugs can support towing, salvage, and evacuation operations.
### abandon-and-fabricate

The buoy is lost, but the crew avoids disproportionate risk and fabricates less capable replacements.

  - `setFlag`: flagId=prototype-buoy-abandoned, value=True

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.
