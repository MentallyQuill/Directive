import {
  addTooltip,
  areDirectiveTooltipsDisabled,
  createButton,
  createElement,
  setDirectiveTooltipsDisabled
} from './runtime-ui-kit.js';
import { buildCertifiedSettingsView } from './view-models/certified-settings-view.mjs';
import { createConnectionProfilePicker } from './connection-profile-picker.js';

export const DIRECTIVE_PRESET_SETTINGS_TARGET = 'directive-preset';

const PROVIDER_TOOLTIPS = Object.freeze({
  provider: 'Current Model uses SillyTavern\'s active connection. Connection Profile uses a saved SillyTavern profile and its native credential handling.',
  profileId: 'Choose a supported SillyTavern chat or text completion profile. Directive never reads or stores its credential.',
  presetMode: 'Isolated keeps the source preset out of Directive prompts. Full source preset includes its configured generation preset.',
  instructMode: 'Auto enables instruct formatting for text completion and disables it for chat completion. On and Off override that detection.',
  samplerMode: 'SillyTavern settings keep the source samplers. Directive override sends only the Temperature and Top P values shown here.',
  structuredOutputMode: 'Auto uses Prompt JSON until this exact configuration passes native-schema certification. Native schema never silently downgrades.',
  temperature: 'Randomness used only when Samplers is set to Directive override.',
  topP: 'Nucleus sampling used only when Samplers is set to Directive override.',
  maxTokens: 'Upper bound for Directive output. A request asking for fewer tokens keeps the smaller value.'
});

let presetRequested = false;

export function resetSettingsPanelState() {
  presetRequested = false;
}

export function selectDirectivePresetSettingsSection() {
  presetRequested = true;
  return DIRECTIVE_PRESET_SETTINGS_TARGET;
}

export async function highlightDirectivePresetSettingsCard({ timeoutMs = 2800 } = {}) {
  const card = typeof document === 'undefined'
    ? null
    : document.querySelector?.(`[data-directive-settings-target="${DIRECTIVE_PRESET_SETTINGS_TARGET}"]`);
  if (!card) return { highlighted: false };
  card.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  card.classList?.add('is-highlighted');
  card.focus?.({ preventScroll: true });
  globalThis.setTimeout?.(() => card.classList?.remove('is-highlighted'), Math.max(0, Number(timeoutMs) || 0));
  presetRequested = false;
  return { highlighted: true };
}

function sectionById(model, id) {
  return model.sections.find((section) => section.id === id) || {};
}

function createSection(kickerText, titleText, summaryText, className = '') {
  const section = createElement('section', `settings-section${className ? ` ${className}` : ''}`);
  const header = createElement('header', 'settings-section-head');
  const kicker = createElement('span');
  kicker.textContent = kickerText;
  const title = createElement('h2');
  title.textContent = titleText;
  const summary = createElement('p');
  summary.textContent = summaryText;
  header.append(kicker, title, summary);
  section.appendChild(header);
  return section;
}

function createField(label, control, detail = '', tooltip = '') {
  const field = createElement('label', 'settings-field');
  const copy = createElement('span', 'settings-field-copy');
  const title = createElement('strong');
  title.textContent = label;
  copy.appendChild(title);
  if (detail) {
    const description = createElement('small');
    description.textContent = detail;
    copy.appendChild(description);
  }
  if (tooltip) {
    addTooltip(copy, tooltip);
    addTooltip(control, tooltip);
  }
  field.append(copy, control);
  return field;
}

function createSelect(value, options, controlName) {
  const select = createElement('select', 'settings-control');
  select.dataset.settingsControl = controlName;
  options.forEach((option) => {
    const item = createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    item.selected = option.value === value;
    select.appendChild(item);
  });
  select.value = value;
  return select;
}

function createNumber(value, { min, max, step }, controlName) {
  const input = createElement('input', 'settings-control');
  input.type = 'number';
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.dataset.settingsControl = controlName;
  return input;
}

function createProfilePicker(kind, value, profiles, { onSelect = null } = {}) {
  const input = createElement('button', 'settings-control settings-profile-picker');
  let selectedId = String(value || '');
  const syncLabel = () => {
    const selected = profiles.find((profile) => profile.id === selectedId) || null;
    input.textContent = selected?.label || selected?.name || selectedId || 'Choose a profile';
  };
  input.type = 'button';
  input.setAttribute('aria-haspopup', 'dialog');
  input.dataset.settingsControl = `${kind}-profileId`;
  input.addEventListener('click', () => createConnectionProfilePicker({
    profiles,
    selectedId,
    opener: input,
    onSelect: async (profileId) => {
      await onSelect?.(profileId);
      selectedId = String(profileId || '');
      syncLabel();
    }
  }));
  syncLabel();
  const wrapper = createElement('span', 'settings-profile-picker-wrap');
  wrapper.appendChild(input);
  return { input, wrapper };
}

