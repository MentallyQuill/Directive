function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactError(error) {
  return {
    code: error?.code || null,
    message: error?.message || String(error),
  };
}

function requireTurnId(turnPacket) {
  const turnId = String(turnPacket?.turnId || '').trim();
  if (turnPacket?.kind !== 'directive.v1NarrationTurn' || !turnId) {
    const error = new Error('Narration custody checkpoint requires a V1 narration turn.');
    error.code = 'DIRECTIVE_V1_NARRATION_TURN_REQUIRED';
    throw error;
  }
  return turnId;
}

export function createTurnCommitCoordinator({ persist } = {}) {
  if (typeof persist !== 'function') {
    throw new TypeError('TurnCommitCoordinator requires persist(campaignState, summary).');
  }

  async function checkpointNarrationCustody({ campaignState, turnPacket } = {}) {
    const turnId = requireTurnId(turnPacket);
    const state = cloneJson(campaignState);
    try {
      const save = await persist(state, `Stored narration custody for ${turnId}.`);
      return {
        campaignState: state,
        save: cloneJson(save),
        turnId,
        persistStatus: 'stored',
        persistError: null,
      };
    } catch (error) {
      return {
        campaignState: state,
        save: null,
        turnId,
        persistStatus: 'failed',
        persistError: compactError(error),
      };
    }
  }

  async function markNarration({ campaignState, turnId, status } = {}) {
    const id = String(turnId || '').trim();
    if (!id) throw new TypeError('turnId is required');
    const state = cloneJson(campaignState);
    try {
      const save = await persist(state, `Narration ${status || 'updated'} for ${id}.`);
      return {
        campaignState: state,
        save: cloneJson(save),
        turnId: id,
        persistStatus: 'stored',
        persistError: null,
      };
    } catch (error) {
      return {
        campaignState: state,
        save: null,
        turnId: id,
        persistStatus: 'failed',
        persistError: compactError(error),
      };
    }
  }

  return { checkpointNarrationCustody, markNarration };
}
