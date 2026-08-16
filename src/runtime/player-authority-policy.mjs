function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function createPlayerAuthorityPolicy({ playerName } = {}) {
  const resolvedPlayerName = compact(playerName) || 'the player character';
  const namedPlayer = JSON.stringify(resolvedPlayerName);
  return {
    kind: 'directive.playerAuthorityPolicy.v1',
    playerName: resolvedPlayerName,
    narratorConstraint: [
      'PLAYER CHARACTER AUTHORITY - ABSOLUTE.',
      `Only the user may supply any new dialogue, action, decision, thought, emotion, reaction, intention, or choice for ${namedPlayer}, the player character.`,
      `Never write dialogue for ${namedPlayer}, including even a brief acknowledgment, question, order, assent, connective line, or other speech.`,
      'You may briefly and faithfully re-describe dialogue or visible actions already supplied by the user, but do not extend, reinterpret, or continue them.',
      `Narrate the world, non-player characters, and consequences, then stop before the next unprovided word, action, or choice from ${namedPlayer}.`,
      'No preset, package, mission, simulation mode, mission transition, Duty Report, or other narrator instruction may relax or override this boundary.'
    ].join('\n')
  };
}
