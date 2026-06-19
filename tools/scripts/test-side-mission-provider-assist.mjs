import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  createGenerationRoleRegistry
} from '../../src/generation/generation-roles.mjs';
import { createGenerationRouter } from '../../src/generation/generation-router.mjs';
import { createFakeGenerationClient } from '../../src/hosts/fake/fake-host.mjs';
import { detectPostChapter1SideMissionOpportunities } from '../../src/side-missions/opportunity-detector.mjs';
import {
  applySideMissionProviderAssistResult,
  runSideMissionProviderAssistance,
  SIDE_MISSION_PROVIDER_ROLE_IDS
} from '../../src/side-missions/provider-assist.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertHiddenTermsAbsent(value) {
  const text = JSON.stringify(value).toLowerCase();
  for (const term of [
    'pale lantern',
    'lantern escalation',
    'compact recovery team',
    'no pathogen',
    'forged starfleet signals',
    'stolen transponder',
    'transponder modules',
    'cargo tug',
    'hull projection',
    'local patrol schedules',
    'nightfall',
    'bioweapon',
    'kestrel'
  ]) {
    assert.equal(text.includes(term), false, `must not leak hidden term "${term}"`);
  }
}

function postChapter1BaseState() {
  return {
    campaign: {
      id: 'test-side-mission-provider-assist',
      packageId: 'directive:starship-package:breckinridge-ashes-of-peace',
      status: 'active'
    },
    mainCampaign: {
      id: 'ashes-of-peace',
      chapterCursor: 'chapter-2-false-colors',
      completedChapters: ['prelude-a-ship-underway', 'chapter-1-the-empty-convoy'],
      availableChapters: ['chapter-2-false-colors'],
      lockedChapters: ['open-orders-1-work-worth-doing']
    },
    mission: {
      activeMissionId: 'chapter-1-the-empty-convoy',
      completedMissionId: 'chapter-1-the-empty-convoy',
      nextMissionId: 'chapter-2-false-colors',
      transitionStatus: 'chapter-2-pending',
      endState: 'chapter-1-transition-to-false-colors',
      knownFacts: [
        'chapter-1.emergency-transponder-hardware-manifest',
        'chapter-1.emergency-hardware-recovered-under-seal',
        'chapter-1.joint-incident-record-created',
        'chapter-1.starfleet-authentication-failure-acknowledged'
      ],
      hiddenFacts: [
        'chapter-1.truth.compact-recovery-team',
        'chapter-1.truth.no-pathogen'
      ],
      outcomeFlags: [
        { id: 'chapter-1.evidence-custody', value: 'preserved-initially' },
        { id: 'chapter-1.convoy-evidence', value: 'clean-chain-started' },
        { id: 'chapter-1.faraday-evidence-access', value: 'preserved-log-access' },
        { id: 'chapter-1.cargo-recovery-route', value: 'resolved-under-joint-record' },
        { id: 'chapter-1.recovered-hardware-status', value: 'recovered-under-joint-seal' },
        { id: 'chapter-1.incident-record-status', value: 'joint-record-created' },
        { id: 'chapter-1.quarantine-posture', value: 'bypassed' },
        { id: 'chapter-1.quarantine-confidence', value: 'exception-logged' },
        { id: 'chapter-1.rescue-urgency', value: 'accelerated-with-risk' },
        { id: 'chapter-1.parnell-rescue', value: 'risk-accepted' },
        { id: 'chapter-1.pell-contact', value: 'witness-cooperation-secured' },
        { id: 'chapter-1.pell-status', value: 'witness-recruited' },
        { id: 'chapter-1.compact-investigation-access', value: 'joint-access' }
      ]
    },
    pressureLedger: {
      records: [
        {
          id: 'pressure.obligation.convoy-evidence-custody',
          type: 'obligation',
          title: 'Convoy Evidence Custody',
          playerSummary: 'The convoy response created an evidence chain that must be protected through the next contact.',
          status: 'active',
          urgencyBand: 'medium',
          escalationBand: 'signal',
          sourceOutcomeId: 'outcome.chapter1.initial-response',
          lastUpdatedByOutcomeId: 'outcome.chapter1.hardware-recovery',
          linkedFactIds: ['chapter-1.quarantine-code-routing-mismatch'],
          tags: ['evidence', 'custody', 'chapter-1']
        },
        {
          id: 'pressure.obligation.quarantine-exception-review',
          type: 'obligation',
          title: 'Quarantine Exception Review',
          playerSummary: 'The quarantine exception has to be justified and contained after the immediate rescue order.',
          status: 'active',
          urgencyBand: 'high',
          escalationBand: 'escalation',
          sourceOutcomeId: 'outcome.chapter1.initial-response',
          lastUpdatedByOutcomeId: 'outcome.chapter1.first-contact',
          tags: ['medical', 'quarantine', 'accepted-risk', 'chapter-1']
        },
        {
          id: 'pressure.regional.convoy-first-impression',
          type: 'regional',
          title: 'Convoy First Impression',
          playerSummary: 'The first response to Relief Convoy Twelve now shapes regional confidence in Breckinridge command.',
          status: 'active',
          urgencyBand: 'medium',
          escalationBand: 'signal',
          sourceOutcomeId: 'outcome.chapter1.initial-response',
          tags: ['regional-trust', 'chapter-1']
        }
      ],
      candidateReviews: [],
      rawValuesHidden: true
    },
    commandLog: {
      entries: [
        {
          id: 'command-log.chapter1.hardware',
          sourceOutcomeId: 'outcome.chapter1.hardware-recovery',
          summaryInputs: ['Recovered emergency hardware under joint seal.'],
          visibleConsequences: ['Evidence custody and the joint incident record remain active follow-up work.']
        },
        {
          id: 'command-log.chapter1.quarantine',
          sourceOutcomeId: 'outcome.chapter1.initial-response',
          summaryInputs: ['Quarantine exception accepted during rescue.'],
          visibleConsequences: ['Medical review is required after the immediate crisis.']
        }
      ],
      summariesGeneratedFromCommittedStateOnly: true
    },
    sideMissions: {
      opportunityReviews: [],
      opportunityCooldowns: [],
      availableAssignments: [],
      completedAssignments: []
    }
  };
}

