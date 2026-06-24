# The Broken Accord Designed Side Assignments

Side assignments are persistent regional or shipboard work. They may be completed, delayed, delegated where allowed, transformed, or ignored.

## Rain at Noon

- **ID:** `rain-at-noon`
- **Kind:** side
- **Initial status:** `latent`
- **Typical duration:** one to three sessions
- **Locations:** Nacre, Umbra Manifold
- **Actors:** Doctor Lyra Veen, Speaker Mara Senn, Ila Tovan, Chief Petty Officer Bol Tressa
- **Factions:** Nacre Assembly, Lattice Engineers' Union
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Allowed. A qualified engineering-medical team can lead the repair, but consuming promised parts requires explicit command authorization.
- **Calm content:** No

### Player-safe premise

A Nacre city's shield grid fails during a corrosive storm, and the fastest repair would consume parts promised to another world.

### Director purpose

The assignment is a focused municipal emergency. City crews know the shield network but lack replacement emitters. The Eudora Vale can divert industrial feedstock, borrow from Umbra, accept narrower protection, or evacuate exposed districts. The decision must persist as a resource and relationship consequence rather than becoming a disposable rescue vignette.

### Dramatic question

> When every spare part already belongs to another promised future, whose immediate danger receives it?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "prelude-the-captains-chair"
    }
  ]
}
```

### Objectives

- Protect exposed districts during the storm.
- Choose the source and future cost of replacement emitters.
- Treat exposure and preserve shelter access.
- Leave city crews able to maintain the repaired system.

### Pressures

- Corrosive rain reaches the weakest shield sectors within hours.
- The needed emitters are allocated to Ferrum, Umbra, or a ship repair.
- Transporters and shelters cannot move the entire exposed population.
- Nacre expects another promise that its emergency can wait.

### Revelations and clue resilience

- **shield-maintenance-underfunded:** Nacre shield failures reflect long-term diversion of maintenance resources. Required: True. Alternate routes allowed: True.
- **local-bypass-design:** City technicians possess a reliable low-power bypass if given time and authority. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Divert shipboard parts and accept feedstock loss.
- Borrow components from Umbra and replace them later.
- Use a temporary low-power bypass and targeted evacuation.
- Move people rather than repair the entire grid.
- Refuse diversion and support local improvisation only.

### Outcome families

#### full-shield-restoration

The shield grid is restored with Starfleet parts, preventing casualties and consuming a major reserve.

**Persistent effects:** adjust `resource-reserves` by -2; adjust `nacre-secession-pressure` by -1; adjust `public-legitimacy` by +1; adjust `clock.ferrum-heat-reserve` by +1; grant asset `nacre-rain-shield-network` (Nacre Rain Shield Network); set `location.nacre.rainShieldCapacity` to `improved`
#### local-bypass

Local crews implement a lower-capacity bypass with Starfleet support, preserving parts while accepting smaller exposed zones.

**Persistent effects:** adjust `resource-reserves` by +0; adjust `distribution-equity` by +1; grant asset `nacre-shield-crews` (Nacre Shield Crews); set `location.nacre.rainShieldCapacity` to `fragile-but-local`
#### targeted-evacuation

The most exposed districts evacuate successfully while the damaged grid remains an unresolved finale risk.

**Persistent effects:** adjust `resource-reserves` by -1; adjust `public-legitimacy` by +0; grant asset `nacre-evacuation-routes` (Nacre Evacuation Routes); set `location.nacre.rainShieldCapacity` to `damaged`
#### storm-casualties

Repair or evacuation fails to cover all exposed districts, creating preventable casualties and stronger secession pressure.

**Persistent effects:** adjust `public-legitimacy` by -1; adjust `nacre-secession-pressure` by +2; adjust `ecological-continuity` by -1; set `location.nacre.rainShieldCapacity` to `critical`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## Salt Debt

- **ID:** `salt-debt`
- **Kind:** side
- **Initial status:** `latent`
- **Typical duration:** one to three sessions
- **Locations:** Pelagos, Caldera Array, Crown Station
- **Actors:** Councillor Rian Oso, Asha Ren, Haro ch'Veth
- **Factions:** Pelagic Council, Ilyra Accord Secretariat
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Allowed. A delegated audit can succeed, but force, quota, and representation choices require command guidance.
- **Calm content:** No

### Player-safe premise

Pelagic communities dispute water exports calculated from outdated population records and threaten to block transfer platforms.

### Director purpose

The export formula counts some abandoned districts and omits newer floating cities, producing obligations that are numerically precise and politically obsolete. The player can conduct a census, establish provisional quotas, recognize city-level bargaining, or enforce the old ledger during emergency. This side quest should inform later water assets and legitimacy without secretly becoming the whole rotation plot.

### Dramatic question

> When a shared obligation is measured by an obsolete record, is compliance justice or merely precision?

### Availability

```json
{
  "any": [
    {
      "type": "questResolved",
      "questId": "chapter-2-the-weight-of-water"
    },
    {
      "type": "questResolved",
      "questId": "chapter-1-bread-and-weather"
    }
  ]
}
```

### Objectives

- Compare current populations, reserves, and infrastructure against the export formula.
- Keep water transfer sites safe and nonviolent.
- Establish a legitimate temporary quota or suspension.
- Create records usable by the interim regime.

### Pressures

- Residents occupy transfer controls without damaging them.
- Aurelia treats any delay as a threat to food security.
- A complete new census takes longer than current reserves allow.
- Floating cities have different exposure and export histories.

### Revelations and clue resilience

- **export-ledger-obsolete:** Pelagic water obligations rely on obsolete population and infrastructure records. Required: True. Alternate routes allowed: True.
- **city-level-variation:** Some communities have overcontributed while others benefited from undercounting. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Run a rapid transparent census and provisional formula.
- Suspend exports until a full audit.
- Negotiate city-specific quotas.
- Enforce the old system temporarily with a binding expiration.
- Treat the occupation as civil disobedience and maintain transfer by alternate crews.

### Outcome families

#### rapid-census-ledger

A transparent provisional census produces trusted quotas and a durable water ledger.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `distribution-equity` by +1; grant asset `pelagic-water-ledger` (Pelagic Water Ledger); set `pelagic-ledger-reformed` to `True`
#### city-specific-accords

Floating cities negotiate differentiated obligations, improving consent while complicating systemwide scheduling.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `lattice-integrity` by +0; grant asset `pelagic-city-contacts` (Pelagic City Contacts); set `pelagic-city-quotas` to `True`
#### temporary-old-formula

Exports continue under an explicit short deadline, preserving immediate supply while leaving political debt.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `public-legitimacy` by -1; set `pelagic-old-formula-deadline` to `True`
#### enforced-transfer

The platforms are cleared or bypassed and water flows, but community trust and future cooperation deteriorate.

**Persistent effects:** adjust `resource-reserves` by +1; adjust `public-legitimacy` by -2; advance `front.public-legitimacy` by 1; set `pelagic-transfer-enforced` to `True`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## The Children of Ferrum

- **ID:** `children-of-ferrum`
- **Kind:** side
- **Initial status:** `latent`
- **Typical duration:** one to three sessions
- **Locations:** Ferrum, Khepri City, Ilyra Habitat Six
- **Actors:** Foreperson Dela Marr, Convenor Kesh Var, Ila Tovan, Coordinator Nia Tess
- **Factions:** Ferrum Combine, Lattice Engineers' Union, Accord Security Service
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Allowed. Delegation is appropriate if the rescue team has explicit instructions about strike neutrality and access.
- **Calm content:** No

### Player-safe premise

A school habitat loses heat during a labor stoppage, testing whether emergency aid respects or undermines the strike.

### Director purpose

The school is physically connected to an industrial district whose workers have stopped nonessential operations. Security and management claim the strike caused the loss; union logs show a deferred maintenance failure. The player can provide direct aid, ask union crews to treat the school as life-safety work, compel access, or relocate children. The assignment should remain about labor, safety, and care rather than revealing a hidden villain.

### Dramatic question

> Can command save people without turning humanitarian aid into a weapon against lawful collective action?

### Availability

```json
{
  "any": [
    {
      "type": "clockThreshold",
      "clockId": "clock.union-strike",
      "operator": "gte",
      "value": 3
    },
    {
      "type": "questResolved",
      "questId": "chapter-3-borrowed-breath"
    }
  ]
}
```

### Objectives

- Protect students and staff before exposure becomes critical.
- Determine whether the stoppage, deferred maintenance, or management choices caused the failure.
- Avoid converting emergency aid into strikebreaking unless the player explicitly chooses that course.
- Keep the school community intact where possible.

### Pressures

- Children and staff have limited thermal reserve.
- Both management and labor want the rescue interpreted in support of their position.
- Union pickets control the safest maintenance route.
- Evacuation is feasible but disruptive and politically symbolic.

### Revelations and clue resilience

- **deferred-maintenance-cause:** Deferred maintenance rather than the strike caused the primary heat failure. Required: True. Alternate routes allowed: True.
- **union-life-safety-exception:** Union rules already permit life-safety repair if management does not use it to restart production. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Negotiate a union life-safety repair.
- Use Starfleet engineers without restarting production.
- Evacuate the school and leave the industrial system offline.
- Compel access and restore the full district.
- Support management replacement crews.

### Outcome families

#### life-safety-repair

Union and Starfleet crews restore the school under a written non-strikebreaking agreement.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `clock.union-strike` by -1; grant asset `ferrum-mutual-aid` (Ferrum Mutual Aid); set `location.ferrum.schoolHabitat` to `safe`
#### evacuation-respected

The school evacuates safely while the labor dispute remains intact and production stays halted.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `resource-reserves` by -1; grant asset `ferrum-evacuation-plan` (Ferrum Evacuation Plan); set `location.ferrum.schoolHabitat` to `evacuated`
#### full-district-restoration

The district is restored under emergency authority, saving the school but effectively breaking part of the stoppage.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `public-legitimacy` by -1; adjust `clock.union-strike` by +2; set `ferrum-strike-undermined` to `True`
#### exposure-losses

Delay, access conflict, or technical failure causes serious exposure casualties and hardens every side.

**Persistent effects:** adjust `public-legitimacy` by -2; adjust `clock.union-strike` by +2; advance `front.engineers-mobilization` by 1; set `location.ferrum.schoolHabitat` to `casualties`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## A Forest Under Glass

- **ID:** `forest-under-glass`
- **Kind:** side
- **Initial status:** `latent`
- **Typical duration:** one to two sessions
- **Locations:** Viridia, Oros Valley Reserve
- **Actors:** Ecologist Sorel Thann, Haro ch'Veth, Lieutenant junior grade Sava Nirel
- **Factions:** Viridian Conservancy
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Allowed. Delegation is safe if substitute load and local consent are already defined. The assignment should remain calm unless current state requires otherwise.
- **Calm content:** Yes

### Player-safe premise

Viridian scientists ask Starfleet to quarantine a valley from lattice processing so an endangered ecosystem can recover.

### Director purpose

The valley is not secretly a strategic site. It is a calm scientific and ethical assignment with real regional consequences. Quarantine requires a substitute processing path, reduced system demand, or acceptance of short-term load elsewhere. The player may authorize a limited preserve, collect a seed and microbiome archive, build a transparent enclosure, or refuse. Direct action by extremists should not intrude unless current campaign state causally brings it here.

### Dramatic question

> What does preservation mean when the protected place still depends on the wider system that is harming it?

### Availability

```json
{
  "any": [
    {
      "type": "questResolved",
      "questId": "chapter-4-the-green-lung"
    },
    {
      "type": "frontStage",
      "frontId": "front.ecological-overshoot",
      "operator": "gte",
      "value": 2
    }
  ]
}
```

### Objectives

- Establish the valley's ecological functions and recovery threshold.
- Define what processing, access, and intervention are prohibited.
- Account for the load displaced by protection.
- Protect local stewardship and scientific continuity.

### Pressures

- Quarantine immediately shifts processing burden elsewhere.
- A sealed preserve can become a laboratory controlled by outsiders.
- Ecological recovery takes longer than the campaign.
- The valley becomes a symbol of whether any place may be protected from system necessity.

### Revelations and clue resilience

- **valley-recovery-possible:** The valley can recover if load remains below a defined threshold for several years. Required: True. Alternate routes allowed: True.
- **microbiome-regional-value:** Its microbiome can improve future orbital catalysts without destroying the source ecosystem. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Authorize a full quarantine with substitute processing.
- Create a rotating low-load preserve.
- Build a seed, microbiome, and species archive without full quarantine.
- Protect only the most critical habitats.
- Refuse quarantine and prioritize system survival.

### Outcome families

#### full-valley-quarantine

The valley receives enforceable protection and replacement processing is found elsewhere.

**Persistent effects:** adjust `ecological-continuity` by +2; adjust `resource-reserves` by -1; grant asset `viridian-ecological-reserve` (Viridian Ecological Reserve); set `location.viridia.protectedValley` to `quarantined`; set `calm-content-completed` to `True`
#### rotating-preserve

A monitored rotation lowers load enough for partial recovery while retaining limited system service.

**Persistent effects:** adjust `ecological-continuity` by +1; adjust `lattice-integrity` by +0; grant asset `viridian-recovery-baseline` (Viridian Recovery Baseline); set `location.viridia.protectedValley` to `partial-recovery`; set `calm-content-completed` to `True`
#### living-archive

A consent-governed ecological archive preserves material and knowledge without protecting the entire valley.

**Persistent effects:** adjust `ecological-continuity` by +0; grant asset `viridian-living-archive` (Viridian Living Archive); set `location.viridia.protectedValley` to `documented-at-risk`; set `calm-content-completed` to `True`
#### quarantine-refused

The valley remains active processing capacity and continues to deteriorate.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `ecological-continuity` by -1; set `location.viridia.protectedValley` to `declining`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## The Engineer's Oath

- **ID:** `engineers-oath`
- **Kind:** side
- **Initial status:** `latent`
- **Typical duration:** one to three sessions
- **Locations:** Crown Station, Harmonic Spindle, U.S.S. Eudora Vale
- **Actors:** Milo Fenn, Convenor Kesh Var, First Minister Elian Vorr, Rear Admiral Celeste Osei
- **Factions:** Lattice Engineers' Union, Ilyra Accord Secretariat, Starfleet Ilyra Review Mission
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. Evidence review can be delegated; Fenn's duty status and the accountability framework are direct command responsibilities.
- **Calm content:** Yes

### Player-safe premise

Fenn confronts former colleagues who signed false lattice certifications under political pressure and must decide what professional accountability requires now.

### Director purpose

The records show a spectrum: some engineers knowingly falsified, some accepted narrow scopes, some trusted curated data, and some objected privately. Fenn missed the permanent cost shift in a Federation-assisted review. This is a crew and institutional accountability quest, not a courtroom with one correct verdict. The player controls duty assignments, evidence handling, immediate suspensions, and support for disclosure.

### Dramatic question

> How should command use expertise that is necessary, compromised, and capable of telling the truth now?

### Availability

```json
{
  "any": [
    {
      "type": "questResolved",
      "questId": "chapter-5-the-public-model"
    },
    {
      "type": "factKnown",
      "factId": "fact.public-model-omits-burden"
    }
  ]
}
```

### Objectives

- Determine who signed what, under which data and pressure.
- Address Fenn's disclosure, culpability, and continued engineering role.
- Avoid disabling needed expertise without a replacement plan.
- Create a credible professional and legal response beyond scapegoating.

### Pressures

- Many implicated engineers are essential to current safety.
- Nacre and opposition figures demand names and immediate suspensions.
- Fenn may ask to step down or overwork to compensate.
- Culpability differs across scopes, data access, intent, and later conduct.

### Revelations and clue resilience

- **fenn-certification-scope:** Fenn certified node integrity from curated data and failed to challenge excluded Nacre categories. Required: True. Alternate routes allowed: True.
- **engineer-objections-buried:** Some engineers documented objections that were removed from final reports. Required: False. Alternate routes allowed: True.
- **intent-varies:** The certification record contains negligence, coercion, compartmentalization, and deliberate falsification rather than one category. Required: True. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Keep Fenn in role under disclosure and independent review.
- Temporarily relieve Fenn while preserving advisory access.
- Publish the full certification chain and let a joint board differentiate culpability.
- Protect names until the crisis is contained.
- Treat the issue as professional reform rather than immediate legal action.

### Outcome families

#### candor-with-duty

Fenn remains chief engineer under transparent review, and engineers provide complete records without automatic removal.

**Persistent effects:** adjust `crew-command-confidence` by +1; adjust `public-legitimacy` by +1; grant asset `engineering-candor-network` (Engineering Candor Network); reveal `fact.fenn-certification`; set `fenn-disclosed-and-retained` to `True`
#### temporary-relief

Fenn steps aside from direct command while supporting a replacement and formal review.

**Persistent effects:** adjust `crew-command-confidence` by +0; adjust `lattice-integrity` by -1; adjust `public-legitimacy` by +1; set `fenn-temporarily-relieved` to `True`; reveal `fact.fenn-certification`
#### sealed-until-crisis

The record remains sealed to preserve capacity, protecting operations while increasing future trust and scrutiny costs.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `public-legitimacy` by -1; adjust `starfleet-scrutiny` by +1; set `certification-record-sealed` to `True`
#### scapegoat-purge

Broad suspensions satisfy immediate anger but remove critical expertise and obscure differentiated responsibility.

**Persistent effects:** adjust `public-legitimacy` by +0; adjust `lattice-integrity` by -2; adjust `resource-reserves` by -1; set `engineering-purge` to `True`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## Weather for Sale

- **ID:** `weather-for-sale`
- **Kind:** side
- **Initial status:** `latent`
- **Typical duration:** one to three sessions
- **Locations:** Ilyra Habitat Six, Crown Station, Harmonic Spindle
- **Actors:** Alix Meral, Foreperson Dela Marr, Councillor Rian Oso, Asha Ren
- **Factions:** Helioform Consortium, Ferrum Combine, Ilyra Accord Secretariat
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Allowed. Technical and legal review can be delegated, but operating control and debt commitments require explicit command and local authority.
- **Calm content:** No

### Player-safe premise

Helioform Consortium offers rapid stabilization hardware in exchange for long-term operating control, data ownership, and priority repayment.

### Director purpose

The technology is functional and can materially help. The danger is not sabotage but lock-in: proprietary maintenance, climate telemetry ownership, debt service, and the ability to prioritize paying jurisdictions. The player can accept, reject, renegotiate, license components, or use Helioform only as a temporary contractor. Local actors disagree based on urgent need and political sovereignty.

### Dramatic question

> When a private rescue works, what makes accepting it different from selling future control of survival?

### Availability

```json
{
  "any": [
    {
      "type": "questResolved",
      "questId": "chapter-11-terms-of-survival"
    },
    {
      "type": "trackThreshold",
      "trackId": "resource-reserves",
      "operator": "lte",
      "value": 4
    }
  ]
}
```

### Objectives

- Verify processor performance, integration risk, and maintenance requirements.
- Identify control, data, repayment, and termination terms.
- Accept, reject, license, or limit Calyx participation.
- Account for the cost of delay if negotiations fail.

### Pressures

- Calyx can deploy faster than public fabrication if the contract is signed.
- The control system cannot be fully audited without source access Calyx will not freely provide.
- The contract prioritizes repayment and service to contracting jurisdictions.
- Rejecting Calyx may leave no equivalent processor before the cascade.

### Revelations and clue resilience

- **calyx-technology-works:** Calyx processors perform as advertised within defined conditions. Required: True. Alternate routes allowed: True.
- **contract-lock-in:** The full concession grants long-term data, maintenance, and service-priority control. Required: True. Alternate routes allowed: True.
- **license-possible:** Calyx can be pushed toward component licensing if public institutions absorb more risk and cost. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Accept the full concession for immediate capacity.
- Negotiate a time-limited emergency contract with public data ownership.
- License components and integrate them under union operation.
- Reject Calyx and expand public fabrication.
- Use Calyx only for noncritical support systems.

### Outcome families

#### public-license

Helioform licenses key components for union-operated public processors at higher immediate cost.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `resource-reserves` by -2; adjust `public-legitimacy` by +1; grant asset `licensed-calyx-components` (Licensed Calyx Components); set `calyx-public-license` to `True`
#### limited-emergency-contract

A time-limited contract provides rapid capacity with public telemetry and termination rights.

**Persistent effects:** adjust `lattice-integrity` by +2; adjust `resource-reserves` by +1; adjust `public-legitimacy` by +0; grant asset `calyx-emergency-processors` (Calyx Emergency Processors); set `calyx-limited-contract` to `True`
#### full-concession

The full private concession delivers the largest immediate capacity and creates long-term climate governance debt.

**Persistent effects:** adjust `lattice-integrity` by +2; adjust `resource-reserves` by +2; adjust `public-legitimacy` by -2; set `calyx-full-concession` to `True`; grant asset `calyx-processor-capacity` (Calyx Processor Capacity)
#### calyx-rejected

The system rejects private control and accepts slower public construction.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `lattice-integrity` by -1; adjust `clock.next-surge` by +1; set `calyx-rejected` to `True`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## The Cold Library

- **ID:** `the-cold-library`
- **Kind:** side
- **Initial status:** `latent`
- **Typical duration:** one to three sessions
- **Locations:** Nacre, Umbra Manifold
- **Actors:** Speaker Mara Senn, Doctor Lyra Veen, Milo Fenn, Ines Quill
- **Factions:** Nacre Assembly, Lattice Engineers' Union
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Allowed. A specialized team can lead recovery, but evidence-versus-life priorities and custody require command guidance.
- **Calm content:** No

### Player-safe premise

A physical archive beneath an abandoned Nacre maintenance complex is dissolving under chemical intrusion, and it may contain the only uncensored early Accord records.

### Director purpose

The archive offers a resilient evidence route but should not become the sole critical clue. Retrieval requires hazardous entry, local guides, containment, and choices between records, living evacuees, and structural stability. Some records are mundane civic history; preserving them matters beyond the rotation investigation. The archive can reveal the signed rotation schedule, early health data, and local engineering practice.

### Dramatic question

> What deserves rescue from a place the system treated as expendable: proof, memory, or the people still maintaining both?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "prelude-the-captains-chair"
    }
  ]
}
```

