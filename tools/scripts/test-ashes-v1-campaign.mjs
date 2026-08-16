import assert from 'node:assert/strict';
import fs from 'node:fs';

import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';
import {
  eligibleMissionCommandBearingAwards,
  reduceMissionEvidence
} from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionPlayerProjection } from '../../src/mission/v1/player-projection.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { validateShipMechanicsPackage } from '../../src/ship/v1/ship-mechanics-contracts.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const FIXTURE_DIRECTORY = 'tests/fixtures/mission/v1';
const EXPECTED_PACKAGE_ROOTS = [
  'assets',
  'campaign',
  'characterCreation',
  'crew',
  'guardrails',
  'manifest',
  'ship',
  'world'
];
const EXPECTED_SOURCE_CHAIN = [
  'prelude-a-ship-underway',
  'chapter-1-the-empty-convoy',
  'chapter-2-false-colors',
  'open-orders-1-work-worth-doing',
  'chapter-3-dead-letters',
  'chapter-4-the-colony-that-stayed',
  'chapter-5-old-lessons',
  'open-orders-2-what-survives',
  'chapter-6-the-cost-of-knowing',
  'chapter-7-a-peace-of-their-own',
  'open-orders-3-before-the-lamps-go-out',
  'chapter-8-the-last-directive',
  'epilogue-the-terms-we-keep'
];
const EXPECTED_INITIAL_MISSION_TEXT = new Map([
  ['mission.prelude-a-ship-underway', [
    'Prelude: A Ship Underway',
    'Complete the command handover, establish a working command rhythm, and bring the Breckenridge to the Asterion Reach.',
    'Complete the command handover with Captain Whitaker',
    'Establish the authority, expectations, and working boundaries of the new XO assignment.',
    'Establish senior-staff delegation and readiness',
    'Set workable responsibilities and readiness procedures with the senior staff.'
  ]],
  ['mission.chapter-1-the-empty-convoy', [
    'Chapter 1: The Empty Convoy',
    'Respond to Relief Convoy Twelve, protect its people, and bring the immediate crisis to a responsible disposition.',
    'Protect the people of Relief Convoy Twelve',
    'Bring the endangered convoy personnel to a safe disposition or place their care with a competent authority.',
    'Relief Convoy Twelve is powered but silent, with a fragmented distress packet and people in need of assistance.'
  ]],
  ['mission.chapter-2-false-colors', [
    'Chapter 2: False Colors',
    'Answer the accusation against the Breckenridge, protect the wounded, and establish a credible path forward.',
    'Protect the wounded aboard Aegis Two',
    'Bring the injured patrol officers to a responsible care disposition without making treatment political leverage.',
    'Establish a credible account of the attack',
    'Build an independently credible account that can answer the accusation and preserve a responsible next investigative step.',
    'Aegis Two was attacked by a vessel presenting as the U.S.S. Breckenridge. Three patrol officers are injured, the real ship was at the convoy site, and Starfleet-controlled records alone cannot settle the dispute.'
  ]],
  ['mission.open-orders-1-work-worth-doing', [
    'Open Orders I: Work Worth Doing',
    'Choose how the Breckenridge will help the Reach while the Hecate evidence is correlated in the background.',
    'Choose and conclude the Breckenridge\'s local work',
    'Resolve two assignments as a normal load, pursue all three with credible delegation, or knowingly leave early with unfinished opportunities recorded.',
    'The Long Repair',
    'Turn accumulated Breckenridge technical debt into an accountable stabilization plan with bounded Helix Yard support.',
    'Borrowed Wings',
    'Build a credible civilian rescue-pilot capability with honest qualification, command, and abort limits.',
    'Quiet Channels',
    'Preserve useful informal communication while setting bounded authority, security, and accountability for its obligations.',
    'The Long Repair, Borrowed Wings, and Quiet Channels are available. Resolving two is a normal command load; taking on all three requires credible delegation or risks overextension.'
  ]],
  ['mission.chapter-3-dead-letters', [
    'Dead Letters',
    'Trace the counterfeit signal into the Hecate Drift, establish what is operating near Hecate Seven, and leave the site in a defensible state.',
    'Establish a defensible position at Hecate Seven',
    'Find a safe way to investigate the site, accept a recorded access cost, or make a responsible withdrawal that preserves another route forward.',
    'Establish what the Hecate Seven evidence proves',
    'Build the strongest supportable account from what can be recovered at the site; missing direct evidence changes confidence and cost rather than blocking the campaign.',
    'Resolve the site\'s custody',
    'Make informed choices about any dangerous or sensitive material you find, then establish what actually happens to it.',
    'The preserved traffic points toward Hecate Seven, where hazardous conditions make approach, investigation, and withdrawal consequential.'
  ]],
  ['mission.chapter-4-the-colony-that-stayed', [
    'The Colony That Stayed',
    'Demeris has refused Starfleet searches and arrests while offering a negotiated inquiry. Establish a workable process, determine what the evidence supports, and resolve the people, evidence, and risks actually found.',
    'Establish a workable process on Demeris',
    'Find a defensible way to investigate the disputed record under competing local, Starfleet, and witness-protection claims, or make a responsible handoff.',
    'Establish the supported Demeris account',
    'Determine what happened on Demeris, whom it helped or harmed, and what continuing risks the evidence supports without requiring one prescribed investigation path.',
    'Resolve personal and evidentiary accountability',
    'After the relevant record is known, decide how responsible people, evidence, and any resulting risks should be handled, then establish what actually happens to each.',
    'Demeris protects Mira Solenn and refuses unilateral searches or arrests. Governor Marr offers testimony through a negotiated inquiry, while Starfleet, the Compact, and Cardassian witnesses assert competing interests in evidence, jurisdiction, and safety.'
  ]],
  ['mission.chapter-5-old-lessons', [
    'Old Lessons',
    'Conflicting warnings are driving civilian and Compact ships into the Orison Gap as obsolete defenses activate and regional command links fail. Keep the corridor from becoming a killing ground, determine what is causing the crisis and whether it has a coordinated purpose, and leave the Reach with a defensible account.',
    'Stabilize the Orison battlespace',
    'Bring civilian and Compact traffic plus the active defense threat to a defensible result, accepting a recorded cost or responsible handoff when clean control is impossible.',
    'Determine and resolve the crisis\'s purpose',
    'Determine whether the crisis has a coordinated purpose and establish a defensible disposition for any consequential evidence you actually uncover.',
    'Establish how the crisis was created',
    'Build the strongest supported account of how the crisis was created and what actors or systems are involved.',
    'Three civilian convoys and two Compact patrol craft are converging on the Orison Gap under conflicting threat warnings while obsolete defenses power up, an authentication buoy goes silent, and Asterion command links fail intermittently.'
  ]],
  ['mission.open-orders-2-what-survives', [
    'Open Orders II: What Survives',
    'Choose how the Breckenridge will help with repair and review work while the crew recovers from the Orison crisis.',
    'Choose and conclude the Breckenridge\'s recovery work',
    'Resolve two assignments as a normal load, pursue all three with credible delegation, or knowingly leave early with unfinished opportunities recorded.',
    'The Last Watch',
    'Review Orison\'s settlement defenses and establish a safe, defensible path for their future operation.',
    'Second Opinion',
    'Evaluate a contested trauma treatment and establish a responsible path for evidence, consent, access, and care.',
    'An Unwelcome Result',
    'Audit a disputed biosphere forecast without suppressing inconvenient findings or overstating uncertain ones.',
    'The Last Watch, Second Opinion, and An Unwelcome Result are available. Resolving two is a normal command load; taking on all three requires credible delegation or risks overextension.'
  ]],
  ['mission.chapter-6-the-cost-of-knowing', [
    'The Cost of Knowing',
    'Confront authentic classified authority, secure the Lacuna operation, and decide how Starfleet can answer for risk imposed on the Reach.',
    'Maintain command and network safety',
    'Keep the Breckenridge coherent through the Lacuna operation and establish the actual result of the command-network risk.',
    'Establish the classified operation\'s conduct and remaining risk',
    'Build a usable account of what the authorized operation did and what danger remains, even if the physical archive is incomplete.',
    'Resolve evidence, disclosure, and operative authority',
    'Establish actual archive custody, what affected regional authorities learn, and Rourke\'s operative status without treating one policy choice as its own result.',
    'Commander Elias Rourke has arrived under authentic Starfleet Intelligence orders. He requests Pale Lantern custody, restricted command-network access, operational authority, a Dominion-system blackout, and compartmentalization of regional representatives. Tolland confirms the orders but lacks their full scope. Rourke argues that the operation has produced genuine threat intelligence and that premature disclosure could expose unrelated agents and allow Dominion weapons traffickers to disappear. He proposes a joint Lacuna operation to recover an intelligence archive, sever a dormant interface, protect unrelated personnel, and destroy the post if compromise is confirmed.'
  ]],
  ['mission.chapter-7-a-peace-of-their-own', [
    'A Peace of Their Own',
    'Stabilize the Annex Six occupation, establish a shared basis for action, and produce command arrangements that can hold before the approaching Starfleet task group changes the crisis.',
    'Stabilize the Annex Six standoff',
    'Establish the actual security and civilian result without treating every threat, fault, protest, or tactical move as its own objective.',
    'Establish a shared operational picture',
    'Determine what each side can legitimately claim and establish trusted control of the systems shaping the crisis.',
    'Establish legitimate command arrangements',
    'Produce an actual enforceable settlement with a named implementation mechanism, Annex and defense-control disposition, and sustainable posture for the approaching task group.',
    'Compact units occupy Asterion Annex Six and claim regional authority over defense infrastructure, intelligence oversight, reconstruction participation, local hearings, and Compact facilities. Rear Admiral Tolland orders restoration of Federation control and prevention of military-system transfer. Captain Joelle Mercer\'s task group will arrive in approximately thirty-six hours and may assume tactical control if the situation becomes openly hostile.',
    'Starfleet task-group arrival',
    'Approximately 36 hours until arrival',
    'Captain Mercer\'s task group will arrive and may assume tactical control if the situation is openly hostile; arrival changes leverage but does not end the mission.'
  ]],
  ['mission.open-orders-3-before-the-lamps-go-out', [
    'Open Orders III: Before the Lamps Go Out',
    'Choose how the Breckenridge will use its narrowing preparation window while the crew readies for a regional crisis that may demand simultaneous action.',
    'Choose and conclude the Breckenridge\'s final preparation work',
    'Resolve two assignments as a normal load, pursue all three with credible delegation, or knowingly leave early with unfinished opportunities recorded.',
    'The Name on the Hull',
    'Help settle what the Breckenridge\'s name should mean without treating memory, identity, or command authority as props.',
    'A Signal Toward Home',
    'Evaluate a long-range signal opportunity and establish whatever dependable communications capability the evidence actually supports.',
    'Two Signatures',
    'Support Imani\'s independent decision while addressing the Helix need and the precedent created by the proposed agreement.',
    'The Name on the Hull, A Signal Toward Home, and Two Signatures are available. Resolving two is a normal command load; taking on all three requires credible delegation or risks overextension.'
  ]],
  ['mission.chapter-8-the-last-directive', [
    'Chapter 8: The Last Directive',
    'Multiple regional systems are issuing credible but incompatible instructions. Take operational command, establish a response others can execute, and contain five simultaneous fronts without assuming any automated authority is trustworthy.',
    'Issue and sustain an executable regional response',
    'Define concrete priorities, trusted pathways, rules of engagement, movement authority, delegated responsibilities, and unilateral-action limits; then keep the resulting authority functional under pressure.',
    'Keep a trusted command mesh functioning',
    'Build human-confirmed channels that keep Starfleet, Compact, Cardassian, and civilian leaders in a usable shared information environment.',
    'Contain the Orison weapons grid',
    'Prevent false locks and counterfeit orders from driving platforms or frightened crews into sustained regional fire while preserving necessary civilian defense.',
    'Break Nightfall\'s coordination path',
    'Identify and neutralize enough of Pale Lantern\'s current coordination path to stop synchronized escalation. Any defensible method that achieves that result remains valid.',
    'Protect civilian evacuation and medical response',
    'Stop false routes, sustain triage and safe havens, rescue ships already in danger, and keep care available across political lines.',
    'Whitaker coordinates Kessler, Mercer, and Holt on regional authority; Priya works with Administrator Prel and Nella Ivers on trusted communications; Bronn and local platform crews own weapons-control compliance; Rowan and Imani trace and isolate the core paths; Sato, Kieran, and Ivers coordinate triage and evacuation. Every front includes a regional actor who can cooperate, refuse, or impose a cost.'
  ]],
  ['mission.epilogue-the-terms-we-keep', [
    'Epilogue: The Terms We Keep',
    'The fighting has stopped enough for its costs to be named. Establish the record, decide what authority and accountability now require, and carry the consequences into whatever comes next.',
    'Establish the operational and humanitarian aftermath',
    'Put the command, communications, weapons, Nightfall, and civilian results on one accurate record, including costs and surviving obligations.',
    'Set terms for regional authority and defense',
    'State what legitimate civil authority and defensible control should look like, then establish what the settlement actually adopts.',
    'Set terms for evidence, custody, and accountability',
    'State what responsibility and repair require, then establish how evidence, dangerous material, participation, and public truth will be handled.',
    'Complete the command review and name what continues',
    'Account for the command patterns the campaign revealed and establish the responsibility and authority that follow the player beyond the crisis.'
  ]]
]);

