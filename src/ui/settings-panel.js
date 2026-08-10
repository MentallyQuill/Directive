import { createButton, createElement } from './runtime-ui-kit.js';
import { buildCertifiedSettingsView } from './view-models/certified-settings-view.mjs';

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

function createField(label, control, detail = '') {
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
  field.append(copy, control);
  return field;
}

function createSelect(value, options) {
  const select = createElement('select', 'settings-control');
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

function createNumber(value, { min, max, step }) {
  const input = createElement('input', 'settings-control');
  input.type = 'number'; input.value = String(value); input.min = String(min); input.max = String(max); input.step = String(step);
  return input;
}

function appendProviderCard(container, kind, configuration, actions) {
  const settings = configuration.settings?.[kind] || {};
  const status = configuration.status?.[kind] || {};
  const profiles = configuration.profiles || [];
  const card = createElement('article', 'settings-provider-card');
  const header = createElement('header');
  const copy = createElement('div');
  const kicker = createElement('span');
  kicker.textContent = kind === 'utility' ? 'Fast structured analysis' : 'Story reasoning and narration';
  const title = createElement('h3');
  title.textContent = kind === 'utility' ? 'Utility lane' : 'Reasoning lane';
  copy.append(kicker, title);
  const state = createElement('span', `settings-provider-state${status.ready ? ' is-ready' : ''}`);
  state.textContent = status.ready ? (status.label ? `Ready / ${status.label}` : 'Ready') : (status.label || 'Needs configuration');
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
  const baseUrl = createElement('input', 'settings-control');
  baseUrl.type = 'url'; baseUrl.value = settings.baseUrl || ''; baseUrl.placeholder = 'https://example.com/v1';
  const model = createElement('input', 'settings-control');
  model.type = 'text'; model.value = settings.model || ''; model.placeholder = 'Model ID';
  const apiKey = createElement('input', 'settings-control');
  apiKey.type = 'password'; apiKey.value = ''; apiKey.placeholder = settings.apiKeySet ? 'Session key is set' : 'Session-only API key';

  const grid = createElement('div', 'settings-field-grid');
  const profileField = createField('Connection profile', profile);
  const baseUrlField = createField('Base URL', baseUrl);
  const modelField = createField('Model', model);
  const apiKeyField = createField('API key', apiKey, 'Held only for this browser session.');
  grid.append(
    createField('Provider', provider), profileField, baseUrlField, modelField, apiKeyField,
    createField('Temperature', createNumber(settings.temperature ?? (kind === 'utility' ? .1 : .7), { min: 0, max: 2, step: .1 })),
    createField('Top P', createNumber(settings.topP ?? .95, { min: 0, max: 1, step: .05 })),
    createField('Max tokens', createNumber(settings.maxTokens ?? 8192, { min: 64, max: 131072, step: 64 }))
  );
  const sync = () => {
    profileField.hidden = provider.value !== 'profile';
    baseUrlField.hidden = provider.value !== 'openai_compatible';
    modelField.hidden = provider.value !== 'openai_compatible';
    apiKeyField.hidden = provider.value !== 'openai_compatible';
  };
  provider.addEventListener('change', sync);
  sync();
  card.appendChild(grid);

  const feedback = createElement('span', 'settings-feedback');
  const commands = createElement('div', 'settings-actions');
  commands.append(
    createButton({
      label: 'Save', className: 'settings-command', disabled: typeof actions.updateProviderSettings !== 'function',
      onClick: async () => {
        const controls = grid.children;
        const patch = {
          provider: provider.value, profileId: profile.value, baseUrl: baseUrl.value.trim(), model: model.value.trim(),
          temperature: Number(controls[5]?.children?.[1]?.value ?? settings.temperature ?? 0),
          topP: Number(controls[6]?.children?.[1]?.value ?? settings.topP ?? .95),
          maxTokens: Number(controls[7]?.children?.[1]?.value ?? settings.maxTokens ?? 8192)
        };
        if (apiKey.value) patch.apiKey = apiKey.value;
        await actions.updateProviderSettings({ kind, patch });
        feedback.textContent = 'Saved';
        await actions.refresh?.();
      }
    }),
    createButton({
      label: 'Test', className: 'settings-command settings-command-primary', disabled: typeof actions.testProvider !== 'function',
      onClick: async () => {
        feedback.textContent = 'Testing...';
        const result = await actions.testProvider({ kind });
        feedback.textContent = result?.ok === false ? (result.error?.message || 'Test failed') : 'Provider ready';
      }
    }),
    feedback
  );
  card.appendChild(commands);
  container.appendChild(card);
}

function appendSupport(container, support, actions) {
  const section = createSection('General', 'Save and support', 'Verify the active save or export a compact, privacy-bounded support bundle.');
  const feedback = createElement('span', 'settings-feedback');
  const actionsRow = createElement('div', 'settings-actions');
  actionsRow.append(
    createButton({
      label: 'Verify active save', className: 'settings-command',
      disabled: !support.activeSaveId || typeof actions.verifyActiveSave !== 'function',
      onClick: async () => {
        const result = await actions.verifyActiveSave();
        feedback.textContent = result?.ok === false ? 'Save verification failed' : 'Save verified';
      }
    }),
    createButton({
      label: 'Export support bundle', className: 'settings-command settings-command-primary',
      disabled: typeof actions.exportSupportDiagnostics !== 'function',
      onClick: async () => {
        const result = await actions.exportSupportDiagnostics({ includeStoryTranscript: false });
        if (typeof Blob === 'function' && globalThis.URL?.createObjectURL && result?.jsonText) {
          const url = URL.createObjectURL(new Blob([result.jsonText], { type: 'application/json' }));
          const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.fileName || 'directive-support.json'; anchor.click?.(); URL.revokeObjectURL(url);
        }
        feedback.textContent = 'Support bundle exported';
      }
    }),
    feedback
  );
  section.appendChild(actionsRow);
  container.appendChild(section);
}

function appendPreset(container, preset, actions) {
  const status = preset.status || {};
  const section = createSection('Advanced', 'Directive preset', status.message || 'Keep the bundled SillyTavern preset installed and current.', 'settings-preset');
  section.dataset.directiveSettingsTarget = DIRECTIVE_PRESET_SETTINGS_TARGET;
  section.tabIndex = -1;
  const facts = createElement('div', 'settings-facts');
  for (const [label, value] of [['Status', status.pill || status.state || 'Unknown'], ['Installed', status.installedVersion || 'Unknown'], ['Bundled', status.bundledVersion || 'Latest']]) {
    const row = createElement('div'); const key = createElement('span'); key.textContent = label; const content = createElement('strong'); content.textContent = value; row.append(key, content); facts.appendChild(row);
  }
  const autoCheck = createElement('input'); autoCheck.type = 'checkbox'; autoCheck.checked = preset.autoCheck?.enabled !== false;
  autoCheck.addEventListener('change', async () => { await actions.updateDirectivePresetAutoCheck?.({ enabled: autoCheck.checked }); await actions.refresh?.(); });
  const commands = createElement('div', 'settings-actions');
  commands.append(
    createButton({ label: status.actionLabel || (status.state === 'current' ? 'Reinstall' : 'Install'), className: 'settings-command settings-command-primary', disabled: status.canInstall !== true || typeof actions.installDirectivePreset !== 'function', onClick: async () => { await actions.installDirectivePreset(); await actions.refresh?.(); } }),
    createButton({ label: 'Refresh status', className: 'settings-command', disabled: typeof actions.refreshDirectivePresetStatus !== 'function', onClick: async () => { await actions.refreshDirectivePresetStatus(); await actions.refresh?.(); } })
  );
  section.append(facts, createField('Check for preset updates at startup', autoCheck), commands);
  container.appendChild(section);
}

export function renderSettingsPanel(body, view, actions = {}) {
  const model = buildCertifiedSettingsView(view);
  const general = model.sections.find((section) => section.id === 'general');
  const advanced = model.sections.find((section) => section.id === 'advanced');
  const surface = createElement('div', 'directive-expanded-settings settings-layout');
  const navigation = createElement('aside', 'settings-navigation');
  const heading = createElement('h2'); heading.textContent = 'Settings';
  const generalLabel = createElement('span', 'active'); generalLabel.textContent = 'General';
  const advancedLabel = createElement('span'); advancedLabel.textContent = 'Advanced';
  navigation.append(heading, generalLabel, advancedLabel);
  const content = createElement('div', 'settings-content');
  content.dataset.directiveScrollOwner = 'true';
  appendSupport(content, general.support, actions);
  const providers = createSection('Advanced', 'Model lanes', 'Configure the current V1 utility and reasoning routes.');
  const providerGrid = createElement('div', 'settings-provider-grid');
  appendProviderCard(providerGrid, 'utility', advanced.providerConfiguration, actions);
  appendProviderCard(providerGrid, 'reasoning', advanced.providerConfiguration, actions);
  providers.appendChild(providerGrid);
  content.appendChild(providers);
  appendPreset(content, general.directivePreset, actions);
  surface.append(navigation, content);
  body.appendChild(surface);
  if (presetRequested) queueMicrotask(() => highlightDirectivePresetSettingsCard());
}
