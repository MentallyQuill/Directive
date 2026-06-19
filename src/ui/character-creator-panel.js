import {
  appendSectionTitle,
  collectInputByPath,
  createButton,
  createElement,
  createInputField,
  getNestedValue,
  setDataset
} from './runtime-ui-kit.js';

const CREATOR_STEPS = {
  identity: {
    label: 'Identity',
    statusKey: 'identityComplete',
    summary: 'Officer identity and presence'
  },
  service: {
    label: 'Service',
    statusKey: 'serviceComplete',
    summary: 'Career path and assignment reason'
  },
  personality: {
    label: 'Personality',
    statusKey: 'personalityComplete',
    summary: 'Command traits and flaw'
  },
  review: {
    label: 'Review',
    statusKey: 'readyForCampaignStart',
    summary: 'Dossier and campaign readiness'
  }
};

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

function creatorStepComplete(creator, stepId) {
  const statusKey = CREATOR_STEPS[stepId]?.statusKey;
  return Boolean(statusKey && creator.progress?.[statusKey]);
}

function createCreatorStatusBlock(label, value, tone = 'warning') {
  const block = createElement('div', `directive-lcars-status-block directive-creator-status-block directive-status-${tone}`);
  const labelElement = createElement('span', 'directive-lcars-status-label');
  labelElement.textContent = label;
  const valueElement = createElement('span', 'directive-lcars-status-value');
  valueElement.textContent = value || 'None';
  block.append(labelElement, valueElement);
  return block;
}

function createCreatorSection(stepId, creator, activeStepId, ...children) {
  const step = CREATOR_STEPS[stepId] || {
    label: formatCreatorStepLabel(stepId),
    summary: ''
  };
  const complete = creatorStepComplete(creator, stepId);
  const section = createElement('section', `directive-form-section directive-creator-section${stepId === activeStepId ? ' directive-creator-section-active' : ''}`);
  section.dataset.creatorStep = stepId;
  section.setAttribute('aria-hidden', stepId === activeStepId ? 'false' : 'true');

  const header = createElement('div', 'directive-creator-section-header');
  const title = createElement('h3', 'directive-creator-section-title');
  title.textContent = step.label;
  const summary = createElement('p', 'directive-creator-section-summary');
  summary.textContent = step.summary;
  const state = createElement('span', `directive-creator-section-state directive-status-${complete ? 'success' : 'warning'}`);
  state.textContent = complete ? 'Complete' : stepId === 'review' ? 'Not ready' : 'Incomplete';
  header.append(title, summary, state);

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
    const button = createButton({
      label,
      className: active ? 'directive-step-button directive-creator-step-button directive-step-button-active' : 'directive-step-button directive-creator-step-button',
      title: `Save and switch to ${label}`,
      onClick: async () => {
        await actions.saveCreatorDraft({
          reason: 'manualSave',
          patch: {
            activeStep: step.id,
            input: collectCreatorInput(container)
          }
        });
        await actions.refresh();
      }
    });
    button.dataset.creatorStepButton = step.id;
    button.setAttribute('aria-current', active ? 'step' : 'false');
    if (step.complete) {
      button.dataset.complete = 'true';
    }
    steps.appendChild(button);
  }
  return steps;
}

