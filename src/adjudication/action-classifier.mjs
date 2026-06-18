import { getActiveDecisionPoints } from '../mission/graph-lookup.mjs';

export function classifyAction({ graphIndex, sceneSnapshot, intentParse }) {
  if (intentParse.primaryIntent === 'no-action') {
    return {
      category: 'impossibleOrUnsupportedMove',
      reason: 'No actionable player intent was supplied.'
    };
  }

  if (intentParse.primaryIntent === 'unsupported-command') {
    return {
      category: 'impossibleOrUnsupportedMove',
      reason: 'The action lacks required authority, access, capability, or physical support in the current scene.'
    };
  }

  if (intentParse.primaryIntent === 'leave-mission-area') {
    return {
      category: 'missionAbandoningMove',
      reason: 'The action attempts to leave or redirect away from the active mission frame and requires command-structure adjudication.'
    };
  }

  const activeDecisionPoints = getActiveDecisionPoints(graphIndex, sceneSnapshot);
  const activeDecisionPointIds = new Set(activeDecisionPoints.map((decisionPoint) => decisionPoint.id));

  if (
    intentParse.primaryIntent === 'resolve-hesperus-with-accountability'
    && activeDecisionPointIds.has('decision.hesperus-response')
    && activeDecisionPointIds.has('decision.inspection-fraud-accountability')
  ) {
    return {
      category: 'validWithinMissionBounds',
      reason: 'The action directly addresses the Hesperus rescue, fraud accountability, passenger safety, and engineering limits inside the active prelude phase.'
    };
  }

  if (activeDecisionPoints.length > 0) {
    return {
      category: 'missionRelevantLateralMove',
      reason: 'The action does not exactly match a prepared route, but it engages the active mission phase and can be resolved against current decision points.'
    };
  }

  return {
    category: 'impossibleOrUnsupportedMove',
    reason: 'The action does not connect to an active decision point or supported mission frame.'
  };
}