### Objectives

- Prevent immediate chemical and structural destruction.
- Protect archivists, maintenance workers, and residents using the complex.
- Choose which legal, technical, medical, and cultural materials receive limited containment.
- Return records to a trusted Nacre or joint repository.

### Pressures

- Corrosive flow destroys physical media and structural supports.
- Transporters and containment cases cannot move the full archive at once.
- Several families and workers shelter in the same complex.
- Starfleet and Secretariat officials want immediate access to selected records.

### Revelations and clue resilience

- **signed-rotation-schedule:** Physical records preserve the original twelve-year rotation schedule. Required: False. Alternate routes allowed: True.
- **local-civic-history:** The archive contains generations of Nacre civic and family records omitted from system institutions. Required: True. Alternate routes allowed: True.
- **early-health-warning:** Early physicians warned that imported load was creating a distinct disease pattern. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Prioritize living occupants and recover only portable records.
- Use ship resources to stabilize the whole archive temporarily.
- Recover legal and technical evidence first.
- Place local cultural records under Nacre custody and copy only agreed evidence.
- Abandon the site when structural risk becomes unacceptable.

### Outcome families

#### archive-and-people-saved

Residents, core civic records, and key evidence survive under Nacre-controlled custody.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `resource-reserves` by -1; grant asset `nacre-cold-archive` (Nacre Cold Archive); reveal `fact.rotation-schedule-physical`; set `location.nacre.coldLibrary` to `preserved`
#### people-first

