export function createCompetenceLedgerRecords({ competencePacket, outcomeId = null } = {}) {
  const sourceTurnId = competencePacket?.sourceTurnId || null;
  const activeMissionId = competencePacket?.activeMissionId || null;
  const activePhaseId = competencePacket?.activePhaseId || null;

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

  return {
    assumedActionsLedgerAdd: (competencePacket?.routineActions || []).map((record) => base(record, 'routineAction')),
    warningLedgerAdd: (competencePacket?.proceduralWarnings || []).map((record) => base(record, 'proceduralWarning')),
    authorityNotesLedgerAdd: (competencePacket?.authorityNotes || []).map((record) => base(record, 'authorityNote')),
    counselRequestLedgerAdd: competencePacket?.requestCounsel?.requested
      ? [{
        type: 'requestCounsel',
        sourceTurnId,
        sourceOutcomeId: outcomeId,
        activeMissionId,
        activePhaseId,
        summary: `Counsel requested: ${competencePacket.requestCounsel.scope}.`,
        playerVisible: true
      }]
      : []
  };
}
