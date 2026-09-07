import { collectMissionPredicateRefs } from './predicate-evaluator.mjs';

export function objectiveResolutionRefs(definition, objective, visited = new Set()) {
    const refs = collectMissionPredicateRefs({any:(objective?.terminalWhen || []).map(item=>item.when)});
    if (!objective || visited.has(objective.id)) return refs;
    visited.add(objective.id);
    for (const id of refs.objectives) {
        const dependency = objectiveResolutionRefs(definition,definition.objectives.find(item=>item.id === id),visited);
        for (const key of Object.keys(refs)) for (const value of dependency[key]) refs[key].add(value);
    }
    return refs;
}
