const clone = (value) => value === undefined
  ? undefined
  : JSON.parse(JSON.stringify(value));

export function buildCertifiedSettingsView(view = {}) {
  return {
    selectedSectionId: 'general',
    sections: [
      {
        id: 'general',
        label: 'General',
        directivePreset: clone(view.directivePreset || {}),
        support: { activeSaveId: view.activeSaveId || null }
      },
      {
        id: 'advanced',
        label: 'Advanced',
        providerConfiguration: clone(view.providerConfiguration || {})
      }
    ]
  };
}
