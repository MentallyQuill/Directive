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
  generationRouting: [
    { id: 'narration', label: 'Story narration', providerKind: 'reasoning' },
    { id: 'utilityJson', label: 'Story distillation', providerKind: 'utility' }
  ],
  diagnostics: { transcriptAvailable: false },
  legacy: { tutorial: true, help: true, directEndpoint: true }
};

assert.deepEqual(buildCertifiedSettingsView(view), {
  sections: [
    { id: 'interface', label: 'Interface' },
    { id: 'providers', label: 'Model Lanes', providerConfiguration: view.providerConfiguration },
    { id: 'preset', label: 'Directive Preset', directivePreset: view.directivePreset },
    { id: 'routing', label: 'Model-Call Routing', generationRouting: view.generationRouting },
    {
      id: 'diagnostics',
      label: 'Diagnostics',
      support: { activeSaveId: 'save.current', transcriptAvailable: false }
    }
  ]
});
const serialized = JSON.stringify(buildCertifiedSettingsView(view));
assert.equal(serialized.includes('tutorial'), false);
assert.equal(serialized.includes('directEndpoint'), false);

console.log('PASS certified Settings view');