function updateProviderState(element, status = {}) {
  const ready = status.ready === true;
  element.classList.toggle?.('is-ready', ready);
  if (typeof element.classList.toggle !== 'function') {
    if (ready) element.classList.add('is-ready');
    else element.classList.remove('is-ready');
  }
  element.textContent = ready
    ? `Ready${status.label ? ` / ${status.label}` : ''}`
    : (status.label || 'Needs configuration');
}

function bindAutoSave({ control, kind, key, actions, feedback, state, transform = (value) => value, beforeSave = null }) {
  control.addEventListener('change', async () => {
    beforeSave?.();
    feedback.textContent = 'Saving...';
    try {
      const result = await actions.updateProviderSettings?.({ kind, patch: { [key]: transform(control.value) } });
      if (result?.status) updateProviderState(state, result.status);
      feedback.textContent = 'Saved / test again after changes';
    } catch (error) {
      feedback.textContent = error?.message || 'Could not save';
    }
  });
}

function appendProviderCard(container, kind, configuration, actions) {
  const settings = configuration.settings?.[kind] || {};
  const status = configuration.status?.[kind] || {};
  const profiles = configuration.profiles || [];
  const card = createElement('article', 'settings-provider-card');
  card.dataset.providerKind = kind;
  const header = createElement('header');
  const copy = createElement('div');
  const kicker = createElement('span');
  kicker.textContent = kind === 'utility' ? 'Fast structured analysis' : 'Deep Directive analysis and creation';
  const title = createElement('h3');
  title.textContent = kind === 'utility' ? 'Utility lane' : 'Reasoning lane';
  copy.append(kicker, title);
  const state = createElement('span', `settings-provider-state${status.ready ? ' is-ready' : ''}`);
  updateProviderState(state, status);
  header.append(copy, state);
  card.appendChild(header);

  const feedback = createElement('span', 'settings-feedback');
  feedback.setAttribute('role', 'status');
  const provider = createSelect(settings.provider || 'st', [
    { value: 'st', label: 'Current Model' },
    { value: 'profile', label: 'Connection Profile' }
  ], `${kind}-provider`);
  const profilePicker = createProfilePicker(kind, settings.profileId || '', profiles, {
    onSelect: async (profileId) => {
      feedback.textContent = 'Saving...';
      try {
        const result = await actions.updateProviderSettings?.({ kind, patch: { profileId } });
        if (result?.status) updateProviderState(state, result.status);
        feedback.textContent = 'Saved / test again after changes';
      } catch (error) {
        feedback.textContent = error?.message || 'Could not save';
        throw error;
      }
    }
  });
  const presetMode = createSelect(settings.presetMode || 'isolated', [
    { value: 'isolated', label: 'Isolated' },
    { value: 'full-profile', label: 'Full source preset' }
  ], `${kind}-presetMode`);
  const instructMode = createSelect(settings.instructMode || 'auto', [
    { value: 'auto', label: 'Auto' },
    { value: 'on', label: 'On' },
    { value: 'off', label: 'Off' }
  ], `${kind}-instructMode`);
  const samplerMode = createSelect(settings.samplerMode || 'profile', [
    { value: 'profile', label: 'SillyTavern settings' },
    { value: 'directive', label: 'Directive override' }
  ], `${kind}-samplerMode`);
  const structuredOutputMode = createSelect(settings.structuredOutputMode || 'auto', [
    { value: 'auto', label: 'Auto' },
    { value: 'native-schema', label: 'Native schema' },
    { value: 'prompt-json', label: 'Prompt JSON' }
  ], `${kind}-structuredOutputMode`);
  const temperature = createNumber(settings.temperature ?? (kind === 'utility' ? 0.1 : 0.4), { min: 0, max: 2, step: 0.05 }, `${kind}-temperature`);
  const topP = createNumber(settings.topP ?? 0.95, { min: 0, max: 1, step: 0.05 }, `${kind}-topP`);
  const maxTokens = createNumber(settings.maxTokens ?? 8192, { min: 64, max: 131072, step: 64 }, `${kind}-maxTokens`);

  const grid = createElement('div', 'settings-field-grid');
  const profileField = createField('Connection Profile', profilePicker.wrapper, 'Search supported chat and text profiles.', PROVIDER_TOOLTIPS.profileId);
  profileField.classList.add('settings-profile-field');
  const samplerOverrides = createElement('div', 'settings-sampler-overrides');
  samplerOverrides.append(
    createField('Temperature', temperature, '', PROVIDER_TOOLTIPS.temperature),
    createField('Top P', topP, '', PROVIDER_TOOLTIPS.topP)
  );
  const syncConditionalFields = () => {
    profileField.hidden = provider.value !== 'profile';
    samplerOverrides.hidden = samplerMode.value !== 'directive';
  };
  grid.append(
    createField('Source', provider, '', PROVIDER_TOOLTIPS.provider),
    profileField,
    createField('Behavioral Preset', presetMode, '', PROVIDER_TOOLTIPS.presetMode),
    createField('Instruct Formatting', instructMode, '', PROVIDER_TOOLTIPS.instructMode),
    createField('Samplers', samplerMode, '', PROVIDER_TOOLTIPS.samplerMode),
    samplerOverrides,
    createField('Structured Output', structuredOutputMode, '', PROVIDER_TOOLTIPS.structuredOutputMode),
    createField('Output token ceiling', maxTokens, '', PROVIDER_TOOLTIPS.maxTokens)
  );
  syncConditionalFields();
  card.appendChild(grid);

  bindAutoSave({ control: provider, kind, key: 'provider', actions, feedback, state, beforeSave: syncConditionalFields });
  bindAutoSave({ control: presetMode, kind, key: 'presetMode', actions, feedback, state });
  bindAutoSave({ control: instructMode, kind, key: 'instructMode', actions, feedback, state });
  bindAutoSave({ control: samplerMode, kind, key: 'samplerMode', actions, feedback, state, beforeSave: syncConditionalFields });
  bindAutoSave({ control: structuredOutputMode, kind, key: 'structuredOutputMode', actions, feedback, state });
  bindAutoSave({ control: temperature, kind, key: 'temperature', actions, feedback, state, transform: Number });
  bindAutoSave({ control: topP, kind, key: 'topP', actions, feedback, state, transform: Number });
  bindAutoSave({ control: maxTokens, kind, key: 'maxTokens', actions, feedback, state, transform: Number });

  const commands = createElement('div', 'settings-actions');
  commands.append(
    createButton({
      label: 'Test Provider',
      className: 'settings-command settings-command-primary',
      tooltip: 'Test connectivity and certify structured-output support for this exact configuration.',
      disabled: typeof actions.testProvider !== 'function',
      onClick: async () => {
        feedback.textContent = 'Testing connectivity and capabilities...';
        const result = await actions.testProvider({ kind });
        if (result?.status) updateProviderState(state, result.status);
        feedback.textContent = result?.ok === false
          ? (result.error?.message || 'Test failed')
          : `Ready / ${result?.capabilities?.structuredOutput === 'native-schema' ? 'Native schema certified' : 'Prompt JSON'}`;
      }
    }),
    feedback
  );
  card.appendChild(commands);
  container.appendChild(card);
}

