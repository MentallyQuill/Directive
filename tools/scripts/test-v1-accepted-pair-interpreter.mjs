import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createMissionAcceptedPairInterpretationPrompt,
    createMissionAcceptedPairInterpreter,
    materializeMissionEvidenceProposal,
    parseMissionAcceptedPairInterpretationOutput,
} from '../../src/mission/v1/accepted-pair-interpreter.mjs';
import { createMissionInterpretationCandidatePacket } from '../../src/mission/v1/interpretation-candidates.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const state = createMissionState({ definition, branchId: 'save.alpha' });
state.knownFacts.push('fact.hesperus.distress-established', 'fact.hesperus.passenger-risk');
state.events.push('event.hesperus.rescue-response-begun');
const candidatePacket = createMissionInterpretationCandidatePacket({ definition, state });
const sourcePair = {
    previousAssistant: {
        messageId: 'message.assistant.17',
        selectedSwipeId: '2',
        textHash: 'a'.repeat(64),
        text: 'With the last patient aboard, Sato confirms everyone from Hesperus is safe.',
    },
    currentPlayer: {
        messageId: 'message.player.18',
        selectedSwipeId: null,
        textHash: 'b'.repeat(64),
        text: 'Use the safer plan for the remaining transfer.',
    },
};

const prompt = createMissionAcceptedPairInterpretationPrompt({ candidatePacket, sourcePair });
assert.equal(prompt.metadata.roleId, 'acceptedPairMissionEvidence');
assert.equal(prompt.metadata.missionId, definition.id);
assert.match(prompt.systemPrompt, /plans, attempts, guesses, questions/i);
assert.match(prompt.systemPrompt, /do not create/i);
assert.match(prompt.systemPrompt, /joint accepted-pair condition/i);
assert.match(prompt.messages[1].content, /last patient aboard/);
assert.match(prompt.messages[1].content, /safer plan/);
assert.equal(prompt.messages[1].content.includes('mustNotReveal'), false);
assert.equal(prompt.maxTokens, 2500);
assert.deepEqual(prompt.parameters, { temperature: 0, top_p: 1, max_tokens: 2500 });

const validOutput = {
    kind: 'directive.missionEvidenceInterpretation.v1',
    assistantAcceptance: 'accepted',
    claims: [
        {
            candidateId: 'policy.hesperus.rescue-result',
            sourceSlot: 'previousAssistant',
            value: 'safe',
        },
        {
            candidateId: 'policy.hesperus.rescue-risk-decision',
            sourceSlot: 'currentPlayer',
            value: 'saferPlan',
        },
    ],
    abstained: false,
};
const parsed = parseMissionAcceptedPairInterpretationOutput(
    `Result follows:\n\`\`\`json\n${JSON.stringify(validOutput)}\n\`\`\``,
    { candidatePacket },
);
assert.equal(parsed.ok, true, parsed.errors?.join('\n'));
assert.equal(parsed.value.claims.length, 2);

const proposal = materializeMissionEvidenceProposal({
    interpretation: parsed.value,
    candidatePacket,
    sourcePair,
});
assert.equal(proposal.kind, 'directive.missionEvidenceProposal.v1');
assert.equal(proposal.branchId, 'save.alpha');
assert.equal(proposal.baseRevision, state.revision);
assert.deepEqual(
    proposal.claims.map((claim) => claim.policyId),
    ['policy.hesperus.rescue-result', 'policy.hesperus.rescue-risk-decision'],
);
assert.deepEqual(proposal.claims[0].sourceRef, {
    messageId: 'message.assistant.17',
    swipeId: '2',
    textHash: 'a'.repeat(64),
});
assert.deepEqual(proposal.claims[1].sourceRef, {
    messageId: 'message.player.18',
    swipeId: null,
    textHash: 'b'.repeat(64),
});
assert.equal(proposal.claims[0].targetId, 'outcome.hesperus.rescue-result');
assert.equal(proposal.claims[1].claimType, 'decisionRecorded');
assert.match(proposal.claims[0].claimId, /^claim\.[a-f0-9]{8}$/);

const corrected = parseMissionAcceptedPairInterpretationOutput({
    ...validOutput,
    assistantAcceptance: 'corrected',
}, { candidatePacket });
assert.equal(corrected.ok, true);
assert.deepEqual(corrected.value.claims, [validOutput.claims[1]]);
assert.equal(corrected.discardedAssistantClaimCount, 1);

