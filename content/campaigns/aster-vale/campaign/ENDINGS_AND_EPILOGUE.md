# Unseen Border: Endings and Epilogue

## End-condition contract

End conditions are committed checkpoint decisions rather than automatic hard stops. Severe events remain true in the current timeline. The player may replay from a retained checkpoint, preserve the branch, accept the ending, or Push On through a package-authored continuation frame when the fiction still supports meaningful agency.

## Ending axes

| Axis | Question |
| --- | --- |
| Refugee Safety | Whether displaced people retain life, family unity, shelter, representation, and freedom from forced extraction. |
| Navigation and Access | Whether the March remains physically navigable and whether route access is public, tiered, local, coercive, or lost. |
| Border Stability | Whether Hadran spillover and armed enforcement are contained, negotiated, deterred, or transformed into open conflict. |
| Criminal Control | Whether transport scarcity remains a source of debt, coercion, disappearance, and private rule. |
| Truth and Accountability | What evidence survives, who may access it, and whether protective and abusive uses of the Protocol can be distinguished and reviewed. |
| Ship and Command | The condition of the Aster Vale, the player's command status, Kellan's future, Halden's status, and the crew's trust. |

## Result bands

| Band | Meaning |
| --- | --- |
| Great Success | The March retains safe passage, protected people, accountable evidence, plural custody, and a stable peace without converting every sanctuary into public property. |
| Success | The core crisis is resolved with defensible losses, usable routes, and institutions capable of contesting future decisions. |
| Partial Success | Most people remain safe through continued obscurity and local custody, but formal recognition, equal access, or institutional accountability remains incomplete. |
| Partial Failure | Order and navigation return, but the settlement exposes, centralizes, excludes, or coerces too many of the people it was meant to protect. |
| Failure | The stabilization mandate fails seriously and the March becomes an armed, humanitarian, or criminal battleground. |
| Great Failure | Routes, records, sanctuary, and lawful witness collapse together, leaving survivors scattered through a region no institution can reliably protect or even perceive. |

## Core settlement families

### A Border Seen Clearly

Strong combined success. The March gains accurate and reviewable safety data, tiered or consent-based access where necessary, durable sanctuary protection, reduced criminal coercion, credible Hadran containment or agreement, and evidence that can survive public or protected accountability. Not every route must be public; the strength lies in accountable distinctions and workable institutions.

### Protected March

Partial success. Most vulnerable people remain safe through local custody, restricted visibility, relocation, or compartmented records. Navigation and formal accountability remain incomplete, and the settlement depends on relationships or practices that may be difficult to scale or audit.

### Restored Border

Operational order returns through Starfleet or another central regime. Traffic and enforcement become predictable, but local consent, sanctuary, asylum, or independent review are weakened. This can prevent immediate violence while reproducing the political conditions that made disappearance useful.

### Open Roads, Closed Eyes

Traffic moves through bargains with coercive carriers, corrupt customs, or politically convenient non-enforcement. Some people are rescued and commerce recovers, but accountability and equal access remain compromised.

### A Line of Fire

Armed conflict, blockade, retaliatory exposure, or mass displacement defines the ending. Individual rescues and evidence may survive, but the regional settlement fails to keep the border from becoming a battlefield.

### Unseen Border

Great failure. Routes, records, sanctuary, and witness systems collapse together. People survive only through flight, criminal dependency, or undocumented isolation; no institution can reliably account for who disappeared or why.

## Authored end conditions

### The Lines We Keep Resolved

**ID:** `completion.unseen-border.lines-we-keep-resolved`  
**Family:** authoredCompletion  
**Severity:** completion  
**Default terminal band:** Success

The Lacuna March campaign has reached an authored settlement and command review.

**Trigger:** Any of: quest epilogue-the-lines-we-keep is resolved; flag unseen-border-complete = True

**Push On:** never. Continuation frames: none.

**Director note:** Resolve from committed campaign state. Do not create this terminal state from one casual hidden roll or one failed check.