const EXPECTED_ENTRY_CAPABILITY_TEXT = new Map([
  ['capability.chapter2.shared-convoy-record', ['Shared Convoy Record', 'Compact and Starfleet participants already possess one jointly authenticated incident record and a tested chain for comparing disputed evidence. It can support the joint investigation but does not automatically vindicate the Breckenridge.']],
  ['capability.open-orders1.compact-verification-framework', ['Compact Verification Framework', 'A functioning Compact-Starfleet channel can compare disputed records under bounded access. It does not guarantee trust, agreement, or a favorable finding.']],
  ['capability.open-orders1.redline-accountability-context', ['Medical Supply Accountability', 'The Breckenridge has recent experience distinguishing useful informal logistics from undocumented access and diverted medical supply. That history sharpens scrutiny without implicating the Quiet Channels network in redline.']],
  ['capability.open-orders2.orison-authentication-record', ['Orison Authentication Record', 'A verified record of the Sigma-4 authentication path is available for defense transition, evidence review, and controlled deactivation work.']],
  ['capability.open-orders2.medical-supply-safeguards', ['Medical Supply Safeguards', 'Sato has a trusted chain for reconciling medical inventory, confidentiality, and duty-fitness concerns. It can change who volunteers information; it does not change treatment efficacy or imply that Vos\'s therapy is redline.']],
  ['capability.chapter8.helix-yard-support', ['Helix Yard Support', 'Helix can repair or reconfigure one critical civilian, Compact, or Breckenridge system quickly enough to matter during Nightfall.']],
  ['capability.chapter8.civilian-rescue-wing', ['Civilian Rescue Wing', 'Qualified civilian pilots can conduct one evacuation, courier, or search operation without requiring Kieran to lead it personally.']],
  ['capability.chapter8.quiet-channels-network', ['Quiet Channels Network', 'A resilient civilian communications route can remain available after official relays are compromised.']],
  ['capability.chapter8.orison-defense-codes', ['Orison Defense Codes', 'Authenticated local codes permit a platform to be disabled or reassigned without destroying it.']],
  ['capability.chapter8.asterion-medical-cooperative', ['Asterion Medical Cooperative', 'Regional medical teams can absorb casualties and keep more than one safe-haven site functioning.']],
  ['capability.chapter8.regional-sensor-baseline', ['Regional Sensor Baseline', 'Corrected regional models can identify one false signature or core candidate before it consumes the response.']],
  ['capability.chapter8.breckenridge-memorial-goodwill', ['Breckenridge Memorial Goodwill', 'A public warning from the Breckenridge can receive a fair hearing across faction lines because its memorial process earned credible trust.']],
  ['capability.chapter8.long-range-relay-window', ['Long-Range Relay Window', 'One brief external confirmation or command path can bypass compromised regional networks.']],
  ['capability.chapter8.cross-isolation-protocol', ['Cross Isolation Protocol', 'The documented, independently consented procedure can disconnect one compromised pathway without cascading ship failure.']],
  ['capability.chapter8.preserved-hecate-relay', ['Preserved Hecate Relay', 'The retained relay can expose or reach one active coordination path, with the containment cost established when it was preserved.']],
  ['capability.chapter8.demeris-archive', ['Demeris Archive', 'The retained Demeris record can demonstrate Pale Lantern\'s manipulation pattern to skeptical local leaders.']],
  ['capability.chapter8.farwatch-evidence-package', ['Farwatch Evidence Package', 'Authenticated Farwatch evidence can compel Starfleet cooperation or support an accountable public explanation.']],
  ['capability.chapter8.provisional-regional-accord', ['Provisional Regional Accord', 'The settlement or stand-down supplies a recognized starting point for shared emergency authority, even if cooperation remains tense.']],
  ['capability.chapter8.distributed-command-readiness', ['Distributed Command Readiness', 'Senior responsibilities and regional support were prepared before Nightfall, reducing dependence on any one officer or command path.']],
  ['capability.epilogue.nightfall-aftermath-record', ['Nightfall Aftermath Record', 'The confirmed command, communications, weapons, coordination, and humanitarian results are available to the settlement without being rewritten as new objectives.']],
  ['capability.epilogue.farwatch-evidence-package', ['Farwatch Evidence Package', 'Authenticated evidence is available to support an inquiry or public account if the player chooses to use it.']],
  ['capability.epilogue.provisional-regional-accord', ['Provisional Regional Accord', 'The prior accord or stand-down provides a recognized starting point for long-term terms without predetermining them.']],
  ['capability.epilogue.rhee-lawful-custody', ['Rhee Lawful Custody Record', 'The supported Prelude custody disposition is available for a bounded personal coda.']],
  ['capability.epilogue.rhee-treatment-handoff', ['Rhee Treatment Handoff Record', 'The supported Prelude treatment or responsible-handoff disposition is available for a bounded personal coda.']],
  ['capability.epilogue.daro-confidential-care', ['Daro Confidential Care Record', 'Daro\'s established confidential treatment and duty boundary are available for a bounded personal coda.']]
]);

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function scenarioFixtures() {
  return fs.readdirSync(FIXTURE_DIRECTORY)
    .filter((name) => name.endsWith('-scenarios.fixture.json'))
    .map((name) => readJson(`${FIXTURE_DIRECTORY}/${name}`));
}

