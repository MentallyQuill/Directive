import {
  addTooltip,
  appendSectionTitle,
  collectInputByPath,
  createButton,
  createElement,
  createInputField,
  getNestedValue,
  setDataset
} from './runtime-ui-kit.js';
import { createPackageImage, createPlayerPortraitImage } from './directive-media.js';
import {
  normalizeSimulationMode,
  simulationModeDifficultyOptions
} from '../simulation/simulation-mode-policy.mjs';

const PRODUCT_DEFAULT_SIMULATION_MODE = 'Command';

const CREATOR_STEPS = {
  identity: {
    label: 'Identity',
    statusKey: 'identityComplete',
    summary: 'Officer identity and presence',
    tooltip: 'Name, address, species, age band, and visible presence for the player officer.'
  },
  service: {
    label: 'Service',
    statusKey: 'serviceComplete',
    summary: 'Career path and assignment reason',
    tooltip: 'Service history and assignment context used to frame the player officer.'
  },
  personality: {
    label: 'Personality',
    statusKey: 'personalityComplete',
    summary: 'Command traits and flaw',
    tooltip: 'Command tendencies: how the player officer reads, connects, acts, and fails under pressure.'
  },
  review: {
    label: 'Review',
    statusKey: 'readyForCampaignStart',
    summary: 'Dossier and campaign readiness',
    tooltip: 'Final dossier text and campaign-start readiness.'
  }
};
const CREATOR_STEP_IDS = Object.freeze(['identity', 'service', 'personality', 'review']);
const CREATOR_SECTION_FIELD_PATHS = Object.freeze({
  identity: Object.freeze([
    'identity.name',
    'identity.pronounsOrAddress',
    'identity.speciesId',
    'identity.ageBandId',
    'identity.appearance'
  ]),
  service: Object.freeze([
    'service.careerBackgroundId',
    'service.formativeExperienceId',
    'service.assignmentReasonId'
  ]),
  personality: Object.freeze([
    'personality.traits.insight',
    'personality.traits.connection',
    'personality.traits.execution',
    'personality.flawId'
  ]),
  review: Object.freeze([
    'dossier.briefBiography',
    'dossier.publicReputation'
  ])
});
const CREATOR_FIELD_LABELS = Object.freeze({
  'identity.name': 'Name',
  'identity.pronounsOrAddress': 'Pronouns or Address',
  'identity.speciesId': 'Species',
  'identity.ageBandId': 'Age Band',
  'identity.appearance': 'Appearance',
  'service.careerBackgroundId': 'Career Background',
  'service.formativeExperienceId': 'Formative Experience',
  'service.assignmentReasonId': 'Assignment Reason',
  'personality.traits.insight': 'Insight',
  'personality.traits.connection': 'Connection',
  'personality.traits.execution': 'Execution',
  'personality.flawId': 'Flaw',
  'dossier.briefBiography': 'Brief Biography',
  'dossier.publicReputation': 'Public Reputation'
});

function collectCreatorInput(container) {
  return collectInputByPath(container, {
    identity: {},
    service: {},
    personality: {
      traits: {}
    },
    dossier: {},
    settings: {}
  });
}

function createTraitOptions(creator, categoryId) {
  return creator.options?.traitCategories?.find((category) => category.id === categoryId)?.options || [];
}

function formatCreatorStepLabel(stepId, fallback = '') {
  return CREATOR_STEPS[stepId]?.label || fallback || stepId;
}

function activeCreatorStepId(creator) {
  const stepIds = new Set((creator.steps || []).map((step) => step.id));
  const activeStep = creator.activeStep || (creator.steps || []).find((step) => step.active)?.id || 'identity';
  return stepIds.has(activeStep) ? activeStep : 'identity';
}

function creatorStepIds(creator) {
  const ids = (creator.steps || []).map((step) => step.id).filter(Boolean);
  return ids.length ? ids : [...CREATOR_STEP_IDS];
}

function creatorStepIndex(creator, stepId) {
  return creatorStepIds(creator).indexOf(stepId);
}

function nextCreatorStepId(creator, stepId) {
  const ids = creatorStepIds(creator);
  const index = ids.indexOf(stepId);
  return index >= 0 ? ids[index + 1] || null : null;
}

