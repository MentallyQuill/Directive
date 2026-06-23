export const DIRECTIVE_SILLYTAVERN_SETTINGS_NAMESPACE = 'directive';
export const DIRECTIVE_SILLYTAVERN_ENABLED_SETTING = 'enabled';
export const DIRECTIVE_SILLYTAVERN_PRESET_AUTO_CHECK_SETTING = 'presetAutoCheckOnStartup';
export const DIRECTIVE_SILLYTAVERN_PRESET_AUTO_CHECK_DISMISSED_VERSION_SETTING = 'presetAutoCheckDismissedVersion';

function isObject(value) {
  return value && typeof value === 'object';
}

function candidateSettingsRoots(context = null) {
  return [
    context?.extensionSettings,
    context?.extension_settings,
    globalThis.extension_settings,
    globalThis.extensionSettings
  ];
}

function getSettingsRoot(context = null) {
  for (const candidate of candidateSettingsRoots(context)) {
    if (isObject(candidate)) return candidate;
  }
  if (isObject(context)) {
    context.extensionSettings = {};
    return context.extensionSettings;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.extension_settings = {};
    return globalThis.extension_settings;
  }
  return null;
}

function saveSettings(context = null) {
  const save = context?.saveSettingsDebounced
    || context?.saveSettings
    || globalThis.saveSettingsDebounced
    || globalThis.saveSettings;
  if (typeof save === 'function') save();
}

export function getSillyTavernDirectiveSettings(context = null) {
  const root = getSettingsRoot(context);
  if (!root) return {};
  if (!isObject(root[DIRECTIVE_SILLYTAVERN_SETTINGS_NAMESPACE])) {
    root[DIRECTIVE_SILLYTAVERN_SETTINGS_NAMESPACE] = {};
  }
  return root[DIRECTIVE_SILLYTAVERN_SETTINGS_NAMESPACE];
}

export function isSillyTavernDirectiveEnabled(context = null) {
  return getSillyTavernDirectiveSettings(context)[DIRECTIVE_SILLYTAVERN_ENABLED_SETTING] !== false;
}

export function setSillyTavernDirectiveEnabledSetting(value, context = null) {
  const enabled = value !== false;
  const settings = getSillyTavernDirectiveSettings(context);
  settings[DIRECTIVE_SILLYTAVERN_ENABLED_SETTING] = enabled;
  saveSettings(context);
  return enabled;
}

export function getSillyTavernDirectivePresetAutoCheckPreference(context = null) {
  const settings = getSillyTavernDirectiveSettings(context);
  return {
    enabled: settings[DIRECTIVE_SILLYTAVERN_PRESET_AUTO_CHECK_SETTING] !== false,
    dismissedVersion: String(settings[DIRECTIVE_SILLYTAVERN_PRESET_AUTO_CHECK_DISMISSED_VERSION_SETTING] || '').trim()
  };
}

export function setSillyTavernDirectivePresetAutoCheckPreference(value, context = null) {
  const enabled = value !== false;
  const settings = getSillyTavernDirectiveSettings(context);
  settings[DIRECTIVE_SILLYTAVERN_PRESET_AUTO_CHECK_SETTING] = enabled;
  if (enabled) {
    settings[DIRECTIVE_SILLYTAVERN_PRESET_AUTO_CHECK_DISMISSED_VERSION_SETTING] = '';
  }
  saveSettings(context);
  return getSillyTavernDirectivePresetAutoCheckPreference(context);
}

export function setSillyTavernDirectivePresetAutoCheckDismissedVersion(version, context = null) {
  const settings = getSillyTavernDirectiveSettings(context);
  settings[DIRECTIVE_SILLYTAVERN_PRESET_AUTO_CHECK_DISMISSED_VERSION_SETTING] = String(version || '').trim();
  saveSettings(context);
  return getSillyTavernDirectivePresetAutoCheckPreference(context);
}