### Player Death in Command

**ID:** `terminal.unseen-border.player-death-command`  
**Family:** playerDeath  
**Severity:** terminalCandidate  
**Default terminal band:** Failure

The player dies during an established lethal situation before the Lacuna March settlement is complete.

**Trigger:** All of: playerStatus (status=dead); campaignStatus (status=active)

**Push On:** never. Continuation frames: none.

**Director note:** Player death requires visible lethal risk, a meaningful decision or accumulated consequence, and fair opportunity for response.

### Permanent Command Removal

**ID:** `terminal.unseen-border.permanent-command-removal`  
**Family:** commandRemoval  
**Severity:** terminalCandidate  
**Default terminal band:** Partial Failure

The player is permanently removed from command before the regional settlement is complete.

**Trigger:** Any of: playerStatus (status=permanently-relieved); flag player-permanently-removed = True

**Push On:** whenPlausibleContinuationExists. Continuation frames: court-martial-and-inquiry, relieved-but-advising, protected-witness-outside-command.

**Director note:** Resolve from committed campaign state. Do not create this terminal state from one casual hidden roll or one failed check.

### Aster Vale Destroyed, Mandate Failed

**ID:** `terminal.unseen-border.aster-vale-destroyed-objective-failed`  
**Family:** shipOrBaseLoss  
**Severity:** terminalCandidate  
**Default terminal band:** Great Failure

The Aster Vale is destroyed and the central protection or stabilization objective fails.

**Trigger:** All of: shipState (path=ship.status, equals=destroyed); flag primary-objective-saved = False

**Push On:** whenPlausibleContinuationExists. Continuation frames: survivors-after-aster-vale-loss, aftermath-exodus.

**Director note:** Resolve from committed campaign state. Do not create this terminal state from one casual hidden roll or one failed check.

### Aster Vale Destroyed, People Saved

**ID:** `terminal.unseen-border.aster-vale-destroyed-objective-saved`  
**Family:** shipOrBaseLoss  
**Severity:** terminalCandidate  
**Default terminal band:** Partial Success

The Aster Vale is lost after saving the principal population or settlement objective.

**Trigger:** All of: shipState (path=ship.status, equals=destroyed); flag primary-objective-saved = True

**Push On:** whenPlausibleContinuationExists. Continuation frames: survivors-after-aster-vale-loss, allied-command-at-sable.

**Director note:** Resolve from committed campaign state. Do not create this terminal state from one casual hidden roll or one failed check.

### Aster Vale Lost, Survivors Continue

**ID:** `terminal.unseen-border.aster-vale-lost-survivors-continue`  
**Family:** shipOrBaseLoss  
**Severity:** terminalCandidate  
**Default terminal band:** Partial Failure

The ship is no longer available, but survivors retain a plausible continuation path.

**Trigger:** All of: shipState (path=ship.status, equals=lost); {"not": {"type": "playerStatus", "status": "dead"}}

**Push On:** whenPlausibleContinuationExists. Continuation frames: survivors-after-aster-vale-loss, allied-command-at-sable, aftermath-exodus.

**Director note:** Resolve from committed campaign state. Do not create this terminal state from one casual hidden roll or one failed check.

### A Line of Fire

**ID:** `terminal.unseen-border.line-of-fire-catastrophe`  
**Family:** objectiveCollapse  
**Severity:** terminalCandidate  
**Default terminal band:** Failure

The Lacuna March becomes an active theater of sustained armed conflict.

**Trigger:** Any of: flag line-of-fire-catastrophe = True; civil-war-spillover gte 10

**Push On:** whenPlausibleContinuationExists. Continuation frames: allied-command-at-sable, aftermath-exodus, medical-survival-and-command-gap.

**Director note:** Resolve from committed campaign state. Do not create this terminal state from one casual hidden roll or one failed check.

### Sanctuary Collapse