function playerFacingText(projection) {
  return [
    projection.title,
    projection.summary,
    ...projection.objectives.flatMap((objective) => [objective.title, objective.summary]),
    ...projection.capabilities.flatMap((capability) => [capability.label, capability.summary]),
    ...projection.facts.map((fact) => fact.summary),
    ...projection.clocks.flatMap((clock) => [clock.label, clock.deadline, clock.consequence]),
    ...projection.outcomeDimensions.flatMap((dimension) => [dimension.label, dimension.value]),
    ...(projection.terminal ? [
      projection.terminal.title,
      projection.terminal.summary,
      projection.terminal.next?.summary
    ].filter(Boolean) : [])
  ];
}

function entryContextForCapability(capability) {
  return {
    kind: 'directive.missionEntryContext.v1',
    capabilities: [{
      id: capability.id,
      sourceRunId: `run.entry-audit.${capability.id}`,
      sourceDefinitionId: capability.source.definitionId,
      sourceDefinitionVersion: capability.source.definitionVersion,
      dimensions: capability.source.requirements.map((requirement) => ({
        id: requirement.dimensionId,
        value: requirement.in[0]
      }))
    }]
  };
}

function sourceForStep({ definition, scenario, step, index, revision }) {
  const selectedSwipeId = step.sourceRole === 'assistant' ? `swipe.${index + 1}` : null;
  return {
    messageId: `message.${definition.packageBinding.sourceId}.${scenario.id}.${index + 1}`,
    branchId: `branch.${definition.packageBinding.sourceId}.${scenario.id}`,
    accepted: true,
    selectedSwipeId,
    textHash: (index + 1).toString(16).padStart(2, '0').repeat(32),
    role: step.sourceRole,
    acceptedAtRevision: revision
  };
}

