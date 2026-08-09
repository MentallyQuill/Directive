import assert from 'node:assert/strict';

import { buildSupportDiagnosticsExport } from '../../src/runtime/support-diagnostics-export.mjs';

const input = {
  exportedAt: '2026-08-08T12:00:00.000Z',
  extensionVersion: '0.1.0',
  activeCampaignId: 'campaign-1',
  activeSaveId: 'save-1',
  host: { id: 'sillytavern', displayName: 'SillyTavern', capabilities: { chat: { open: true } } },
  storageDiagnostics: { status: 'ok', counts: { saves: 2 }, rawState: { hiddenFact: 'secret' } },
  providerConfiguration: {
    status: { utility: { ready: true, label: 'gpt-5-mini' } },
    settings: { utility: { profileId: 'utility', apiKey: 'secret', baseUrl: 'https://private.example/v1' } }
  },
  tracking: { modelCallCount: 4 },
  messages: [
    { role: 'system', text: 'secret prompt' },
    { role: 'user', text: 'Player text', raw: { secret: true } },
    { role: 'assistant', text: 'Visible reply', swipes: ['unused alternative'] },
    { role: 'tool', text: 'private reasoning' }
  ]
};

const withoutTranscript = buildSupportDiagnosticsExport(input);
assert.equal(withoutTranscript.kind, 'directive.supportDiagnostics');
assert.equal(withoutTranscript.storyTranscript, undefined);
assert.deepEqual(withoutTranscript.providers, { utility: { ready: true, model: 'gpt-5-mini' } });
assert.equal(JSON.stringify(withoutTranscript).includes('secret'), false);
assert.equal(JSON.stringify(withoutTranscript).includes('private.example'), false);

const withTranscript = buildSupportDiagnosticsExport({ ...input, includeStoryTranscript: true });
assert.deepEqual(withTranscript.storyTranscript, [
  { role: 'user', text: 'Player text' },
  { role: 'assistant', text: 'Visible reply' }
]);
assert.equal(JSON.stringify(withTranscript).includes('unused alternative'), false);
assert.equal(JSON.stringify(withTranscript).includes('secret prompt'), false);

console.log('Support diagnostics export contract passed');
