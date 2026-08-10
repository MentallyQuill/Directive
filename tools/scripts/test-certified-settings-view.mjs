import assert from 'node:assert/strict';
import { buildCertifiedSettingsView } from '../../src/ui/view-models/certified-settings-view.mjs';

const view = {
  activeSaveId: 'save.current',
  directivePreset: {
    status: { state: 'current', bundledVersion: '1.0.0', installedVersion: '1.0.0' },
    autoCheck: { enabled: true }
  },
  providerConfiguration: {
    profiles: [{ id: 'profile.utility', label: 'Utility' }],
    settings: { utility: { provider: 'profile', profileId: 'profile.utility' }, reasoning: { provider: 'st' } },
    status: { utility: { ready: true }, reasoning: { ready: true } }
  },
  legacy: { tutorial: true, diagnostics: true }
};

assert.deepEqual(buildCertifiedSettingsView(view), {
  selectedSectionId: 'general',
  sections: [
    {
      id: 'general',
      label: 'General',
      directivePreset: view.directivePreset,
      support: { activeSaveId: 'save.current' }
    },
    {
      id: 'advanced',
      label: 'Advanced',
      providerConfiguration: view.providerConfiguration
    }
  ]
});
assert.equal(JSON.stringify(buildCertifiedSettingsView(view)).includes('tutorial'), false);

console.log('PASS certified Settings view');