function runScenario(definition, fixture, scenario) {
  const branchId = `branch.${definition.packageBinding.sourceId}.${scenario.id}`;
  const steps = [
    ...(scenario.sequence || []).flatMap((fragmentId) => {
      const fragment = fixture.fragments?.[fragmentId];
      assert.equal(Array.isArray(fragment), true, `${definition.id}:${scenario.id}: missing fragment ${fragmentId}`);
      return fragment;
    }),
    ...(scenario.steps || [])
  ];
  const entryCapabilityIds = scenario.entryCapabilityIds || [];
  const entryContext = entryCapabilityIds.length ? {
    kind: 'directive.missionEntryContext.v1',
    capabilities: entryCapabilityIds.map((capabilityId, capabilityIndex) => {
      const capability = (definition.entryCapabilities || []).find((candidate) => candidate.id === capabilityId);
      assert.ok(capability, `${definition.id}:${scenario.id}: unknown entry capability ${capabilityId}`);
      return {
        id: capability.id,
        sourceRunId: `run.${scenario.id}.${capabilityIndex + 1}`,
        sourceDefinitionId: capability.source.definitionId,
        sourceDefinitionVersion: capability.source.definitionVersion,
        dimensions: capability.source.requirements.map((requirement) => ({
          id: requirement.dimensionId,
          value: requirement.in[0]
        }))
      };
    })
  } : undefined;
  let state = createMissionState({ definition, branchId, entryContext });
  let acceptedClaimCount = 0;
  const rejectedReasonCodes = [];
  for (const [index, step] of steps.entries()) {
    const source = sourceForStep({ definition, scenario, step, index, revision: state.revision });
    const proposal = {
      kind: 'directive.missionEvidenceProposal.v1',
      branchId,
      missionId: definition.id,
      baseRevision: state.revision + (step.baseRevisionOffset || 0),
      claims: [{
        claimId: step.claimId,
        policyId: step.policyId,
        claimType: step.claimType,
        targetId: step.targetId,
        ...(Object.hasOwn(step, 'value') ? { value: step.value } : {}),
        sourceRef: {
          messageId: source.messageId,
          swipeId: step.sourceSwipeOverride ?? source.selectedSwipeId,
          textHash: source.textHash
        }
      }]
    };
    const evidence = validateMissionEvidenceProposal({
      definition,
      state,
      proposal,
      resolveSourceRef: (ref) => ref?.messageId === source.messageId ? source : null
    });
    acceptedClaimCount += evidence.acceptedClaims.length;
    rejectedReasonCodes.push(...evidence.rejectedClaims.map((claim) => claim.reasonCode));
    if (!evidence.acceptedClaims.length) continue;
    state = reduceMissionEvidence({
      definition,
      state,
      acceptedClaims: evidence.acceptedClaims,
      sourceContribution: {
        id: `contribution.${definition.packageBinding.sourceId}.${scenario.id}.${index + 1}`,
        messageId: source.messageId,
        swipeId: source.selectedSwipeId,
        role: source.role,
        textHash: source.textHash,
        acceptedAtRevision: source.acceptedAtRevision
      }
    }).state;
  }
  return { state, acceptedClaimCount, rejectedReasonCodes };
}

