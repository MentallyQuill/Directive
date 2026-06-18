export const DIRECTIVE_RUNTIME_PANEL_ID = 'directive-runtime-panel';

export const DIRECTIVE_RUNTIME_TABS = Object.freeze([
  { id: 'starships', label: 'Starships' },
  { id: 'mission', label: 'Mission' },
  { id: 'crew', label: 'Crew' },
  { id: 'ship', label: 'Ship' },
  { id: 'log', label: 'Log' },
  { id: 'settings', label: 'Settings' }
]);

let activeTab = 'starships';
let runtimeApp = null;

function canUseDocument() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function tabLabel(tabId) {
  return DIRECTIVE_RUNTIME_TABS.find((tab) => tab.id === tabId)?.label || 'Starships';
}

function createElement(tagName, className = '') {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  return element;
}

function createIcon(className) {
  const icon = createElement('i', className);
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function clearElement(element) {
  if (typeof element.replaceChildren === 'function') {
    element.replaceChildren();
    return;
  }
  element.textContent = '';
  if (Array.isArray(element.children)) {
    element.children.length = 0;
  }
}

function setDataset(element, key, value) {
  element.dataset[key] = String(value);
}

function createButton({ label, icon = '', className = 'directive-button', title = '', disabled = false, onClick = null }) {
  const button = createElement('button', className);
  button.type = 'button';
  button.disabled = disabled;
  if (title) button.title = title;
  if (icon) button.append(createIcon(icon));
  const text = createElement('span');
  text.textContent = label;
  button.append(text);
  if (typeof onClick === 'function') {
    button.addEventListener('click', async (event) => {
      event?.preventDefault?.();
      button.disabled = true;
      try {
        await onClick(event);
      } finally {
        button.disabled = disabled;
      }
    });
  }
  return button;
}

function createPanel() {
  const panel = createElement('section', 'directive-runtime-panel');
  panel.id = DIRECTIVE_RUNTIME_PANEL_ID;
  panel.setAttribute('aria-label', 'Directive runtime');

  const header = createElement('header', 'directive-runtime-header');
  const title = createElement('div', 'directive-runtime-title');
  title.append(createIcon('fa-solid fa-compass directive-runtime-title-icon'));
  const titleText = createElement('span');
  titleText.textContent = 'Directive';
  title.append(titleText);

  const closeButton = createElement('button', 'directive-icon-button');
  closeButton.type = 'button';
  closeButton.title = 'Close Directive';
  closeButton.setAttribute('aria-label', 'Close Directive');
  closeButton.append(createIcon('fa-solid fa-xmark'));
  closeButton.addEventListener('click', hideDirectiveRuntimePanel);
  header.append(title, closeButton);

  const tabs = createElement('nav', 'directive-runtime-tabs');
  tabs.setAttribute('aria-label', 'Directive sections');
  for (const tab of DIRECTIVE_RUNTIME_TABS) {
    const button = createElement('button', 'directive-tab-button');
    button.type = 'button';
    button.dataset.tab = tab.id;
    button.textContent = tab.label;
    button.addEventListener('click', async () => {
      activeTab = tab.id;
      await refreshDirectiveRuntimePanel();
    });
    tabs.appendChild(button);
  }

  const body = createElement('main', 'directive-runtime-body');
  body.dataset.directiveRuntimeBody = 'true';

  panel.append(header, tabs, body);
  return panel;
}

function runtimeHost() {
  return document.body || document.documentElement;
}

function ensurePanel() {
  if (!canUseDocument()) {
    return null;
  }
  let panel = document.getElementById(DIRECTIVE_RUNTIME_PANEL_ID);
  if (!panel) {
    panel = createPanel();
    runtimeHost()?.appendChild(panel);
  }
  return panel;
}

async function getRuntimeView() {
  if (!runtimeApp || typeof runtimeApp.getCurrentView !== 'function') {
    return null;
  }
  return runtimeApp.getCurrentView({ tabId: activeTab });
}

function appendEmpty(body, message) {
  const empty = createElement('p', 'directive-runtime-empty');
  empty.textContent = message;
  body.appendChild(empty);
}

function appendSectionTitle(body, label = tabLabel(activeTab)) {
  const heading = createElement('h2', 'directive-runtime-section-title');
  heading.textContent = label;
  body.appendChild(heading);
}

function createMetaRow(label, value) {
  const row = createElement('div', 'directive-meta-row');
  const key = createElement('span', 'directive-meta-label');
  key.textContent = label;
  const content = createElement('span', 'directive-meta-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  row.append(key, content);
  return row;
}

function createOption(option, selectedValue = '') {
  const item = document.createElement('option');
  item.value = option?.id || '';
  item.textContent = option?.label || option?.title || option?.id || '';
  item.selected = String(item.value) === String(selectedValue || '');
  return item;
}

function createInputField({ label, path, value = '', type = 'text', multiline = false, options = null }) {
  const wrapper = createElement('label', 'directive-field');
  const labelText = createElement('span', 'directive-field-label');
  labelText.textContent = label;

  let control;
  if (Array.isArray(options)) {
    control = document.createElement('select');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '';
    placeholder.selected = !value;
    control.appendChild(placeholder);
    for (const option of options) {
      control.appendChild(createOption(option, value));
    }
    control.value = value || '';
  } else if (multiline) {
    control = document.createElement('textarea');
    control.rows = 4;
    control.value = value || '';
  } else {
    control = document.createElement('input');
    control.type = type;
    control.value = value || '';
  }

  control.className = 'directive-field-control';
  control.dataset.inputPath = path;
  wrapper.append(labelText, control);
  return wrapper;
}

function getNestedValue(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

function setNestedValue(target, path, value) {
  const keys = String(path || '').split('.').filter(Boolean);
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
}

function collectCreatorInput(container) {
  const input = {
    identity: {},
    service: {},
    personality: {
      traits: {}
    },
    dossier: {}
  };
  for (const control of container.querySelectorAll('[data-input-path]')) {
    setNestedValue(input, control.dataset.inputPath, control.value || '');
  }
  return input;
}

function createTraitOptions(creator, categoryId) {
  return creator.options?.traitCategories?.find((category) => category.id === categoryId)?.options || [];
}

function renderCreatorStepButtons(container, creator) {
  const steps = createElement('div', 'directive-step-row');
  for (const step of creator.steps || []) {
    const button = createButton({
      label: step.label || step.id,
      className: step.active ? 'directive-step-button directive-step-button-active' : 'directive-step-button',
      title: `Save and switch to ${step.label || step.id}`,
      onClick: async () => {
        await runtimeApp.saveCreatorDraft({
          reason: 'manualSave',
          patch: {
            activeStep: step.id,
            input: collectCreatorInput(container)
          }
        });
        await refreshDirectiveRuntimePanel();
      }
    });
    if (step.complete) {
      button.dataset.complete = 'true';
    }
    steps.appendChild(button);
  }
  return steps;
}

function renderCreatorView(body, view) {
  const creator = view.creator;
  appendSectionTitle(body, 'Character Creator');

  const form = createElement('form', 'directive-creator-form');
  setDataset(form, 'creatorForm', 'true');
  form.addEventListener('submit', (event) => event.preventDefault());

  const role = creator.role?.lockedRole;
  const summary = createElement('div', 'directive-card directive-creator-summary');
  summary.append(
    createMetaRow('Package', creator.package?.title),
    createMetaRow('Campaign', creator.campaign?.title),
    createMetaRow('Role', role ? `${role.rank}, ${role.billet}` : 'Package defined'),
    createMetaRow('Draft', `${creator.draft.id} rev ${creator.draft.revision}`)
  );
  form.appendChild(summary);
  form.appendChild(renderCreatorStepButtons(form, creator));

  const identity = createElement('section', 'directive-form-section');
  identity.append(
    createMetaRow('Identity', creator.progress?.identityComplete ? 'Complete' : 'Incomplete'),
    createInputField({ label: 'Name', path: 'identity.name', value: getNestedValue(creator.input, 'identity.name') }),
    createInputField({ label: 'Pronouns or Address', path: 'identity.pronounsOrAddress', value: getNestedValue(creator.input, 'identity.pronounsOrAddress') }),
    createInputField({ label: 'Species', path: 'identity.speciesId', value: getNestedValue(creator.input, 'identity.speciesId'), options: creator.options?.allowedSpecies || [] }),
    createInputField({ label: 'Age Band', path: 'identity.ageBandId', value: getNestedValue(creator.input, 'identity.ageBandId'), options: creator.options?.ageBands || [] }),
    createInputField({ label: 'Appearance', path: 'identity.appearance', value: getNestedValue(creator.input, 'identity.appearance'), multiline: true })
  );

  const service = createElement('section', 'directive-form-section');
  service.append(
    createMetaRow('Service', creator.progress?.serviceComplete ? 'Complete' : 'Incomplete'),
    createInputField({ label: 'Career Background', path: 'service.careerBackgroundId', value: getNestedValue(creator.input, 'service.careerBackgroundId'), options: creator.options?.careerBackgrounds || [] }),
    createInputField({ label: 'Formative Experience', path: 'service.formativeExperienceId', value: getNestedValue(creator.input, 'service.formativeExperienceId'), options: creator.options?.formativeExperiences || [] }),
    createInputField({ label: 'Assignment Reason', path: 'service.assignmentReasonId', value: getNestedValue(creator.input, 'service.assignmentReasonId'), options: creator.options?.assignmentReasons || [] })
  );

  const personality = createElement('section', 'directive-form-section');
  personality.append(
    createMetaRow('Personality', creator.progress?.personalityComplete ? 'Complete' : 'Incomplete'),
    createInputField({ label: 'Insight', path: 'personality.traits.insight', value: getNestedValue(creator.input, 'personality.traits.insight'), options: createTraitOptions(creator, 'insight') }),
    createInputField({ label: 'Connection', path: 'personality.traits.connection', value: getNestedValue(creator.input, 'personality.traits.connection'), options: createTraitOptions(creator, 'connection') }),
    createInputField({ label: 'Execution', path: 'personality.traits.execution', value: getNestedValue(creator.input, 'personality.traits.execution'), options: createTraitOptions(creator, 'execution') }),
    createInputField({ label: 'Flaw', path: 'personality.flawId', value: getNestedValue(creator.input, 'personality.flawId'), options: creator.options?.flaws?.options || [] })
  );

  const review = createElement('section', 'directive-form-section');
  review.append(
    createMetaRow('Review', creator.progress?.readyForCampaignStart ? 'Ready' : 'Not Ready'),
    createInputField({ label: 'Brief Biography', path: 'dossier.briefBiography', value: getNestedValue(creator.input, 'dossier.briefBiography'), multiline: true }),
    createInputField({ label: 'Public Reputation', path: 'dossier.publicReputation', value: getNestedValue(creator.input, 'dossier.publicReputation'), multiline: true })
  );

  form.append(identity, service, personality, review);

  const actions = createElement('div', 'directive-action-row');
  const modeSelect = document.createElement('select');
  modeSelect.className = 'directive-mode-select';
  for (const mode of ['Command', 'Exploration']) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    modeSelect.appendChild(option);
  }

  actions.append(
    createButton({
      label: 'Save Draft',
      icon: 'fa-solid fa-floppy-disk',
      title: 'Save Character Creator draft',
      onClick: async () => {
        await runtimeApp.saveCreatorDraft({
          reason: 'manualSave',
          patch: {
            activeStep: creator.activeStep,
            input: collectCreatorInput(form)
          }
        });
        await refreshDirectiveRuntimePanel();
      }
    }),
    modeSelect,
    createButton({
      label: 'Begin',
      icon: 'fa-solid fa-play',
      title: 'Begin campaign',
      disabled: !creator.canBeginCampaign,
      onClick: async () => {
        await runtimeApp.saveCreatorDraft({
          reason: 'manualSave',
          patch: {
            activeStep: 'review',
            input: collectCreatorInput(form)
          }
        });
        await runtimeApp.acceptCreatorDraftAndStartCampaign({
          simulationMode: modeSelect.value || 'Command'
        });
        activeTab = 'mission';
        await refreshDirectiveRuntimePanel();
      }
    }),
    createButton({
      label: 'Back',
      icon: 'fa-solid fa-arrow-left',
      title: 'Return to Starships',
      onClick: async () => {
        await runtimeApp.cancelCreatorDraft();
        await refreshDirectiveRuntimePanel();
      }
    })
  );
  form.appendChild(actions);
  body.appendChild(form);
}

function renderStarshipsView(body, view) {
  appendSectionTitle(body, 'Starships');
  const starships = view?.starships;
  if (!starships?.packages?.length) {
    appendEmpty(body, 'No packages loaded.');
    return;
  }

  const list = createElement('div', 'directive-card-list');
  for (const pack of starships.packages) {
    const card = createElement('article', 'directive-card directive-starship-card');
    const title = createElement('h3', 'directive-card-title');
    title.textContent = pack.title;
    const meta = createElement('div', 'directive-card-meta');
    meta.append(
      createMetaRow('Ship', `${pack.ship?.name || 'Unknown'} (${pack.ship?.class || 'Unknown class'})`),
      createMetaRow('Campaign', pack.campaign?.title),
      createMetaRow('Role', pack.playerRole?.label),
      createMetaRow('Drafts', pack.counts?.drafts || 0),
      createMetaRow('Saves', pack.counts?.saves || 0)
    );

    const actions = createElement('div', 'directive-action-row');
    actions.appendChild(createButton({
      label: 'Start Campaign',
      icon: 'fa-solid fa-plus',
      title: 'Start campaign',
      onClick: async () => {
        await runtimeApp.startCreatorDraft({ packageId: pack.packageId });
        await refreshDirectiveRuntimePanel();
      }
    }));
    if (pack.actions?.resumeDraft) {
      actions.appendChild(createButton({
        label: 'Resume Draft',
        icon: 'fa-solid fa-pen-to-square',
        title: 'Resume Character Creator draft',
        onClick: async () => {
          await runtimeApp.resumeCreatorDraft({ draftId: pack.actions.resumeDraft });
          await refreshDirectiveRuntimePanel();
        }
      }));
    }
    if (pack.actions?.loadLatestSave) {
      actions.appendChild(createButton({
        label: 'Load Save',
        icon: 'fa-solid fa-folder-open',
        title: 'Load latest save',
        onClick: async () => {
          await runtimeApp.loadGame({ saveId: pack.actions.loadLatestSave });
          activeTab = 'mission';
          await refreshDirectiveRuntimePanel();
        }
      }));
    }

    card.append(title, meta, actions);
    list.appendChild(card);
  }
  body.appendChild(list);

  if (starships.drafts?.length || starships.saves?.length) {
    const records = createElement('section', 'directive-records');
    if (starships.drafts?.length) {
      const draftTitle = createElement('h3', 'directive-subsection-title');
      draftTitle.textContent = 'Creator Drafts';
      records.appendChild(draftTitle);
      for (const draft of starships.drafts) {
        const row = createElement('div', 'directive-record-row');
        row.append(
          createMetaRow(draft.status === 'accepted' ? 'Accepted' : 'Draft', `${draft.packageTitle} - ${draft.roleLabel}`),
          createButton({
            label: 'Resume',
            icon: 'fa-solid fa-pen-to-square',
            title: 'Resume draft',
            disabled: draft.status === 'accepted',
            onClick: async () => {
              await runtimeApp.resumeCreatorDraft({ draftId: draft.id });
              await refreshDirectiveRuntimePanel();
            }
          })
        );
        records.appendChild(row);
      }
    }

    if (starships.saves?.length) {
      const saveTitle = createElement('h3', 'directive-subsection-title');
      saveTitle.textContent = 'Saves';
      records.appendChild(saveTitle);
      for (const save of starships.saves) {
        const row = createElement('div', 'directive-record-row');
        row.append(
          createMetaRow(save.current ? 'Current Save' : 'Save', save.name),
          createButton({
            label: 'Load',
            icon: 'fa-solid fa-folder-open',
            title: 'Load save',
            onClick: async () => {
              await runtimeApp.loadGame({ saveId: save.id });
              activeTab = 'mission';
              await refreshDirectiveRuntimePanel();
            }
          })
        );
        records.appendChild(row);
      }
    }
    body.appendChild(records);
  }
}

function renderMissionView(body, view) {
  appendSectionTitle(body, 'Mission');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, 'No active campaign.');
    return;
  }

  const card = createElement('article', 'directive-card directive-mission-card');
  card.append(
    createMetaRow('Player', `${state.player?.rank || ''} ${state.player?.name || ''}`.trim()),
    createMetaRow('Ship', state.ship?.name),
    createMetaRow('Campaign', state.campaign?.title),
    createMetaRow('Mission', state.mission?.activeMissionId),
    createMetaRow('Stardate', state.campaign?.currentStardate),
    createMetaRow('Mode', state.settings?.simulationMode)
  );

  const actions = createElement('div', 'directive-action-row');
  actions.append(
    createButton({
      label: 'Save Game',
      icon: 'fa-solid fa-floppy-disk',
      title: 'Save game',
      onClick: async () => {
        await runtimeApp.saveCurrentGame({ summary: 'Manual runtime save.' });
        await refreshDirectiveRuntimePanel();
      }
    }),
    createButton({
      label: 'Save As',
      icon: 'fa-solid fa-copy',
      title: 'Save game as',
      onClick: async () => {
        const name = typeof globalThis.prompt === 'function'
          ? globalThis.prompt('Save name', '')
          : '';
        await runtimeApp.saveCurrentGameAs({ name });
        await refreshDirectiveRuntimePanel();
      }
    })
  );
  card.appendChild(actions);
  body.appendChild(card);
}

