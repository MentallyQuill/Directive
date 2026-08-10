import {
  appendEmpty,
  createButton,
  createElement
} from './runtime-ui-kit.js';

export const DIRECTIVE_PRESET_SETTINGS_TARGET = 'directive-preset';

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

function display(value, fallback = 'Not configured') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function createSection(title, summary, className = '') {
  const section = createElement('section', `directive-v1-settings-section${className ? ` ${className}` : ''}`);
  const header = createElement('header');
  const kicker = createElement('span', 'directive-v1-kicker');
  kicker.textContent = 'Settings';
  const heading = createElement('h2');
  heading.textContent = title;
  const copy = createElement('p');
  copy.textContent = summary;
  header.append(kicker, heading, copy);
  section.appendChild(header);
  return section;
}

function createField(label, control, detail = '') {
  const wrapper = createElement('label', 'directive-v1-setting-field');
  const copy = createElement('span');
  const title = createElement('strong');
  title.textContent = label;
  copy.appendChild(title);
  if (detail) {
    const description = createElement('small');
    description.textContent = detail;
    copy.appendChild(description);
  }
  wrapper.append(copy, control);
  return wrapper;
}

function createNumberInput(value, { min, max, step = 1 } = {}) {
  const input = createElement('input', 'directive-field-control');
  input.type = 'number';
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  return input;
}

function createSelect(value, options) {
  const select = createElement('select', 'directive-field-control');
  options.forEach((option) => {
    const element = createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    element.selected = option.value === value;
    select.appendChild(element);
  });
  select.value = value;
  return select;
}

function providerStatusText(status = {}) {
  if (status.ready === true) return status.label ? `Ready / ${status.label}` : 'Ready';
  return status.label || 'Needs configuration';
}

function appendProviderCard(container, kind, configuration, actions) {
  const settings = configuration.settings?.[kind] || {};
  const status = configuration.status?.[kind] || {};
  const profiles = Array.isArray(configuration.profiles) ? configuration.profiles : [];
  const card = createElement('article', 'directive-v1-provider-card');
  const header = createElement('header');
  const copy = createElement('div');
  const label = createElement('span', 'directive-v1-kicker');
  label.textContent = kind === 'utility' ? 'Fast structured analysis' : 'Story reasoning and narration';
  const title = createElement('h3');
  title.textContent = kind === 'utility' ? 'Utility lane' : 'Reasoning lane';
  copy.append(label, title);
  const state = createElement('span', `directive-v1-provider-state${status.ready ? ' is-ready' : ''}`);
  state.textContent = providerStatusText(status);
  header.append(copy, state);
  card.appendChild(header);

  const provider = createSelect(settings.provider || 'st', [
    { value: 'st', label: 'Current SillyTavern model' },
    { value: 'profile', label: 'Connection profile' },
    { value: 'openai_compatible', label: 'OpenAI-compatible endpoint' }
  ]);
  const profile = createSelect(settings.profileId || '', [
    { value: '', label: 'Select a profile' },
    ...profiles.map((item) => ({ value: item.id, label: item.model ? `${item.label} / ${item.model}` : item.label }))
  ]);
  const baseUrl = createElement('input', 'directive-field-control');
  baseUrl.type = 'url';
  baseUrl.value = settings.baseUrl || '';
  baseUrl.placeholder = 'https://example.com/v1';
  const model = createElement('input', 'directive-field-control');
  model.type = 'text';
  model.value = settings.model || '';
  model.placeholder = 'Model ID';
  const apiKey = createElement('input', 'directive-field-control');
  apiKey.type = 'password';
  apiKey.value = '';
  apiKey.placeholder = settings.apiKeySet ? 'Session key is set' : 'Session-only API key';
  const temperature = createNumberInput(settings.temperature ?? (kind === 'utility' ? 0.1 : 0.7), { min: 0, max: 2, step: 0.1 });
  const topP = createNumberInput(settings.topP ?? 0.95, { min: 0, max: 1, step: 0.05 });
  const maxTokens = createNumberInput(settings.maxTokens ?? 8192, { min: 64, max: 131072, step: 64 });

  const grid = createElement('div', 'directive-v1-settings-grid');
  const providerField = createField('Provider', provider);
  const profileField = createField('Connection profile', profile);
  const baseUrlField = createField('Base URL', baseUrl);
  const modelField = createField('Model', model);
  const apiKeyField = createField('API key', apiKey, 'Held only for this browser session.');
  grid.append(
    providerField,
    profileField,
    baseUrlField,
    modelField,
    apiKeyField,
    createField('Temperature', temperature),
    createField('Top P', topP),
    createField('Max tokens', maxTokens)
  );
  const syncFields = () => {
    profileField.hidden = provider.value !== 'profile';
    baseUrlField.hidden = provider.value !== 'openai_compatible';
    modelField.hidden = provider.value !== 'openai_compatible';
    apiKeyField.hidden = provider.value !== 'openai_compatible';
  };
  provider.addEventListener('change', syncFields);
  syncFields();
  card.appendChild(grid);

  const feedback = createElement('span', 'directive-v1-settings-feedback');
  const commands = createElement('div', 'directive-v1-settings-actions');
  commands.append(
    createButton({
      label: 'Save',
      icon: 'fa-solid fa-floppy-disk',
      className: 'directive-button directive-secondary-command',
      disabled: typeof actions.updateProviderSettings !== 'function',
      onClick: async () => {
        const patch = {
          provider: provider.value,
          profileId: profile.value,
          baseUrl: baseUrl.value.trim(),
          model: model.value.trim(),
          temperature: Number(temperature.value),
          topP: Number(topP.value),
          maxTokens: Number(maxTokens.value)
        };
        if (apiKey.value) patch.apiKey = apiKey.value;
        await actions.updateProviderSettings({ kind, patch });
        feedback.textContent = 'Saved';
        await actions.refresh?.();
      }
    }),
    createButton({
      label: 'Test',
      icon: 'fa-solid fa-plug-circle-check',
      className: 'directive-button directive-primary-command',
      disabled: typeof actions.testProvider !== 'function',
      onClick: async () => {
        feedback.textContent = 'Testing...';
        const result = await actions.testProvider({ kind });
        feedback.textContent = result?.ok === false
          ? (result.error?.message || 'Test failed')
          : 'Provider ready';
      }
    }),
    feedback
  );
  card.appendChild(commands);
  container.appendChild(card);
}