function previousCreatorStepId(creator, stepId) {
  const ids = creatorStepIds(creator);
  const index = ids.indexOf(stepId);
  return index > 0 ? ids[index - 1] || null : null;
}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function sectionHasMeaningfulInput(input, stepId) {
  return (CREATOR_SECTION_FIELD_PATHS[stepId] || []).some((path) => hasText(getNestedValue(input, path)));
}

function inputPathControls(container) {
  return Array.from(container?.querySelectorAll?.('[data-input-path]') || []);
}

function controlForPath(container, path) {
  return inputPathControls(container)
    .find((control) => control.dataset.inputPath === path) || null;
}

function optionTextForValue(control, value) {
  if (!control || String(control.tagName || '').toLowerCase() !== 'select') return '';
  return [...(control.children || [])]
    .find((option) => String(option.value || '') === String(value || ''))?.textContent || '';
}

function displayValueForField(form, path, value) {
  const control = controlForPath(form, path);
  return optionTextForValue(control, value) || String(value || '');
}

function applyCreatorSectionFields(form, fields = {}) {
  for (const [path, value] of Object.entries(fields || {})) {
    const control = controlForPath(form, path);
    if (control) control.value = value || '';
  }
  return collectCreatorInput(form);
}

function normalizeCreatorSectionDraftResponse(response = {}) {
  return response?.assistResult
    || response?.characterCreatorSectionDraft
    || response?.result?.assistResult
    || response?.result?.characterCreatorSectionDraft
    || response;
}

function clearCreatorAssistPreview(section) {
  for (const preview of section.querySelectorAll('.directive-creator-assist-preview')) {
    preview.remove();
  }
}

function showCreatorAssistMessage(section, message, tone = 'neutral') {
  clearCreatorAssistPreview(section);
  const preview = createElement('div', `directive-creator-assist-preview directive-creator-assist-preview-${tone}`);
  preview.setAttribute('role', 'status');
  const copy = createElement('p', 'directive-creator-assist-preview-copy');
  copy.textContent = message;
  preview.appendChild(copy);
  section.appendChild(preview);
  return preview;
}

async function saveAppliedCreatorSection(form, actions, activeStepId, input) {
  await saveCreatorForm(form, actions, {
    activeStep: activeStepId,
    reason: 'sectionDraftApplied',
    input
  });
}

function appendCreatorAssistPreview(section, {
  form,
  actions,
  activeStepId,
  stepId,
  result,
  regenerate
}) {
  clearCreatorAssistPreview(section);
  const fields = result?.fields || {};
  const preview = createElement('div', 'directive-creator-assist-preview directive-lcars-panel');
  preview.dataset.creatorAssistPreview = stepId;

  const header = createElement('div', 'directive-creator-assist-preview-header');
  const title = createElement('strong');
  title.textContent = result?.mode === 'refine' ? 'Suggested Refinement' : 'Suggested Draft';
  const source = createElement('span');
  source.textContent = result?.source === 'provider' ? 'Provider' : 'Local fallback';
  header.append(title, source);

  const list = createElement('dl', 'directive-creator-assist-field-list');
  for (const [path, value] of Object.entries(fields)) {
    const term = createElement('dt');
    term.textContent = CREATOR_FIELD_LABELS[path] || path;
    const description = createElement('dd');
    description.textContent = displayValueForField(form, path, value);
    list.append(term, description);
  }

  const messages = [
    ...(result?.warnings || []),
    ...(result?.notes || [])
  ].filter(Boolean).slice(0, 3);
  const note = createElement('p', 'directive-creator-assist-preview-copy');
  note.textContent = messages.join(' ') || 'Review before applying to this section.';

  const actionsRow = createElement('div', 'directive-creator-assist-preview-actions');
  actionsRow.append(
    createButton({
      label: 'Apply',
      icon: 'fa-solid fa-check',
      className: 'directive-button directive-creator-assist-apply',
      title: 'Apply this section draft',
      onClick: async () => {
        const input = applyCreatorSectionFields(form, fields);
        await saveAppliedCreatorSection(form, actions, activeStepId, input);
        showCreatorAssistMessage(section, 'Draft applied.', 'success');
      }
    }),
    createButton({
      label: 'Regenerate',
      icon: 'fa-solid fa-rotate-right',
      className: 'directive-button directive-creator-assist-regenerate',
      title: 'Generate another section draft',
      onClick: regenerate
    }),
    createButton({
      label: 'Dismiss',
      icon: 'fa-solid fa-xmark',
      className: 'directive-button directive-creator-assist-dismiss',
      title: 'Dismiss this section draft',
      onClick: async () => {
        clearCreatorAssistPreview(section);
      }
    })
  );

  preview.append(header, list, note, actionsRow);
  section.appendChild(preview);
  return preview;
}

