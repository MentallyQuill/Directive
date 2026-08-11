import assert from 'node:assert/strict';

import {
  DEFAULT_DIRECTIVE_PROVIDER_SETTINGS,
  createSillyTavernProviderSettingsStore,
  normalizeDirectiveProviderSettings,
  validateDirectiveProviderSettings
} from '../../src/providers/directive-provider-settings.mjs';
import {
  directiveProviderConfigFingerprint,
  resolveDirectiveGenerationPolicy
} from '../../src/providers/generation-policy.mjs';

const expectedUtility = {
  provider: 'st',
  profileId: '',
  presetMode: 'isolated',
  instructMode: 'auto',
  samplerMode: 'profile',
  structuredOutputMode: 'auto',
  temperature: 0.1,
  topP: 0.95,
  maxTokens: 8192,
  certification: { status: 'not-run' }
};

assert.deepEqual(DEFAULT_DIRECTIVE_PROVIDER_SETTINGS.utility, expectedUtility);
assert.deepEqual(DEFAULT_DIRECTIVE_PROVIDER_SETTINGS.reasoning, {
  ...expectedUtility,
  temperature: 0.4
});

const normalized = normalizeDirectiveProviderSettings({
  utility: {
    provider: 'openai_compatible',
    profileId: 'obsolete-profile',
    baseUrl: 'https://private.example/v1',
    model: 'private-model',
    apiKey: 'NEVER_PERSIST',
    apiKeySet: true,
    presetMode: 'bad-value',
    instructMode: 'on',
    samplerMode: 'directive',
    structuredOutputMode: 'prompt-json',
    temperature: 8,
    topP: -2,
    maxTokens: 12
  },
  reasoning: {
    provider: 'profile',
    profileId: 'reasoner.local',
    presetMode: 'full-profile',
    instructMode: 'off',
    samplerMode: 'profile',
    structuredOutputMode: 'native-schema',
    certification: {
      status: 'passed',
      configHash: 'hash-1',
      structuredOutput: 'native-schema',
      testedAt: '2026-08-10T12:00:00.000Z'
    }
  }
});

assert.deepEqual(normalized.utility, {
  ...expectedUtility,
  instructMode: 'on',
  samplerMode: 'directive',
  structuredOutputMode: 'prompt-json',
  temperature: 2,
  topP: 0,
  maxTokens: 64
});
assert.equal('baseUrl' in normalized.utility, false);
assert.equal('model' in normalized.utility, false);
assert.equal('apiKey' in normalized.utility, false);
assert.equal('apiKeySet' in normalized.utility, false);
assert.deepEqual(normalized.reasoning, {
  ...expectedUtility,
  provider: 'profile',
  profileId: 'reasoner.local',
  presetMode: 'full-profile',
  instructMode: 'off',
  structuredOutputMode: 'native-schema',
  temperature: 0.4,
  certification: {
    status: 'passed',
    configHash: 'hash-1',
    structuredOutput: 'native-schema',
    testedAt: '2026-08-10T12:00:00.000Z'
  }
});

assert.deepEqual(validateDirectiveProviderSettings(normalized, 'utility').diagnostics, []);
assert.deepEqual(validateDirectiveProviderSettings({ reasoning: { provider: 'profile' } }, 'reasoning').diagnostics, [{
  kind: 'reasoning',
  severity: 'error',
  code: 'profile-required',
  message: 'reasoning connection profile is not selected.'
}]);

const policyCases = [
  {
    name: 'isolated chat defaults to Prompt JSON without sampler overrides',
    provider: expectedUtility,
    completionMode: 'chat',
    certifiedNativeSchema: false,
    want: {
      includePreset: false,
      includeInstruct: false,
      samplerMode: 'profile',
      samplerOverrides: null,
      structuredOutputMethod: 'prompt-json'
    }
  },
  {
    name: 'auto instruct enables text completion',
    provider: expectedUtility,
    completionMode: 'text',
    certifiedNativeSchema: false,
    want: {
      includePreset: false,
      includeInstruct: true,
      samplerMode: 'profile',
      samplerOverrides: null,
      structuredOutputMethod: 'prompt-json'
    }
  },
  {
    name: 'all explicit controls resolve literally',
    provider: {
      ...expectedUtility,
      presetMode: 'full-profile',
      instructMode: 'on',
      samplerMode: 'directive',
      structuredOutputMode: 'native-schema',
      temperature: 0.35,
      topP: 0.8
    },
    completionMode: 'chat',
    certifiedNativeSchema: false,
    want: {
      includePreset: true,
      includeInstruct: true,
      samplerMode: 'directive',
      samplerOverrides: { temperature: 0.35, top_p: 0.8 },
      structuredOutputMethod: 'native-schema'
    }
  },
  {
    name: 'auto uses native schema only after exact certification',
    provider: expectedUtility,
    completionMode: 'chat',
    certifiedNativeSchema: true,
    want: {
      includePreset: false,
      includeInstruct: false,
      samplerMode: 'profile',
      samplerOverrides: null,
      structuredOutputMethod: 'native-schema'
    }
  }
];

for (const testCase of policyCases) {
  assert.deepEqual(resolveDirectiveGenerationPolicy(testCase), testCase.want, testCase.name);
}

const fingerprintInput = {
  kind: 'utility',
  provider: expectedUtility,
  identity: 'current:nanogpt:zai-org/glm-5.1',
  completionMode: 'chat'
};
const fingerprint = directiveProviderConfigFingerprint(fingerprintInput);
assert.equal(fingerprint, directiveProviderConfigFingerprint({
  completionMode: 'chat',
  identity: 'current:nanogpt:zai-org/glm-5.1',
  provider: { ...expectedUtility },
  kind: 'utility'
}));
assert.notEqual(fingerprint, directiveProviderConfigFingerprint({
  ...fingerprintInput,
  provider: { ...expectedUtility, topP: 0.8 }
}));
assert.notEqual(fingerprint, directiveProviderConfigFingerprint({
  ...fingerprintInput,
  identity: 'current:nanogpt:another-model'
}));

let saveCalls = 0;
const context = {
  extensionSettings: {
    directive: {
      providers: {
        utility: {
          provider: 'openai_compatible',
          baseUrl: 'https://private.example/v1',
          model: 'private-model',
          apiKeySet: true
        }
      }
    }
  },
  saveSettingsDebounced() { saveCalls += 1; }
};
const store = createSillyTavernProviderSettingsStore({ context });
assert.deepEqual(store.get('utility'), expectedUtility);
assert.equal(typeof store.getApiKey, 'undefined');
assert.equal(typeof store.clearApiKey, 'undefined');
store.update('utility', { provider: 'profile', profileId: 'utility.local' });
assert.equal(store.get('utility').provider, 'profile');
assert.equal(saveCalls, 1);
assert.equal(JSON.stringify(context.extensionSettings).includes('private.example'), false);
assert.equal(JSON.stringify(context.extensionSettings).includes('apiKey'), false);

console.log('PASS Directive provider settings and generation policy');
