import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildContinuityProjectionMatrix,
  materializeCommandLogFacts,
  materializeRejectedClaimFacts,
  quarantineGeneratedClaims,
  reviewContinuityContradictions
} from '../../src/continuity/index.mjs';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const campaignProjection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

let campaignState = initializeCampaignRuntimeTracking(cloneJson(campaignProjection.initialState));
campaignState.campaign = {
  ...campaignState.campaign,
  id: 'campaign-continuity-ledger-materializers',
  status: 'active'
};
campaignState.commandLog = {
  entries: [
    {
      id: 'log.visible.1',
      sourceOutcomeId: 'outcome.visible.1',
      summaryInputs: ['Sam asked for the operational picture.'],
      visibleConsequences: ['The senior staff framed the handoff around transparent reporting.']
    },
    {
      id: 'log.hidden.1',
      summary: 'Hidden Farwatch order surfaced.',
      visibility: 'hidden',
      visibleConsequences: ['This must not render.']
    },
    {
      id: 'log.player-hidden.1',
      summary: 'A player-hidden item should not render.',
      playerVisible: false
    },
    {
      id: 'log.visible.2',
      sourceOutcomeId: 'outcome.visible.2',
      assistedSummary: { text: 'Sam chose to review Bronn\'s tactical handoff before arrival.' },
      visibleConsequences: ['Bronn prepared a direct tactical readiness brief.']
    }
  ]
};

const commandLogFacts = materializeCommandLogFacts({ campaignState });
assert.equal(commandLogFacts.length, 2);
assert.equal(commandLogFacts.every((fact) => fact.kind === 'commandLog.committed'), true);
assert.equal(commandLogFacts.every((fact) => fact.conflictKey.startsWith('commandLog.')), true);
assert.equal(JSON.stringify(commandLogFacts).includes('Hidden Farwatch'), false);
assert.equal(commandLogFacts.some((fact) => fact.id === 'command-log.outcome.visible.2'), true);

const badText = 'Bronn, a human male in his early forties, said the ship had been at impulse for six days since leaving Utopia Planitia.';
const badReview = reviewContinuityContradictions({
  text: badText,
  campaignState,
  packageData,
  crewDataset,
  campaignProjection
});
assert.equal(badReview.ok, false);
campaignState = quarantineGeneratedClaims(campaignState, {
  text: badText,
  source: { kind: 'test', id: 'bad-host-native-generation' },
  review: badReview,
  status: 'rejected',
  now: '2026-06-27T00:00:00.000Z'
}).campaignState;
const rejectedFacts = materializeRejectedClaimFacts({ campaignState });
assert.equal(rejectedFacts.length > 0, true);
assert.equal(rejectedFacts.every((fact) => fact.kind === 'continuity.rejectedClaim'), true);
assert.equal(rejectedFacts.every((fact) => fact.tags.includes('contradiction-guard')), true);
assert.equal(JSON.stringify(rejectedFacts).includes('human male in his early forties'), false);

const candidateState = quarantineGeneratedClaims(campaignState, {
  text: 'Bronn, the Tellarite tactical chief, reviewed the tactical handoff.',
  source: { kind: 'test', id: 'candidate-host-native-generation' },
  review: { ok: true, findings: [] },
  status: 'candidate',
  now: '2026-06-27T00:00:01.000Z'
}).campaignState;
assert.equal(materializeRejectedClaimFacts({ campaignState: candidateState }).length, rejectedFacts.length);

const matrix = buildContinuityProjectionMatrix({
  campaignState,
  packageData,
  crewDataset,
  campaignProjection,
  createdAt: '2026-06-27T00:00:02.000Z'
});
const recapBlock = matrix.blocks.find((block) => block.promptKey === 'directive.recap.committed');
assert(recapBlock);
assert.match(recapBlock.content, /Sam asked for the operational picture/);
assert.match(recapBlock.content, /Sam chose to review Bronn's tactical handoff/);
assert.doesNotMatch(recapBlock.content, /Hidden Farwatch|player-hidden/);
const invariantBlock = matrix.blocks.find((block) => block.promptKey === 'directive.continuity.invariants');
assert(invariantBlock);
assert.match(invariantBlock.content, /rejected by continuity review/);
assert.doesNotMatch(invariantBlock.content, /human male in his early forties|six days since leaving Utopia Planitia/);
assert.equal(matrix.plan.laneFactIds['directive.recap.committed'].some((id) => id.startsWith('command-log.')), true);
assert.equal(matrix.plan.laneFactIds['directive.continuity.invariants'].some((id) => id.startsWith('rejected-claim.')), true);

console.log('Continuity ledger materializer tests passed: committed Command Log facts and rejected-claim guard facts');
