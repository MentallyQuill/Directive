import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createMissionAcceptedPairInterpretationSchema,
    parseMissionAcceptedPairInterpretationOutput,
} from '../../src/mission/v1/accepted-pair-interpreter.mjs';
import { createMissionInterpretationCandidatePacket } from '../../src/mission/v1/interpretation-candidates.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const state = createMissionState({ definition, branchId: 'save.sam-vickers-regression' });
state.knownFacts.push('fact.hesperus.distress-established');
state.events.push('event.hesperus.rescue-response-begun');

const candidatePacket = createMissionInterpretationCandidatePacket({ definition, state });
assert.equal(
    candidatePacket.candidates.some(({ id }) => id === 'policy.prelude.command-handover-terms-settled'),
    true,
    'The accepted pair must be able to record the working handover terms.',
);

const sourcePair = {
    previousAssistant: {
        messageId: '40',
        selectedSwipeId: '0',
        textHash: '40'.repeat(32),
        text: [
            '"It is. As of now, Commander Vickers assumes the duties of executive officer of this ship. Lieutenant Commander Bronn is relieved of the acting billet and returns to tactical."',
            '"Logged, Captain," Nayar said, already keying it. "Effective now."',
            'Bronn came around from the tactical station and stopped at the rail.',
            '"Sickbay\'s surge protocol needs your authorization, not the captain\'s."',
            '"Four hours and four minutes to the storm boundary," Vale said from the conn.',
        ].join('\n'),
    },
    currentPlayer: {
        messageId: '41',
        selectedSwipeId: null,
        textHash: '41'.repeat(32),
        text: '"Understood Captain," Sam replied before directing fifteen security staff to report to medical.',
    },
};
const peopleContext = {
    knownPeople: [
        { id: 'mara-whitaker', name: 'Mara Whitaker' },
        { id: 'priya-nayar', name: 'Priya Nayar' },
        { id: 'hadrik-bronn', name: 'Hadrik Bronn' },
        { id: 'miriam-sato', name: 'Miriam Sato' },
        { id: 'kieran-vale', name: 'Kieran Vale' },
    ],
};
const interpretation = {
    kind: 'directive.missionEvidenceInterpretation.v1',
    assistantAcceptance: 'accepted',
    claims: [{
        candidateId: 'policy.prelude.command-handover-terms-settled',
        sourceSlot: 'previousAssistant',
        evidenceQuote: 'Commander Vickers assumes the duties of executive officer of this ship.',
    }],
    peopleEvents: [{
        type: 'relationshipEvidence',
        personRef: 'mara-whitaker',
        summary: 'Whitaker formally assigned Vickers the executive-officer duties.',
        sourceSlot: 'previousAssistant',
        evidenceQuote: 'Commander Vickers assumes the duties of executive officer of this ship.',
    }, {
        type: 'relationshipEvidence',
        personRef: 'priya-nayar',
        summary: 'Nayar logged the transfer as immediately effective.',
        sourceSlot: 'previousAssistant',
        evidenceQuote: 'Nayar said, already keying it. "Effective now."',
    }, {
        type: 'relationshipEvidence',
        personRef: 'hadrik-bronn',
        summary: 'Bronn yielded the acting billet and returned to tactical.',
        sourceSlot: 'previousAssistant',
        evidenceQuote: 'Lieutenant Commander Bronn is relieved of the acting billet and returns to tactical.',
    }, {
        type: 'relationshipEvidence',
        personRef: 'miriam-sato',
        summary: 'Sato placed sickbay surge authorization with Vickers.',
        sourceSlot: 'previousAssistant',
        evidenceQuote: 'Sickbay\'s surge protocol needs your authorization, not the captain\'s.',
    }],
    abstained: false,
    time: {
        decision: 'advance',
        elapsedSeconds: 70,
        reason: 'formal-handover-and-briefing',
        confidence: 0.9,
    },
};

const parsed = parseMissionAcceptedPairInterpretationOutput(interpretation, {
    candidatePacket,
    sourcePair,
    peopleContext,
});
assert.equal(parsed.ok, true, parsed.errors?.join('\n'));
assert.deepEqual(parsed.value.claims, interpretation.claims, 'Mission evidence must take precedence over overflow People observations.');
assert.deepEqual(parsed.value.peopleEvents, interpretation.peopleEvents.slice(0, 3));
assert.equal(parsed.discardedOverflowPeopleEventCount, 1);

const schema = createMissionAcceptedPairInterpretationSchema({ candidatePacket });
assert.deepEqual(
    schema.allOf[0].oneOf.map((branch) => ({
        claims: branch.properties.claims.maxItems,
        peopleEvents: branch.properties.peopleEvents.maxItems,
    })),
    [
        { claims: 0, peopleEvents: 4 },
        { claims: 1, peopleEvents: 3 },
        { claims: 2, peopleEvents: 2 },
        { claims: 3, peopleEvents: 1 },
        { claims: 4, peopleEvents: 0 },
    ],
    'The provider schema must prevent the overflow that the parser defensively handles.',
);

console.log('Sam Vickers accepted-pair overflow regression passed.');
