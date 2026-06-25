import {
  getSillyTavernDirectivePresetAutoCheckPreference,
  setSillyTavernDirectivePresetAutoCheckDismissedVersion,
  setSillyTavernDirectivePresetAutoCheckPreference
} from './settings-store.mjs';

export const DIRECTIVE_PRESET_API_ID = 'openai';
export const DIRECTIVE_PRESET_NAME = 'Directive';
export const DIRECTIVE_PRESET_VERSION = 'Directive-0.1.0-pre-alpha.7';
export const DIRECTIVE_PRESET_ASSET_URL = new URL('../../../presets/sillytavern/directive.json', import.meta.url);
export const DIRECTIVE_LEGACY_PRESET_NAMES = Object.freeze([
  'Directive Star Trek Command',
  'directive-star-trek-command'
]);
export const DIRECTIVE_DEFAULT_POV_RULE = 'third person limited external - narrate the world, crew, NPCs, ship or station, reports, and observable player command-character behavior from outside the player\'s private interior. Do not enter the player\'s thoughts, feelings, unspoken intent, or decisions.';
export const DIRECTIVE_DEFAULT_PLAYER_AGENCY_RULE = '# Player Agency And Perspective\nDefault perspective: third person limited external - narrate the world, crew, NPCs, ship or station, reports, and observable player command-character behavior from outside the player\'s private interior. Do not enter the player\'s thoughts, feelings, unspoken intent, or decisions.\n\nOnly the user speaks, acts, decides, and thinks for the player\'s command character. Do not write the player\'s dialogue, private thoughts, physical actions, chosen orders, final decision, emotional reaction, unspoken intent, or future choice.\n\nDescribe only what others can observe about the player\'s command character: words already written by the user, visible posture, position, equipment, injuries, publicly available status, and consequences already established by Directive state or chat history. Typed narration, planning notes, stage direction, and private inner monologue are not audible. Treat only explicit dialogue, spoken orders, transmissions, or established telepathic contact as information other characters can perceive. If the next beat requires the player\'s choice, stop at a command-relevant opening instead of filling in the choice.';

const VERSION_PATTERN = /(?:Directive[-\s]*)?v?(\d+(?:\.\d+){0,3})(?:-([0-9A-Za-z.-]+))?/i;
const DIRECTIVE_POV_VARIABLE = 'directive_pov';
const DIRECTIVE_PLAYER_AGENCY_PROMPT_IDENTIFIER = 'directive-player-agency-perspective';
const DIRECTIVE_POV_PROMPT_PREFIX = 'directive-pov-';
const DIRECTIVE_PRESET_STARTUP_PROMPT_STATES = Object.freeze(new Set([
  'missing',
  'behind',
  'unknown',
  'legacy-name'
]));

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compactText(value) {
  return String(value || '').replace(/[ \t]+\n/g, '\n').trim();
}

function fetchImplDefault() {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Fetch is unavailable for Directive preset loading.');
  }
  return globalThis.fetch.bind(globalThis);
}

function presetManagerFromContext(context) {
  if (typeof context?.getPresetManager !== 'function') return null;
  try {
    return context.getPresetManager(DIRECTIVE_PRESET_API_ID) || null;
  } catch (_) {
    return null;
  }
}

function readPresetByName(manager, name) {
  if (!name) return null;
  let preset = null;
  if (typeof manager?.getCompletionPresetByName === 'function') {
    preset = manager.getCompletionPresetByName(name) || null;
  }
  if (!preset && typeof manager?.readPresetExtensionField === 'function') {
    const directiveMeta = manager.readPresetExtensionField({ name, path: 'directive' });
    if (directiveMeta) preset = { extensions: { directive: directiveMeta } };
  }
  return preset;
}

function selectedPresetRecord(manager) {
  if (!manager) return { name: '', preset: null };
  let selectedName = '';
  let selectedValue = null;
  try {
    selectedName = typeof manager.getSelectedPresetName === 'function'
      ? String(manager.getSelectedPresetName() || '').trim()
      : '';
  } catch (_) {
    selectedName = '';
  }
  try {
    selectedValue = typeof manager.getSelectedPreset === 'function' ? manager.getSelectedPreset() : null;
  } catch (_) {
    selectedValue = null;
  }
  if (!selectedName && typeof selectedValue === 'string') selectedName = selectedValue.trim();
  const namedPreset = readPresetByName(manager, selectedName);
  const selectedPreset = isObject(selectedValue) ? selectedValue : null;
  return {
    name: selectedName,
    preset: namedPreset || selectedPreset
  };
}

