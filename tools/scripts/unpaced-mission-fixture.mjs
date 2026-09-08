// Historical repair and isolated plumbing tests intentionally exercise pre-pacing
// evidence. Canonical pacing is exercised through test-scene-pacing*.mjs.
export function disableScenePacingForFixture(definition) {
    delete definition.scenePacing;
    definition.objectives.forEach(objective=>{delete objective.scenePacing;});
    for (const collection of ['events','outcomes','evidencePolicies']) {
        definition[collection]=definition[collection].filter(item=>!item.id.includes('.scene-pacing.'));
    }
    const distress=definition.evidencePolicies.find(policy=>policy.id==='policy.hesperus.distress-established');
    if (distress) distress.when=true;
    return definition;
}