All occupants survive but much of the archive is lost, preserving human life and leaving other evidence routes necessary.

**Persistent effects:** adjust `public-legitimacy` by +1; grant asset `nacre-community-trust` (Nacre Community Trust); set `location.nacre.coldLibrary` to `mostly-lost`
#### evidence-first

The strongest legal and technical evidence survives, but cultural loss and local resentment shape its use.

**Persistent effects:** adjust `public-legitimacy` by -1; reveal `fact.rotation-schedule-physical`; grant asset `authenticated-rotation-record` (Authenticated Rotation Record); set `location.nacre.coldLibrary` to `cultural-loss`
#### archive-lost

The site collapses or is abandoned; living survivors and partial testimony remain as alternate routes.

**Persistent effects:** adjust `public-legitimacy` by -1; set `cold-library-lost` to `True`; set `location.nacre.coldLibrary` to `destroyed`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## Rhee's Quarters

- **ID:** `rhees-quarters`
- **Kind:** side
- **Initial status:** `latent`
- **Typical duration:** one to two sessions
- **Locations:** U.S.S. Eudora Vale
- **Actors:** Nasrin Rhee, Asha Ren, Venn Talar, Jaya Kel, Rear Admiral Celeste Osei
- **Factions:** Starfleet Ilyra Review Mission
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. Inventory work can be delegated, but command privacy, succession meaning, and emergency access must be decided by the player.
- **Calm content:** Yes

