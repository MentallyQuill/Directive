import {
  buildCompetenceContext,
  isPlayerSafeRecord,
  publicRecord,
  ruleMatchesContext
} from './competence-policy-index.mjs';
import { CONFIDENCE_LABELS } from './knowledge-classes.mjs';
import { parseCounselRequest } from './request-counsel-parser.mjs';

function reportMatchesCounsel(report, requestCounsel) {
  if (!requestCounsel.requested || requestCounsel.scope !== 'domain') {
    return true;
  }
  return requestCounsel.domains.includes(report.domain);
}

function scoreReport(report, context, requestCounsel) {
  let score = Number(report.priority || 100);
  if (requestCounsel.requested) {
    score -= 20;
  }
  if (requestCounsel.domains?.includes(report.domain)) {
    score -= 50;
  }
  if (context.presentCharacters.includes(report.officerId)) {
    score -= 12;
  }
  if (context.implicatedOfficerIds.includes(report.officerId)) {
    score -= 15;
  }
  if ((report.requiredCardIds || []).some((cardId) => context.retrievalCardIds.includes(cardId))) {
    score -= 10;
  }
  if ((report.decisionPointIds || []).some((decisionPointId) => context.activeDecisionPointIds.includes(decisionPointId))) {
    score -= 10;
  }
  if (String(context.normalizedPlayerInput || '').includes(String(report.officerId || '').split('-')[0])) {
    score -= 8;
  }
  return score;
}

export function selectDomainReports(policyIndex, sceneSnapshot = {}) {
  const context = buildCompetenceContext(sceneSnapshot);
  const requestCounsel = parseCounselRequest(sceneSnapshot);
  const maxReports = requestCounsel.requested ? (requestCounsel.scope === 'domain' ? 3 : 4) : 2;

  return (policyIndex.domainReports || [])
    .filter((report) => isPlayerSafeRecord(report))
    .filter((report) => ruleMatchesContext(report, context))
    .filter((report) => reportMatchesCounsel(report, requestCounsel))
    .map((report) => ({
      report,
      score: scoreReport(report, context, requestCounsel)
    }))
    .sort((left, right) => left.score - right.score || left.report.id.localeCompare(right.report.id))
    .slice(0, maxReports)
    .map(({ report }) => ({
      id: report.id,
      officerId: report.officerId,
      domain: report.domain,
      summary: report.summary,
      confidence: CONFIDENCE_LABELS.includes(report.confidence) ? report.confidence : 'unknown',
      recommendation: requestCounsel.requested || report.dutyToObject ? report.recommendation || null : null,
      record: publicRecord(report)
    }));
}