function assertScenarioResult(definition, scenario, result) {
  const label = `${definition.id}:${scenario.id}`;
  const expected = scenario.expected;
  assert.equal(result.state.status, expected.status, `${label}: status`);
  assert.equal(result.state.terminalDisposition, expected.terminalDisposition, `${label}: disposition`);
  assert.equal(result.acceptedClaimCount, expected.acceptedClaimCount, `${label}: accepted claims`);
  assert.deepEqual(result.rejectedReasonCodes, expected.rejectedReasonCodes, `${label}: rejected claims`);
  for (const [id, value] of Object.entries(expected.objectiveDispositions || {})) {
    assert.equal(result.state.objectives[id]?.disposition, value, `${label}:${id}`);
  }
  for (const [id, value] of Object.entries(expected.outcomeDimensions || {})) {
    assert.equal(result.state.outcomeDimensions[id] ?? 'pending', value, `${label}:${id}`);
  }
  for (const [id, value] of Object.entries(expected.outcomeValues || {})) {
    assert.equal(result.state.outcomes[id], value, `${label}:${id}`);
  }
  for (const id of expected.knownFactsIncludes || []) {
    assert.equal(result.state.knownFacts.includes(id), true, `${label}:${id}`);
  }
  for (const id of expected.knownFactsExcludes || []) {
    assert.equal(result.state.knownFacts.includes(id), false, `${label}:${id}`);
  }
  for (const id of expected.eventsInclude || []) {
    assert.equal(result.state.events.includes(id), true, `${label}:${id}`);
  }
  for (const id of expected.eventsExclude || []) {
    assert.equal(result.state.events.includes(id), false, `${label}:${id}`);
  }
  for (const [id, value] of Object.entries(expected.clockStates || {})) {
    assert.equal(result.state.clocks[id]?.state, value.state, `${label}:${id}:state`);
    assert.equal(result.state.clocks[id]?.value, value.value, `${label}:${id}:value`);
  }
  if (Object.hasOwn(expected, 'commandBearingAwardIds')) {
    assert.deepEqual(
      eligibleMissionCommandBearingAwards(definition, result.state).map((award) => award.id),
      expected.commandBearingAwardIds,
      `${label}: Command Bearing awards`
    );
  }
  assert.equal(result.state.transitionReceipt?.target?.id || null, expected.transitionTargetId || null, `${label}: transition`);
}

