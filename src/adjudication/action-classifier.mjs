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

  if (
    intentParse.primaryIntent === 'establish-arrival-tone'
    && activeDecisionPointIds.has('decision.arrival-tone')
  ) {
    return {
      category: 'validWithinMissionBounds',
      reason: 'The action addresses the opening arrival-tone decision point and establishes how the new XO treats working routines.'
    };
  }

  if (
    intentParse.primaryIntent === 'complete-ready-room-handover'
    && activeDecisionPointIds.has('decision.handover-value')
  ) {
    return {
      category: 'validWithinMissionBounds',
      reason: 'The action addresses the ready-room handover decision point and defines the XO command relationship with Whitaker and Bronn.'
    };
  }

  if (
    intentParse.primaryIntent === 'set-readiness-priorities'
    && activeDecisionPointIds.has('decision.readiness-priorities')
  ) {
    return {
      category: 'validWithinMissionBounds',
      reason: 'The action addresses the senior staff readiness conference by setting priorities, ownership, and accepted risk before the next drill.'
    };
  }

  if (
    intentParse.primaryIntent === 'set-fallback-command-procedure'
    && activeDecisionPointIds.has('decision.fallback-procedure')
  ) {
    return {
      category: 'validWithinMissionBounds',
      reason: 'The action addresses the fallback-command drill by setting command continuity, technical remediation, and emergency authority boundaries.'
    };
  }

  if (
    intentParse.primaryIntent === 'establish-command-rhythm'
    && sceneSnapshot?.activePhaseId === 'command-rhythm-scenes'
  ) {
    return {
      category: 'validWithinMissionBounds',
      reason: 'The action uses the freeform command-rhythm interval to create meaningful senior staff contact and command-culture expectations.'
    };
  }

  if (
    intentParse.primaryIntent === 'assign-hesperus-aftermath'
    && sceneSnapshot?.activePhaseId === 'hesperus-aftermath'
  ) {
    return {
      category: 'validWithinMissionBounds',
      reason: 'The action records Hesperus aftermath obligations and prepares the ship to resume the Prelude shakedown path.'
    };
  }

  if (
    intentParse.primaryIntent === 'resolve-combined-load-test'
    && activeDecisionPointIds.has('decision.combined-load-risk')
  ) {
    return {
      category: 'validWithinMissionBounds',
      reason: 'The action addresses the combined-load test by deciding how to handle technical debt, schedule margin, and readiness reporting.'
    };
  }

  if (
    intentParse.primaryIntent === 'complete-final-command-review'
    && activeDecisionPointIds.has('decision.final-readiness-report')
  ) {
    return {
      category: 'validWithinMissionBounds',
      reason: 'The action addresses the final readiness report by setting arrival posture, command support needs, and what must be carried into Chapter 1.'
    };
  }

  if (
    intentParse.primaryIntent === 'request-chapter-1-counsel'
    && activeDecisionPointIds.has('decision.initial-convoy-posture')
  ) {
    return {
      category: 'validWithinMissionBounds',
      reason: 'The action asks for officer counsel before the initial Chapter 1 convoy posture is committed.'
    };
  }

  if (
    intentParse.primaryIntent === 'set-initial-convoy-posture'
    && activeDecisionPointIds.has('decision.initial-convoy-posture')
  ) {
    return {
      category: 'validWithinMissionBounds',
      reason: 'The action addresses the initial Relief Convoy Twelve command posture decision.'
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