function renderPlaceholderView(body, view) {
  appendSectionTitle(body, tabLabel(activeTab));
  if (activeTab === 'crew') {
    appendEmpty(body, view?.campaignState ? 'Crew panel is not wired yet.' : 'No crew state loaded.');
  } else if (activeTab === 'ship') {
    appendEmpty(body, view?.campaignState ? 'Ship panel is not wired yet.' : 'No ship state loaded.');
  } else if (activeTab === 'log') {
    appendEmpty(body, view?.campaignState ? 'Command Log panel is not wired yet.' : 'No command log entries.');
  } else {
    appendEmpty(body, 'No settings loaded.');
  }
}

async function renderBody(panel) {
  const body = panel.querySelector('[data-directive-runtime-body="true"]');
  if (!body) return;
  clearElement(body);

  let view = null;
  try {
    view = await getRuntimeView();
  } catch (error) {
    appendSectionTitle(body);
    appendEmpty(body, error?.message || String(error));
    return;
  }

  if (activeTab === 'starships' && view?.activeScreen === 'creator' && view?.creator) {
    renderCreatorView(body, view);
    return;
  }
  if (activeTab === 'starships') {
    renderStarshipsView(body, view);
    return;
  }
  if (activeTab === 'mission') {
    renderMissionView(body, view);
    return;
  }
  renderPlaceholderView(body, view);
}

