import assert from 'node:assert/strict';

import { deriveGameplayNotifications } from '../../src/projection/v1/gameplay-notifications.mjs';

function projection({ objectiveStatus = 'active', missionStatus = 'active', missionRevision = 1 } = {}) {
  return {
    kind: 'directive.playerProjection.v1',
    revisions: { mission: missionRevision, story: 1 },
    mission: {
      kind: 'directive.missionPlayerProjection.v1',
      missionId: 'mission.alpha',
      revision: missionRevision,
      status: missionStatus,
      title: 'First Contact',
      objectives: [{
        id: 'objective.signal',
        class: 'required',
        status: objectiveStatus,
        disposition: objectiveStatus === 'terminal' ? 'completed' : null,
        title: 'Trace the signal',
        summary: 'Locate the signal source.',
        terminalText: objectiveStatus === 'terminal' ? 'The signal source was located.' : null,
      }],
      terminal: missionStatus === 'terminal'
        ? { disposition: 'completed', title: 'Contact established', summary: 'The encounter ended well.' }
        : null,
    },
    people: {
      kind: 'directive.peoplePlayerProjection.v1',
      people: [],
    },
    ship: {
      kind: 'directive.shipPlayerProjection.v1',
      cohesion: { visibleTasks: [], completedHistory: [] },
    },
  };
}

const objectiveNotice = deriveGameplayNotifications({
  previousProjection: projection(),
  nextProjection: projection({ objectiveStatus: 'terminal', missionRevision: 2 }),
});

assert.deepEqual(
  objectiveNotice.map(({ route, kind, subjectId }) => ({ route, kind, subjectId })),
  [{ route: 'mission', kind: 'objectiveComplete', subjectId: 'mission.alpha' }],
  'a newly terminal objective should create one Mission notification',
);

const missionNotice = deriveGameplayNotifications({
  previousProjection: projection(),
  nextProjection: projection({ objectiveStatus: 'terminal', missionStatus: 'terminal', missionRevision: 2 }),
});

assert.deepEqual(
  missionNotice.map(({ kind, title }) => ({ kind, title })),
  [{ kind: 'missionComplete', title: 'Mission complete' }],
  'mission completion should supersede a redundant final-objective notification',
);

const beforeContact = projection();
const afterContact = structuredClone(beforeContact);
afterContact.people.people.push({
  id: 'person.t-vel',
  name: "T'Vel",
  relationshipPosture: 'Cautiously cooperative',
  relationshipOpenMatter: null,
  moments: [],
});
afterContact.mission.revision = 2;

assert.deepEqual(
  deriveGameplayNotifications({ previousProjection: beforeContact, nextProjection: afterContact })
    .map(({ route, kind, subjectId, title }) => ({ route, kind, subjectId, title })),
  [{ route: 'people', kind: 'newContact', subjectId: 'person.t-vel', title: "New contact: T'Vel" }],
  'a new person and initial posture should group into one New contact notification',
);

const beforeRelationship = projection();
beforeRelationship.people.people.push({
  id: 'person.t-vel', name: "T'Vel", relationshipPosture: 'Guarded', relationshipOpenMatter: null, moments: [],
});
const afterRelationship = structuredClone(beforeRelationship);
Object.assign(afterRelationship.people.people[0], {
  relationshipPosture: 'Cautiously cooperative',
  relationshipOpenMatter: 'Whether to share the sensor logs',
  moments: [{ id: 'moment.shared-risk', title: 'Shared risk', summary: 'They protected the same evacuation route.' }],
});
afterRelationship.mission.revision = 3;

assert.deepEqual(
  deriveGameplayNotifications({ previousProjection: beforeRelationship, nextProjection: afterRelationship })
    .map(({ route, kind, subjectId }) => ({ route, kind, subjectId })),
  [{ route: 'people', kind: 'relationshipUpdated', subjectId: 'person.t-vel' }],
  'posture, open-matter, and defining-moment changes for one person should group into one notice',
);

const beforeShipProgress = projection();
beforeShipProgress.ship.cohesion.visibleTasks.push({
  id: 'task.sensor-baseline',
  title: 'Sensor Baseline',
  phases: [{ id: 'phase.isolation', label: 'Run an isolation test', status: 'available' }],
});
const afterShipProgress = structuredClone(beforeShipProgress);
afterShipProgress.ship.cohesion.visibleTasks[0].phases[0].status = 'completed';
afterShipProgress.mission.revision = 4;

assert.deepEqual(
  deriveGameplayNotifications({ previousProjection: beforeShipProgress, nextProjection: afterShipProgress })
    .map(({ route, kind, subjectId }) => ({ route, kind, subjectId })),
  [{ route: 'ship', kind: 'shipTaskProgress', subjectId: 'task.sensor-baseline' }],
  'a newly completed Ship phase should create one task-progress notice',
);