function appendInterface(container) {
  const section = createSection('Interface', 'Interface', 'Choose how Directive explains controls while you work.');
  const enabled = createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = !areDirectiveTooltipsDisabled();
  enabled.dataset.settingsControl = 'tooltips-enabled';
  enabled.addEventListener('change', () => setDirectiveTooltipsDisabled(!enabled.checked));
  section.appendChild(createField(
    'Tooltips',
    enabled,
    'Show concise explanations for unfamiliar controls on desktop.',
    'Mobile and touch surfaces suppress hover tooltips automatically.'
  ));
  container.appendChild(section);
}

function appendPreset(container, preset, actions) {
  const status = preset.status || {};
  const section = createSection('Provider support', 'Directive Preset', status.message || 'Keep the bundled SillyTavern preset installed and current.', 'settings-preset');
  section.dataset.directiveSettingsTarget = DIRECTIVE_PRESET_SETTINGS_TARGET;
  section.tabIndex = -1;
  const facts = createElement('div', 'settings-facts');
  for (const [label, value] of [
    ['Status', status.pill || status.state || 'Unknown'],
    ['Installed', status.installedVersion || 'Unknown'],
    ['Bundled', status.bundledVersion || 'Latest']
  ]) {
    const row = createElement('div');
    const key = createElement('span'); key.textContent = label;
    const content = createElement('strong'); content.textContent = value;
    row.append(key, content); facts.appendChild(row);
  }
  const autoCheck = createElement('input');
  autoCheck.type = 'checkbox';
  autoCheck.checked = preset.autoCheck?.enabled !== false;
  autoCheck.addEventListener('change', async () => {
    await actions.updateDirectivePresetAutoCheck?.({ enabled: autoCheck.checked });
  });
  const commands = createElement('div', 'settings-actions');
  commands.append(
    createButton({
      label: status.actionLabel || (status.state === 'current' ? 'Reinstall' : 'Install'),
      className: 'settings-command settings-command-primary',
      disabled: status.canInstall !== true || typeof actions.installDirectivePreset !== 'function',
      onClick: async () => { await actions.installDirectivePreset(); await actions.refresh?.(); }
    }),
    createButton({
      label: 'Refresh status',
      className: 'settings-command',
      disabled: typeof actions.refreshDirectivePresetStatus !== 'function',
      onClick: async () => { await actions.refreshDirectivePresetStatus(); await actions.refresh?.(); }
    })
  );
  section.append(facts, createField('Check for preset updates at startup', autoCheck), commands);
  container.appendChild(section);
}