function promptMap(preset) {
  const prompts = Array.isArray(preset?.prompts) ? preset.prompts : [];
  return new Map(prompts
    .filter((prompt) => prompt?.identifier)
    .map((prompt) => [String(prompt.identifier), prompt]));
}

function orderedPresetPrompts(preset) {
  const byIdentifier = promptMap(preset);
  const order = (Array.isArray(preset?.prompt_order) ? preset.prompt_order : [])
    .map((entry) => Array.isArray(entry?.order) ? entry.order : null)
    .find(Boolean);
  if (order) {
    return order
      .map((entry) => {
        const identifier = String(entry?.identifier || '').trim();
        const prompt = byIdentifier.get(identifier) || null;
        return {
          identifier,
          enabled: entry?.enabled !== false,
          prompt
        };
      })
      .filter((entry) => entry.identifier && entry.prompt);
  }
  return [...byIdentifier.entries()].map(([identifier, prompt]) => ({
    identifier,
    enabled: prompt.enabled !== false,
    prompt
  }));
}

function extractDirectivePov(content) {
  const source = String(content || '');
  const pattern = new RegExp(`\\{\\{setvar::${DIRECTIVE_POV_VARIABLE}::([\\s\\S]*?)\\}\\}`, 'gi');
  let match = null;
  let value = '';
  while ((match = pattern.exec(source))) {
    value = compactText(match[1]);
  }
  return value;
}

function activePromptContent(preset, identifier) {
  return orderedPresetPrompts(preset)
    .find((entry) => entry.enabled && entry.identifier === identifier)
    ?.prompt?.content || '';
}

function presetHasDirectivePovControls(preset) {
  return orderedPresetPrompts(preset).some((entry) => {
    const content = String(entry.prompt?.content || '');
    return entry.identifier.startsWith(DIRECTIVE_POV_PROMPT_PREFIX)
      || content.includes(`setvar::${DIRECTIVE_POV_VARIABLE}::`)
      || content.includes(`getvar::${DIRECTIVE_POV_VARIABLE}`);
  });
}

function compatibleDirectivePreset(preset, presetName = '') {
  if (!isObject(preset)) return false;
  const metadata = directivePresetMetadata(preset);
  if (metadata.presetName === DIRECTIVE_PRESET_NAME || metadata.supportsDirectiveRuntime || metadata.supportsPromptContextBlocks) return true;
  const normalizedName = String(presetName || '').trim().toLowerCase();
  if ([DIRECTIVE_PRESET_NAME, ...DIRECTIVE_LEGACY_PRESET_NAMES].some((name) => name.toLowerCase() === normalizedName)) return true;
  return presetHasDirectivePovControls(preset)
    && Boolean(activePromptContent(preset, DIRECTIVE_PLAYER_AGENCY_PROMPT_IDENTIFIER));
}

export function directiveNarrationContextFromPreset(preset, { presetName = '', roleId = 'campaignIntro' } = {}) {
  const base = {
    kind: 'directive.narrationPresetContext',
    roleId,
    activePresetName: presetName || null,
    compatible: false,
    source: 'directive-default',
    perspective: DIRECTIVE_DEFAULT_POV_RULE,
    instructions: DIRECTIVE_DEFAULT_PLAYER_AGENCY_RULE,
    promptIdentifiers: [],
    reason: null
  };
  if (!isObject(preset)) {
    return {
      ...base,
      source: 'preset-unavailable',
      reason: 'No active SillyTavern preset could be read; Directive default perspective applied.'
    };
  }
  if (!compatibleDirectivePreset(preset, presetName)) {
    return {
      ...base,
      source: 'unrelated-active-preset',
      reason: 'The active SillyTavern preset is not Directive-compatible; Directive default perspective applied.'
    };
  }

  let perspective = '';
  let perspectivePromptId = null;
  const promptIdentifiers = [];
  for (const entry of orderedPresetPrompts(preset)) {
    if (!entry.enabled) continue;
    promptIdentifiers.push(entry.identifier);
    const nextPov = extractDirectivePov(entry.prompt?.content);
    if (nextPov) {
      perspective = nextPov;
      perspectivePromptId = entry.identifier;
    }
  }
  const resolvedPerspective = perspective || DIRECTIVE_DEFAULT_POV_RULE;
  const playerAgency = compactText(activePromptContent(preset, DIRECTIVE_PLAYER_AGENCY_PROMPT_IDENTIFIER))
    .replace(new RegExp(`\\{\\{getvar::${DIRECTIVE_POV_VARIABLE}\\}\\}`, 'gi'), resolvedPerspective)
    .replace(/\{\{user\}\}/g, 'the user');
  const instructions = playerAgency || DIRECTIVE_DEFAULT_PLAYER_AGENCY_RULE;
  return {
    ...base,
    compatible: true,
    source: directivePresetMetadata(preset).supportsDirectiveRuntime || String(presetName || '').trim().toLowerCase() === DIRECTIVE_PRESET_NAME.toLowerCase()
      ? 'active-directive-preset'
      : 'active-compatible-preset',
    perspective: resolvedPerspective,
    instructions,
    promptIdentifiers,
    perspectivePromptId,
    reason: perspective
      ? null
      : 'Directive-compatible preset did not expose an enabled directive_pov value; Directive default perspective applied.'
  };
}