async function runCreatorSectionAssist({
  form,
  section,
  stepId,
  activeStepId,
  actions
}) {
  if (typeof actions.generateCreatorSectionDraft !== 'function') return;
  const input = collectCreatorInput(form);
  const empty = !sectionHasMeaningfulInput(input, stepId);
  showCreatorAssistMessage(section, empty ? 'Drafting section...' : 'Drafting from current details...', 'loading');
  try {
    const response = await actions.generateCreatorSectionDraft({
      sectionId: stepId,
      input
    });
    const result = normalizeCreatorSectionDraftResponse(response);
    const fields = result?.fields || {};
    if (!result?.ok || Object.keys(fields).length === 0) {
      showCreatorAssistMessage(section, 'No usable section draft was returned.', 'warning');
      return;
    }
    if (empty) {
      const nextInput = applyCreatorSectionFields(form, fields);
      await saveAppliedCreatorSection(form, actions, activeStepId, nextInput);
      showCreatorAssistMessage(section, 'Draft applied.', 'success');
      return;
    }
    appendCreatorAssistPreview(section, {
      form,
      actions,
      activeStepId,
      stepId,
      result,
      regenerate: async () => runCreatorSectionAssist({
        form,
        section,
        stepId,
        activeStepId,
        actions
      })
    });
  } catch (error) {
    showCreatorAssistMessage(section, error?.message || 'Section drafting failed.', 'warning');
  }
}

function creatorInputStepComplete(input, stepId) {
  const identity = input.identity || {};
  const service = input.service || {};
  const personality = input.personality || {};
  const traits = personality.traits || {};
  const dossier = input.dossier || {};

  if (stepId === 'identity') {
    return hasText(identity.name)
      && hasText(identity.pronounsOrAddress)
      && hasText(identity.speciesId)
      && hasText(identity.ageBandId)
      && hasText(identity.appearance);
  }

  if (stepId === 'service') {
    return hasText(service.careerBackgroundId)
      && hasText(service.formativeExperienceId)
      && hasText(service.assignmentReasonId);
  }

  if (stepId === 'personality') {
    return hasText(traits.insight)
      && hasText(traits.connection)
      && hasText(traits.execution)
      && hasText(personality.flawId);
  }

  if (stepId === 'review') {
    return hasText(dossier.briefBiography)
      && hasText(dossier.publicReputation);
  }

  return true;
}

function ensureCreatorValidationMessage(form) {
  let message = form.querySelector('.directive-creator-validation-message');
  if (!message) {
    message = createElement('p', 'directive-creator-validation-message');
    message.hidden = true;
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    form.appendChild(message);
  }
  return message;
}

function showCreatorValidationMessage(form, stepId) {
  const message = ensureCreatorValidationMessage(form);
  message.hidden = false;
  message.textContent = `Complete ${formatCreatorStepLabel(stepId)} before continuing.`;
  form.dataset.creatorValidation = stepId;
}

function clearCreatorValidationMessage(form) {
  const message = form.querySelector('.directive-creator-validation-message');
  if (message) {
    message.hidden = true;
    message.textContent = '';
  }
  delete form.dataset.creatorValidation;
}

function validateCreatorStep(form, stepId) {
  const input = collectCreatorInput(form);
  if (creatorInputStepComplete(input, stepId)) {
    clearCreatorValidationMessage(form);
    return { ok: true, input };
  }
  showCreatorValidationMessage(form, stepId);
  return { ok: false, input };
}

async function saveCreatorForm(form, actions, {
  activeStep,
  reason = 'manualSave',
  input = null
} = {}) {
  await actions.saveCreatorDraft({
    reason,
    patch: {
      activeStep,
      input: input || collectCreatorInput(form)
    }
  });
}