function appendRouting(container, routing = []) {
  const section = createSection('Runtime map', 'Model-Call Routing', 'Read-only V1 role bindings for the Utility and Reasoning lanes.');
  const list = createElement('div', 'settings-routing-list');
  for (const role of routing) {
    const row = createElement('div', 'settings-routing-row');
    const label = createElement('span'); label.textContent = role.label || role.id;
    const lane = createElement('strong'); lane.textContent = role.providerKind === 'reasoning' ? 'Reasoning lane' : 'Utility lane';
    row.append(label, lane);
    list.appendChild(row);
  }
  if (!routing.length) {
    const unavailable = createElement('p', 'settings-feedback');
    unavailable.textContent = 'Routing metadata is unavailable.';
    list.appendChild(unavailable);
  }
  section.appendChild(list);
  container.appendChild(section);
}

function downloadSupportBundle(result) {
  if (typeof Blob !== 'function' || !globalThis.URL?.createObjectURL || !result?.jsonText) return;
  const url = URL.createObjectURL(new Blob([result.jsonText], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.fileName || 'directive-support.json';
  anchor.click?.();
  URL.revokeObjectURL(url);
}

function appendDiagnostics(container, support, actions) {
  const details = createElement('details', 'settings-section settings-diagnostics');
  const summary = createElement('summary');
  const title = createElement('strong'); title.textContent = 'Diagnostics';
  const copy = createElement('span'); copy.textContent = 'Verify the active save or export privacy-bounded support data.';
  summary.append(title, copy);
  const privacy = createElement('p', 'settings-diagnostics-privacy');
  privacy.textContent = 'Exports exclude credentials, system prompts, hidden messages, alternate swipes, and unselected branches.';
  const transcript = createElement('input');
  transcript.type = 'checkbox';
  transcript.checked = false;
  transcript.disabled = support.transcriptAvailable !== true;
  transcript.dataset.settingsControl = 'include-story-transcript';
  const transcriptField = createField(
    'Include Story Transcript',
    transcript,
    transcript.disabled
      ? 'Unavailable because the host cannot prove a player-visible selected-branch transcript boundary.'
      : 'Includes only player-visible messages on the selected branch.'
  );
  const feedback = createElement('span', 'settings-feedback');
  feedback.setAttribute('role', 'status');
  const actionsRow = createElement('div', 'settings-actions');
  actionsRow.append(
    createButton({
      label: 'Verify active save',
      className: 'settings-command',
      disabled: !support.activeSaveId || typeof actions.verifyActiveSave !== 'function',
      onClick: async () => {
        const result = await actions.verifyActiveSave();
        feedback.textContent = result?.ok === false ? 'Save verification failed' : 'Save verified';
      }
    }),
    createButton({
      label: 'Export support bundle',
      className: 'settings-command settings-command-primary',
      disabled: typeof actions.exportSupportDiagnostics !== 'function',
      onClick: async () => {
        const result = await actions.exportSupportDiagnostics({ includeStoryTranscript: transcript.checked });
        downloadSupportBundle(result);
        feedback.textContent = 'Support bundle exported';
      }
    }),
    feedback
  );
  details.append(summary, privacy, transcriptField, actionsRow);
  container.appendChild(details);
}

export function renderSettingsPanel(body, view, actions = {}) {
  const model = buildCertifiedSettingsView(view);
  const surface = createElement('div', 'directive-expanded-settings settings-layout');
  const content = createElement('div', 'settings-content');
  content.dataset.directiveScrollOwner = 'true';

  appendInterface(content);
  const providerSection = sectionById(model, 'providers');
  const providers = createSection('Generation', 'Model Lanes', 'Configure the current V1 Utility and Reasoning routes through SillyTavern.');
  const providerGrid = createElement('div', 'settings-provider-grid');
  appendProviderCard(providerGrid, 'utility', providerSection.providerConfiguration || {}, actions);
  appendProviderCard(providerGrid, 'reasoning', providerSection.providerConfiguration || {}, actions);
  providers.appendChild(providerGrid);
  content.appendChild(providers);

  appendPreset(content, sectionById(model, 'preset').directivePreset || {}, actions);
  appendRouting(content, sectionById(model, 'routing').generationRouting || []);
  appendDiagnostics(content, sectionById(model, 'diagnostics').support || {}, actions);
  surface.appendChild(content);
  body.appendChild(surface);
  if (presetRequested) queueMicrotask(() => highlightDirectivePresetSettingsCard());
}