export function comparableDirectivePresetVersion(value) {
  const match = String(value || '').trim().match(VERSION_PATTERN);
  return match?.[1] || '';
}

function directivePresetVersionParts(value) {
  const match = String(value || '').trim().match(VERSION_PATTERN);
  if (!match) return null;
  return {
    core: match[1].split('.').map((part) => Number(part) || 0),
    prerelease: match[2] || ''
  };
}

function comparePrereleaseVersions(installed, bundled) {
  if (installed === bundled) return 0;
  if (!installed && bundled) return 1;
  if (installed && !bundled) return -1;
  const left = installed.split('.');
  const right = bundled.split('.');
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] || '';
    const b = right[index] || '';
    if (a === b) continue;
    if (!a) return -1;
    if (!b) return 1;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const av = Number(a);
      const bv = Number(b);
      if (av < bv) return -1;
      if (av > bv) return 1;
      continue;
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a.localeCompare(b);
  }
  return 0;
}

export function compareDirectivePresetVersions(installed, bundled) {
  const leftVersion = directivePresetVersionParts(installed);
  const rightVersion = directivePresetVersionParts(bundled);
  if (!leftVersion || !rightVersion) return null;
  const length = Math.max(leftVersion.core.length, rightVersion.core.length, 3);
  for (let index = 0; index < length; index += 1) {
    const av = leftVersion.core[index] || 0;
    const bv = rightVersion.core[index] || 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return comparePrereleaseVersions(leftVersion.prerelease, rightVersion.prerelease);
}

export function ensureDirectivePresetMetadata(preset) {
  const next = cloneJson(preset || {});
  next.extensions = isObject(next.extensions) ? next.extensions : {};
  next.extensions.directive = {
    ...(isObject(next.extensions.directive) ? next.extensions.directive : {}),
    presetName: DIRECTIVE_PRESET_NAME,
    presetVersion: DIRECTIVE_PRESET_VERSION,
    version: comparableDirectivePresetVersion(DIRECTIVE_PRESET_VERSION) || '0.1.0',
    metadataSchema: 1,
    bundledPreset: true,
    supportsDirectiveRuntime: true,
    supportsPromptContextBlocks: true,
    supportsSceneContinuityGrounding: true
  };
  return next;
}

export function directivePresetMetadata(preset, { fallbackVersion = '' } = {}) {
  const ext = isObject(preset?.extensions?.directive) ? preset.extensions.directive : {};
  const notes = String(preset?.notes || '');
  const explicit = ext.presetVersion || ext.version || '';
  const noteMatch = notes.match(/\bDirective[-\s]+v?(\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z.-]+)?)\b/i)
    || notes.match(/\bDirective\s+(\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z.-]+)?)\b/i);
  const rawVersion = explicit || (noteMatch ? noteMatch[1] : '') || fallbackVersion || '';
  const comparable = comparableDirectivePresetVersion(rawVersion);
  const displayVersion = comparable
    ? String(rawVersion).trim().match(/^Directive[-\s]/i)
      ? String(rawVersion).trim()
      : `Directive-${String(rawVersion).trim()}`
    : '';
  return {
    presetName: ext.presetName || '',
    displayVersion,
    comparable,
    source: explicit ? 'metadata' : noteMatch ? 'notes' : '',
    bundledPreset: ext.bundledPreset === true,
    supportsDirectiveRuntime: ext.supportsDirectiveRuntime === true,
    supportsPromptContextBlocks: ext.supportsPromptContextBlocks === true
  };
}

