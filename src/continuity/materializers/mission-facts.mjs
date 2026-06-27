import {
  CONTINUITY_VISIBILITY,
  compact,
  createContinuityFact
} from '../fact-schema.mjs';

export function materializeMissionFacts({
  packageData = null,
  campaignState = null,
  campaignProjection = null
} = {}) {
  const packageId = packageData?.manifest?.id || campaignState?.campaign?.packageId || null;
  const currentGoal = compact(campaignProjection?.mission?.currentGoal || campaignProjection?.campaign?.currentGoal || campaignState?.mission?.currentGoal);
  const currentConcern = compact(campaignProjection?.mission?.currentConcern || campaignProjection?.campaign?.currentConcern || campaignState?.mission?.currentConcern);
  const facts = [];
  if (currentGoal) {
    facts.push(createContinuityFact({
      id: 'mission.current-goal',
      kind: 'mission.state',
      subject: 'mission',
      predicate: 'currentGoal',
      value: currentGoal,
      summary: currentGoal,
      render: { narrator: currentGoal, director: currentGoal },
      source: { type: currentGoal === campaignState?.mission?.currentGoal ? 'campaignState' : 'campaignProjection', packageId },
      authority: currentGoal === campaignState?.mission?.currentGoal ? 'campaignState' : 'projection',
      visibility: CONTINUITY_VISIBILITY.narratorSafe,
      criticality: 'high',
      tags: ['mission', 'goal']
    }));
  }
  if (currentConcern) {
    facts.push(createContinuityFact({
      id: 'mission.current-concern',
      kind: 'mission.state',
      subject: 'mission',
      predicate: 'currentConcern',
      value: currentConcern,
      summary: currentConcern,
      render: { narrator: currentConcern, director: currentConcern },
      source: { type: currentConcern === campaignState?.mission?.currentConcern ? 'campaignState' : 'campaignProjection', packageId },
      authority: currentConcern === campaignState?.mission?.currentConcern ? 'campaignState' : 'projection',
      visibility: CONTINUITY_VISIBILITY.narratorSafe,
      criticality: 'high',
      tags: ['mission', 'concern']
    }));
  }
  return facts;
}