function createRouter(responses) {
  const generationClient = createFakeGenerationClient({ responses });
  return {
    generationClient,
    router: createGenerationRouter({
      generationClient,
      now: () => '2026-06-19T12:00:00.000Z'
    })
  };
}

const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const campaignState = postChapter1BaseState();
const campaignBefore = cloneJson(campaignState);
const review = detectPostChapter1SideMissionOpportunities({
  campaignState,
  packageData,
  maxCandidates: 4
});
const hardwareCandidate = review.candidates.find((candidate) => (
  candidate.opportunityId === 'chapter1-missing-hardware-audit'
));
assert(hardwareCandidate, 'deterministic hardware candidate should exist before provider assistance');

const registry = createGenerationRoleRegistry();
for (const roleId of Object.values(SIDE_MISSION_PROVIDER_ROLE_IDS)) {
  const role = registry.get(roleId);
  assert.equal(role.structuredOutput, true);
  assert.equal(role.blocking, false);
  assert.equal(role.mayProposeState, false);
  assert.equal(role.mayRunDuringMainGeneration, false);
}
assert.equal(registry.get(SIDE_MISSION_PROVIDER_ROLE_IDS.signalDetector).timeoutMs, 45000);
assert.equal(registry.get(SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder).timeoutMs, 90000);
assert.equal(registry.get(SIDE_MISSION_PROVIDER_ROLE_IDS.sceneFramer).timeoutMs, 90000);

const success = createRouter({
  [SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder]: {
    providerId: 'fake-side-mission-builder',
    model: 'fake-structured-json',
    content: {
      proposals: [
        {
          candidateId: hardwareCandidate.id,
          opportunityId: hardwareCandidate.opportunityId,
          title: 'Recovered Hardware Custody Review',
          playerSummary: 'Engineering, security, and operations can turn the recovered hardware record into a clean accountability check.',
          reviewQuestion: 'Who owns the custody review while Starfleet and Compact records stay aligned?',
          sceneBrief: {
            openingSituation: 'The Breckinridge can audit recovered hardware before later authentication pressure builds.',
            sceneQuestion: 'How does command keep the audit bounded, lawful, and useful?',
            expectedOutputs: [
              'Name the accountable owner.',
              'Keep the record tied to known custody facts.',
              'Leave a clear handoff for later command-authentication work.'
            ]
          }
        }
      ]
    }
  }
});

