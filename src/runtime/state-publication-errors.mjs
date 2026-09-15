export const STATE_PUBLICATION_UNCERTAIN = 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN';
export const STATE_PUBLICATION_PENDING = 'DIRECTIVE_V1_STATE_PERSISTENCE_PENDING';
export const STATE_PUBLICATION_ACK_PENDING = 'DIRECTIVE_V1_STATE_PUBLICATION_ACK_PENDING';

export function isUncertainStatePublicationError(error) {
  return error?.code === STATE_PUBLICATION_UNCERTAIN;
}

export function isStatePublicationError(error) {
  return isUncertainStatePublicationError(error) || error?.code === STATE_PUBLICATION_PENDING
    || error?.code === STATE_PUBLICATION_ACK_PENDING;
}

export function statePublicationError(saveId, status = {}) {
  const pending = status.phase === 'pending';
  const acknowledged = status.phase === 'acknowledgement';
  const notCommitted = status.result?.publication === 'not-committed';
  return Object.assign(new Error(pending
    ? 'This saved game is still being written. Please wait before continuing.'
    : acknowledged ? (notCommitted
      ? 'The game was not changed, but save cleanup is pending. Reopen the campaign before continuing.'
      : 'Your game was saved, but save finalization is pending. Reopen the campaign before continuing.')
    : 'The save outcome could not be verified. Reopen the campaign to verify it before continuing.'), {
    code: pending ? STATE_PUBLICATION_PENDING : acknowledged ? STATE_PUBLICATION_ACK_PENDING : STATE_PUBLICATION_UNCERTAIN,
    details: { saveId: saveId || null, phase: status.phase || 'uncertain', requestHash: status.requestHash || null,
      publication: status.result?.publication || null },
  });
}
