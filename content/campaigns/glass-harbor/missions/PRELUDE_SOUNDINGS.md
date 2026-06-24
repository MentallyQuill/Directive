# Prelude: Soundings


## Soundings

**ID:** `prelude-soundings`  
**Kind:** onboarding  
**Typical duration:** two to four sessions  
**Priority:** 100  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Join the U.S.S. Glass Harbor as its newly promoted Executive Officer, establish a working command rhythm, and take the conn when a convoy rescue and gravitic inversion strand Captain Amina Rhos beyond contact.

### Dramatic question

What kind of acting captain takes command when loyalty, rescue, and incomplete information collide?

### Anchors

- Locations: lagrange-gate, quiet-shelf
- Actors: lysa-mbeki, amina-rhos
- Factions: starfleet-survey-command

### Objectives

- Complete the command handover with Captain Rhos and review the Glass Harbor’s known limitations.
- Set priorities for convoy assistance, sensor calibration, and survey-buoy custody.
- Respond when the lane inversion separates Rhos’s shuttle and destabilizes the civilian convoy.
- Complete the rescue or withdrawal with an explicit search posture for the missing shuttle.
- Accept or contest Starfleet confirmation as Acting Captain and reach a stable anchorage.

### Active pressures

- The civilian convoy will enter lethal shear before a prolonged shuttle search can be completed.
- The Glass Harbor’s replacement gravimetric pallet produces contradictory readings under rapidly changing shear.
- The tractor emitters can hold a corridor or stabilize a transport, but prolonged use overheats the port power trunks.
- The senior staff has established routines under Rhos and is now evaluating the player’s judgment under genuine uncertainty.

### Required revelations

- The Glass Harbor can save the convoy, preserve the ship, and conduct a limited search, but cannot maximize all three without cost.
- The lane inversion is a real regional phenomenon, not sabotage or a Crown attack.
- Rhos’s shuttle transmitted a low-power course correction toward the Reef interior before contact failed.
- The acting command is legally temporary but operationally complete until Rhos returns or Starfleet installs a replacement.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Prioritize convoy stabilization and delegate the shuttle search to probes or a local craft.
- Commit the Glass Harbor to a short, high-risk search before withdrawing to complete the rescue.
- Use tractor control, transporter relays, shuttlecraft, or coordinated civilian maneuvers in any workable combination.
- Request Kheled or civilian assistance and accept the political obligations that follow.
- Refuse immediate acting command and require Starfleet to clarify legal authority while the crew continues emergency operations.

### Outcome families

### balanced-command

Most civilians survive, the ship reaches anchorage with manageable damage, and a disciplined search record preserves multiple routes to Rhos.

  - `adjustTrack`: trackId=crew-succession-confidence, amount=1
  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `adjustClock`: clockId=clock.rhos-survival, amount=1
  - `setFlag`: flagId=player-acting-captain, value=True
### captain-first

The search gains strong evidence or narrows Rhos’s path, but the convoy suffers avoidable losses or dispersal.

  - `adjustTrack`: trackId=crew-succession-confidence, amount=0
  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `adjustClock`: clockId=clock.rhos-survival, amount=2
  - `revealFact`: factId=fact.rhos-course-correction, summary=Rhos’s shuttle corrected toward an unknown stable volume inside the Reef., tags=['rhos', 'search']
  - `setFlag`: flagId=player-acting-captain, value=True
### rescue-first

The convoy is saved decisively, but the missing shuttle trail degrades and the crew must accept a slower search.

  - `adjustTrack`: trackId=civilian-strain, amount=-2
  - `adjustTrack`: trackId=crew-succession-confidence, amount=1
  - `adjustClock`: clockId=clock.rhos-survival, amount=-1
  - `setFlag`: flagId=player-acting-captain, value=True
### costly-hold

The ship remains in the inversion too long, saving some lives and data at the price of damage, fatigue, and a harder opening position.

  - `adjustTrack`: trackId=reef-instability, amount=1
  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `adjustTrack`: trackId=crew-succession-confidence, amount=-1
  - `setFlag`: flagId=glass-harbor-opening-damage, value=True
  - `setFlag`: flagId=player-acting-captain, value=True

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.
