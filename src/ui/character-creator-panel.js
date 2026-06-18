import {
  appendSectionTitle,
  collectInputByPath,
  createButton,
  createElement,
  createInputField,
  createMetaRow,
  getNestedValue,
  setDataset
} from './runtime-ui-kit.js';

function collectCreatorInput(container) {
  return collectInputByPath(container, {
    identity: {},
    service: {},
    personality: {
      traits: {}
    },
    dossier: {}
  });
}

function createTraitOptions(creator, categoryId) {
  return creator.options?.traitCategories?.find((category) => category.id === categoryId)?.options || [];
}

function renderCreatorStepButtons(container, creator, actions) {
  const steps = createElement('div', 'directive-step-row');
  for (const step of creator.steps || []) {
    const button = createButton({
      label: step.label || step.id,
      className: step.active ? 'directive-step-button directive-step-button-active' : 'directive-step-button',
      title: `Save and switch to ${step.label || step.id}`,
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
    if (step.complete) {
      button.dataset.complete = 'true';
    }
    steps.appendChild(button);
  }
  return steps;
}

export function renderCharacterCreatorPanel(body, view, actions) {
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
  form.appendChild(renderCreatorStepButtons(form, creator, actions));

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

  const actionRow = createElement('div', 'directive-action-row');
  const modeSelect = document.createElement('select');
  modeSelect.className = 'directive-mode-select';
  const allowedModes = view.activePackage?.simulationModes?.length
    ? view.activePackage.simulationModes
    : ['Command', 'Exploration'];
  for (const mode of allowedModes) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    modeSelect.appendChild(option);
  }

  actionRow.append(
    createButton({
      label: 'Save Draft',
      icon: 'fa-solid fa-floppy-disk',
      title: 'Save Character Creator draft',
      onClick: async () => {
        await actions.saveCreatorDraft({
          reason: 'manualSave',
          patch: {
            activeStep: creator.activeStep,
            input: collectCreatorInput(form)
          }
        });
        await actions.refresh();
      }
    }),
    modeSelect,
    createButton({
      label: 'Begin',
      icon: 'fa-solid fa-play',
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
      title: 'Return to Starships',
      onClick: async () => {
        await actions.cancelCreatorDraft();
        await actions.refresh();
      }
    })
  );
  form.appendChild(actionRow);
  body.appendChild(form);
}
