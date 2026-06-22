import {
  appendSectionTitle,
  collectInputByPath,
  createButton,
  createElement,
  createInputField,
  getNestedValue,
  setDataset
} from './runtime-ui-kit.js';
import { createPackageImage } from './directive-media.js';

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
const CREATOR_STEP_IDS = Object.freeze(['identity', 'service', 'personality', 'review']);

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

function createCreatorSection(stepId, creator, activeStepId, ...children) {
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
  header.append(title, summary);

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
      title: locked ? `${label} is locked until prior steps are complete.` : `Save and move to ${label}`,
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

export function renderCharacterCreatorPanel(body, view, actions) {
  const creator = view.creator;
  const activeStepId = activeCreatorStepId(creator);
  appendSectionTitle(body, 'Character Creator');

  const form = createElement('form', 'directive-creator-form directive-creator-console directive-lcars-console directive-lcars-panel');
  setDataset(form, 'creatorForm', 'true');
  form.dataset.creatorActiveStep = activeStepId;
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
  modeSelect.className = 'directive-field-control directive-creator-mode-select';
  for (const mode of allowedModes) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    modeSelect.appendChild(option);
  }
  modeSelect.dataset.inputPath = 'settings.simulationMode';
  modeSelect.value = selectedMode;
  const modeField = createElement('label', 'directive-field directive-creator-mode-field');
  const modeLabel = createElement('span', 'directive-field-label');
  modeLabel.textContent = 'Simulation Mode';
  modeField.append(modeLabel, modeSelect);

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
  const summaryText = createElement('div', 'directive-creator-overview-copy');
  const summaryKicker = createElement('span', 'directive-lcars-kicker');
  summaryKicker.textContent = 'Starfleet Personnel Command';
  const summaryTitle = createElement('h3', 'directive-card-title');
  summaryTitle.textContent = 'Commissioning File';
  const summarySubtitle = createElement('p', 'directive-creator-overview-summary');
  summarySubtitle.textContent = role ? `${role.rank}, ${role.billet}` : 'Package-defined command role';
  const summaryCampaign = createElement('p', 'directive-creator-overview-campaign');
  summaryCampaign.textContent = `${creator.campaign?.title || 'Campaign'} aboard ${view.activePackage?.ship?.name || 'the assigned starship'}`;
  summaryText.append(summaryKicker, summaryTitle, summarySubtitle, summaryCampaign);

  summary.append(visual, summaryText);
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
            await actions.acceptCreatorDraftAndStartCampaign({
              simulationMode: modeSelect.value || 'Command'
            });
            actions.setActiveTab('mission');
            await actions.refresh();
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
    modeField,
    createInputField({ label: 'Brief Biography', path: 'dossier.briefBiography', value: getNestedValue(creator.input, 'dossier.briefBiography'), multiline: true }),
    createInputField({ label: 'Public Reputation', path: 'dossier.publicReputation', value: getNestedValue(creator.input, 'dossier.publicReputation'), multiline: true })
  );

  form.append(identity, service, personality, review);
  body.appendChild(form);
}