function createCreatorPortraitTile({
  form,
  creator,
  view,
  actions,
  activeStepId
}) {
  const portrait = getNestedValue(creator.input, 'identity.portrait');
  const supported = view.media?.playerPortraitImportSupported === true
    && typeof actions.importCreatorPortrait === 'function';
  const tile = createElement('section', 'directive-creator-portrait-tile');
  const visual = createPlayerPortraitImage(portrait, {
    wrapperClass: 'directive-creator-player-portrait',
    label: getNestedValue(creator.input, 'identity.name') || 'Player character',
    loading: 'eager'
  });
  const copy = createElement('div', 'directive-creator-portrait-copy');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = 'Player Portrait';
  const title = createElement('strong');
  title.textContent = portrait?.asset?.path ? 'Portrait Linked' : 'No Portrait';
  copy.append(kicker, title);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp';
  fileInput.hidden = true;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0] || null;
    if (!file) return;
    await actions.importCreatorPortrait({
      file,
      activeStep: activeStepId,
      input: collectCreatorInput(form)
    });
    fileInput.value = '';
    await actions.refresh();
  });

  const actionsRow = createElement('div', 'directive-creator-portrait-actions');
  actionsRow.appendChild(createButton({
    label: portrait?.asset?.path ? 'Change' : 'Import',
    icon: 'fa-solid fa-image',
    className: 'directive-button directive-creator-portrait-import',
    title: supported ? 'Import a player character portrait' : 'Portrait import is not available on this host',
    disabled: !supported,
    onClick: async () => {
      fileInput.click?.();
    }
  }));
  if (portrait?.asset?.path) {
    actionsRow.appendChild(createButton({
      label: 'Remove',
      icon: 'fa-solid fa-trash-can',
      className: 'directive-button directive-creator-portrait-remove',
      title: 'Remove this player character portrait',
      disabled: typeof actions.removeCreatorPortrait !== 'function',
      onClick: async () => {
        await actions.removeCreatorPortrait({
          activeStep: activeStepId,
          input: collectCreatorInput(form)
        });
        await actions.refresh();
      }
    }));
  }

  tile.append(visual, copy, actionsRow, fileInput);
  return tile;
}

function createCreatorSection(stepId, creator, activeStepId, {
  form = null,
  actions = {}
} = {}, ...children) {
  const step = CREATOR_STEPS[stepId] || {
    label: formatCreatorStepLabel(stepId),
    summary: ''
  };
  const section = createElement('section', `directive-form-section directive-creator-section${stepId === activeStepId ? ' directive-creator-section-active' : ''}`);
  section.dataset.creatorStep = stepId;
  section.setAttribute('aria-hidden', stepId === activeStepId ? 'false' : 'true');

  const header = createElement('div', 'directive-creator-section-header');
  const title = createElement('h3', 'directive-creator-section-title');
  title.textContent = step.label;
  const summary = createElement('p', 'directive-creator-section-summary');
  summary.textContent = step.summary;
  const copy = createElement('div', 'directive-creator-section-heading-copy');
  copy.append(title, summary);
  header.appendChild(copy);

  const assistAvailable = typeof actions.generateCreatorSectionDraft === 'function';
  const currentInput = creator.input || {};
  const assistMode = sectionHasMeaningfulInput(currentInput, stepId) ? 'refine' : 'create';
  const assistButton = createButton({
    label: '',
    icon: 'fa-solid fa-wand-magic-sparkles',
    className: 'directive-icon-button directive-creator-section-wand',
    title: assistMode === 'refine' ? 'Ask the provider to refine this section from creator inputs only' : 'Draft this section from creator inputs only',
    disabled: !assistAvailable,
    onClick: async () => runCreatorSectionAssist({
      form,
      section,
      stepId,
      activeStepId,
      actions
    })
  });
  assistButton.dataset.creatorSectionWand = stepId;
  assistButton.setAttribute('aria-label', `Draft ${step.label}`);
  header.appendChild(assistButton);

  section.append(header, ...children);
  return section;
}