### Player-safe premise

The crew must decide when and how to open Captain Rhee's private files, return personal effects, and preserve command privacy while her unfinished review may matter.

### Director purpose

This is a quiet shipboard command and mourning assignment. Rhee separated personal logs, command records, and privileged correspondence. The player can follow standard inventory, appoint witnesses, defer private material, seek family consent, or open mission-relevant files under emergency authority. Her records reveal suspicion and a bargain for Nacre medical access, but only when access and independent context justify it. Do not turn the scene into Rhee speaking posthumously with perfect answers.

### Dramatic question

> What does command inherit from a dead captain, and what remains hers?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "prelude-the-captains-chair"
    }
  ]
}
```

### Objectives

- Distinguish command records, mission evidence, personal logs, and family property.
- Set witnesses, authority, timing, and privacy rules.
- Address how the crew memorializes Rhee without freezing command culture.
- Secure any mission-relevant material through lawful means.

### Pressures

- Rhee's review may contain time-sensitive evidence or contacts.
- Emergency relevance does not erase personal dignity or family rights.
- How the player handles the quarters becomes a statement about succession.
- Kel and other crew members have direct emotional investment in the process.

### Revelations and clue resilience

- **rhee-suspected-hidden-load:** Rhee suspected hidden Nacre allocation categories before arrival. Required: False. Alternate routes allowed: True.
- **rhee-medical-bargain:** Rhee delayed public escalation in exchange for Nacre medical access and a broader review. Required: False. Alternate routes allowed: True.
- **rhee-no-clean-answer:** Her notes contain unresolved questions and competing duties rather than a final instruction. Required: True. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Open mission files with witnesses and preserve personal privacy.
- Defer all private material until family consent arrives.
- Use emergency authority to review the complete quarters.
- Ask a trusted officer or JAG representative to conduct a filtered review.
- Seal the quarters through the crisis.

### Outcome families

#### bounded-review

Mission records are reviewed with witnesses while personal material remains protected, strengthening command trust.

**Persistent effects:** adjust `crew-command-confidence` by +2; adjust `starfleet-scrutiny` by +0; reveal `fact.rhee-delayed-review`; grant asset `rhee-review-notes` (Rhee Review Notes); set `rhee-quarters-bounded-review` to `True`
#### family-first-deferral

The quarters remain sealed pending family process, preserving privacy and leaving evidence to alternate routes.

**Persistent effects:** adjust `crew-command-confidence` by +1; set `rhee-quarters-sealed` to `True`; set `calm-content-completed` to `True`
#### full-emergency-search

Command gains all mission-relevant information quickly but damages privacy norms and some crew trust.

**Persistent effects:** adjust `crew-command-confidence` by -1; adjust `starfleet-scrutiny` by +1; reveal `fact.rhee-delayed-review`; grant asset `rhee-review-notes` (Rhee Review Notes); set `rhee-quarters-full-search` to `True`
#### quarters-remain-unresolved

No access process gains enough trust, and the quarters remain a live crew and evidence issue.

**Persistent effects:** adjust `crew-command-confidence` by -1; set `thread.thread.rhees-unfinished-command.status` to `active`; set `rhee-quarters-unresolved` to `True`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## The Sixth Habitat

- **ID:** `the-sixth-habitat`
- **Kind:** side
- **Initial status:** `latent`
- **Typical duration:** one to three sessions
- **Locations:** Ilyra Habitat Six, Khepri City, Crown Station
- **Actors:** Coordinator Nia Tess, Foreperson Dela Marr, Asha Ren, Venn Talar
- **Factions:** Lattice Engineers' Union, Ferrum Combine, Ilyra Accord Secretariat
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Allowed. Engineering support can be delegated, but representation and charter standing require explicit command and political engagement.
- **Calm content:** No

### Player-safe premise

An orbital settlement excluded from the Accord demands representation after becoming an emergency transfer point for workers, migrants, and fabrication crews.

### Director purpose

The habitat is neither a planet nor a temporary work camp. It has permanent residents, schools, clinics, maintenance capacity, and no vote in the Accord. During the crisis it absorbs evacuees and industrial traffic, increasing its importance and risk. The player can recognize a delegate, negotiate service obligations, expand life support, or treat it as a logistical facility. Recognition affects the successor charter and finale capacity.

### Dramatic question

> When does a place become a political community rather than infrastructure serving someone else?

### Availability

```json
{
  "any": [
    {
      "type": "questResolved",
      "questId": "chapter-3-borrowed-breath"
    },
    {
      "type": "questResolved",
      "questId": "chapter-11-terms-of-survival"
    },
    {
      "type": "trackThreshold",
      "trackId": "resource-reserves",
      "operator": "lte",
      "value": 5
    }
  ]
}
```

### Objectives

- Verify life support, population, traffic, and emergency-transfer limits.
- Determine the habitat's standing in interim decisions.
- Provide or negotiate power, air, medical, and docking support.
- Set what the habitat contributes and what protections it receives.

### Pressures

- Emergency transfers push life support and docking beyond design limits.
- The old Accord defines political membership by planetary government.
- Ferrum and Heliacal Yard depend on habitat labor while resisting separate representation.
- Evacuees may become permanent residents without clear rights.

### Revelations and clue resilience

- **habitat-permanent-community:** The Sixth Habitat has been a permanent civic community for more than a generation. Required: True. Alternate routes allowed: True.
- **excluded-by-definition:** Accord drafters excluded nonplanetary settlements from representation despite tax and labor obligations. Required: False. Alternate routes allowed: True.
- **finale-logistics-value:** The habitat can serve as a major transfer, shelter, and fabrication coordination node if stabilized. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Recognize a full interim delegate and voting status.
- Grant emergency standing without permanent charter commitment.
- Negotiate service rights and obligations but no political recognition.
- Treat the habitat as a Ferrum dependency.
- Support a referendum among residents on affiliation and status.

### Outcome families

#### full-habitat-recognition

The Sixth Habitat gains interim representation, services, and obligations as a political community.

**Persistent effects:** adjust `public-legitimacy` by +2; adjust `distribution-equity` by +1; adjust `resource-reserves` by +1; grant asset `sixth-habitat-transfer-network` (Sixth Habitat Transfer Network); set `sixth-habitat-recognized` to `True`; set `location.sixth-habitat.civicStatus` to `recognized`
#### emergency-standing

The habitat gains a seat for emergency decisions and guaranteed services pending later constitutional review.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `resource-reserves` by +1; grant asset `sixth-habitat-transfer-network` (Sixth Habitat Transfer Network); set `sixth-habitat-emergency-standing` to `True`; set `location.sixth-habitat.civicStatus` to `provisional`
#### service-compact

A technical service compact stabilizes the habitat without resolving representation.

**Persistent effects:** adjust `resource-reserves` by +1; adjust `public-legitimacy` by +0; grant asset `sixth-habitat-docking` (Sixth Habitat Docking); set `location.sixth-habitat.civicStatus` to `unresolved`
#### continued-exclusion

The habitat remains an administrative dependency and begins withholding toll-free access or labor.

**Persistent effects:** adjust `public-legitimacy` by -1; adjust `resource-reserves` by -1; set `sixth-habitat-excluded` to `True`; set `location.sixth-habitat.civicStatus` to `excluded`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.
