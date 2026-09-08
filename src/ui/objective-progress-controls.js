import { bindDirectiveModal } from './modal-lifecycle.js';
import { createElement } from './runtime-ui-kit.js';
import { appendDirectiveModal } from './directive-overlay-root.js';
import { runRuntimeAction } from '../runtime/runtime-actions.js';
import { refreshRuntimeSafely } from '../extension/runtime-mount.js';

function button(label, handler) {
  const control = createElement('button', 'objective-progress-button');
  control.type = 'button';
  control.textContent = label;
  control.addEventListener('click', handler);
  return control;
}

export async function commitObjectiveProgress(payload) {
  const result = await runRuntimeAction('runtime.adjustObjectiveProgress', payload);
  if (result?.ok !== true || result?.status !== 'committed') {
    throw new Error(result?.message || 'Progress could not be saved. Try again.');
  }
  return result;
}

function commandFor(mission, objective, action, extra = {}) {
  return { missionId: mission.id, objectiveId: objective.id, expectedRunId: mission.runId,
    expectedRevision: objective.progressControl.expectedRevision, action, ...extra };
}

function actionRunner(container, status, onCommitted) {
  let pending = false;
  return async (payload) => {
    if (pending) return;
    pending = true;
    const controls = [...container.querySelectorAll('button')];
    controls.forEach(control => { control.disabled = true; });
    container.setAttribute('aria-busy', 'true');
    if (container.getAttribute('role') === 'dialog') container.focus({ preventScroll: true });
    status.textContent = 'Saving progress…';
    try {
      await commitObjectiveProgress(payload);
      status.textContent = 'Progress saved.';
      await onCommitted();
    } catch (error) {
      status.textContent = error.message || 'Progress could not be saved. Try again.';
    } finally {
      pending = false;
      container.setAttribute('aria-busy', 'false');
      controls.forEach(control => { control.disabled = false; });
    }
  };
}

export function showObjectiveProgressDialog({ objective, mission, onCommitted = refreshRuntimeSafely }) {
  const existing = document.querySelector('.objective-progress-dialog');
  if (existing) { existing.focus(); return null; }
  const opener = document.activeElement;
  const overlay = createElement('div', 'objective-progress-overlay');
  const dialog = createElement('section', 'objective-progress-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', `Adjust progress: ${objective.title}`);
  const heading = createElement('h2');
  heading.textContent = 'Adjust progress';
  const title = createElement('p');
  title.textContent = objective.title;
  const note = createElement('p');
  note.textContent = 'Choose the current result. A result you set stays in place until you change it.';
  const actions = createElement('div', 'objective-progress-actions');
  const status = createElement('p', 'objective-progress-feedback');
  status.setAttribute('role', 'status');
  const close = () => { overlay.remove(); release(); };
  const run = actionRunner(dialog, status, async () => {
    close();
    await onCommitted();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    else {
      const row = [...document.querySelectorAll('[data-objective-id]')].find(node => node.dataset.objectiveId === objective.id && node.getClientRects().length);
      row?.querySelector('.objective-progress-button')?.focus({ preventScroll: true });
    }
  });
  actions.append(button('Still underway', () => run(commandFor(mission, objective, 'reopen'))));
  for (const resolution of objective.progressControl.allowedResolutions || []) {
    actions.append(button(resolution.label, () => run(commandFor(mission, objective, 'resolve', { disposition: resolution.disposition }))));
  }
  if (objective.progressControl.mode !== 'automatic') {
    actions.append(button('Resume automatic tracking', () => run(commandFor(mission, objective, 'resume'))));
  }
  actions.append(button('Cancel', close));
  dialog.append(heading, title, note, actions, status);
  dialog.tabIndex = -1;
  overlay.append(dialog);
  appendDirectiveModal(overlay);
  const release = bindDirectiveModal({ overlay, dialog, opener, onDismiss: close, canDismiss: () => dialog.getAttribute('aria-busy') !== 'true' });
  actions.firstElementChild.focus();
  return { overlay, dialog };
}

export function appendObjectiveProgressControls(container, { objective, mission, onCommitted = refreshRuntimeSafely }) {
  const control = objective.progressControl;
  if (!control) return;
  const section = createElement('div', 'objective-progress-controls');
  const mode = createElement('p', 'objective-progress-mode');
  mode.textContent = control.mode === 'player_set' ? 'Set by you' : control.mode === 'confirmation_required' ? 'Completion needs your confirmation.' : '';
  section.append(mode);
  if (control.explanation) {
    const explanation = createElement('details', 'objective-progress-explanation');
    const summary = createElement('summary');
    summary.textContent = 'Why this was marked resolved';
    const text = createElement('p');
    text.textContent = control.explanation;
    explanation.append(summary, text);
    section.append(explanation);
  }
  const actions = createElement('div', 'objective-progress-actions');
  const status = createElement('p', 'objective-progress-feedback');
  status.setAttribute('role', 'status');
  const run = actionRunner(section, status, onCommitted);
  actions.append(button('Adjust progress', () => showObjectiveProgressDialog({ objective, mission, onCommitted })));
  if (control.mode !== 'automatic') actions.append(button('Resume automatic tracking', () => run(commandFor(mission, objective, 'resume'))));
  if (control.proposal) {
    const proposal = createElement('p');
    proposal.textContent = `Suggested result: ${control.proposal.label || 'Resolve objective'}. Your confirmation is needed.`;
    section.append(proposal);
    actions.append(button(`Confirm ${control.proposal.label || 'result'}`, () => run(commandFor(mission, objective, 'acceptProposal', { proposalId: control.proposal.id }))));
    actions.append(button('Keep underway', () => run(commandFor(mission, objective, 'dismissProposal', { proposalId: control.proposal.id }))));
  }
  section.append(actions, status);
  container.append(section);
}
