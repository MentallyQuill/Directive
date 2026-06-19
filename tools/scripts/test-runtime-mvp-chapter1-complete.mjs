import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { applyPressureLedgerDelta } from '../../src/pressures/pressure-ledger.mjs';
import { buildPressureLedgerDeltaForTurn } from '../../src/pressures/pressure-seeding.mjs';
import {
  commitProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntime
} from '../../src/runtime/director-turn-runtime.mjs';
import { detectPostChapter1SideMissionOpportunities } from '../../src/side-missions/opportunity-detector.mjs';
import { applySideMissionOpportunityReview } from '../../src/side-missions/opportunity-review.mjs';
import {
  applySideMissionOpportunityResolution,
  applySideMissionOpportunitySceneStart
} from '../../src/side-missions/opportunity-scene.mjs';
import { renderMissionPanel } from '../../src/ui/mission-panel.js';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function setFlag(state, flagId, value) {
  const flag = (state.mission?.outcomeFlags || []).find((item) => item.id === flagId);
  if (!flag) throw new Error(`Missing flag "${flagId}"`);
  flag.value = value;
}

function flagValue(state, id) {
  return (state.mission?.outcomeFlags || []).find((flag) => flag.id === id)?.value;
}

function frontById(state, id) {
  return (state.fronts || []).find((front) => front.id === id);
}

function actorPosture(state, actorId) {
  return (state.actors?.postures || []).find((posture) => posture.actorId === actorId);
}

function pressureById(state, pressureId) {
  return (state.pressureLedger?.records || []).find((pressure) => pressure.id === pressureId);
}

