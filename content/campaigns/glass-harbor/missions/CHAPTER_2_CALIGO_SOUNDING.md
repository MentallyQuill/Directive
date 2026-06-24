# Chapter 2: Caligo Sounding


## The Caligo Sounding

**ID:** `chapter-2-caligo-sounding`  
**Kind:** main  
**Typical duration:** three to five sessions  
**Priority:** 93  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Enter Saint Caligo Wreckfield to recover a trapped survey team, secure unstable ordnance, and determine why wrecks from unrelated eras have migrated into the same gravitic pattern.

### Dramatic question

Who owns evidence and dangerous salvage when rescue, history, and security cannot be separated?

### Anchors

- Locations: saint-caligo-wreckfield, bellweather-anchorage, ossuary-loop
- Actors: bram-ochoa, nema-voss
- Factions: breakwater-guild, starfleet-survey-command

### Objectives

- Locate and recover the trapped survey team or establish a credible alternate rescue plan.
- Prevent unstable weapons or reactors from threatening inhabited routes.
- Negotiate evidence and salvage custody with Breakwater crews and memorial authorities.
- Compare wreck trajectories from several historical periods.
- Leave the field with an explicit policy for future recovery operations.

### Active pressures

- The trapped team’s life support is failing while several wrecks continue to migrate.
- A damaged torpedo magazine can be neutralized, towed, or abandoned, each with different costs.
- Breakwater crews have legal and practical claims to recovered material but incomplete safety data.
- The field contains culturally protected remains and classified military evidence in overlapping hulls.

### Required revelations

- Wrecks from different eras share a repeating drift vector inconsistent with natural capture alone.
- Breakwater recovered a gravitic coupler from a buried structure and connected it to a salvage power rig.
- The coupler’s surges correlate with lane inversions elsewhere in the Reef.
- The missing shuttle’s transponder briefly appeared in archival noise near the field before moving toward an uncharted volume.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Lead a direct rescue and defer salvage or evidence collection.
- Coordinate Breakwater tugs, Starfleet teams, and memorial custodians under a temporary recovery charter.
- Use remote drones, transporter tags, controlled detonation, towing, or engineering isolation.
- Seize dangerous material under Starfleet emergency authority and accept political consequences.
- Withdraw after saving lives and preserve the wreckfield as an unresolved hazard.

### Outcome families

### rescue-and-evidence

The team survives, the gravitic pattern is documented, and custody arrangements preserve both evidence and cultural claims.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `adjustTrack`: trackId=reef-instability, amount=-1
  - `grantAsset`: assetId=verified-wreck-registry, title=Verified Wreck Registry, playerSummary=Cross-faction records improve identification, evidence custody, and safe salvage.
  - `revealFact`: factId=fact.repeating-wreck-vector, summary=Wrecks from unrelated eras are being drawn by the same repeating gravitic pattern., tags=['shepherd', 'caligo']
  - `revealFact`: factId=fact.breakwater-overloaded-coupler, summary=A salvaged ancient coupler is overloading an unknown field-control system., tags=['shepherd', 'breakwater']
### negotiated-salvage

The rescue succeeds and Breakwater retains broad salvage rights under improved safety rules, but some evidence remains privately held.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `grantAsset`: assetId=breakwater-tug-group, title=Breakwater Tug Group, playerSummary=Guild tugs can support towing, salvage, and evacuation operations.
  - `revealFact`: factId=fact.repeating-wreck-vector, summary=Wrecks from unrelated eras are being drawn by the same repeating gravitic pattern., tags=['shepherd', 'caligo']
### ordnance-first

Weapons hazards are contained and strategic material secured, but survivor or cultural priorities suffer.

  - `adjustTrack`: trackId=raider-consolidation, amount=-1
  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `setFlag`: flagId=caligo-starfleet-seizure, value=True
  - `revealFact`: factId=fact.breakwater-overloaded-coupler, summary=A salvaged ancient coupler is overloading an unknown field-control system., tags=['shepherd', 'breakwater']
### costly-extraction

Some lives and evidence are saved, but the field worsens, a major wreck is lost, or the Glass Harbor incurs significant damage.

  - `adjustTrack`: trackId=reef-instability, amount=1
  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `setFlag`: flagId=caligo-recovery-incomplete, value=True
  - `revealFact`: factId=fact.repeating-wreck-vector, summary=Wrecks from unrelated eras are being drawn by the same repeating gravitic pattern., tags=['shepherd', 'caligo']

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.
