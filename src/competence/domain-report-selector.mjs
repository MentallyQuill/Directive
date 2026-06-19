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

export function selectDomainReports(policyIndex, sceneSnapshot = {}) {
  const context = buildCompetenceContext(sceneSnapshot);
  const requestCounsel = parseCounselRequest(sceneSnapshot);
  const maxReports = requestCounsel.requested ? (requestCounsel.scope === 'domain' ? 3 : 4) : 2;

  return (policyIndex.domainReports || [])
    .filter((report) => isPlayerSafeRecord(report))
    .filter((report) => ruleMatchesContext(report, context))
    .filter((report) => reportMatchesCounsel(report, requestCounsel))
    .sort((left, right) => Number(left.priority || 100) - Number(right.priority || 100) || left.id.localeCompare(right.id))
    .slice(0, maxReports)
    .map((report) => ({
      id: report.id,
      officerId: report.officerId,
      domain: report.domain,
      summary: report.summary,
      confidence: CONFIDENCE_LABELS.includes(report.confidence) ? report.confidence : 'unknown',
      recommendation: requestCounsel.requested ? report.recommendation || null : null,
      record: publicRecord(report)
    }));
}
