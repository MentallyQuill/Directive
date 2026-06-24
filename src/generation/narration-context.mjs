export const DIRECTIVE_DEFAULT_NARRATION_PERSPECTIVE = 'third person limited external - narrate the world, crew, NPCs, ship or station, reports, and observable player command-character behavior from outside the player\'s private interior. Do not enter the player\'s thoughts, feelings, unspoken intent, or decisions.';

export const DIRECTIVE_DEFAULT_PLAYER_AGENCY_RULE = '# Player Agency And Perspective\nDefault perspective: third person limited external - narrate the world, crew, NPCs, ship or station, reports, and observable player command-character behavior from outside the player\'s private interior. Do not enter the player\'s thoughts, feelings, unspoken intent, or decisions.\n\nOnly the user speaks, acts, decides, and thinks for the player\'s command character. Do not write the player\'s dialogue, private thoughts, physical actions, chosen orders, final decision, emotional reaction, unspoken intent, or future choice.\n\nDescribe only what others can observe about the player\'s command character: words already written by the user, visible posture, position, equipment, injuries, publicly available status, and consequences already established by Directive state or chat history. If the next beat requires the player\'s choice, stop at a command-relevant opening instead of filling in the choice.';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function normalizeDirectiveNarrationContext(value = null, { roleId = 'campaignIntro' } = {}) {
  const compatible = value?.compatible === true;
  return {
    kind: 'directive.narrationPresetContext',
    roleId: value?.roleId || roleId,
    activePresetName: value?.activePresetName || null,
    compatible,
    source: value?.source || 'directive-default',
    perspective: compact(value?.perspective || DIRECTIVE_DEFAULT_NARRATION_PERSPECTIVE),
    instructions: String(value?.instructions || DIRECTIVE_DEFAULT_PLAYER_AGENCY_RULE).trim(),
    promptIdentifiers: Array.isArray(value?.promptIdentifiers) ? cloneJson(value.promptIdentifiers) : [],
    perspectivePromptId: value?.perspectivePromptId || null,
    reason: value?.reason || (compatible ? null : 'Directive default perspective applied.')
  };
}

export function directiveNarrationContextSummary(context, options = {}) {
  const resolved = normalizeDirectiveNarrationContext(context, options);
  return {
    roleId: resolved.roleId,
    source: resolved.source,
    compatible: resolved.compatible,
    activePresetName: resolved.activePresetName,
    perspective: resolved.perspective,
    perspectivePromptId: resolved.perspectivePromptId,
    reason: resolved.reason
  };
}

export async function resolveDirectiveNarrationContext(host, { roleId = 'campaignIntro' } = {}) {
  if (typeof host?.presets?.getNarrationContext !== 'function') {
    return normalizeDirectiveNarrationContext({
      roleId,
      source: 'preset-adapter-unavailable',
      reason: 'Host does not expose active preset narration context; Directive default perspective applied.'
    }, { roleId });
  }
  try {
    return normalizeDirectiveNarrationContext(await host.presets.getNarrationContext({ roleId }), { roleId });
  } catch (error) {
    return normalizeDirectiveNarrationContext({
      roleId,
      source: 'preset-context-error',
      reason: `Active preset narration context could not be read: ${error?.message || String(error)}`
    }, { roleId });
  }
}

export function directiveNarrationPerspectiveMode(narrationContext) {
  const perspective = compact(narrationContext?.perspective).toLowerCase();
  if (perspective.includes('second person')) return 'second-person';
  if (perspective.includes('first person')) return 'first-person';
  return 'third-person';
}
