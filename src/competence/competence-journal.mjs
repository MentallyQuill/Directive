export function createCompetenceLedgerRecords({ competencePacket, outcomeId = null, confirmedWarningIds = [] } = {}) {
  const sourceTurnId = competencePacket?.sourceTurnId || null;
  const activeMissionId = competencePacket?.activeMissionId || null;
  const activePhaseId = competencePacket?.activePhaseId || null;
  const confirmed = new Set(confirmedWarningIds);

  function base(record, type) {
    return {
      type,
      id: record.id,
      sourceTurnId,
      sourceOutcomeId: outcomeId,
      activeMissionId,
      activePhaseId,
      summary: record.summary || record.standardConcern || '',
      playerVisible: record.visibility !== 'directorOnly'
    };
  }

  const warningRecords = (competencePacket?.proceduralWarnings || []).map((record) => ({
    ...base(record, 'proceduralWarning'),
    severity: record.severity || 'advisory',
    confirmed: confirmed.has(record.id) || record.confirmationRequired !== true,
    confirmationRequired: record.confirmationRequired === true
  }));
  const acceptedRiskRecords = (competencePacket?.proceduralWarnings || [])
    .filter((record) => confirmed.has(record.id))
    .map((record) => ({
      type: 'acceptedRisk',
      id: `risk.${record.id}`,
      sourceWarningId: record.id,
      sourceTurnId,
      sourceOutcomeId: outcomeId,
      activeMissionId,
      activePhaseId,
      summary: record.knownConsequence || record.standardConcern || record.summary || '',
      basisForException: record.availableBasisForException || '',
      playerVisible: true
    }));
  const counselWasMeaningful = competencePacket?.requestCounsel?.requested === true
    && (competencePacket?.domainReports || []).length > 0;

  return {
    assumedActionsLedgerAdd: (competencePacket?.routineActions || []).map((record) => base(record, 'routineAction')),
    warningLedgerAdd: warningRecords,
    acceptedRiskLedgerAdd: acceptedRiskRecords,
    authorityNotesLedgerAdd: (competencePacket?.authorityNotes || []).map((record) => base(record, 'authorityNote')),
    counselRequestLedgerAdd: counselWasMeaningful
      ? [{
        type: 'requestCounsel',
        sourceTurnId,
        sourceOutcomeId: outcomeId,
        activeMissionId,
        activePhaseId,
        summary: `Counsel requested: ${competencePacket.requestCounsel.scope}.`,
        reportIds: (competencePacket.domainReports || []).map((report) => report.id),
        playerVisible: true
      }]
      : []
  };
}