export function getInstalledDirectivePreset(manager, { installedConfirmed = false } = {}) {
  const names = typeof manager?.getAllPresets === 'function' ? manager.getAllPresets() : [];
  const candidates = [DIRECTIVE_PRESET_NAME, ...DIRECTIVE_LEGACY_PRESET_NAMES];
  let installedName = '';
  if (Array.isArray(names)) {
    installedName = candidates
      .map((candidate) => names.find((name) => String(name || '').trim().toLowerCase() === candidate.toLowerCase()) || '')
      .find(Boolean) || '';
  }
  if (!installedName) {
    installedName = candidates.find((candidate) => readPresetByName(manager, candidate)) || '';
  }
  if (installedName) {
    return {
      name: installedName,
      preset: readPresetByName(manager, installedName),
      legacyName: installedName.toLowerCase() !== DIRECTIVE_PRESET_NAME.toLowerCase()
    };
  }
  return installedConfirmed
    ? { name: DIRECTIVE_PRESET_NAME, preset: null, legacyName: false, assumed: true }
    : { name: '', preset: null, legacyName: false };
}

export function directivePresetStatus({ manager = null, installedConfirmed = false } = {}) {
  const bundledVersion = DIRECTIVE_PRESET_VERSION;
  if (!manager) {
    return {
      state: 'unavailable',
      pill: 'Manual',
      message: 'SillyTavern preset manager is unavailable. Import presets/sillytavern/directive.json manually.',
      installedVersion: 'unknown',
      bundledVersion,
      canInstall: false
    };
  }

  const installed = getInstalledDirectivePreset(manager, { installedConfirmed });
  if (!installed.preset && !installed.assumed) {
    return {
      state: 'missing',
      pill: 'Not Installed',
      message: 'Install the bundled Directive preset, then select it manually in SillyTavern for campaign play.',
      installedVersion: 'not found',
      bundledVersion,
      actionLabel: 'Install Preset',
      primaryAction: true,
      canInstall: true
    };
  }

  const installedMeta = directivePresetMetadata(installed.preset, {
    fallbackVersion: installed.assumed ? bundledVersion : ''
  });
  const installedVersion = installedMeta.displayVersion || 'unknown';
  const comparison = installed.assumed
    ? 0
    : compareDirectivePresetVersions(installedMeta.displayVersion, bundledVersion);
  const legacyNameMessage = installed.legacyName
    ? ` Legacy preset name "${installed.name}" was found; updating installs the stable "${DIRECTIVE_PRESET_NAME}" preset name.`
    : '';

  if (comparison === null) {
    return {
      state: 'unknown',
      pill: 'Version Unknown',
      message: `A Directive preset is installed, but its version metadata is missing or unreadable.${legacyNameMessage}`,
      installedVersion,
      bundledVersion,
      installedName: installed.name,
      actionLabel: 'Update Preset',
      primaryAction: true,
      canInstall: true
    };
  }

  if (comparison < 0) {
    return {
      state: 'behind',
      pill: 'Update Available',
      message: `The installed Directive preset is older than the bundled preset.${legacyNameMessage}`,
      installedVersion,
      bundledVersion,
      installedName: installed.name,
      actionLabel: 'Update Preset',
      primaryAction: true,
      canInstall: true
    };
  }

  if (comparison > 0 && !installed.legacyName) {
    return {
      state: 'ahead',
      pill: 'Newer Installed',
      message: 'The installed Directive preset appears newer than the bundled preset. No update is needed.',
      installedVersion,
      bundledVersion,
      installedName: installed.name,
      canInstall: true
    };
  }

  if (installed.legacyName) {
    return {
      state: 'legacy-name',
      pill: 'Legacy Name',
      message: legacyNameMessage.trim(),
      installedVersion,
      bundledVersion,
      installedName: installed.name,
      actionLabel: 'Update Preset',
      primaryAction: true,
      canInstall: true
    };
  }

  return {
    state: 'current',
    pill: 'Current',
    message: 'The installed Directive preset matches the bundled version.',
    installedVersion,
    bundledVersion,
    installedName: installed.name || DIRECTIVE_PRESET_NAME,
    actionLabel: 'Reinstall Preset',
    canInstall: true
  };
}

function directivePresetStartupReminder(status, preference) {
  const normalizedStatus = status || {};
  const bundledVersion = normalizedStatus.bundledVersion || DIRECTIVE_PRESET_VERSION;
  const enabled = preference?.enabled !== false;
  const dismissedVersion = String(preference?.dismissedVersion || '').trim();
  const actionable = DIRECTIVE_PRESET_STARTUP_PROMPT_STATES.has(normalizedStatus.state);
  const dismissed = Boolean(dismissedVersion && dismissedVersion === bundledVersion);
  return {
    enabled,
    shouldPrompt: Boolean(enabled && actionable && !dismissed),
    actionable,
    dismissed,
    dismissedVersion,
    bundledVersion,
    state: normalizedStatus.state || 'unknown',
    title: 'Directive Preset needs attention',
    message: 'The bundled Directive preset is missing or older than this extension version. Open Directive Preset settings to install the latest preset and enable the included regex cleanup.',
    status: cloneJson(normalizedStatus)
  };
}

