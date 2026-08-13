import assert from 'node:assert/strict';

import {
    createPeopleDossierAuthor,
    parsePeopleDossierBatchOutput,
} from '../../src/people/people-dossier-author.mjs';

const introductions = [{
    personId: 'person.emergent.ari-sol',
    name: 'Ari Sol',
    introductionSummary: 'Ari introduced herself while repairing relay junction four.',
}, {
    personId: 'person.emergent.tovan-rel',
    name: 'Tovan Rel',
    introductionSummary: 'Tovan introduced himself beside the damaged relay.',
}];
const output = {
    kind: 'directive.peopleDossierBatch.v1',
    dossiers: [{
        personId: 'person.emergent.ari-sol',
        displayName: 'Ari Sol',
        role: 'Damage-control technician',
        affiliation: 'U.S.S. Breckenridge',
        species: 'Human',
        age: '31',
        birthplace: 'Nairobi, Earth',
        serviceBackground: 'Damage control, relay maintenance, emergency repair',
        assignmentHistory: 'Assigned to the Breckenridge engineering department',
        profileSummary: 'Ari Sol is a Breckenridge damage-control technician responsible for relay and emergency systems repair.',
    }, {
        personId: 'person.emergent.tovan-rel',
        displayName: 'Tovan Rel',
        role: 'Systems specialist',
        affiliation: 'U.S.S. Breckenridge',
        species: 'Trill',
        age: 'Adult',
        birthplace: 'Trill',
        serviceBackground: 'Starship systems diagnostics and relay calibration',
        assignmentHistory: 'Breckenridge systems team',
        profileSummary: 'Tovan Rel is a systems specialist serving aboard the Breckenridge.',
    }],
};

const calls = [];
const author = createPeopleDossierAuthor({
    generationRouter: {
        async generate(roleId, request, options) {
            calls.push({ roleId, request, options });
            return { ok: true, response: { text: JSON.stringify(output), providerId: 'test', model: 'reasoner' } };
        },
    },
    timeoutMs: 200,
});
const result = await author({
    introductions,
    campaignContext: {
        campaignTitle: 'Ashes of Peace',
        shipName: 'U.S.S. Breckenridge',
    },
});
assert.equal(result.ok, true, JSON.stringify(result));
assert.equal(calls.length, 1);
assert.equal(calls[0].roleId, 'peopleDossierAuthor');
assert.equal(calls[0].request.jsonSchema.additionalProperties, false);
assert.match(calls[0].request.systemPrompt, /public/i);
assert.match(calls[0].request.systemPrompt, /secrets|private motives/i);
assert.deepEqual(result.dossiers, output.dossiers);

const forbidden = structuredClone(output);
forbidden.dossiers[0].privateMotive = 'Secretly planning a mutiny.';
const forbiddenResult = parsePeopleDossierBatchOutput(forbidden, { introductions });
assert.equal(forbiddenResult.ok, false);
assert.match(forbiddenResult.errors.join('\n'), /unknown field/);

console.log('People dossier author tests passed.');