export function renderCharacterCreatorPanel(body, view, actions) {
  const creator = view.creator;
  const activeStepId = activeCreatorStepId(creator);
  appendSectionTitle(body, 'Character Creator');

  const form = createElement('form', 'directive-creator-form directive-creator-console directive-lcars-console directive-lcars-panel');
  setDataset(form, 'creatorForm', 'true');
  form.addEventListener('submit', (event) => event.preventDefault());

  const role = creator.role?.lockedRole;
  const allowedModes = view.activePackage?.simulationModes?.length
    ? view.activePackage.simulationModes
    : ['Command', 'Exploration'];
  const savedMode = getNestedValue(creator.input, 'settings.simulationMode');
  const selectedMode = allowedModes.includes(savedMode)
    ? savedMode
    : allowedModes.includes('Command')
      ? 'Command'
      : allowedModes[0];
  const modeSelect = document.createElement('select');
  modeSelect.className = 'directive-mode-select directive-creator-mode-select';
  for (const mode of allowedModes) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    modeSelect.appendChild(option);
  }
  modeSelect.dataset.inputPath = 'settings.simulationMode';
  modeSelect.value = selectedMode;

  const summary = createElement('section', 'directive-creator-overview directive-lcars-panel');
  const summaryText = createElement('div', 'directive-creator-overview-copy');
  const summaryTitle = createElement('h3', 'directive-card-title');
  summaryTitle.textContent = 'Commissioning File';
  const summarySubtitle = createElement('p', 'directive-creator-overview-summary');
  summarySubtitle.textContent = role ? `${role.rank}, ${role.billet}` : 'Package-defined command role';
  summaryText.append(summaryTitle, summarySubtitle);

  const statusGrid = createElement('div', 'directive-creator-status-grid');
  statusGrid.append(
    createCreatorStatusBlock('Package', creator.package?.title, 'success'),
    createCreatorStatusBlock('Campaign', creator.campaign?.title, 'success'),
    createCreatorStatusBlock('Draft', `rev ${creator.draft.revision}`, 'warning'),
    createCreatorStatusBlock('Mode', selectedMode, 'warning')
  );
  summary.append(summaryText, statusGrid);
  form.appendChild(summary);

  const progressGrid = createElement('div', 'directive-creator-progress-grid');
  for (const stepId of ['identity', 'service', 'personality', 'review']) {
    const complete = creatorStepComplete(creator, stepId);
    progressGrid.appendChild(createCreatorStatusBlock(
      formatCreatorStepLabel(stepId),
      complete ? 'Complete' : stepId === activeStepId ? 'Active' : 'Open',
      complete ? 'success' : stepId === activeStepId ? 'warning' : 'neutral'
    ));
  }
  form.appendChild(progressGrid);
  form.appendChild(renderCreatorStepButtons(form, creator, actions));

  const actionRow = createElement('div', 'directive-action-row directive-creator-command-bar directive-lcars-panel');
  actionRow.append(
    modeSelect,
    createButton({
      label: 'Save Draft',
      icon: 'fa-solid fa-floppy-disk',
      className: 'directive-button directive-creator-command-button',
      title: 'Save Character Creator draft',
      onClick: async () => {
        await actions.saveCreatorDraft({
          reason: 'manualSave',
          patch: {
            activeStep: activeStepId,
            input: collectCreatorInput(form)
          }
        });
        await actions.refresh();
      }
    }),
    createButton({
      label: 'Begin',
      icon: 'fa-solid fa-play',
      className: 'directive-button directive-creator-command-button directive-creator-begin-button',
      title: 'Begin campaign',
      disabled: !creator.canBeginCampaign,
      onClick: async () => {
        await actions.saveCreatorDraft({
          reason: 'manualSave',
          patch: {
            activeStep: 'review',
            input: collectCreatorInput(form)
          }
        });
        await actions.acceptCreatorDraftAndStartCampaign({
          simulationMode: modeSelect.value || 'Command'
        });
        actions.setActiveTab('mission');
        await actions.refresh();
      }
    }),
    createButton({
      label: 'Back',
      icon: 'fa-solid fa-arrow-left',
      className: 'directive-button directive-creator-command-button',
      title: 'Return to Starships',
      onClick: async () => {
        await actions.cancelCreatorDraft();
        await actions.refresh();
      }
    })
  );
  form.appendChild(actionRow);

  const identity = createCreatorSection(
    'identity',
    creator,
    activeStepId,
    createInputField({ label: 'Name', path: 'identity.name', value: getNestedValue(creator.input, 'identity.name') }),
    createInputField({ label: 'Pronouns or Address', path: 'identity.pronounsOrAddress', value: getNestedValue(creator.input, 'identity.pronounsOrAddress') }),
    createInputField({ label: 'Species', path: 'identity.speciesId', value: getNestedValue(creator.input, 'identity.speciesId'), options: creator.options?.allowedSpecies || [] }),
    createInputField({ label: 'Age Band', path: 'identity.ageBandId', value: getNestedValue(creator.input, 'identity.ageBandId'), options: creator.options?.ageBands || [] }),
    createInputField({ label: 'Appearance', path: 'identity.appearance', value: getNestedValue(creator.input, 'identity.appearance'), multiline: true })
  );

  const service = createCreatorSection(
    'service',
    creator,
    activeStepId,
    createInputField({ label: 'Career Background', path: 'service.careerBackgroundId', value: getNestedValue(creator.input, 'service.careerBackgroundId'), options: creator.options?.careerBackgrounds || [] }),
    createInputField({ label: 'Formative Experience', path: 'service.formativeExperienceId', value: getNestedValue(creator.input, 'service.formativeExperienceId'), options: creator.options?.formativeExperiences || [] }),
    createInputField({ label: 'Assignment Reason', path: 'service.assignmentReasonId', value: getNestedValue(creator.input, 'service.assignmentReasonId'), options: creator.options?.assignmentReasons || [] })
  );

  const personality = createCreatorSection(
    'personality',
    creator,
    activeStepId,
    createInputField({ label: 'Insight', path: 'personality.traits.insight', value: getNestedValue(creator.input, 'personality.traits.insight'), options: createTraitOptions(creator, 'insight') }),
    createInputField({ label: 'Connection', path: 'personality.traits.connection', value: getNestedValue(creator.input, 'personality.traits.connection'), options: createTraitOptions(creator, 'connection') }),
    createInputField({ label: 'Execution', path: 'personality.traits.execution', value: getNestedValue(creator.input, 'personality.traits.execution'), options: createTraitOptions(creator, 'execution') }),
    createInputField({ label: 'Flaw', path: 'personality.flawId', value: getNestedValue(creator.input, 'personality.flawId'), options: creator.options?.flaws?.options || [] })
  );

  const review = createCreatorSection(
    'review',
    creator,
    activeStepId,
    createInputField({ label: 'Brief Biography', path: 'dossier.briefBiography', value: getNestedValue(creator.input, 'dossier.briefBiography'), multiline: true }),
    createInputField({ label: 'Public Reputation', path: 'dossier.publicReputation', value: getNestedValue(creator.input, 'dossier.publicReputation'), multiline: true })
  );

  form.append(identity, service, personality, review);
  body.appendChild(form);
}