const accepted = await runSideMissionProviderAssistance({
  generationRouter: success.router,
  opportunityReview: review,
  roleId: SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder,
  candidateId: hardwareCandidate.id,
  requestId: 'provider-assist.success'
});
assert.equal(accepted.ok, true);
assert.equal(accepted.status, 'accepted');
assert.equal(accepted.proposals.length, 1);
assert.equal(accepted.proposals[0].proposalOnly, true);
assert.equal(accepted.proposals[0].authoritative, false);
assert.equal(accepted.proposals[0].matchedDeterministicCandidate.id, hardwareCandidate.id);
assert.equal(accepted.proposals[0].sourceEventIds, undefined);
assert.equal(accepted.proposals[0].stateDelta, undefined);
assert.equal(accepted.diagnostics[0].providerOutputStored, false);
assert.equal(accepted.diagnostics[0].campaignStateMutated, false);
assert.equal(success.generationClient.calls()[0].role, SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder);
assert.equal(success.generationClient.calls()[0].request.candidates[0].id, hardwareCandidate.id);
assert.equal(success.generationClient.calls()[0].request.candidates[0].sourceEventIds, undefined);
assertHiddenTermsAbsent(accepted);
assert.deepEqual(campaignState, campaignBefore, 'accepted provider proposals must not mutate campaign state');

const persisted = applySideMissionProviderAssistResult({
  campaignState,
  result: accepted,
  appliedAt: '2026-06-19T12:01:00.000Z'
});
assert.equal(persisted.kind, 'directive.committedSideMissionProviderAssistDiagnostics');
assert.equal(persisted.acceptedProposalCount, 1);
assert.equal(persisted.diagnosticCount, 1);
assert.equal(persisted.providerOutputStored, false);
assert.equal(persisted.campaignState.sideMissions.providerAssistProposals.length, 1);
assert.equal(persisted.campaignState.sideMissions.providerAssistDiagnostics.length, 1);
assert.equal(persisted.campaignState.sideMissions.providerAssistProposals[0].proposalOnly, true);
assert.equal(persisted.campaignState.sideMissions.providerAssistProposals[0].authoritative, false);
assert.equal(persisted.campaignState.sideMissions.providerAssistProposals[0].sourceEventIds, undefined);
assert.equal(persisted.campaignState.sideMissions.providerAssistProposals[0].stateDelta, undefined);
assert.equal(persisted.campaignState.sideMissions.providerAssistDiagnostics[0].providerOutputStored, false);
assert.deepEqual(
  persisted.campaignState.commandLog,
  campaignState.commandLog,
  'provider-assist diagnostics must not write Command Log rows'
);
assertHiddenTermsAbsent(persisted);
assert.deepEqual(campaignState, campaignBefore, 'persisting sanitized provider diagnostics must not mutate source state');

const wrappedJson = createRouter({
  [SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder]: {
    providerId: 'fake-wrapped-json',
    text: `Here is the structured proposal:
\`\`\`json
{
  "proposals": [
    {
      "candidateId": "${hardwareCandidate.id}",
      "opportunityId": "${hardwareCandidate.opportunityId}",
      "title": "Evidence Custody Working Session",
      "playerSummary": "The ship can turn the recovered hardware trail into a bounded custody review.",
      "reviewQuestion": "Who owns the review while the joint record stays consistent?"
    }
  ]
}
\`\`\``
  }
});
const wrappedJsonResult = await runSideMissionProviderAssistance({
  generationRouter: wrappedJson.router,
  opportunityReview: review,
  roleId: SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder,
  candidateId: hardwareCandidate.id,
  requestId: 'provider-assist.wrapped-json'
});
assert.equal(wrappedJsonResult.ok, true);
assert.equal(wrappedJsonResult.status, 'accepted');
assert.equal(wrappedJsonResult.proposals[0].title, 'Evidence Custody Working Session');
assertHiddenTermsAbsent(wrappedJsonResult);
assert.deepEqual(campaignState, campaignBefore, 'wrapped JSON provider proposals must not mutate campaign state');