function renderCreatorStepButtons(container, creator, actions) {
  const steps = createElement('nav', 'directive-step-row directive-creator-step-row');
  steps.setAttribute('aria-label', 'Character Creator steps');
  const activeStepId = activeCreatorStepId(creator);
  for (const step of creator.steps || []) {
    const label = formatCreatorStepLabel(step.id, step.label);
    const active = step.id === activeStepId;
    const stepIndex = creatorStepIndex(creator, step.id);
    const activeIndex = creatorStepIndex(creator, activeStepId);
    const stepState = step.state || (step.complete ? 'complete' : active ? 'active' : 'locked');
    const locked = stepState === 'locked' || step.enabled === false;
    const button = createButton({
      label,
      className: active
        ? `directive-step-button directive-creator-step-button directive-step-button-active directive-creator-step-${stepState}`
        : `directive-step-button directive-creator-step-button directive-creator-step-${stepState}`,
      title: locked ? `${label} is locked until prior steps are complete.` : (CREATOR_STEPS[step.id]?.tooltip || `Save and move to ${label}`),
      disabled: locked,
      onClick: async () => {
        if (step.id === activeStepId) return;
        if (stepIndex > activeIndex) {
          const validation = validateCreatorStep(container, activeStepId);
          if (!validation.ok) return;
          await saveCreatorForm(container, actions, {
            activeStep: step.id,
            input: validation.input
          });
        } else {
          await saveCreatorForm(container, actions, { activeStep: step.id });
        }
        await actions.refresh();
      }
    });
    button.dataset.creatorStepButton = step.id;
    button.dataset.creatorStepState = stepState;
    button.setAttribute('aria-current', active ? 'step' : 'false');
    button.setAttribute('aria-disabled', locked ? 'true' : 'false');
    if (step.complete) {
      button.dataset.complete = 'true';
    }
    const stateLabel = createElement('span', 'directive-creator-step-state');
    stateLabel.textContent = stepState;
    button.appendChild(stateLabel);
    steps.appendChild(button);
  }
  return steps;
}

function creatorAllowedSimulationModes(view) {
  return view.activePackage?.simulationModes?.length
    ? view.activePackage.simulationModes
    : ['Exploration', 'Command'];
}

function creatorDefaultSimulationMode(view, allowedModes) {
  const candidates = [
    view.activePackage?.defaultSimulationMode,
    view.activePackage?.campaign?.defaultSimulationMode,
    view.activePackage?.package?.defaultSimulationMode,
    PRODUCT_DEFAULT_SIMULATION_MODE
  ].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = normalizeSimulationMode(candidate);
    if (allowedModes.includes(normalized)) return normalized;
  }
  return allowedModes[0] || PRODUCT_DEFAULT_SIMULATION_MODE;
}

function createCreatorDifficultySelector({
  allowedModes,
  selectedMode
}) {
  const options = simulationModeDifficultyOptions(allowedModes);
  const modeSelect = document.createElement('select');
  modeSelect.className = 'directive-field-control directive-creator-mode-select directive-creator-mode-select-hidden';
  modeSelect.dataset.inputPath = 'settings.simulationMode';
  modeSelect.setAttribute('aria-hidden', 'true');
  modeSelect.tabIndex = -1;
  for (const option of options) {
    const item = document.createElement('option');
    item.value = option.mode;
    item.textContent = option.label;
    modeSelect.appendChild(item);
  }

  const shell = createElement('section', 'directive-creator-difficulty-field directive-lcars-panel');
  shell.dataset.creatorDifficultyField = 'true';
  const header = createElement('header', 'directive-creator-difficulty-header');
  const copy = createElement('div', 'directive-creator-difficulty-heading-copy');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = 'Campaign Setup';
  const title = createElement('h4', 'directive-creator-difficulty-title');
  title.textContent = 'Campaign Difficulty';
  const lead = createElement('p', 'directive-creator-difficulty-lead');
  lead.textContent = 'Choose how hard future consequences can land in this campaign.';
  copy.append(kicker, title, lead);
  header.appendChild(copy);
  addTooltip(header, 'Campaign-level consequence style. This can be changed later from Campaign Command.');

  const body = createElement('div', 'directive-creator-difficulty-body');
  const optionRail = createElement('div', 'directive-creator-difficulty-options');
  optionRail.setAttribute('role', 'radiogroup');
  optionRail.setAttribute('aria-label', 'Campaign Difficulty');

  const summary = createElement('article', 'directive-creator-difficulty-summary');
  summary.setAttribute('aria-live', 'polite');
  const summaryKicker = createElement('span', 'directive-lcars-kicker');
  summaryKicker.textContent = 'Selected Mode Summary';
  const summaryTitle = createElement('strong', 'directive-creator-difficulty-summary-title');
  const summaryBadge = createElement('span', 'directive-creator-difficulty-summary-badge');
  const summaryCopy = createElement('p', 'directive-creator-difficulty-summary-copy');
  const bestFit = createElement('p', 'directive-creator-difficulty-best-fit');
  const fatalityPolicy = createElement('span', 'directive-creator-difficulty-fatality');
  summary.append(summaryKicker, summaryTitle, summaryBadge, summaryCopy, bestFit, fatalityPolicy);

  const buttons = [];
  const sync = (mode) => {
    const normalized = normalizeSimulationMode(mode);
    const option = options.find((item) => item.mode === normalized) || options[0];
    if (!option) return;
    modeSelect.value = option.mode;
    shell.dataset.creatorDifficultyMode = option.mode;
    for (const button of buttons) {
      const active = button.dataset.creatorDifficultyOption === option.mode;
      button.classList.toggle('directive-creator-difficulty-option-active', active);
      button.setAttribute('aria-checked', active ? 'true' : 'false');
      button.dataset.selected = active ? 'true' : 'false';
    }
    summaryTitle.textContent = option.label;
    summaryBadge.textContent = option.difficultyLabel;
    summaryCopy.textContent = option.summary;
    bestFit.textContent = option.bestFit;
    fatalityPolicy.textContent = option.fatalityPolicy;
  };

  for (const option of options) {
    const button = createElement('button', 'directive-creator-difficulty-option');
    button.type = 'button';
    button.dataset.creatorDifficultyOption = option.mode;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-label', `${option.label}: ${option.difficultyLabel}`);
    const optionLabel = createElement('strong');
    optionLabel.textContent = option.label;
    const optionBadge = createElement('span', 'directive-creator-difficulty-option-badge');
    optionBadge.textContent = option.difficultyLabel;
    const optionPolicy = createElement('span', 'directive-creator-difficulty-option-policy');
    optionPolicy.textContent = option.fatalityPolicy;
    button.append(optionLabel, optionBadge, optionPolicy);
    button.addEventListener('click', () => sync(option.mode));
    optionRail.appendChild(button);
    buttons.push(button);
  }

  modeSelect.addEventListener('change', () => sync(modeSelect.value));
  body.append(optionRail, summary);
  shell.append(header, body, modeSelect);
  sync(selectedMode);
  return { field: shell, modeSelect };
}