const { packageData, crewDataset, shipDataset, missionDefinitions } = loadAshesRuntimeAssets();
assert.deepEqual(Object.keys(packageData).sort(), EXPECTED_PACKAGE_ROOTS);
assert.equal(packageData.manifest.kind, 'directive.campaignPackage.v1');
assert.equal(packageData.manifest.schemaVersion, 1);
assert.deepEqual(Object.keys(crewDataset).sort(), ['manifest', 'officers']);
assert.equal(crewDataset.manifest.kind, 'directive.crewDataset.v1');
assert.equal(crewDataset.manifest.packageId, packageData.manifest.id);
assert.equal(crewDataset.manifest.version, '1.1.0');
assert.equal(crewDataset.officers.length, 7);
const expectedCrewPublicRecords = {
  'mara-whitaker': {
    species: 'Human', age: '47', birthplace: 'Kingston, Ontario, Earth',
    serviceBackground: 'Science operations, diplomacy, executive command',
    assignmentHistory: "Commanding officer since the Breckenridge's 2372 commission"
  },
  'kieran-vale': {
    species: 'Human', age: '29', birthplace: 'Tycho City, Luna',
    serviceBackground: 'Shuttle operations, tactical flight, high-stress navigation',
    assignmentHistory: 'Previous posting: U.S.S. Valorous'
  },
  'priya-nayar': {
    species: 'Human', age: '36', birthplace: 'Starbase 12',
    serviceBackground: 'Logistics, communications, personnel coordination, operations management',
    assignmentHistory: 'Previous posting: U.S.S. Valorous'
  },
  'hadrik-bronn': {
    species: 'Tellarite', age: 'Late fifties by human comparison',
    birthplace: 'Drekon Cooperative District, Tellar Prime',
    serviceBackground: 'Border security, convoy protection, shipboard defense, crisis containment',
    assignmentHistory: 'Original Breckenridge senior officer; acting XO during post-refit transit'
  },
  'rowan-saye': {
    species: 'Human', age: '41', birthplace: 'Utopia Colony, Mars',
    serviceBackground: 'Astrophysics, subspace phenomena, scientific intelligence, anomaly analysis',
    assignmentHistory: 'Previous posting: U.S.S. Huxley'
  },
  'miriam-sato': {
    species: 'Human', age: '43', birthplace: 'Sapporo, Earth',
    serviceBackground: 'Trauma surgery, emergency medicine, bioethics, operational health',
    assignmentHistory: 'Previous posting: U.S.S. Huxley'
  },
  'imani-cross': {
    species: 'Human', age: '39', birthplace: 'Nairobi, Earth',
    serviceBackground: 'Starship systems integration, bio-neural architecture, propulsion-control validation',
    assignmentHistory: 'Previous posting: Utopia Planitia systems-integration and refit program'
  }
};
for (const officer of crewDataset.officers) {
  assert.deepEqual(Object.keys(officer).sort(), ['billet', 'categoryId', 'id', 'name', 'narrationGuide', 'profileSummary', 'publicRecord', 'service', 'species']);
  assert.equal(officer.categoryId, 'ships-company');
  assert.equal(officer.service.organization, 'starfleet');
  assert.equal(Boolean(officer.service.department), true);
  assert.equal(Boolean(officer.service.rankCode), true);
  assert.equal(Boolean(officer.service.rankLabel), true);
  assert.equal(Boolean(officer.profileSummary.trim()), true);
  assert.equal(Boolean(officer.narrationGuide.voice.trim()), true);
  assert.equal(officer.narrationGuide.constraints.length > 0, true);
  const expected = expectedCrewPublicRecords[officer.id];
  assert.ok(expected, `${officer.id}: public record snapshot exists`);
  assert.deepEqual({ species: officer.species, ...officer.publicRecord }, expected, `${officer.id}: public record`);
  for (const forbidden of ['publicReputation', 'centralStrength', 'centralFlaw', 'campaignFunction', 'narrationGuide', 'distinguishingHistory']) {
    assert.equal(Object.hasOwn(officer.publicRecord, forbidden), false, `${officer.id}: ${forbidden} is private`);
  }
}
assert.deepEqual(Object.keys(shipDataset).sort(), ['manifest', 'mechanics', 'profile']);
assert.equal(shipDataset.manifest.kind, 'directive.shipDataset.v1');
assert.equal(shipDataset.manifest.packageId, packageData.manifest.id);
assert.equal(Boolean(shipDataset.profile.summary.trim()), true);
assert.equal(Boolean(shipDataset.profile.narrationGuide.trim()), true);
assert.equal(shipDataset.profile.hardFacts.length > 0, true);
assert.equal(missionDefinitions.length, EXPECTED_SOURCE_CHAIN.length);
assert.deepEqual(validateShipMechanicsPackage({ shipDataset, missionDefinitions }), { ok: true, errors: [] });
assert.deepEqual(shipDataset.mechanics.systems.map(({ id }) => id), [
  'ship-system.systems-integration',
  'ship-system.sensor-calibration'
]);

