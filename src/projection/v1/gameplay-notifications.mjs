export const GAMEPLAY_NOTIFICATION_KINDS = Object.freeze({
  missionComplete: 'missionComplete',
  objectiveComplete: 'objectiveComplete',
  newContact: 'newContact',
  relationshipUpdated: 'relationshipUpdated',
  shipTaskComplete: 'shipTaskComplete',
  shipTaskProgress: 'shipTaskProgress',
});

const PROJECTION_KINDS = Object.freeze({
  composite: 'directive.playerProjection.v1',
  mission: 'directive.missionPlayerProjection.v1',
  people: 'directive.peoplePlayerProjection.v1',
  ship: 'directive.shipPlayerProjection.v1',
});

function validProjection(projection) {
  return projection?.kind === PROJECTION_KINDS.composite
    && projection?.mission?.kind === PROJECTION_KINDS.mission
    && projection?.people?.kind === PROJECTION_KINDS.people
    && projection?.ship?.kind === PROJECTION_KINDS.ship;
}

function indexById(records = []) {
  return new Map(records.filter(({ id }) => id).map((record) => [record.id, record]));
}

function objectiveCompletions(previousMission, nextMission) {
  const previous = indexById(previousMission.objectives);
  return (nextMission.objectives || []).filter((objective) => (
    objective?.id
    && objective.status === 'terminal'
    && previous.get(objective.id)?.status !== 'terminal'
  ));
}

function projectionRevision(projection) {
  const mission = Number(projection?.revisions?.mission ?? projection?.mission?.revision) || 0;
  const story = Number(projection?.revisions?.story) || 0;
  return `mission:${mission};story:${story}`;
}

function missionNotifications(previousMission, nextMission, sourceRevision) {
  const completed = objectiveCompletions(previousMission, nextMission);
  const missionId = nextMission.missionId;
  if (!missionId) return [];
  const revision = Number(nextMission.revision) || 0;
  if (previousMission.status !== 'terminal' && nextMission.status === 'terminal') {
    return [{
      id: `mission.missionComplete.${missionId}.${revision}`,
      route: 'mission',
      subjectId: missionId,
      kind: GAMEPLAY_NOTIFICATION_KINDS.missionComplete,
      title: 'Mission complete',
      summary: nextMission.terminal?.title || nextMission.title,
      priority: 100,
      sourceRevision,
    }];
  }
  if (completed.length === 0) return [];
  return [{
    id: `mission.objectiveComplete.${missionId}.${revision}.${completed.map(({ id }) => id).sort().join('+')}`,
    route: 'mission',
    subjectId: missionId,
    kind: GAMEPLAY_NOTIFICATION_KINDS.objectiveComplete,
    title: completed.length === 1 ? 'Objective complete' : 'Objectives complete',
    summary: completed.length === 1
      ? completed[0].terminalText || completed[0].title
      : `${completed.length} objectives completed`,
    priority: 70,
    sourceRevision,
  }];
}

