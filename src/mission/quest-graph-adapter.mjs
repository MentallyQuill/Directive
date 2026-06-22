import { questTemplateById } from '../quests/quest-ledger.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }

function defaultPhase(template) {
  return {
    id: 'opening',
    label: 'Opening',
    summary: template.summary,
    decisionPointIds: [],
    pressureIds: asArray(template.pressures).map((pressure) => pressure.id).filter(Boolean),
    completion: { type: 'directorOrObjectiveCompletion' }
  };
}

/**
 * Adapts a package quest template into the local Mission Director graph shape.
 * Authored detailed graphs can still override every collection; ordinary quests
 * only need a concise missionGraph embedded in the template.
 */
export function questTemplateToMissionGraph(template, { packageId = null } = {}) {
  if (!template?.id) throw new Error('Quest template requires id.');
  const embedded = cloneJson(template.missionGraph || {});
  const phases = asArray(embedded.phases).length ? embedded.phases : [defaultPhase(template)];
  const graphId = embedded.id || `graph.${template.id}`;
  return {
    manifest: {
      kind: 'directive.missionGraph',
      schemaVersion: 2,
      id: graphId,
      title: template.title,
      version: embedded.version || '2.0.0',
      status: 'pre-alpha',
      packageId,
      questTemplateId: template.id
    },
    missionFrame: {
      id: template.id,
      type: template.kind,
      function: template.summary,
      dramaticQuestion: template.dramaticQuestion,
      startLocation: asArray(template.anchors?.locationIds)[0] || 'current-location',
      questTemplateId: template.id,
      completionEvents: asArray(template.emittedEvents).map((event) => event.type).filter(Boolean),
      failurePolicy: template.failurePolicy || 'Failure changes cost, position, time, or trust; it does not invalidate the campaign.'
    },
    phases,
    actors: asArray(embedded.actors),
    actorIntentions: asArray(embedded.actorIntentions),
    facts: asArray(embedded.facts || template.revelations),
    clocks: asArray(embedded.clocks),
    pressures: asArray(embedded.pressures || template.pressures),
    decisionPoints: asArray(embedded.decisionPoints),
    commandDecisions: asArray(embedded.commandDecisions),
    outcomeFlags: asArray(embedded.outcomeFlags),
    endStates: asArray(embedded.endStates).length ? embedded.endStates : asArray(template.outcomes).map((outcome) => ({
      id: outcome.id,
      label: outcome.label || outcome.id,
      summary: outcome.summary || '',
      conditions: outcome.conditions || null,
      emittedEvents: asArray(outcome.emittedEvents || template.emittedEvents)
    })),
    narratorConstraints: asArray(embedded.narratorConstraints),
    competencePolicy: embedded.competencePolicy || template.competencePolicy || null,
    openWorld: {
      questTemplateId: template.id,
      anchors: cloneJson(template.anchors),
      completionConditions: cloneJson(template.completionConditions || null),
      failureConditions: cloneJson(template.failureConditions || null),
      noSuccessorMission: true
    }
  };
}

export function missionGraphForQuest(packageData, questId, campaignState = null) {
  const template = questTemplateById(packageData, questId, campaignState);
  return template ? questTemplateToMissionGraph(template, { packageId: packageData?.manifest?.id || null }) : null;
}