const byId = new Map(missionDefinitions.map((definition) => [definition.id, definition]));
const bySourceId = new Map(missionDefinitions.map((definition) => [definition.packageBinding.sourceId, definition]));
assert.equal(byId.size, missionDefinitions.length, 'mission definition ids must be unique');
assert.equal(bySourceId.size, missionDefinitions.length, 'mission source ids must be unique');
assert.equal(packageData.manifest.openingMissionId, EXPECTED_SOURCE_CHAIN[0]);

function assertShipInteractionEvidence({ definition, policyId, targetId, capabilityId, prepareState }) {
  const state = createMissionState({ definition, branchId: `ship-interaction.${policyId}` });
  prepareState(state);
  const source = {
    branchId: state.branchId, accepted: true, role: 'assistant',
    messageId: `message.${policyId}`, selectedSwipeId: `swipe.${policyId}`,
    textHash: 'f'.repeat(64), contributionId: `contribution.${policyId}`,
  };
  const proposal = {
    kind: 'directive.missionEvidenceProposal.v1', branchId: state.branchId,
    missionId: definition.id, baseRevision: 0, claims: [{
      claimId: `claim.${policyId}`, policyId, claimType: 'eventOccurred', targetId,
      sourceRef: {
        messageId: source.messageId, swipeId: source.selectedSwipeId, textHash: source.textHash,
      },
    }],
  };
  const withoutCapability = validateMissionEvidenceProposal({
    definition, state, proposal, resolveSourceRef: () => source,
  });
  assert.equal(withoutCapability.acceptedClaims.length, 0);
  assert.equal(withoutCapability.rejectedClaims[0].reasonCode, 'precondition-not-met');
  const withCapability = validateMissionEvidenceProposal({
    definition, state, proposal, resolveSourceRef: () => source,
    shipCapabilityEvidenceById: new Map([[capabilityId, [`effect.${capabilityId}`]]]),
  });
  assert.equal(withCapability.acceptedClaims.length, 1);
  assert.deepEqual(withCapability.acceptedClaims[0].dependencyEffectIds, [`effect.${capabilityId}`]);
}

const preludeDefinition = bySourceId.get('prelude-a-ship-underway');
assert.deepEqual(preludeDefinition.shipInteractions.map(({ capabilityId }) => capabilityId), [
  'ship-capability.segmented-isolation'
]);
assertShipInteractionEvidence({
  definition: preludeDefinition,
  policyId: 'policy.hesperus.integration-cascade-avoided',
  targetId: 'event.hesperus.integration-cascade-avoided',
  capabilityId: 'ship-capability.segmented-isolation',
  prepareState: (state) => state.events.push('event.hesperus.contact-established'),
});

const chapter2Definition = bySourceId.get('chapter-2-false-colors');
assert.deepEqual(chapter2Definition.shipInteractions.map(({ capabilityId }) => capabilityId), [
  'ship-capability.cross-system-reconstruction'
]);
assertShipInteractionEvidence({
  definition: chapter2Definition,
  policyId: 'policy.chapter2.cross-system-reconstruction-completed',
  targetId: 'event.chapter2.cross-system-reconstruction-completed',
  capabilityId: 'ship-capability.cross-system-reconstruction',
  prepareState: (state) => state.knownFacts.push('fact.chapter2.false-colors-crisis'),
});