const invalidJson = createRouter({
  [SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder]: {
    providerId: 'fake-invalid-json',
    text: '{ "proposals": ['
  }
});
const invalidJsonResult = await runSideMissionProviderAssistance({
  generationRouter: invalidJson.router,
  opportunityReview: review,
  roleId: SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder,
  candidateId: hardwareCandidate.id,
  requestId: 'provider-assist.invalid-json'
});
assert.equal(invalidJsonResult.ok, false);
assert.equal(invalidJsonResult.status, 'rejected');
assert.equal(invalidJsonResult.diagnostics[0].code, 'DIRECTIVE_SIDE_MISSION_PROVIDER_INVALID_JSON');
assert.equal(invalidJsonResult.diagnostics[0].campaignStateMutated, false);
assertHiddenTermsAbsent(invalidJsonResult);
assert.deepEqual(campaignState, campaignBefore, 'invalid JSON must not mutate campaign state');

const persistedFailure = applySideMissionProviderAssistResult({
  campaignState,
  result: invalidJsonResult,
  appliedAt: '2026-06-19T12:02:00.000Z'
});
assert.equal(persistedFailure.acceptedProposalCount, 0);
assert.equal(persistedFailure.diagnosticCount, 1);
assert.equal(persistedFailure.campaignState.sideMissions.providerAssistProposals.length, 0);
assert.equal(persistedFailure.campaignState.sideMissions.providerAssistDiagnostics[0].code, 'DIRECTIVE_SIDE_MISSION_PROVIDER_INVALID_JSON');
assertHiddenTermsAbsent(persistedFailure);
assert.deepEqual(campaignState, campaignBefore, 'persisting provider failure diagnostics must not mutate source state');

const failingRouter = createGenerationRouter({
  generationClient: {
    async generate() {
      throw Object.assign(new Error('side-mission sidecar unavailable'), {
        code: 'DIRECTIVE_FAKE_PROVIDER_DOWN'
      });
    }
  },
  now: () => '2026-06-19T12:00:00.000Z'
});
const failure = await runSideMissionProviderAssistance({
  generationRouter: failingRouter,
  opportunityReview: review,
  roleId: SIDE_MISSION_PROVIDER_ROLE_IDS.sceneFramer,
  candidateId: hardwareCandidate.id,
  requestId: 'provider-assist.failure'
});
assert.equal(failure.ok, false);
assert.equal(failure.status, 'failed');
assert.equal(failure.diagnostics[0].code, 'DIRECTIVE_FAKE_PROVIDER_DOWN');
assert.equal(failure.diagnostics[0].providerOutputStored, false);
assert.equal(failure.diagnostics[0].campaignStateMutated, false);
assertHiddenTermsAbsent(failure);
assert.deepEqual(campaignState, campaignBefore, 'provider failure must not mutate campaign state');

const hiddenLeak = createRouter({
  [SIDE_MISSION_PROVIDER_ROLE_IDS.sceneFramer]: {
    providerId: 'fake-hidden-leak',
    content: {
      proposals: [
        {
          candidateId: hardwareCandidate.id,
          opportunityId: hardwareCandidate.opportunityId,
          sceneBrief: {
            openingSituation: 'Pale Lantern should be named as the reason for the audit.',
            sceneQuestion: 'How does the ship reveal the hidden actor?'
          }
        }
      ]
    }
  }
});
const hiddenRejected = await runSideMissionProviderAssistance({
  generationRouter: hiddenLeak.router,
  opportunityReview: review,
  roleId: SIDE_MISSION_PROVIDER_ROLE_IDS.sceneFramer,
  candidateId: hardwareCandidate.id,
  requestId: 'provider-assist.hidden-leak'
});
assert.equal(hiddenRejected.ok, false);
assert.equal(hiddenRejected.status, 'rejected');
assert.equal(hiddenRejected.diagnostics[0].code, 'DIRECTIVE_SIDE_MISSION_PROVIDER_HIDDEN_LEAK');
assert.equal(hiddenRejected.diagnostics[0].hiddenLeakBlocked, true);
assert.equal(hiddenRejected.proposals.length, 0);
assertHiddenTermsAbsent(hiddenRejected);
assert.deepEqual(campaignState, campaignBefore, 'hidden-leaking provider output must not mutate campaign state');