function peopleNotifications(previousPeople, nextPeople, sourceRevision) {
  const previous = indexById(previousPeople.people);
  return (nextPeople.people || []).flatMap((person) => {
    if (!person?.id) return [];
    const prior = previous.get(person.id);
    if (!prior) {
      return [{
        id: `people.newContact.${person.id}.${sourceRevision}`,
        route: 'people',
        subjectId: person.id,
        kind: GAMEPLAY_NOTIFICATION_KINDS.newContact,
        title: `New contact: ${person.name || 'Unknown contact'}`,
        summary: person.relationshipPosture
          ? `Relationship established: ${person.relationshipPosture}`
          : 'A new People card is available.',
        priority: 60,
        sourceRevision,
      }];
    }
    const priorMomentIds = new Set((prior.moments || []).map(({ id }) => id));
    const newMoments = (person.moments || []).filter(({ id }) => id && !priorMomentIds.has(id));
    const postureChanged = (prior.relationshipPosture || null) !== (person.relationshipPosture || null);
    const openMatterChanged = (prior.relationshipOpenMatter || null) !== (person.relationshipOpenMatter || null);
    if (!postureChanged && !openMatterChanged && newMoments.length === 0) return [];
    const changeIds = [
      ...(postureChanged ? ['posture'] : []),
      ...(openMatterChanged ? ['openMatter'] : []),
      ...newMoments.map(({ id }) => id),
    ].sort();
    let summary = 'A significant relationship update is available.';
    if (newMoments.length > 0) summary = `New defining moment: ${newMoments[0].title || newMoments[0].summary}`;
    else if (postureChanged) summary = person.relationshipPosture
      ? `Current posture: ${person.relationshipPosture}`
      : 'Current posture was cleared.';
    else if (person.relationshipOpenMatter) summary = `Open matter: ${person.relationshipOpenMatter}`;
    else summary = 'An open matter was resolved.';
    return [{
      id: `people.relationshipUpdated.${person.id}.${sourceRevision}.${changeIds.join('+')}`,
      route: 'people',
      subjectId: person.id,
      kind: GAMEPLAY_NOTIFICATION_KINDS.relationshipUpdated,
      title: `Relationship updated: ${person.name || 'Contact'}`,
      summary,
      priority: 50,
      sourceRevision,
    }];
  });
}

function shipNotifications(previousShip, nextShip, sourceRevision) {
  const previousTasks = indexById(previousShip.cohesion?.visibleTasks);
  const previousCompleted = indexById(previousShip.cohesion?.completedHistory);
  const completed = (nextShip.cohesion?.completedHistory || [])
    .filter((record) => record?.id && previousTasks.has(record.id) && !previousCompleted.has(record.id))
    .map((record) => ({
      id: `ship.shipTaskComplete.${record.id}.${record.sequence ?? sourceRevision}`,
      route: 'ship',
      subjectId: record.id,
      kind: GAMEPLAY_NOTIFICATION_KINDS.shipTaskComplete,
      title: 'Ship task complete',
      summary: record.title,
      priority: 90,
      sourceRevision,
    }));
  const completedIds = new Set(completed.map(({ subjectId }) => subjectId));
  const progress = (nextShip.cohesion?.visibleTasks || []).flatMap((task) => {
    const prior = previousTasks.get(task?.id);
    if (!prior || completedIds.has(task.id)) return [];
    const priorPhases = indexById(prior.phases);
    const completed = (task.phases || []).filter((phase) => (
      phase?.id
      && phase.status === 'completed'
      && priorPhases.get(phase.id)?.status !== 'completed'
    ));
    if (completed.length === 0) return [];
    return [{
      id: `ship.shipTaskProgress.${task.id}.${sourceRevision}.${completed.map(({ id }) => id).sort().join('+')}`,
      route: 'ship',
      subjectId: task.id,
      kind: GAMEPLAY_NOTIFICATION_KINDS.shipTaskProgress,
      title: `Ship task progressed: ${task.title}`,
      summary: completed.length === 1
        ? `Step complete: ${completed[0].label}`
        : `${completed.length} steps completed`,
      priority: 40,
      sourceRevision,
    }];
  });
  return [...completed, ...progress];
}

export function deriveGameplayNotifications({
  previousProjection = null,
  nextProjection = null,
} = {}) {
  if (!validProjection(previousProjection) || !validProjection(nextProjection)) return Object.freeze([]);
  const sourceRevision = projectionRevision(nextProjection);
  return Object.freeze([
    ...missionNotifications(previousProjection.mission, nextProjection.mission, sourceRevision),
    ...peopleNotifications(previousProjection.people, nextProjection.people, sourceRevision),
    ...shipNotifications(previousProjection.ship, nextProjection.ship, sourceRevision),
  ]
    .sort((left, right) => (
      right.priority - left.priority
      || left.route.localeCompare(right.route)
      || left.subjectId.localeCompare(right.subjectId)
      || left.id.localeCompare(right.id)
    ))
    .map((record) => Object.freeze(record)));
}