assert.equal(EXPECTED_INITIAL_MISSION_TEXT.size, missionDefinitions.length, 'every mission requires an approved entry projection');
for (const definition of missionDefinitions) {
  const expectedText = EXPECTED_INITIAL_MISSION_TEXT.get(definition.id);
  assert.ok(expectedText, `${definition.id}: missing approved entry projection`);
  const state = createMissionState({ definition, branchId: `entry-audit.${definition.packageBinding.sourceId}` });
  const projection = createMissionPlayerProjection({ definition, state });
  assert.deepEqual(playerFacingText(projection), expectedText, `${definition.id}: initial Mission page copy changed without review`);
  assert.deepEqual(projection.capabilities, [], `${definition.id}: entry capabilities require accepted prior-mission context`);
  assert.deepEqual(projection.outcomeDimensions, [], `${definition.id}: entry outcomes must not precede story evidence`);
  assert.equal(projection.terminal, null, `${definition.id}: terminal copy must not appear at entry`);

  for (const capability of definition.entryCapabilities || []) {
    const expectedCapabilityText = EXPECTED_ENTRY_CAPABILITY_TEXT.get(capability.id);
    assert.ok(expectedCapabilityText, `${definition.id}:${capability.id}: missing approved entry capability copy`);
    const capabilityState = createMissionState({
      definition,
      branchId: `entry-capability-audit.${capability.id}`,
      entryContext: entryContextForCapability(capability)
    });
    const capabilityProjection = createMissionPlayerProjection({ definition, state: capabilityState });
    const capabilityTextOffset = 2 + (projection.objectives.length * 2);
    assert.deepEqual(
      playerFacingText(capabilityProjection),
      [
        ...expectedText.slice(0, capabilityTextOffset),
        ...expectedCapabilityText,
        ...expectedText.slice(capabilityTextOffset)
      ],
      `${definition.id}:${capability.id}: capability-bearing entry projection changed without review`
    );
  }
}
assert.deepEqual(
  missionDefinitions.flatMap((definition) => definition.entryCapabilities || []).map((capability) => capability.id).sort(),
  [...EXPECTED_ENTRY_CAPABILITY_TEXT.keys()].sort(),
  'every entry capability requires approved player-facing copy'
);

for (const [index, sourceId] of EXPECTED_SOURCE_CHAIN.entries()) {
  const definition = bySourceId.get(sourceId);
  assert.ok(definition, `missing Ashes V1 mission ${sourceId}`);
  assert.equal(definition.packageBinding.packageId, packageData.manifest.id, `${sourceId}: package id`);
  assert.equal(definition.packageBinding.packageVersion, packageData.manifest.version, `${sourceId}: package version`);
  const targetIds = [...new Set(definition.transitions.map((transition) => transition.target.id))];
  if (index < EXPECTED_SOURCE_CHAIN.length - 1) {
    assert.deepEqual(targetIds, [EXPECTED_SOURCE_CHAIN[index + 1]], `${sourceId}: next mission`);
    assert.equal(definition.transitions.every((transition) => transition.target.kind === 'mission'), true);
  } else {
    assert.deepEqual(targetIds, ['ashes-authored-conclusion']);
    assert.equal(definition.transitions.every((transition) => (
      transition.target.kind === 'phase'
      && Boolean(transition.target.campaignConclusion?.endConditionId)
    )), true, 'the epilogue must own an explicit authored conclusion');
  }
}

const fixtures = scenarioFixtures();
const fixturesByDefinition = new Map(fixtures.map((fixture) => [fixture.definitionId, fixture]));
assert.equal(fixturesByDefinition.size, missionDefinitions.length, 'every Ashes mission needs one scenario fixture');

let scenarioCount = 0;
const knownTransitionTargetIds = new Set([
  ...EXPECTED_SOURCE_CHAIN,
  'ashes-authored-conclusion'
]);
for (const definition of missionDefinitions) {
  const fixture = fixturesByDefinition.get(definition.id);
  assert.ok(fixture, `${definition.id}: scenario fixture missing`);
  const lint = lintMissionPackage({
    definition,
    knownDefinitions: missionDefinitions,
    knownTransitionTargetIds,
    scenarioExpectations: fixture.scenarios.map((scenario) => scenario.expected)
  });
  assert.equal(lint.ok, true, `${definition.id}: ${lint.errors.join('\n')}`);
  for (const scenario of fixture.scenarios) {
    assertScenarioResult(definition, scenario, runScenario(definition, fixture, scenario));
    scenarioCount += 1;
  }
}

console.log(`Ashes V1 campaign passed ${missionDefinitions.length} mission contracts and ${scenarioCount} authored scenarios.`);
