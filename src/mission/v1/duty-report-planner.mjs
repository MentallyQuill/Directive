import { missionStateContext } from './mission-state.mjs';
import { evaluateMissionPredicate } from './predicate-evaluator.mjs';

export const DUTY_REPORT_PACKET_KIND = 'directive.dutyReportPacket.v1';

const URGENCY_RANK = Object.freeze({
    urgent: 30,
    material: 20,
    routine: 10,
});

const REQUIREMENT_RANK = Object.freeze({
    required: 20,
    optional: 10,
});

function asSet(value) {
    if (value instanceof Set) return new Set(value);
    return new Set(Array.isArray(value) ? value : []);
}

function compareRoutes(a, b) {
    const urgencyDifference = (URGENCY_RANK[b?.urgency] ?? 0) - (URGENCY_RANK[a?.urgency] ?? 0);
    if (urgencyDifference !== 0) return urgencyDifference;
    const requirementDifference = (REQUIREMENT_RANK[b?.deliveryRequirement] ?? 0)
        - (REQUIREMENT_RANK[a?.deliveryRequirement] ?? 0);
    if (requirementDifference !== 0) return requirementDifference;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function settledDeliveryMatchesRoute(entry, route) {
    const delivery = entry?.delivery;
    return entry?.claimType === 'factDisclosed'
        && entry?.targetId === route?.factId
        && entry?.policyId === route?.evidencePolicyId
        && delivery?.kind === 'directive.dutyReportDelivery.v1'
        && delivery?.contractVersion === 1
        && delivery?.reportId === route?.id
        && delivery?.factId === route?.factId
        && delivery?.policyId === route?.evidencePolicyId
        && typeof delivery?.reporterId === 'string'
        && typeof delivery?.responseId === 'string'
        && typeof delivery?.hostMessageId === 'string'
        && typeof delivery?.visibleTextHash === 'string'
        && typeof delivery?.segmentTextHash === 'string'
        && typeof delivery?.sourceTransactionId === 'string';
}

export function deliveredDutyReportIds({ definition = {}, state = {} } = {}) {
    const routes = new Map((definition.reportRoutes || []).map((route) => [route.id, route]));
    const invalidated = asSet(state.invalidatedSourceContributionIds);
    const delivered = [];
    for (const entry of Array.isArray(state.evidenceLog) ? state.evidenceLog : []) {
        if (!entry?.sourceContributionId || invalidated.has(entry.sourceContributionId)) continue;
        const route = routes.get(entry?.delivery?.reportId);
        if (route && settledDeliveryMatchesRoute(entry, route) && !delivered.includes(route.id)) {
            delivered.push(route.id);
        }
    }
    return delivered.sort();
}

function actorHasCapability(actor, requiredCapabilities) {
    const actorCapabilities = asSet(actor?.capabilityRoles);
    return requiredCapabilities.some((capability) => actorCapabilities.has(capability));
}

function selectReporter(route, availableActors) {
    const actors = (Array.isArray(availableActors) ? availableActors : [])
        .filter((actor) => actor?.available !== false && typeof actor?.id === 'string')
        .sort((a, b) => a.id.localeCompare(b.id));
    const actorsById = new Map(actors.map((actor) => [actor.id, actor]));
    const requiredCapabilities = Array.isArray(route?.capabilityRoles) ? route.capabilityRoles : [];

    for (const actorId of Array.isArray(route?.preferredActorIds) ? route.preferredActorIds : []) {
        const actor = actorsById.get(actorId);
        if (actor && actorHasCapability(actor, requiredCapabilities)) return actor;
    }
    const capableActor = actors.find((actor) => actorHasCapability(actor, requiredCapabilities));
    if (capableActor) return capableActor;
    for (const actorId of Array.isArray(route?.fallbackActorIds) ? route.fallbackActorIds : []) {
        const actor = actorsById.get(actorId);
        if (actor) return actor;
    }
    return null;
}

export function selectPendingDutyReport({
    definition = {},
    state = {},
    availableActors = [],
    deliveredReportIds = [],
} = {}) {
    const delivered = asSet(deliveredReportIds);
    const knownFacts = asSet(state?.knownFacts);
    const worldFacts = asSet(state?.worldFacts);
    const context = missionStateContext(definition, state);

    for (const route of [...(definition.reportRoutes || [])].sort(compareRoutes)) {
        if (delivered.has(route.id)) continue;
        if (!worldFacts.has(route.factId) || knownFacts.has(route.factId)) continue;
        const predicate = evaluateMissionPredicate(route.when, context);
        if (!predicate.ok || !predicate.value) continue;
        const reporter = selectReporter(route, availableActors);
        if (!reporter) continue;
        return {
            kind: DUTY_REPORT_PACKET_KIND,
            reportId: route.id,
            reporterId: reporter.id,
            factId: route.factId,
            urgency: route.urgency,
            confidence: route.confidence,
            deliveryRequirement: route.deliveryRequirement,
            playerText: structuredClone(route.playerText),
            authorizedClaim: {
                claimType: 'factDisclosed',
                targetId: route.factId,
                policyId: route.evidencePolicyId,
            },
        };
    }
    return null;
}
