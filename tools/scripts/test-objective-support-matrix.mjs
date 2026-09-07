import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { evaluateMissionPredicate } from '../../src/mission/v1/predicate-evaluator.mjs';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const matrix = read('docs/testing/ashes-objective-support-matrix.json');
const corpus = read('docs/testing/objective-progress-controlled-corpus.json');
const files = fs.readdirSync('packages/bundled/breckenridge/v1').filter(p => p.endsWith('.mission-v1.json')).sort();
assert.deepEqual(matrix.missions.map(m => path.basename(m.sourcePath)).sort(), files);
assert.equal(matrix.missions.length, 13);
assert.equal(matrix.missions.reduce((n,m) => n+m.objectives.length, 0), 50);
const patterns = new Map(matrix.patterns.map(p => [p.id,p]));
const cases = new Map(corpus.cases.map(c => [c.id,c]));
assert.equal(cases.size, corpus.cases.length, 'duplicate corpus case');
const definitions = new Map();
for (const mission of matrix.missions) {
    assert.equal(hash(mission.sourcePath), mission.sha256, `${mission.missionId}: source drift requires review`);
    const source = read(mission.sourcePath);
    definitions.set(mission.missionId, source);
    assert.equal(source.id, mission.missionId);
    assert.deepEqual(mission.objectives.map(o => o.objectiveId), source.objectives.map(o => o.id));
    for (const key of ['evidencePolicies','events','outcomes','facts','reportRoutes','commandBearingAwards','outcomeDimensions','closeWhen','terminalDispositions','transitions']) {
        if (source[key] !== undefined) assert.deepEqual(mission[key], source[key], `${mission.missionId}:${key} snapshot`);
    }
    for (const objective of mission.objectives) {
        const authored = source.objectives.find(o => o.id === objective.objectiveId);
        assert.deepEqual(objective.definition, authored, `${objective.objectiveId}: entire authored definition`);
        assert.notEqual(objective.review.status, 'pending-semantic-review', `${objective.objectiveId}: source changes need review`);
        assert.ok(objective.review.patternIds.length && objective.review.caseIds.length);
        for (const id of objective.review.patternIds) assert.ok(patterns.has(id), `unknown pattern ${id}`);
        for (const id of objective.review.caseIds) {
            assert.ok(cases.has(id), `missing case ${id}`);
            assert.equal(cases.get(id).objectiveId, objective.objectiveId);
        }
    }
}
definitions.set(corpus.independentMission.id, corpus.independentMission);
function context(state, definition) {
    const index = Object.fromEntries(['facts','events','outcomes','objectives','entryCapabilities'].map(k => [k, new Map((definition[k] || []).map(v => [v.id,v]))]));
    return { index, knownFacts:new Set(state.facts), worldFacts:new Set(state.facts), events:new Set(state.events), outcomes:new Map(Object.entries(state.outcomes)), objectives:new Map(Object.entries(state.objectives)), missionStatus:'active' };
}
let steps = 0;
for (const c of corpus.cases) {
    const definition = definitions.get(c.missionId);
    assert.ok(definition, c.id);
    if (c.sourceHash) assert.equal(c.sourceHash, matrix.missions.find(m => m.missionId === c.missionId).sha256);
    const objective = definition.objectives.find(o => o.id === c.objectiveId);
    let state = structuredClone(c.initialAcceptedState);
    for (const step of c.steps) {
        for (const fact of step.acceptedDelta.facts || []) if (!state.facts.includes(fact)) state.facts.push(fact);
        for (const event of step.acceptedDelta.events || []) if (!state.events.includes(event)) state.events.push(event);
        Object.assign(state.outcomes, step.acceptedDelta.outcomes || {});
        Object.assign(state.objectives, step.acceptedDelta.objectives || {});
        for (const key of ['activationWhen','availableWhen','visibleWhen','progressWhen']) {
            const result = evaluateMissionPredicate(objective[key] ?? (key !== 'progressWhen'), context(state, definition));
            assert.ok(result.ok, `${c.id}:${key}: ${result.errors.join(', ')}`);
            assert.equal(result.value, step.expectedPredicates[key], `${c.id}:${step.label}:${key}`);
        }
        const matching = objective.terminalWhen.filter(r => {
            const result = evaluateMissionPredicate(r.when, context(state, definition));
            assert.ok(result.ok, `${c.id}: ${result.errors.join(', ')}`);
            return result.value;
        });
        assert.equal(matching[0]?.disposition ?? null, step.terminalMatch, `${c.id}:${step.label}`);
        assert.equal(matching.some(r => (step.forbiddenDispositions || []).includes(r.disposition)), false, `${c.id}:${step.label}: forbidden resolution`);
        assert.deepEqual(JSON.parse(JSON.stringify(state)), state, `${c.id}: fixture survives serialization`);
        steps++;
    }
}
for (const p of patterns.values()) {
    assert.ok(p.caseIds.length, `unexercised pattern ${p.id}`);
    for (const id of p.caseIds) assert.ok(cases.has(id), `missing pattern case ${id}`);
}
assert.deepEqual(matrix.cases.map(c => c.id).sort(), [...cases.keys()].sort());
console.log(`Objective support matrix: 13 missions, 50 objectives, ${patterns.size} classified patterns, ${cases.size} controlled lifecycle-predicate cases, ${steps} steps passed. Rewards/closure classified only; no model, correction-runtime, or live-play claim.`);
