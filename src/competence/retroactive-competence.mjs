export function evaluateRetroactiveCompetenceClaims({ claims = [], contradictedIds = [] } = {}) {
  const contradicted = new Set(contradictedIds);
  return claims.map((claim) => {
    const accepted = claim.routine === true
      && claim.reasonable === true
      && claim.lowCost === true
      && claim.strategicallyDecisive !== true
      && !contradicted.has(claim.id);

    return {
      id: claim.id,
      accepted,
      summary: claim.summary || '',
      reason: accepted
        ? 'Routine, reasonable, low-cost, and uncontradicted preparation.'
        : 'Not eligible for retroactive competence.'
    };
  });
}
