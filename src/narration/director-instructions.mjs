const INSTRUCTIONS = Object.freeze({
  'continue-thread': 'Develop the existing thread in response to the player.',
  'offer-resolution': 'Offer an established way to resolve or delegate this thread; do not declare success.',
  'surface-opportunity': 'Make this established opportunity available for consideration; do not initiate it for the player.',
  'respond-to-player': 'Respond to the player within the current scene and reconciled state.',
});

const COMPLICATION_INSTRUCTIONS = Object.freeze({
  avoid: 'Do not introduce a new consequential complication in this beat.',
  allowed: 'Any new complication must fit the supplied campaign constraints.',
});

function validTarget(target) {
  return target
    && typeof target.id === 'string'
    && target.id.length > 0
    && typeof target.playerSafeText === 'string'
    && target.playerSafeText.trim().length > 0
    && target.conditions instanceof Set;
}

export function compileDirectorInstruction({ direction = {}, eligibleTargets = new Map() } = {}) {
  if (!Object.hasOwn(INSTRUCTIONS, direction.move)) throw new TypeError('director-move-invalid');
  if (!Object.hasOwn(COMPLICATION_INSTRUCTIONS, direction.newComplications)) {
    throw new TypeError('director-complication-policy-invalid');
  }
  if (!Array.isArray(direction.requires) || direction.requires.some((id) => typeof id !== 'string' || !id)) {
    throw new TypeError('director-requirements-invalid');
  }
  const target = direction.move === 'respond-to-player'
    ? null
    : eligibleTargets.get(direction.targetRef);
  const allowed = validTarget(target)
    && direction.requires.every((id) => target.conditions.has(id));
  const move = allowed ? direction.move : 'respond-to-player';
  return {
    move,
    targetRef: allowed ? target.id : null,
    targetText: allowed ? target.playerSafeText.trim() : null,
    instruction: INSTRUCTIONS[move],
    complicationInstruction: COMPLICATION_INSTRUCTIONS[direction.newComplications],
  };
}
