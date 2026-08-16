import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    parseMissionAcceptedPairInterpretationOutput,
} from '../../src/mission/v1/accepted-pair-interpreter.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { createMissionInterpretationCandidatePacket } from '../../src/mission/v1/interpretation-candidates.mjs';
import { createMissionPlayerProjection } from '../../src/mission/v1/player-projection.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createShipWorkInterpretationCandidates } from '../../src/ship/v1/ship-work-evidence.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const fixture = JSON.parse(fs.readFileSync(
    'tests/fixtures/mission/v1/prelude-premature-completion-regression.fixture.json',
    'utf8',
));
const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const { shipDataset } = loadAshesRuntimeAssets();

const state = createMissionState({ definition, branchId: 'save.1786851317628.1' });
state.knownFacts.push('fact.hesperus.distress-established', 'fact.hesperus.passenger-risk');
state.worldFacts.push('fact.hesperus.distress-established');
state.events.push('event.hesperus.rescue-response-begun');

const missionCandidates = createMissionInterpretationCandidatePacket({ definition, state });
const candidatePacket = {
    ...missionCandidates,
    candidates: [
        ...missionCandidates.candidates,
        ...createShipWorkInterpretationCandidates({
            shipDataset,
            storySettlement: { episodes: [], receipts: [] },
        }),
    ].sort((left, right) => left.id.localeCompare(right.id)),
};
const candidateIds = new Set(candidatePacket.candidates.map((candidate) => candidate.id));

for (const terminalId of [
    'policy.prelude.command-handover-completed',
    'policy.prelude.staff-readiness-established',
    'policy.hesperus.rescue-result',
    'policy.hesperus.rescue-cost',
]) {
    assert.equal(candidateIds.has(terminalId), false, `${terminalId} must be unavailable before its authored stage`);
}
for (const laterShipMilestone of [
    'ship-milestone.integration-combined-load-test',
    'ship-milestone.sensor-live-load-validation',
]) {
    assert.equal(candidateIds.has(laterShipMilestone), false, `${laterShipMilestone} must remain locked`);
}

for (const pair of fixture.pairs) {
    const sourcePair = {
        previousAssistant: pair.assistant,
        currentPlayer: pair.player,
    };
    const oldUngroundedOutput = {
        kind: 'directive.missionEvidenceInterpretation.v1',
        assistantAcceptance: 'accepted',
        claims: pair.formerSelections,
        peopleEvents: [],
        abstained: false,
        time: {
            decision: 'unchanged',
            elapsedSeconds: 0,
            reason: 'incident-regression',
            confidence: 1,
        },
    };
    const parsed = parseMissionAcceptedPairInterpretationOutput(oldUngroundedOutput, {
        candidatePacket,
        sourcePair,
    });
    assert.equal(parsed.ok, false, `${pair.id}: old ungrounded selections must fail closed`);
    assert.match(parsed.errors.join('\n'), /evidenceQuote|unknown candidate|four durable selections/i, pair.id);
}

const registryPair = fixture.pairs.find((pair) => pair.id === 'registry-and-medical-briefing');
assert.match(registryPair.assistant.text, /Six hours to arrive if we stay reasonable, four if we don't/);
assert.doesNotMatch(registryPair.assistant.text, /people aboard Hesperus reach safety/i);
const engineeringPair = fixture.pairs.find((pair) => pair.id === 'uncertainty-not-completed-work');
assert.match(engineeringPair.assistant.text, /They never certified them together under a sustained representative load/);
assert.match(engineeringPair.assistant.text, /That's an absence of evidence/);

const falseShipCompletion = parseMissionAcceptedPairInterpretationOutput({
    kind: 'directive.missionEvidenceInterpretation.v1',
    assistantAcceptance: 'accepted',
    claims: [{
        candidateId: 'ship-milestone.integration-isolation-test',
        sourceSlot: 'previousAssistant',
        evidenceQuote: 'The combined-load validation completed successfully.',
    }],
    peopleEvents: [],
    abstained: false,
    time: { decision: 'unchanged', elapsedSeconds: 0, reason: 'incident-regression', confidence: 1 },
}, {
    candidatePacket,
    sourcePair: { previousAssistant: engineeringPair.assistant, currentPlayer: engineeringPair.player },
});
assert.equal(falseShipCompletion.ok, false);
assert.match(falseShipCompletion.errors.join('\n'), /evidenceQuote must occur in its authorized source/);

function assertPrematureMissionClaimRejected({ pairId, policyId, claimType, targetId, value }) {
    const pair = fixture.pairs.find((candidate) => candidate.id === pairId);
    const source = {
        ...pair.assistant,
        branchId: state.branchId,
        role: 'assistant',
        accepted: true,
        acceptedAtRevision: state.revision,
        contributionId: `contribution.regression.${pair.assistant.messageId}`,
    };
    const claim = {
        claimId: `claim.regression.${pair.assistant.messageId}.${targetId.split('.').at(-1)}`,
        policyId,
        claimType,
        targetId,
        ...(value === undefined ? {} : { value }),
        sourceRef: {
            messageId: source.messageId,
            swipeId: source.selectedSwipeId,
            textHash: source.textHash,
        },
    };
    const result = validateMissionEvidenceProposal({
        definition,
        state,
        proposal: {
            kind: 'directive.missionEvidenceProposal.v1',
            branchId: state.branchId,
            missionId: definition.id,
            baseRevision: state.revision,
            claims: [claim],
        },
        resolveSourceRef: () => source,
    });
    assert.equal(result.acceptedClaims.length, 0, policyId);
    assert.equal(result.rejectedClaims[0]?.reasonCode, 'precondition-not-met', policyId);
}

for (const claim of [
    {
        pairId: 'handover-boundaries-not-transfer',
        policyId: 'policy.prelude.command-handover-completed',
        claimType: 'eventOccurred',
        targetId: 'event.prelude.command-handover-completed',
    },
    {
        pairId: 'registry-and-medical-briefing',
        policyId: 'policy.prelude.staff-readiness-established',
        claimType: 'eventOccurred',
        targetId: 'event.prelude.staff-readiness-established',
    },
    {
        pairId: 'uncertainty-not-completed-work',
        policyId: 'policy.hesperus.rescue-result',
        claimType: 'outcomeObserved',
        targetId: 'outcome.hesperus.rescue-result',
        value: 'safeWithCost',
    },
    {
        pairId: 'uncertainty-not-completed-work',
        policyId: 'policy.hesperus.rescue-cost',
        claimType: 'outcomeObserved',
        targetId: 'outcome.hesperus.rescue-cost',
        value: 'material',
    },
]) assertPrematureMissionClaimRejected(claim);

const projection = createMissionPlayerProjection({ definition, state });
for (const objectiveId of [
    'objective.prelude.command-handover',
    'objective.prelude.staff-readiness',
    'objective.prelude.hesperus-rescue',
]) {
    const objective = projection.objectives.find((candidate) => candidate.id === objectiveId);
    assert.notEqual(objective?.state, 'terminal', objectiveId);
}

console.log('Prelude premature-completion transcript regression passed.');