export function createSillyTavernDirectivePresetManager({
  contextFactory,
  fetchImpl = fetchImplDefault(),
  assetUrl = DIRECTIVE_PRESET_ASSET_URL
} = {}) {
  const getContext = typeof contextFactory === 'function'
    ? contextFactory
    : () => globalThis.SillyTavern?.getContext?.() || null;
  let bundledPresetCache = null;
  let installConfirmed = false;
  let latestStatus = null;

  function manager() {
    return presetManagerFromContext(getContext());
  }

  function getStatus() {
    latestStatus = directivePresetStatus({
      manager: manager(),
      installedConfirmed: installConfirmed
    });
    return cloneJson(latestStatus);
  }

  function getNarrationContext(options = {}) {
    const pm = manager();
    if (!pm) {
      return directiveNarrationContextFromPreset(null, {
        roleId: options.roleId || 'campaignIntro'
      });
    }
    const selected = selectedPresetRecord(pm);
    return cloneJson(directiveNarrationContextFromPreset(selected.preset, {
      presetName: selected.name,
      roleId: options.roleId || 'campaignIntro'
    }));
  }

  function getAutoCheckPreference() {
    return cloneJson(getSillyTavernDirectivePresetAutoCheckPreference(getContext()));
  }

  function setAutoCheckPreference(value) {
    return cloneJson(setSillyTavernDirectivePresetAutoCheckPreference(value, getContext()));
  }

  function dismissAutoCheckForVersion(version = DIRECTIVE_PRESET_VERSION) {
    return cloneJson(setSillyTavernDirectivePresetAutoCheckDismissedVersion(
      version || DIRECTIVE_PRESET_VERSION,
      getContext()
    ));
  }

  function getStartupCheck() {
    const status = getStatus();
    const preference = getAutoCheckPreference();
    return directivePresetStartupReminder(status, preference);
  }

  async function loadBundledPreset() {
    if (bundledPresetCache) return cloneJson(bundledPresetCache);
    const response = await fetchImpl(String(assetUrl), { cache: 'no-store' });
    if (!response?.ok) {
      throw new Error(`Bundled Directive preset could not be loaded (${response?.status || 0}).`);
    }
    const preset = ensureDirectivePresetMetadata(await response.json());
    bundledPresetCache = preset;
    return cloneJson(preset);
  }

  async function installBundledPreset() {
    const pm = manager();
    if (!pm || typeof pm.savePreset !== 'function') {
      throw new Error('SillyTavern preset manager is unavailable.');
    }
    const preset = await loadBundledPreset();
    const previousValue = typeof pm.getSelectedPreset === 'function' ? pm.getSelectedPreset() : '';
    const previousName = typeof pm.getSelectedPresetName === 'function' ? pm.getSelectedPresetName() : '';

    await pm.savePreset(DIRECTIVE_PRESET_NAME, preset);
    installConfirmed = true;

    let restored = false;
    if (previousValue && typeof pm.selectPreset === 'function') {
      try {
        const currentName = typeof pm.getSelectedPresetName === 'function' ? pm.getSelectedPresetName() : '';
        if (currentName !== previousName) {
          pm.selectPreset(previousValue);
          restored = true;
        }
      } catch (error) {
        console.warn('[Directive] Could not restore previous preset after importing Directive preset:', error);
      }
    }

    latestStatus = getStatus();
    return {
      ok: true,
      presetName: DIRECTIVE_PRESET_NAME,
      presetVersion: DIRECTIVE_PRESET_VERSION,
      selectionTouched: previousName !== DIRECTIVE_PRESET_NAME,
      restored,
      status: cloneJson(latestStatus)
    };
  }

  return {
    id: 'sillytavern-directive-preset-manager',
    getStatus,
    latestStatus() {
      return cloneJson(latestStatus || getStatus());
    },
    getNarrationContext,
    getAutoCheckPreference,
    setAutoCheckPreference,
    dismissAutoCheckForVersion,
    getStartupCheck,
    loadBundledPreset,
    installBundledPreset
  };
}

export const __sillyTavernPresetManagerTestHooks = Object.freeze({
  readPresetByName,
  presetManagerFromContext,
  selectedPresetRecord,
  orderedPresetPrompts,
  extractDirectivePov,
  compatibleDirectivePreset
});
