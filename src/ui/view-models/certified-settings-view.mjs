import { normalizeCharacterKnowledgeSettings } from '../../providers/character-knowledge-settings.mjs';
import { normalizeNarrationSettings } from '../../narration/narration-policy.mjs';
const clone = (value) => value === undefined
  ? undefined
  : JSON.parse(JSON.stringify(value));

export function buildCertifiedSettingsView(view = {}) {
  return {
    sections: [
      { id: 'interface', label: 'Interface' },
      { id: 'character-knowledge', label: 'Character knowledge', settings: normalizeCharacterKnowledgeSettings(view.characterKnowledgeSettings) },
      { id: 'narration', label: 'Narration', narrationSettings: normalizeNarrationSettings(view.narrationSettings) },
      {
        id: 'providers',
        label: 'Model Lanes',
        providerConfiguration: clone(view.providerConfiguration || {})
      },
      {
        id: 'preset',
        label: 'Directive Preset',
        directivePreset: clone(view.directivePreset || {})
      },
      {
        id: 'routing',
        label: 'Model-Call Routing',
        generationRouting: clone(view.generationRouting || [])
      },
      {
        id: 'diagnostics',
        label: 'Diagnostics',
        support: {
          activeSaveId: view.activeSaveId || null,
          transcriptAvailable: view.diagnostics?.transcriptAvailable === true,
          storage: clone(view.storageDiagnostics || null),
          characterScene: clone(view.characterKnowledgeDiagnostics || null),
        }
      }
    ]
  };
}