**ID:** `terminal.unseen-border.sanctuary-collapse`  
**Family:** objectiveCollapse  
**Severity:** terminalCandidate  
**Default terminal band:** Great Failure

The protected settlement network collapses and displaced communities scatter or fall into hostile control.

**Trigger:** Any of: flag sanctuary-collapse = True; All of: refugee-pressure gte 10; regional-legitimacy lte 1

**Push On:** whenPlausibleContinuationExists. Continuation frames: aftermath-exodus, protected-witness-outside-command.

**Director note:** Resolve from committed campaign state. Do not create this terminal state from one casual hidden roll or one failed check.

### Protocol Buried

**ID:** `terminal.unseen-border.protocol-buried-accountability`  
**Family:** packageSpecific  
**Severity:** terminalCandidate  
**Default terminal band:** Partial Failure

The immediate border crisis may be contained, but the evidentiary record and institutional accountability are deliberately buried.

**Trigger:** All of: flag protocol-buried = True; institutional-scrutiny lte 1

**Push On:** whenPlausibleContinuationExists. Continuation frames: court-martial-and-inquiry, protected-witness-outside-command.

**Director note:** Resolve from committed campaign state. Do not create this terminal state from one casual hidden roll or one failed check.

### Black Ledger Mass Disappearance

**ID:** `terminal.unseen-border.black-ledger-mass-disappearance`  
**Family:** objectiveCollapse  
**Severity:** terminalCandidate  
**Default terminal band:** Failure

Black Ledger disperses captives and destroys the records needed to find them.

**Trigger:** Any of: flag black-ledger-mass-disappearance = True; All of: criminal-exploitation gte 10; flag black-ledger-purge-triggered = True

**Push On:** whenPlausibleContinuationExists. Continuation frames: allied-command-at-sable, protected-witness-outside-command.

**Director note:** Resolve from committed campaign state. Do not create this terminal state from one casual hidden roll or one failed check.

### Border Regime Collapse

**ID:** `terminal.unseen-border.border-regime-collapse`  
**Family:** objectiveCollapse  
**Severity:** terminalCandidate  
**Default terminal band:** Great Failure

No recognized route or custody regime remains capable of coordinating rescue, passage, or review.

**Trigger:** All of: chart-restoration lte 0; regional-legitimacy lte 0

**Push On:** whenPlausibleContinuationExists. Continuation frames: aftermath-exodus, allied-command-at-sable.

**Director note:** Resolve from committed campaign state. Do not create this terminal state from one casual hidden roll or one failed check.

### Player Resignation or Transfer

**ID:** `terminal.unseen-border.player-resignation-or-transfer`  
**Family:** playerChoice  
**Severity:** terminalCandidate  
**Default terminal band:** Partial Failure

The player deliberately leaves the Aster Vale or Starfleet command before the campaign settlement is complete.

**Trigger:** Any of: playerStatus (status=resigned); playerStatus (status=transferred); flag player-chose-to-leave-command = True

**Push On:** whenPlausibleContinuationExists. Continuation frames: relieved-but-advising, protected-witness-outside-command.

**Director note:** Resolve from committed campaign state. Do not create this terminal state from one casual hidden roll or one failed check.

### Player Chooses to Conclude

**ID:** `terminal.unseen-border.player-choice-conclude`  
**Family:** playerChoice  
**Severity:** terminalCandidate  
**Default terminal band:** Partial Success

The player chooses to conclude the campaign at the current settlement rather than continue unresolved work.

**Trigger:** flag player-requested-campaign-conclusion = True

**Push On:** never. Continuation frames: none.

**Director note:** Resolve from committed campaign state. Do not create this terminal state from one casual hidden roll or one failed check.

## Continuation frames

### Court-Martial and Inquiry

Play continues through investigation, testimony, evidence custody, and the remaining March mandate under constrained authority.

**Playable role:** Constrained commander, attached investigator, or material witness.  
**Authority:** The player no longer exercises unrestricted command but remains a material witness and may retain limited mission authority.

**Plausibility signals**