function assertHiddenTermsAbsent(value) {
  const text = JSON.stringify(value).toLowerCase();
  for (const term of [
    'pale lantern',
    'lantern',
    'no pathogen',
    'nightfall',
    'bioweapon',
    'kestrel',
    'compact recovery team',
    'destroy the transponder',
    'stolen transponder',
    'hull projection',
    'local patrol schedules'
  ]) {
    assert.equal(text.includes(term), false, `must not leak hidden term "${term}"`);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.value = '';
    this.type = '';
    this.disabled = false;
    this.rows = 0;
    this.title = '';
    this._className = '';
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'class') this.className = normalized;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = normalized;
    }
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  addEventListener() {}

  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (selector === '[data-input-path]' && typeof child.dataset.inputPath === 'string') {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

function textOf(element) {
  return [
    element.textContent || '',
    ...element.children.map(textOf)
  ].join(' ');
}

function seededPreludeChapter1Start(projection) {
  const state = cloneJson(projection.initialState);
  state.player.name = 'Talia Serrin';
  state.player.creationStatus = 'ready';
  state.campaign.status = 'active';
  state.campaign.currentStardate = 53076.6;
  state.mainCampaign.completedChapters = ['prelude-a-ship-underway'];
  state.mainCampaign.availableChapters = ['chapter-1-the-empty-convoy'];
  state.mainCampaign.lockedChapters = (state.mainCampaign.lockedChapters || [])
    .filter((chapterId) => chapterId !== 'chapter-1-the-empty-convoy');
  state.mainCampaign.chapterCursor = 'chapter-1-the-empty-convoy';
  state.mission = {
    ...state.mission,
    activeMissionId: 'chapter-1-the-empty-convoy',
    activeMissionGraphId: 'breckinridge.ashes-of-peace.chapter-1-the-empty-convoy',
    activeMissionGraphPath: 'packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json',
    activePhaseId: 'initial-reception',
    phase: 'initial-reception',
    completedMissionId: 'prelude-a-ship-underway',
    nextMissionId: null,
    transitionStatus: 'chapter-1-active',
    knownFacts: ['chapter-1.relief-convoy-distress-packet'],
    availableDecisionPointIds: ['decision.initial-convoy-posture']
  };
  state.pressureLedger = {
    records: [],
    candidateReviews: [],
    rawValuesHidden: true
  };
  state.fronts = [];
  state.actors = {
    ...state.actors,
    postures: [],
    rawValuesHidden: true
  };

  setFlag(state, 'prelude.ship-state', 'complete-with-accepted-limitation');
  setFlag(state, 'prelude.bronn', 'debate-not-closed');
  setFlag(state, 'prelude.priya', 'approval-bottlenecked');
  setFlag(state, 'prelude.hesperus-resolution', 'passengers-transferred');

  const preludePressureDelta = buildPressureLedgerDeltaForTurn({
    campaignState: state,
    outcomePacket: {
      id: 'outcome.mvp.seeded-prelude-final-review',
      resultBand: 'Success',
      summary: 'Seeded Prelude completion for MVP Chapter 1 runtime journey.',
      costs: [],
      revealedFactIds: [],
      commandDecisionAwards: []
    },
    intentParse: {
      primaryIntent: 'complete-final-command-review',
      signals: {}
    }
  });
  applyPressureLedgerDelta(state, preludePressureDelta);
  return state;
}

function previewChapter1({ campaignState, graph, projection, crewDataset, turnId, playerInput }) {
  return createProvisionalDirectorTurnRuntime({
    campaignState,
    graph,
    projection,
    crewDataset,
    graphPath: 'packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json',
    projectionPath: 'packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json',
    turnId,
    playerInput
  });
}

function commitInput({ campaignState, graph, projection, crewDataset, turnId, playerInput }) {
  const preview = previewChapter1({ campaignState, graph, projection, crewDataset, turnId, playerInput });
  const committed = commitProvisionalDirectorTurnRuntime({
    campaignState,
    turnPacket: preview.turnPacket,
    confirmWarnings: false,
    confirmedWarningIds: []
  });
  assert.equal(preview.turnPacket.actionClassification.category, 'validWithinMissionBounds');
  assert.equal(
    ['Success', 'Partial Success'].includes(committed.turnPacket.outcomePacket.resultBand),
    true,
    `MVP path step must remain player-safe, got ${committed.turnPacket.outcomePacket.resultBand}`
  );
  assertHiddenTermsAbsent(preview.turnPacket.outcomePacket);
  assertHiddenTermsAbsent(preview.turnPacket.narratorPacket);
  assertHiddenTermsAbsent(preview.turnPacket.commandLogPacket);
  assertHiddenTermsAbsent(committed.turnPacket.outcomePacket);
  assertHiddenTermsAbsent(committed.turnPacket.narratorPacket);
  assertHiddenTermsAbsent(committed.turnPacket.commandLogPacket);
  return {
    preview,
    commit: committed
  };
}

function chapter1MvpCheckpoint(packageData) {
  const template = (packageData.missionTemplates?.main || [])
    .find((item) => item.id === 'chapter-1-the-empty-convoy');
  assert.equal(template?.status, 'playable');
  assert.equal(template?.mvpStatus, 'mvp-complete');
  assert.equal(template?.mvpCheckpoint?.rawValuesHidden, true);
  return template.mvpCheckpoint;
}

const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const chapter1Graph = readJson('packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');

let state = seededPreludeChapter1Start(projection);
assert.equal(state.mainCampaign.completedChapters.includes('prelude-a-ship-underway'), true);
assert.equal(state.mission.activePhaseId, 'initial-reception');
assert.equal(Boolean(pressureById(state, 'pressure.ship.imani-technical-debt')), true);
assert.equal(Boolean(pressureById(state, 'pressure.crew.bronn-fallback-command')), true);

const pathSteps = [
  {
    turnId: 'turn.mvp.chapter1.initial-response',
    expectedIntent: 'set-initial-convoy-posture',
    expectedPhase: 'convoy-approach',
    playerInput: 'Hold range, preserve convoy computer logs and signal records, and run remote scans before anyone boards.'
  },
  {
    turnId: 'turn.mvp.chapter1.boarding-threshold',
    expectedIntent: 'set-first-boarding-threshold',
    expectedPhase: 'first-committed-response',
    playerInput: 'Take us in for first contact, but no boarding until remote scans verify the threshold, quarantine isolation is ready, security overwatch is staged, rescue teams are prepared, and Imani owns evidence custody for the convoy logs.'
  },
  {
    turnId: 'turn.mvp.chapter1.first-contact-execution',
    expectedIntent: 'execute-first-contact-response',
    expectedPhase: 'convoy-contact-execution',
    playerInput: 'Execute the threshold: launch remote access against the Faraday Bell logs, send a quarantine-capable boarding team with Bronn security overwatch, put Imani on evidence custody, and start Parnell plasma-leak rescue under Miriam isolation rules.'
  },
  {
    turnId: 'turn.mvp.chapter1.offsite-custody-cargo',
    expectedIntent: 'frame-offsite-custody-cargo-leads',
    expectedPhase: 'offsite-custody-cargo-leads',
    playerInput: 'Use the Faraday Bell logs and shuttle telemetry to locate the evacuees at Ilyon, have Priya open a lawful channel to Lieutenant Pell over Ivers and the custody claim, keep Bronn on security overwatch, keep Miriam on quarantine triage, and have Imani preserve the secured hold inventory for the missing cargo module.'
  },
  {
    turnId: 'turn.mvp.chapter1.pell-contact-terms',
    expectedIntent: 'set-pell-contact-terms',
    expectedPhase: 'pell-contact-terms',
    playerInput: 'Open a channel to Pell, acknowledge Compact emergency concerns, offer a joint medical and cargo inspection, share the Faraday logs and manifest, request Ivers and the detained officers be released for supervised questioning, and set a legal undertaking to recover the missing emergency transponder hardware while Imani preserves evidence.'
  },
  {
    turnId: 'turn.mvp.chapter1.joint-inspection-release',
    expectedIntent: 'execute-joint-inspection-release',
    expectedPhase: 'joint-inspection-release-cargo',
    playerInput: 'Execute the joint inspection team now: Priya opens a shared inspection record and gives Pell a lawful exit through a Compact official, Bronn secures Ivers and the detained officers for supervised release and questioning, Imani seals the cargo evidence chain around the emergency hardware, and Rowan verifies the manifest without public claims.'
  },
  {
    turnId: 'turn.mvp.chapter1.cargo-diagnostic-pulse',
    expectedIntent: 'trace-cargo-diagnostic-pulse',
    expectedPhase: 'cargo-diagnostic-pulse',
    playerInput: 'Trace the diagnostic pulse with Rowan and Imani, keep the emergency hardware under joint seal and shared custody, have Priya preserve Pell\'s lawful exit, and have Bronn hold a non-hostile intercept posture with defensive shields, no targeting solution, and the cargo evidence chain intact.'
  },
  {
    turnId: 'turn.mvp.chapter1.hardware-recovery',
    expectedIntent: 'recover-hardware-under-seal',
    expectedPhase: 'hardware-recovery-under-seal',
    playerInput: 'Recover the emergency hardware with Imani and Rowan, preserve the diagnostic trace and recovery telemetry for comparison against the warning, keep the hardware under a joint evidence seal pending final custody review, preserve Pell\'s lawful exit, and have Bronn maintain defensive non-hostile security.'
  },
  {
    turnId: 'turn.mvp.chapter1.resolution-terms',
    expectedIntent: 'set-chapter1-resolution-terms',
    expectedPhase: 'chapter-1-resolution-terms',
    playerInput: 'Create a joint incident record for Starfleet and Compact access, have Ivers remain a witness because she trusts the record, record Pell as a lawful witness with cooperation terms, preserve joint custody terms for the recovered emergency hardware, publicly acknowledge the Starfleet authentication failure, and document Parnell technical debt for engineering follow-up.'
  },
  {
    turnId: 'turn.mvp.chapter1.false-colors-transition',
    expectedIntent: 'transition-chapter1-to-false-colors',
    expectedPhase: 'asterion-arrival-false-colors',
    playerInput: 'Bring the joint incident record into the Asterion Station formal briefing, notify Asterion, Starfleet, and Compact authorities, receive the Compact patrol report about an attack by a vessel identifying itself as the U.S.S. Breckinridge, have Rowan begin verification, and have Bronn hold a defensive non-hostile posture.'
  }
];

for (const step of pathSteps) {
  const result = commitInput({
    campaignState: state,
    graph: chapter1Graph,
    projection,
    crewDataset,
    turnId: step.turnId,
    playerInput: step.playerInput
  });
  assert.equal(result.preview.turnPacket.intentParse.primaryIntent, step.expectedIntent);
  if (step.expectedResultBand) {
    assert.equal(result.commit.turnPacket.outcomePacket.resultBand, step.expectedResultBand);
  }
  assert.equal(result.commit.campaignState.mission.activePhaseId, step.expectedPhase);
  state = result.commit.campaignState;
}

assert.equal(state.mission.endState, 'chapter-1-transition-to-false-colors');
assert.equal(state.mission.completedMissionId, 'chapter-1-the-empty-convoy');
assert.equal(state.mission.nextMissionId, 'chapter-2-false-colors');
assert.equal(state.mission.transitionStatus, 'chapter-2-pending');
assert.equal(state.mainCampaign.completedChapters.includes('chapter-1-the-empty-convoy'), true);
assert.equal(state.mainCampaign.availableChapters.includes('chapter-2-false-colors'), true);
assert.equal((state.mainCampaign.lockedChapters || []).includes('chapter-2-false-colors'), false);
assert.equal(state.mainCampaign.chapterCursor, 'chapter-2-false-colors');

assert.equal(state.mission.knownFacts.includes('chapter-1.joint-incident-record-created'), true);
assert.equal(state.mission.knownFacts.includes('chapter-1.cooperative-resolution-filed'), true);
assert.equal(state.mission.knownFacts.includes('chapter-1.starfleet-authentication-failure-acknowledged'), true);
assert.equal(state.mission.knownFacts.includes('chapter-1.asterion-arrival'), true);
assert.equal(state.mission.knownFacts.includes('chapter-1.compact-patrol-false-colors-report'), true);
assert.equal(state.mission.knownFacts.includes('chapter-1.truth.compact-recovery-team'), false);
assert.equal(state.mission.knownFacts.includes('chapter-1.truth.no-pathogen'), false);
assert.equal(state.mission.knownFacts.includes('chapter-1.truth.forged-starfleet-signals'), false);

assert.equal(flagValue(state, 'chapter-1.resolution-path'), 'cooperative');
assert.equal(flagValue(state, 'chapter-1.incident-record-status'), 'joint-record-created');
assert.equal(flagValue(state, 'chapter-1.authentication-failure-posture'), 'publicly-acknowledged');
assert.equal(flagValue(state, 'chapter-1.parnell-technical-debt'), 'documented-contained');
assert.equal(flagValue(state, 'chapter-1.transition-status'), 'false-colors-report-received');
assert.equal(flagValue(state, 'chapter-1.next-mission-hook'), 'chapter-2-false-colors-open');

assert.equal(frontById(state, 'front.chapter-1.evidence-custody')?.status, 'joint-record-carried-forward');
assert.equal(frontById(state, 'front.chapter-1.regional-diplomacy')?.status, 'false-colors-crisis-open');
assert.equal(actorPosture(state, 'uss-breckinridge')?.posture, 'false-colors-accusation-received');
assert.equal(actorPosture(state, 'compact-recovery-team')?.playerSummary, null);

const checkpoint = chapter1MvpCheckpoint(packageData);
const checkpointText = JSON.stringify(checkpoint);
assert.match(checkpointText, /rescued the convoy survivors/);
assert.match(checkpointText, /joint incident record/);
assert.match(checkpointText, /source of the conflicting orders remains unknown/);
assert.match(checkpointText, /repair, fallback-command, and coordination pressures/);
assert.match(checkpointText, /Chapter 2 can open/);
assertHiddenTermsAbsent(checkpoint);

globalThis.document = new FakeDocument();
const missionBody = document.createElement('main');
renderMissionPanel(missionBody, {
  activePackage: {
    campaign: packageData.mainCampaign,
    mvpCheckpoints: [{
      chapterId: 'chapter-1-the-empty-convoy',
      title: 'The Empty Convoy',
      status: 'playable',
      mvpStatus: 'mvp-complete',
      checkpoint
    }]
  },
  campaignState: state,
  starships: {
    saves: []
  }
}, {
  saveCurrentGame() {},
  saveCurrentGameAs() {},
  previewDirectorTurn() {},
  refresh() {}
});
const missionPanelText = textOf(missionBody);
delete globalThis.document;
assert.match(missionPanelText, /Chapter 1 Complete: False Colors Open/);
assert.match(missionPanelText, /rescued the convoy survivors/);
assert.match(missionPanelText, /source of the conflicting orders remains unknown/);
assert.match(missionPanelText, /repair, fallback-command, and coordination pressures/);
assert.match(missionPanelText, /Chapter 2 can open/);
assert.match(missionPanelText, /Follow-Up Opportunities|Safe Alpha Actions/);
assertHiddenTermsAbsent(missionPanelText);

const commandLogText = JSON.stringify(state.commandLog.entries);
assert.match(commandLogText, /joint incident record/i);
assert.match(commandLogText, /false-colors/i);
assertHiddenTermsAbsent(state.commandLog.entries);
assertHiddenTermsAbsent(state.fronts.map((front) => front.playerSummary));
assertHiddenTermsAbsent(state.actors.postures.map((posture) => posture.playerSummary));

const opportunityReview = detectPostChapter1SideMissionOpportunities({
  campaignState: state,
  packageData,
  maxCandidates: 4
});
assert.equal(opportunityReview.packageGuard.eligible, true);
assert.equal(opportunityReview.modelCallsUsed, false);
assert.equal(opportunityReview.rawValuesHidden, true);
assert.equal(
  opportunityReview.candidates.some((candidate) => candidate.opportunityId === 'chapter1-missing-hardware-audit'),
  true,
  'completed Chapter 1 state should produce the missing-hardware audit opportunity'
);
assert.equal(
  opportunityReview.candidates.some((candidate) => candidate.opportunityId === 'chapter1-pell-terms-follow-up'),
  true,
  'completed Chapter 1 state should produce the Pell terms follow-up opportunity'
);
assertHiddenTermsAbsent(opportunityReview);

const scheduledFollowUp = applySideMissionOpportunityReview({
  campaignState: state,
  packageData,
  opportunityId: 'chapter1-missing-hardware-audit',
  decision: 'schedule',
  reviewId: 'opportunity-review.mvp-chapter1-hardware',
  reviewedAt: '2026-06-19T17:00:00.000Z',
  maxCandidates: 4
});
assert.equal(scheduledFollowUp.scheduledOpportunity.title, 'Missing Hardware Audit');
assert.equal(
  scheduledFollowUp.campaignState.sideMissions.scheduledOpportunities.some((item) => item.id === 'chapter1-missing-hardware-audit'),
  true,
  'completed Chapter 1 state should schedule a follow-up opportunity'
);
assertHiddenTermsAbsent(scheduledFollowUp.reviewRecord);
assertHiddenTermsAbsent(scheduledFollowUp.scheduledOpportunity);

const openedFollowUp = applySideMissionOpportunitySceneStart({
  campaignState: scheduledFollowUp.campaignState,
  opportunityId: 'chapter1-missing-hardware-audit',
  sceneId: 'side-opportunity-scene.mvp-chapter1-hardware',
  sceneStartedAt: '2026-06-19T17:05:00.000Z',
  reason: 'MVP completed-state follow-up scene smoke.'
});
assert.equal(openedFollowUp.sceneRecord.status, 'active');
assert.equal(openedFollowUp.sceneBrief.rawValuesHidden, true);
assertHiddenTermsAbsent(openedFollowUp.sceneBrief);

const resolvedFollowUp = applySideMissionOpportunityResolution({
  campaignState: openedFollowUp.campaignState,
  opportunityId: 'chapter1-missing-hardware-audit',
  resolutionId: 'side-opportunity-resolution.mvp-chapter1-hardware',
  resolvedAt: '2026-06-19T17:10:00.000Z',
  outcomeBand: 'Success',
  assignmentMode: 'direct',
  reason: 'MVP completed-state follow-up resolution smoke.'
});
assert.equal(resolvedFollowUp.resolutionRecord.status, 'completed');
assert.equal(
  resolvedFollowUp.campaignState.commandLog.entries.some((entry) => entry.type === 'sideMissionOpportunityResolution'),
  true,
  'completed Chapter 1 follow-up resolution should write a safe Command Log row'
);
assertHiddenTermsAbsent(resolvedFollowUp.resolutionRecord);

const loaded = cloneJson(state);
assert.deepEqual(loaded.mission, state.mission, 'Chapter 1 MVP completion mission state survives JSON save/load clone');
assert.deepEqual(loaded.mainCampaign, state.mainCampaign, 'Chapter 1 MVP completion campaign cursor survives JSON save/load clone');
assert.deepEqual(loaded.pressureLedger.records, state.pressureLedger.records, 'Chapter 1 MVP pressure carry-forward survives JSON save/load clone');
const loadedFollowUp = cloneJson(scheduledFollowUp.campaignState);
assert.deepEqual(
  loadedFollowUp.sideMissions.scheduledOpportunities,
  scheduledFollowUp.campaignState.sideMissions.scheduledOpportunities,
  'scheduled follow-up opportunity survives JSON save/load clone'
);
const loadedResolvedFollowUp = cloneJson(resolvedFollowUp.campaignState);
assert.deepEqual(
  loadedResolvedFollowUp.sideMissions.completedOpportunities,
  resolvedFollowUp.campaignState.sideMissions.completedOpportunities,
  'resolved follow-up opportunity survives JSON save/load clone'
);

console.log('MVP Chapter 1 runtime journey passed: seeded Prelude/Chapter 1 start through chapter-1-transition-to-false-colors, player-safe checkpoint, Chapter 2 unlock, pressure carry-forward, follow-up scheduling and resolution, command log continuity, save/load clone, and hidden-source safety');