const hiddenWrappedJson = createRouter({
  [SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder]: {
    providerId: 'fake-hidden-wrapped-json',
    text: `Pale Lantern context follows.
{
  "proposals": [
    {
      "candidateId": "${hardwareCandidate.id}",
      "opportunityId": "${hardwareCandidate.opportunityId}",
      "title": "Evidence Custody Working Session"
    }
  ]
}`
  }
});
const hiddenWrappedRejected = await runSideMissionProviderAssistance({
  generationRouter: hiddenWrappedJson.router,
  opportunityReview: review,
  roleId: SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder,
  candidateId: hardwareCandidate.id,
  requestId: 'provider-assist.hidden-wrapped-json'
});
assert.equal(hiddenWrappedRejected.ok, false);
assert.equal(hiddenWrappedRejected.status, 'rejected');
assert.equal(hiddenWrappedRejected.diagnostics[0].code, 'DIRECTIVE_SIDE_MISSION_PROVIDER_HIDDEN_LEAK');
assert.equal(hiddenWrappedRejected.diagnostics[0].hiddenLeakBlocked, true);
assertHiddenTermsAbsent(hiddenWrappedRejected);
assert.deepEqual(campaignState, campaignBefore, 'hidden text surrounding JSON must not mutate campaign state');

const authorityAttempt = createRouter({
  [SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder]: {
    providerId: 'fake-authority-attempt',
    content: {
      proposals: [
        {
          candidateId: hardwareCandidate.id,
          opportunityId: hardwareCandidate.opportunityId,
          title: 'Invalid Authoritative Rewrite',
          sourceEventIds: ['provider-invented-source'],
          stateDelta: { sideMissions: { status: 'accepted' } }
        }
      ]
    }
  }
});
const authorityRejected = await runSideMissionProviderAssistance({
  generationRouter: authorityAttempt.router,
  opportunityReview: review,
  roleId: SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder,
  candidateId: hardwareCandidate.id,
  requestId: 'provider-assist.authority'
});
assert.equal(authorityRejected.ok, false);
assert.equal(authorityRejected.status, 'rejected');
assert.equal(authorityRejected.diagnostics[0].code, 'DIRECTIVE_SIDE_MISSION_PROVIDER_AUTHORITY_KEY');
assertHiddenTermsAbsent(authorityRejected);
assert.deepEqual(campaignState, campaignBefore, 'authority-key rejection must not mutate campaign state');

const runtimeAppSource = fs.readFileSync(path.resolve(root, 'src/runtime/runtime-app.mjs'), 'utf8');
assert.match(runtimeAppSource, /runSideMissionProviderAssistance/, 'runtime app should expose provider-assist action');
assert.match(runtimeAppSource, /applySideMissionProviderAssistResult/, 'runtime app should persist sanitized provider-assist diagnostics');
assert.doesNotMatch(runtimeAppSource, /providerAssist.*commandLog|commandLog.*providerAssist/i, 'provider-assist runtime path should not write Command Log rows');

const runtimeShellSource = fs.readFileSync(path.resolve(root, 'src/runtime/runtime-shell.js'), 'utf8');
assert.match(runtimeShellSource, /runSideMissionProviderAssistance/, 'runtime shell should expose provider-assist action');

const lumiverseBridgeSource = fs.readFileSync(path.resolve(root, 'src/hosts/lumiverse/runtime-bridge.mjs'), 'utf8');
assert.match(lumiverseBridgeSource, /runSideMissionProviderAssistance/, 'Lumiverse runtime bridge should expose provider-assist action');

console.log('Side-mission provider assist tests passed: structured fake proposals, sanitized runtime diagnostics persistence, invalid JSON, provider failure, hidden-leak rejection, authority-key rejection, bridge wiring, and campaign immutability.');