function appendProviders(surface, view, actions) {
  const section = createSection(
    'Model lanes',
    'Directive uses a fast lane for structured analysis and a reasoning lane for mission judgment and narration.'
  );
  const configuration = view?.providerConfiguration || {};
  if (configuration.error) {
    appendEmpty(section, configuration.error.message || 'Provider configuration is unavailable.');
  } else {
    const grid = createElement('div', 'directive-v1-provider-grid');
    appendProviderCard(grid, 'utility', configuration, actions);
    appendProviderCard(grid, 'reasoning', configuration, actions);
    section.appendChild(grid);
  }
  surface.appendChild(section);
}

function appendPreset(surface, view, actions) {
  const preset = view?.directivePreset || {};
  const status = preset.status || {};
  const section = createSection(
    'Directive preset',
    status.message || 'Keep the bundled SillyTavern preset installed and current.',
    'directive-v1-preset'
  );
  section.dataset.directiveSettingsTarget = DIRECTIVE_PRESET_SETTINGS_TARGET;
  section.tabIndex = -1;
  const facts = createElement('div', 'directive-v1-settings-facts');
  for (const [label, value] of [
    ['Status', status.pill || status.state || 'Unknown'],
    ['Installed', status.installedVersion || 'Unknown'],
    ['Bundled', status.bundledVersion || 'Latest']
  ]) {
    const row = createElement('div');
    const key = createElement('span');
    key.textContent = label;
    const content = createElement('strong');
    content.textContent = value;
    row.append(key, content);
    facts.appendChild(row);
  }
  const autoCheck = createElement('input');
  autoCheck.type = 'checkbox';
  autoCheck.checked = preset.autoCheck?.enabled !== false;
  autoCheck.addEventListener('change', async () => {
    await actions.updateDirectivePresetAutoCheck?.({ enabled: autoCheck.checked });
    await actions.refresh?.();
  });
  const commands = createElement('div', 'directive-v1-settings-actions');
  section.append(
    facts,
    createField('Check for preset updates at startup', autoCheck),
    commands
  );
  commands.append(
    createButton({
      label: status.actionLabel || (status.state === 'current' ? 'Reinstall' : 'Install'),
      icon: 'fa-solid fa-download',
      className: 'directive-button directive-primary-command',
      disabled: status.canInstall !== true || typeof actions.installDirectivePreset !== 'function',
      onClick: async () => {
        await actions.installDirectivePreset();
        await actions.refresh?.();
      }
    }),
    createButton({
      label: 'Refresh status',
      icon: 'fa-solid fa-arrows-rotate',
      className: 'directive-button directive-secondary-command',
      disabled: typeof actions.refreshDirectivePresetStatus !== 'function',
      onClick: async () => {
        await actions.refreshDirectivePresetStatus();
        await actions.refresh?.();
      }
    })
  );
  surface.appendChild(section);
  if (presetRequested) queueMicrotask(() => highlightDirectivePresetSettingsCard());
}

function downloadJson({ fileName = 'directive-export.json', jsonText = '' } = {}) {
  if (typeof document === 'undefined' || typeof Blob !== 'function' || !globalThis.URL?.createObjectURL) return false;
  const url = URL.createObjectURL(new Blob([jsonText], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click?.();
  URL.revokeObjectURL(url);
  return true;
}

function appendSupport(surface, view, actions) {
  const section = createSection(
    'Save and support',
    'Verify the active save or export a compact support bundle.'
  );
  const feedback = createElement('span', 'directive-v1-settings-feedback');
  const commands = createElement('div', 'directive-v1-settings-actions');
  commands.append(
    createButton({
      label: 'Verify active save',
      icon: 'fa-solid fa-circle-check',
      className: 'directive-button directive-secondary-command',
      disabled: !view?.activeSaveId || typeof actions.verifyActiveSave !== 'function',
      onClick: async () => {
        const result = await actions.verifyActiveSave();
        feedback.textContent = result?.ok === false ? 'Save verification failed' : 'Save verified';
      }
    }),
    createButton({
      label: 'Export support bundle',
      icon: 'fa-solid fa-arrow-up-from-bracket',
      className: 'directive-button directive-primary-command',
      disabled: typeof actions.exportSupportDiagnostics !== 'function',
      onClick: async () => {
        const result = await actions.exportSupportDiagnostics({ includeStoryTranscript: false });
        downloadJson(result);
        feedback.textContent = 'Support bundle exported';
      }
    }),
    feedback
  );
  section.appendChild(commands);
  surface.appendChild(section);
}

export function renderSettingsPanel(body, view, actions = {}) {
  const surface = createElement('div', 'directive-v1-settings');
  appendProviders(surface, view, actions);
  appendPreset(surface, view, actions);
  appendSupport(surface, view, actions);
  body.appendChild(surface);
}
