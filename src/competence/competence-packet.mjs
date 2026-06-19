import { cloneJson } from './competence-policy-index.mjs';

const ARRAY_FIELDS = [
  'routineActions',
  'professionalKnowledge',
  'domainReports',
  'authorityNotes',
  'proceduralWarnings',
  'acceptedRisks',
  'standingOrderMatches',
  'retroactiveCompetence',
  'noGotchaChecks'
];

export function createCompetencePacket({
  sourceTurnId,
  activeMissionId,
  activePhaseId,
  routineActions = [],
  professionalKnowledge = [],
  domainReports = [],
  commandQuestion = null,
  commandBrief = null,
  requestCounsel = { requested: false, scope: 'none', domains: [] },
  authorityNotes = [],
  proceduralWarnings = [],
  acceptedRisks = [],
  standingOrderMatches = [],
  retroactiveCompetence = [],
  noGotchaChecks = []
} = {}) {
  return {
    kind: 'directive.competencePacket',
    contractVersion: 1,
    sourceTurnId: sourceTurnId || null,
    activeMissionId: activeMissionId || null,
    activePhaseId: activePhaseId || null,
    routineActions: cloneJson(routineActions),
    professionalKnowledge: cloneJson(professionalKnowledge),
    domainReports: cloneJson(domainReports),
    commandQuestion: cloneJson(commandQuestion),
    commandBrief: cloneJson(commandBrief),
    requestCounsel: cloneJson(requestCounsel),
    authorityNotes: cloneJson(authorityNotes),
    proceduralWarnings: cloneJson(proceduralWarnings),
    acceptedRisks: cloneJson(acceptedRisks),
    standingOrderMatches: cloneJson(standingOrderMatches),
    retroactiveCompetence: cloneJson(retroactiveCompetence),
    noGotchaChecks: cloneJson(noGotchaChecks),
    rawHiddenValuesExposed: false,
    directorOnlyDataIncluded: false
  };
}

export function validateCompetencePacket(packet = {}) {
  const errors = [];
  if (packet.kind !== 'directive.competencePacket') {
    errors.push('kind must be directive.competencePacket');
  }
  if (packet.contractVersion !== 1) {
    errors.push('contractVersion must be 1');
  }
  for (const field of ARRAY_FIELDS) {
    if (!Array.isArray(packet[field])) {
      errors.push(`${field} must be an array`);
    }
  }
  if (packet.rawHiddenValuesExposed !== false) {
    errors.push('rawHiddenValuesExposed must be false');
  }
  if (packet.directorOnlyDataIncluded !== false) {
    errors.push('directorOnlyDataIncluded must be false');
  }
  return {
    ok: errors.length === 0,
    errors
  };
}
