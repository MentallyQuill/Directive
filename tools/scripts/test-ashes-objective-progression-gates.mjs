import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { collectMissionPredicateRefs } from '../../src/mission/v1/predicate-evaluator.mjs';

const missionDirectory = 'packages/bundled/breckenridge/v1';
const missionFiles = fs.readdirSync(missionDirectory)
    .filter((name) => name.endsWith('.mission-v1.json'))
    .sort();

let objectiveCount = 0;
let terminalRouteCount = 0;

for (const missionFile of missionFiles) {
    const definition = JSON.parse(fs.readFileSync(path.join(missionDirectory, missionFile), 'utf8'));
    const policiesByTarget = new Map();
    for (const policy of definition.evidencePolicies || []) {
        const policies = policiesByTarget.get(policy.targetId) || [];
        policies.push(policy);
        policiesByTarget.set(policy.targetId, policies);
    }

    for (const objective of definition.objectives || []) {
        objectiveCount += 1;
        for (const route of objective.terminalWhen || []) {
            terminalRouteCount += 1;
            const refs = collectMissionPredicateRefs(route.when);
            const terminalPolicies = [
                ...[...refs.facts].flatMap((targetId) => (
                    policiesByTarget.get(targetId) || []
                ).filter((policy) => policy.claimType === 'factDisclosed')),
                ...[...refs.events].flatMap((targetId) => (
                    policiesByTarget.get(targetId) || []
                ).filter((policy) => policy.claimType === 'eventOccurred')),
                ...[...refs.outcomes].flatMap((targetId) => (
                    policiesByTarget.get(targetId) || []
                ).filter((policy) => ['outcomeObserved', 'decisionRecorded'].includes(policy.claimType))),
            ];
            if (refs.facts.size + refs.events.size + refs.outcomes.size === 0) continue;
            assert.ok(terminalPolicies.length > 0,
                `${definition.id}:${objective.id}:${route.disposition} needs terminal evidence policy coverage`);
            for (const policy of terminalPolicies) {
                const atomicPlayerDecision = policy.claimType === 'decisionRecorded'
                    && policy.sourceRoles?.length > 0
                    && policy.sourceRoles.every((role) => role === 'user');
                if (atomicPlayerDecision) continue;
                const gateRefs = collectMissionPredicateRefs(policy.when);
                gateRefs.facts.delete(policy.targetId);
                gateRefs.outcomes.delete(policy.targetId);
                const causalRefCount = gateRefs.facts.size
                    + gateRefs.events.size
                    + gateRefs.outcomes.size
                    + gateRefs.objectives.size
                    + gateRefs.entryCapabilities.size
                    + gateRefs.shipCapabilities.size;
                assert.ok(causalRefCount > 0,
                    `${definition.id}:${objective.id}:${policy.id} needs a causal gate`);
                if (policy.sourceRoles?.some((role) => role === 'assistant')) {
                    assert.ok(
                        policy.interpretation?.evidenceStandard,
                        `${definition.id}:${objective.id}:${policy.id} needs an interpretation standard`,
                    );
                }
            }
        }
    }
}

assert.equal(missionFiles.length, 13, 'campaign mission inventory changed');
assert.equal(objectiveCount, 50, 'campaign objective inventory changed');
assert.equal(terminalRouteCount, 142, 'campaign terminal-route inventory changed');

console.log('Ashes objective progression gate tests passed.');