function syncTabs(panel) {
  for (const button of panel.querySelectorAll('.directive-tab-button')) {
    const selected = button.dataset.tab === activeTab;
    button.classList.toggle('directive-tab-button-active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
}

export function setDirectiveRuntimeApp(app) {
  runtimeApp = app || null;
}

export async function showDirectiveRuntimePanel() {
  const panel = ensurePanel();
  if (!panel) {
    return { isOpen: false };
  }
  panel.hidden = false;
  panel.classList.add('directive-runtime-panel-open');
  await refreshDirectiveRuntimePanel();
  return { isOpen: true, activeTab };
}

export function hideDirectiveRuntimePanel() {
  const panel = canUseDocument() ? document.getElementById(DIRECTIVE_RUNTIME_PANEL_ID) : null;
  if (!panel) {
    return { isOpen: false };
  }
  panel.hidden = true;
  panel.classList.remove('directive-runtime-panel-open');
  return { isOpen: false, activeTab };
}

export async function refreshDirectiveRuntimePanel() {
  const panel = ensurePanel();
  if (!panel) {
    return { refreshed: false, activeTab };
  }
  syncTabs(panel);
  await renderBody(panel);
  return { refreshed: true, activeTab };
}

export async function setDirectiveRuntimeTab(tabId) {
  const nextTab = String(tabId || '').trim();
  if (!DIRECTIVE_RUNTIME_TABS.some((tab) => tab.id === nextTab)) {
    throw new Error(`Unknown Directive runtime tab "${nextTab}"`);
  }
  activeTab = nextTab;
  return refreshDirectiveRuntimePanel();
}

export const __directiveRuntimeShellTestHooks = Object.freeze({
  reset() {
    activeTab = 'starships';
    runtimeApp = null;
    if (canUseDocument()) {
      document.getElementById(DIRECTIVE_RUNTIME_PANEL_ID)?.remove();
    }
  },
  getActiveTab: () => activeTab
});
