import {
  buildCompetenceContext,
  publicRecord,
  ruleMatchesContext
} from './competence-policy-index.mjs';

export function matchStandingOrders({ campaignState = {}, sceneSnapshot = {} }) {
  const context = buildCompetenceContext(sceneSnapshot);
  return (campaignState.commandCompetence?.standingOrders || [])
    .filter((order) => order.active !== false)
    .filter((order) => ruleMatchesContext(order, context))
    .map((order) => ({
      id: order.id,
      category: order.category || null,
      summary: order.summary || '',
      version: order.version || 1,
      record: publicRecord(order)
    }));
}
