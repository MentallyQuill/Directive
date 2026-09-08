export function normalizeNarrationSettings(value = {}) {
  return {
    pov: ['first-person', 'second-person', 'third-person-limited'].includes(value?.pov) ? value.pov : 'third-person-limited',
    tense: ['past', 'present'].includes(value?.tense) ? value.tense : 'past'
  };
}

export function createNarrationPolicy({ settings, player } = {}) {
  const { pov, tense } = normalizeNarrationSettings(settings);
  const playerName = String(player?.name || player?.identity?.name || '').trim() || 'the player character';
  const perspective = {
    'first-person': 'Use first person (I/me/my) for the player character as the grammatical viewpoint. This does not authorize invented player interiority or behavior.',
    'second-person': 'Use second person (you/your) for the player character.',
    'third-person-limited': 'Use third person limited, naming the player character or using their established pronouns.'
  }[pov];
  return {
    kind: 'directive.narrationPolicy', pov, tense, playerName,
    instruction: `# Narration Policy\nThese global preferences are the sole authority for narration viewpoint and tense, including openings and regeneration. Override any conflicting preset viewpoint, tense setters, or NPC viewpoint variation. Write in ${tense} tense. ${perspective}\nPlayer character: ${playerName}. Stay within the player character's available knowledge and established sensory access. Do not enter NPC private thoughts or switch viewpoint to an NPC. Do not invent the player's speech, actions, thoughts, feelings, intentions, decisions or choices. Refer only to player behavior already supplied by the user or established in accepted state. Stop when the next beat requires a player choice. Quoted dialogue retains the speaker's natural person and tense. Structured analysis and factual reports retain their required formats. Apply this policy to future narration only; do not rewrite existing messages.`
  };
}