export function renderCharacterCreatorPanel(body, view, actions) {
  const creator = view.creator;
  const activeStepId = activeCreatorStepId(creator);
  appendSectionTitle(body, 'Character Creator');

  const form = createElement('form', 'directive-creator-form directive-creator-console directive-lcars-console directive-lcars-panel');
  setDataset(form, 'creatorForm', 'true');
  form.dataset.creatorActiveStep = activeStepId;
  form.addEventListener('submit', (event) => event.preventDefault());

  const role = creator.role?.lockedRole;
  const allowedModes = creatorAllowedSimulationModes(view);
  const savedMode = getNestedValue(creator.input, 'settings.simulationMode');
  const selectedMode = allowedModes.includes(savedMode)
    ? savedMode
    : creatorDefaultSimulationMode(view, allowedModes);
  const { field: difficultyField, modeSelect } = createCreatorDifficultySelector({
    allowedModes,
    selectedMode
  });

  const summary = createElement('section', 'directive-creator-overview directive-lcars-panel');
  const visual = createPackageImage(view.activePackage, {
    kind: 'ship.hero',
    subjectId: view.activePackage?.ship?.id || 'uss-breckenridge',
    variant: 'card'
  }, {
    wrapperClass: 'directive-creator-overview-media',
    label: view.activePackage?.ship?.name || creator.package?.title,
    icon: 'fa-solid fa-shuttle-space',
    loading: 'eager'
  });
  const mediaDeck = createElement('div', 'directive-creator-overview-media-deck');
  mediaDeck.append(visual, createCreatorPortraitTile({
    form,
    creator,
    view,
    actions,
    activeStepId
  }));
  const summaryText = createElement('div', 'directive-creator-overview-copy');
  const summaryKicker = createElement('span', 'directive-lcars-kicker');
  summaryKicker.textContent = 'Starfleet Personnel Command';
  const summaryTitle = createElement('h3', 'directive-card-title');
  summaryTitle.textContent = 'Commissioning File';
  addTooltip(summaryTitle, 'Player officer draft before campaign state exists.');
  const summarySubtitle = createElement('p', 'directive-creator-overview-summary');
  summarySubtitle.textContent = role ? `${role.rank}, ${role.billet}` : 'Package-defined command role';
  const summaryCampaign = createElement('p', 'directive-creator-overview-campaign');
  summaryCampaign.textContent = `${creator.campaign?.title || 'Campaign'} aboard ${view.activePackage?.ship?.name || 'the assigned starship'}`;
  summaryText.append(summaryKicker, summaryTitle, summarySubtitle, summaryCampaign);

  summary.append(mediaDeck, summaryText);
  form.appendChild(summary);

  const progressHeader = createElement('header', 'directive-creator-progress-header');
  const progressKicker = createElement('span', 'directive-lcars-kicker');
  progressKicker.textContent = 'Commissioning Steps';
  const progressSummary = createElement('span');
  progressSummary.textContent = creator.canBeginCampaign ? 'Ready for final review' : 'Complete each personnel section';
  progressHeader.append(progressKicker, progressSummary);
  form.appendChild(progressHeader);
  form.appendChild(renderCreatorStepButtons(form, creator, actions));
  const validationMessage = createElement('p', 'directive-creator-validation-message');
  validationMessage.hidden = true;
  validationMessage.setAttribute('role', 'status');
  validationMessage.setAttribute('aria-live', 'polite');
  form.appendChild(validationMessage);

  const actionRow = createElement('div', 'directive-action-row directive-creator-command-bar directive-lcars-panel');
  const previousStepId = previousCreatorStepId(creator, activeStepId);
  const nextStepId = nextCreatorStepId(creator, activeStepId);
  const reviewStepActive = activeStepId === 'review';
  actionRow.append(
    createButton({
      label: 'Campaign Library',
      icon: 'fa-solid fa-arrow-left',
      className: 'directive-button directive-creator-command-button directive-creator-route-exit-command',
      title: 'Return to Campaign Library',
      onClick: async () => {
        await actions.returnCreatorToCampaignLibrary({
          patch: {
            activeStep: activeStepId,
            input: collectCreatorInput(form)
          }
        });
        await actions.refresh();
      }
    }),
    createButton({
      label: 'Save Draft',
      icon: 'fa-solid fa-floppy-disk',
      className: 'directive-button directive-creator-command-button directive-creator-save-command',
      title: 'Save Character Creator draft',
      onClick: async () => {
        await saveCreatorForm(form, actions, { activeStep: activeStepId });
        await actions.refresh();
      }
    }),
    createButton({
      label: 'Back',
      icon: 'fa-solid fa-arrow-left',
      className: 'directive-button directive-creator-command-button directive-creator-back-command',
      title: previousStepId ? `Save and return to ${formatCreatorStepLabel(previousStepId)}` : 'Already at the first creator step',
      disabled: !previousStepId,
      onClick: async () => {
        await saveCreatorForm(form, actions, { activeStep: previousStepId || activeStepId });
        await actions.refresh();
      }
    }),
    reviewStepActive
      ? createButton({
          label: 'Start Campaign',
          icon: 'fa-solid fa-play',
          className: 'directive-button directive-creator-command-button directive-creator-begin-button',
          title: 'Create the campaign save, bind a chat, and post the opening scene',
          disabled: creator.progress?.reviewReady !== true,
          onClick: async () => {
            const validation = validateCreatorStep(form, 'review');
            if (!validation.ok) return;
            await saveCreatorForm(form, actions, {
              activeStep: 'review',
              input: validation.input
            });
            try {
              await actions.acceptCreatorDraftAndStartCampaign({
                simulationMode: modeSelect.value || 'Command'
              });
              actions.setActiveTab('mission');
              await actions.refresh();
            } catch (error) {
              actions.setActiveTab('campaign');
              await actions.refresh();
              throw error;
            }
          }
        })
      : createButton({
          label: `Next: ${formatCreatorStepLabel(nextStepId)}`,
          icon: 'fa-solid fa-arrow-right',
          className: 'directive-button directive-creator-command-button directive-creator-next-command',
          title: nextStepId ? `Save and continue to ${formatCreatorStepLabel(nextStepId)}` : 'Complete the current creator step',
          disabled: !nextStepId,
          onClick: async () => {
            const validation = validateCreatorStep(form, activeStepId);
            if (!validation.ok) return;
            await saveCreatorForm(form, actions, {
              activeStep: nextStepId || activeStepId,
              input: validation.input
            });
            await actions.refresh();
          }
        }),
    createButton({
      label: 'Discard Character',
      icon: 'fa-solid fa-trash-can',
      className: 'directive-button directive-creator-command-button directive-creator-discard-command',
      title: 'Delete this in-progress Character Creator draft',
      onClick: async () => {
        const confirmed = typeof globalThis.confirm === 'function'
          ? globalThis.confirm('Discard this in-progress character and delete the draft?')
          : true;
        if (!confirmed) return;
        await actions.discardCreatorDraft();
        await actions.refresh();
      }
    })
  );
  form.appendChild(actionRow);

  const identity = createCreatorSection(
    'identity',
    creator,
    activeStepId,
    { form, actions },
    createInputField({ label: 'Name', path: 'identity.name', value: getNestedValue(creator.input, 'identity.name'), tooltip: 'Player officer name shown in campaign records and chat context.' }),
    createInputField({ label: 'Pronouns or Address', path: 'identity.pronounsOrAddress', value: getNestedValue(creator.input, 'identity.pronounsOrAddress'), tooltip: 'How crew should address the player officer in narration.' }),
    createInputField({ label: 'Species', path: 'identity.speciesId', value: getNestedValue(creator.input, 'identity.speciesId'), options: creator.options?.allowedSpecies || [], tooltip: 'Species choice used for player officer identity and context.' }),
    createInputField({ label: 'Age Band', path: 'identity.ageBandId', value: getNestedValue(creator.input, 'identity.ageBandId'), options: creator.options?.ageBands || [], tooltip: 'Broad age range used for characterization, not a precise age.' }),
    createInputField({ label: 'Appearance', path: 'identity.appearance', value: getNestedValue(creator.input, 'identity.appearance'), multiline: true, tooltip: 'Visible description used for dossier and narration context.' })
  );

  const service = createCreatorSection(
    'service',
    creator,
    activeStepId,
    { form, actions },
    createInputField({ label: 'Career Background', path: 'service.careerBackgroundId', value: getNestedValue(creator.input, 'service.careerBackgroundId'), options: creator.options?.careerBackgrounds || [], tooltip: 'Service history that shapes the officer command profile.' }),
    createInputField({ label: 'Formative Experience', path: 'service.formativeExperienceId', value: getNestedValue(creator.input, 'service.formativeExperienceId'), options: creator.options?.formativeExperiences || [], tooltip: 'Past experience that influences how the officer handles pressure.' }),
    createInputField({ label: 'Assignment Reason', path: 'service.assignmentReasonId', value: getNestedValue(creator.input, 'service.assignmentReasonId'), options: creator.options?.assignmentReasons || [], tooltip: 'Why this officer receives the campaign command assignment.' })
  );

  const personality = createCreatorSection(
    'personality',
    creator,
    activeStepId,
    { form, actions },
    createInputField({ label: 'Insight', path: 'personality.traits.insight', value: getNestedValue(creator.input, 'personality.traits.insight'), options: createTraitOptions(creator, 'insight'), tooltip: 'How your officer reads evidence, people, and uncertainty.' }),
    createInputField({ label: 'Connection', path: 'personality.traits.connection', value: getNestedValue(creator.input, 'personality.traits.connection'), options: createTraitOptions(creator, 'connection'), tooltip: 'How your officer builds trust and uses relationships.' }),
    createInputField({ label: 'Execution', path: 'personality.traits.execution', value: getNestedValue(creator.input, 'personality.traits.execution'), options: createTraitOptions(creator, 'execution'), tooltip: 'How your officer turns decisions into action under pressure.' }),
    createInputField({ label: 'Flaw', path: 'personality.flawId', value: getNestedValue(creator.input, 'personality.flawId'), options: creator.options?.flaws?.options || [], tooltip: 'A command tendency that can create pressure or complications.' })
  );

  const review = createCreatorSection(
    'review',
    creator,
    activeStepId,
    { form, actions },
    difficultyField,
    createInputField({ label: 'Brief Biography', path: 'dossier.briefBiography', value: getNestedValue(creator.input, 'dossier.briefBiography'), multiline: true, tooltip: 'Concise player-facing biography for the officer dossier.' }),
    createInputField({ label: 'Public Reputation', path: 'dossier.publicReputation', value: getNestedValue(creator.input, 'dossier.publicReputation'), multiline: true, tooltip: 'How the officer is known publicly before the campaign begins.' })
  );

  form.append(identity, service, personality, review);
  body.appendChild(form);
}
