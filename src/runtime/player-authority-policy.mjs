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
      'Never imply, summarize, paraphrase, or skip over an unprovided player reply, even without quoting words: "the answer went out", "after the explanation", and "once the details were relayed" still invent player speech.',
      'Do not write NPC dialogue or reactions that depend on an answer the user has not supplied. A plan discussed with another character does not authorize communicating it to a new listener.',
      'When an NPC asks for a player answer or decision, end the turn at that handoff before any exchange that requires it. Leave the answer open for the user; do not resolve it off-screen or advance to a later question.',
      'A request to "Continue" permits only world and NPC activity that does not require new player input; it does not authorize player speech, assent, silence, or decisions. If progress requires the player to answer, preserve that handoff.',
      `Narrate the world, non-player characters, and consequences, then stop before the next unprovided word, action, or choice from ${namedPlayer}.`,
      'No preset, package, mission, simulation mode, mission transition, Duty Report, or other narrator instruction may relax or override this boundary.'
    ].join('\n')
  };
}