const abstained = parseMissionAcceptedPairInterpretationOutput({
    kind: 'directive.missionEvidenceInterpretation.v1',
    assistantAcceptance: 'ambiguous',
    claims: [],
    abstained: true,
}, { candidatePacket });
assert.equal(abstained.ok, true);
assert.deepEqual(abstained.value.claims, []);

for (const [label, output, pattern] of [
    ['unknown top-level field', { ...validOutput, summary: 'invented' }, /unknown field/],
    ['wrong kind', { ...validOutput, kind: 'directive.other.v1' }, /kind/],
    ['unknown acceptance', { ...validOutput, assistantAcceptance: 'probably' }, /assistantAcceptance/],
    ['unknown candidate', {
        ...validOutput,
        claims: [{ candidateId: 'policy.hallucinated', sourceSlot: 'previousAssistant' }],
    }, /unknown candidate/],
    ['wrong source slot', {
        ...validOutput,
        claims: [{
            candidateId: 'policy.hesperus.rescue-risk-decision',
            sourceSlot: 'previousAssistant',
            value: 'saferPlan',
        }],
    }, /sourceSlot is not authorized/],
    ['disallowed value', {
        ...validOutput,
        claims: [{
            candidateId: 'policy.hesperus.rescue-result',
            sourceSlot: 'previousAssistant',
            value: 'unresolved',
        }],
    }, /value is not allowed/],
    ['missing value', {
        ...validOutput,
        claims: [{ candidateId: 'policy.hesperus.rescue-result', sourceSlot: 'previousAssistant' }],
    }, /value is required/],
    ['value on non-valued claim', {
        ...validOutput,
        claims: [{
            candidateId: 'policy.prelude.command-handover-completed',
            sourceSlot: 'previousAssistant',
            value: true,
        }],
    }, /value is not allowed/],
    ['duplicate selection', {
        ...validOutput,
        claims: [validOutput.claims[0], validOutput.claims[0]],
    }, /duplicate claim selection/],
    ['abstained with claims', { ...validOutput, abstained: true }, /abstained output cannot contain claims/],
]) {
    const invalid = parseMissionAcceptedPairInterpretationOutput(output, { candidatePacket });
    assert.equal(invalid.ok, false, label);
    assert.match(invalid.errors.join('\n'), pattern, label);
}

const malformed = parseMissionAcceptedPairInterpretationOutput('not json', { candidatePacket });
assert.equal(malformed.ok, false);
assert.match(malformed.errors.join('\n'), /valid JSON/);

const generatedRequests = [];
const interpreter = createMissionAcceptedPairInterpreter({
    generationRouter: {
        async generate(roleId, request) {
            generatedRequests.push({ roleId, request });
            return {
                ok: true,
                response: { text: JSON.stringify(validOutput), providerId: 'fake-utility', model: 'fake' },
                diagnostics: { latencyMs: 12 },
            };
        },
    },
    timeoutMs: 100,
});
const interpreted = await interpreter({ candidatePacket, sourcePair });
assert.equal(interpreted.ok, true);
assert.equal(interpreted.status, 'interpreted');
assert.equal(interpreted.proposal.claims.length, 2);
assert.equal(generatedRequests[0].roleId, 'acceptedPairMissionEvidence');
assert.equal(interpreted.diagnostics.providerId, 'fake-utility');
assert.equal(Object.hasOwn(interpreted.diagnostics, 'rawResponse'), false);

const thrown = await createMissionAcceptedPairInterpreter({
    generationRouter: { generate: async () => { throw new Error('secret provider failure'); } },
    timeoutMs: 100,
})({ candidatePacket, sourcePair });
assert.equal(thrown.ok, false);
assert.equal(thrown.status, 'unavailable');
assert.equal(thrown.reasonCode, 'provider-threw');
assert.equal(JSON.stringify(thrown).includes('secret provider failure'), false);

const timedOut = await createMissionAcceptedPairInterpreter({
    generationRouter: { generate: async () => new Promise(() => {}) },
    timeoutMs: 5,
})({ candidatePacket, sourcePair });
assert.equal(timedOut.ok, false);
assert.equal(timedOut.reasonCode, 'provider-timeout');

console.log('V1 accepted-pair interpreter tests passed.');