const afterShipComplete = structuredClone(beforeShipProgress);
afterShipComplete.ship.cohesion.visibleTasks = [];
afterShipComplete.ship.cohesion.completedHistory.push({
  id: 'task.sensor-baseline', title: 'Sensor Baseline', sequence: 8, cohesionRestored: 10,
});
afterShipComplete.mission.revision = 5;

assert.deepEqual(
  deriveGameplayNotifications({ previousProjection: beforeShipProgress, nextProjection: afterShipComplete })
    .map(({ route, kind, subjectId, title }) => ({ route, kind, subjectId, title })),
  [{ route: 'ship', kind: 'shipTaskComplete', subjectId: 'task.sensor-baseline', title: 'Ship task complete' }],
  'a task entering completed history should supersede phase progress',
);

const combinedBefore = structuredClone(beforeShipProgress);
const combinedAfter = structuredClone(afterShipComplete);
combinedAfter.mission.objectives[0].status = 'terminal';
combinedAfter.mission.objectives[0].terminalText = 'The signal source was located.';
combinedAfter.people.people.push({ id: 'person.ren', name: 'Ren', relationshipPosture: null, relationshipOpenMatter: null, moments: [] });

assert.deepEqual(
  deriveGameplayNotifications({ previousProjection: combinedBefore, nextProjection: combinedAfter })
    .map(({ kind }) => kind),
  ['shipTaskComplete', 'objectiveComplete', 'newContact'],
  'completion and progress records should sort by stable priority',
);

const sameMissionBefore = structuredClone(beforeRelationship);
sameMissionBefore.revisions = { mission: 1, story: 10 };
const firstStoryChange = structuredClone(sameMissionBefore);
firstStoryChange.people.people[0].relationshipPosture = 'Cooperative';
firstStoryChange.revisions.story = 11;
const secondStoryChange = structuredClone(sameMissionBefore);
secondStoryChange.people.people[0].relationshipPosture = 'Trusting';
secondStoryChange.revisions.story = 12;
const firstRelationshipId = deriveGameplayNotifications({ previousProjection: sameMissionBefore, nextProjection: firstStoryChange })[0].id;
const secondRelationshipId = deriveGameplayNotifications({ previousProjection: sameMissionBefore, nextProjection: secondStoryChange })[0].id;

assert.notEqual(
  firstRelationshipId,
  secondRelationshipId,
  'story revisions should distinguish separate relationship changes when mission revision is unchanged',
);

const beforeTwoObjectives = projection();
beforeTwoObjectives.mission.objectives.push({
  id: 'objective.reply', class: 'optional', status: 'active', disposition: null,
  title: 'Answer the hail', summary: 'Respond to the unknown ship.', terminalText: null,
});
const afterTwoObjectives = structuredClone(beforeTwoObjectives);
for (const objective of afterTwoObjectives.mission.objectives) {
  objective.status = 'terminal';
  objective.disposition = 'completed';
  objective.terminalText = `${objective.title} completed.`;
}
afterTwoObjectives.mission.revision = 2;
afterTwoObjectives.revisions.mission = 2;
assert.deepEqual(
  deriveGameplayNotifications({ previousProjection: beforeTwoObjectives, nextProjection: afterTwoObjectives })
    .map(({ kind, summary }) => ({ kind, summary })),
  [{ kind: 'objectiveComplete', summary: '2 objectives completed' }],
  'multiple objective completions in one commit should group into one card',
);

const publicFactBefore = structuredClone(beforeRelationship);
publicFactBefore.people.people[0].publicRecord = { affiliation: 'Independent' };
const publicFactAfter = structuredClone(publicFactBefore);
publicFactAfter.people.people[0].publicRecord.affiliation = 'Federation liaison';
publicFactAfter.revisions.story = 2;
const invalidProjection = projection();
invalidProjection.people.kind = 'invalid.people';
assert.deepEqual([
  deriveGameplayNotifications({ previousProjection: null, nextProjection: projection() }).length,
  deriveGameplayNotifications({ previousProjection: projection(), nextProjection: projection() }).length,
  deriveGameplayNotifications({ previousProjection: publicFactBefore, nextProjection: publicFactAfter }).length,
  deriveGameplayNotifications({ previousProjection: projection(), nextProjection: invalidProjection }).length,
], [0, 0, 0, 0], 'initial load, identical state, public facts, and invalid projections should stay silent');

const missingMissionSubject = projection({ objectiveStatus: 'terminal', missionRevision: 2 });
delete missingMissionSubject.mission.missionId;
assert.deepEqual(
  deriveGameplayNotifications({ previousProjection: projection(), nextProjection: missingMissionSubject }),
  [],
  'a notification without a stable route subject should be discarded',
);

console.log('Directive gameplay notification projection tests passed.');