- A surviving record, lawful hearing authority, and unresolved regional duties.

**Player-facing start:** The next scene begins under inquiry. Your authority is constrained, but your testimony and evidence can still shape the Lacuna March.

### Relieved but Advising

A successor holds the conn while the player remains aboard as a specialist adviser during the unresolved crisis.

**Playable role:** Senior adviser, mission specialist, or protected former acting captain.  
**Authority:** The legal chain of command has changed; the player retains expert access and influence but cannot issue general orders.

**Plausibility signals**

- The Aster Vale remains operational and a lawful successor is available.

**Player-facing start:** You no longer hold the conn, but the March still depends on knowledge and relationships only you possess.

### Survivors after the Aster Vale

Play continues from shuttles, local craft, or a surviving outpost after the ship is destroyed or rendered irrecoverable.

**Playable role:** Senior surviving officer coordinating rescue and continuation.  
**Authority:** Authority derives from emergency succession, survivor coordination, and any functioning local compact.

**Plausibility signals**

- The player survives, some crew or civilians survive, and at least one operational base or craft remains.

**Player-facing start:** The Aster Vale is gone. Command now means keeping survivors, witnesses, and the remaining routes from disappearing with her.

### Allied Command at Sable

The campaign continues from Sable Crossing under a joint local-Starfleet emergency command.

**Playable role:** Starfleet co-commander or liaison with defined regional powers.  
**Authority:** The player shares operational authority with Sable and other participating councils under a negotiated compact.

**Plausibility signals**

- Sable remains functional and at least one local authority accepts the player.

**Player-facing start:** Sable has given you a table, not a throne. Every order now carries more than one signature.

### Aftermath Exodus

The campaign continues as a mobile evacuation and resettlement operation after sanctuary or border collapse.

**Playable role:** Flotilla commander, convoy XO, or senior rescue coordinator.  
**Authority:** The player commands or coordinates a flotilla whose legitimacy comes from protecting displaced people in motion.

**Plausibility signals**

- A viable convoy, surviving route knowledge, and a destination or negotiation target.

**Player-facing start:** The border failed, but its people remain. The next command is to carry them somewhere they can become visible without becoming prey.

### Medical Survival and Command Gap

Play continues after severe injury through recovery, remote advice, and a contested succession aboard or ashore.

**Playable role:** Injured commander participating through briefings, testimony, and bounded decisions.  
**Authority:** The player retains standing but cannot exercise ordinary continuous command until medically restored or formally reassigned.

**Plausibility signals**

- The player survives and communication with command or regional actors remains possible.

**Player-facing start:** You survived, but the command structure moved while you were in sickbay. The March still asks for decisions your body may not let you enforce.

### Protected Witness Outside Command

The player leaves normal Starfleet command but remains central to the public and protected record of the Protocol.

**Playable role:** Protected witness, civilian adviser, or former officer during settlement.  
**Authority:** Influence derives from testimony, relationships, and custody of evidence rather than rank authority.

**Plausibility signals**

- The player survives with material evidence or witness standing.

**Player-facing start:** Your rank no longer decides who listens. Your record, witnesses, and choices still might.

## Epilogue procedure

The Lines We Keep is a playable settlement operation, not only a montage. It should establish route records, protected annexes, review authority, custody transfers, outstanding warrants or amnesties, refugee and family status, Kellan and Halden’s disposition, crew assignments, ship repairs, public narrative, and future obligations.

The final campaign band is derived after all axes are evaluated. A destroyed Aster Vale can coexist with operational or political success if the central objective and people survive. A physically intact ship can coexist with failure if the region becomes coercive, unaccountable, or uninhabitable.

## No-gotcha rule

Player death, senior-officer death, permanent command removal, ship destruction, sanctuary collapse, or mass disappearance requires visible risk, causal setup, meaningful choice or accumulated consequence, and normal professional competence. Exploration mode converts most lethal terminal states into severe recoverable outcomes. Command mode permits them when fair and established.
