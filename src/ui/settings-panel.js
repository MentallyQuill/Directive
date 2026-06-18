import {
  appendEmpty,
  appendSectionTitle,
  createCard,
  createCardTitle,
  createMetaRow,
  joinList
} from './runtime-ui-kit.js';

export function renderSettingsPanel(body, view) {
  appendSectionTitle(body, 'Settings');
  const state = view?.campaignState;
  const packageContext = view?.activePackage;
  if (!state && !packageContext) {
    appendEmpty(body, 'No settings loaded.');
    return;
  }

  const card = createCard('directive-settings-card');
  card.append(
    createCardTitle('Runtime'),
    createMetaRow('Active Package', packageContext?.title || state?.campaign?.packageTitle),
    createMetaRow('Package Version', packageContext?.version || state?.activeStarshipPackage?.packageVersion),
    createMetaRow('Active Save', view?.activeSaveId),
    createMetaRow('Simulation Mode', state?.settings?.simulationMode || 'Not started'),
    createMetaRow('Allowed Modes', joinList(state?.settings?.allowedSimulationModes || packageContext?.simulationModes)),
    createMetaRow('Storage Mode', state?.settings?.storagePointerOnly ? 'Save payload plus package pointer' : 'Package only')
  );
  body.appendChild(card);

  if (state?.commandStyle) {
    const command = state.commandStyle;
    const reserveUsed = Number(command.inspiration?.points || 0) + Number(command.resolve?.points || 0);
    const bearing = createCard('directive-settings-command-card');
    bearing.append(
      createCardTitle(command.systemName || 'Command Bearing'),
      createMetaRow('Inspiration', `${command.inspiration?.rankTitle || 'Unrated'}; Marks ${command.inspiration?.marks ?? 0}; Points ${command.inspiration?.points ?? 0}/${command.inspiration?.pointCap ?? 0}`),
      createMetaRow('Resolve', `${command.resolve?.rankTitle || 'Unrated'}; Marks ${command.resolve?.marks ?? 0}; Points ${command.resolve?.points ?? 0}/${command.resolve?.pointCap ?? 0}`),
      createMetaRow('Shared Reserve', `${reserveUsed}/${command.reserve?.capacity ?? 0}`),
      createMetaRow('Morality Score', command.noMoralityScore ? 'None' : 'Enabled')
    );
    body.appendChild(bearing);
  }

  if (view?.storageDiagnostics) {
    const diagnostics = view.storageDiagnostics;
    const storage = createCard('directive-settings-storage-card');
    storage.append(
      createCardTitle('Storage Diagnostics'),
      createMetaRow('Status', diagnostics.status || 'unknown'),
      createMetaRow('Issues', Array.isArray(diagnostics.issues) ? diagnostics.issues.length : 0),
      createMetaRow('Creator Drafts', diagnostics.counts?.creatorDrafts),
      createMetaRow('Saves', diagnostics.counts?.saves)
    );
    body.appendChild(storage);
  }
}
