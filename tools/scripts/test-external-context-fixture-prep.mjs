import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  EXTERNAL_CONTEXT_FIXTURE_CHAT_FILE,
  EXTERNAL_CONTEXT_FIXTURE_CHAT_FOLDER,
  EXTERNAL_CONTEXT_FIXTURE_WORLD,
  buildExternalContextFixtureChatMetadata,
  buildExternalContextFixtureBrowserSnapshot,
  prepareSillyTavernExternalContextFixture,
  validateSillyTavernExternalContextFixture
} from './prepare-sillytavern-external-context-fixture.mjs';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'directive-external-context-prep-'));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const root = tempRoot();

assert.throws(
  () => prepareSillyTavernExternalContextFixture({
    dataRoot: root,
    userHandle: 'default-user'
  }),
  /default-user is reserved/
);
assert.throws(
  () => prepareSillyTavernExternalContextFixture({
    dataRoot: root,
    userHandle: 'directive-soak-z'
  }),
  /may only target/
);

const dryRun = prepareSillyTavernExternalContextFixture({
  dataRoot: root,
  userHandle: 'Directive Soak A'
});
assert.equal(dryRun.status, 'planned');
assert.equal(dryRun.mode, 'dry-run');
assert.equal(dryRun.userHandle, 'directive-soak-a');
assert.equal(fs.existsSync(path.join(root, 'directive-soak-a', 'settings.json')), false);

const seededUserRoot = path.join(root, 'directive-soak-a');
fs.mkdirSync(seededUserRoot, { recursive: true });
fs.writeFileSync(path.join(seededUserRoot, 'settings.json'), JSON.stringify({
  extensions: {
    disabledExtensions: ['third-party/VectFox', 'Extension-Summaryception', 'SillyTavern-MemoryBooks', 'unrelated-extension']
  },
  disabledExtensions: ['third-party/VectFox', 'other-root-disabled'],
  extension_settings: {
    disabledExtensions: ['third-party/VectFox', 'Extension-Summaryception', 'extension-settings-unrelated'],
    note: {
      default: 'Contaminating Author Note must be cleared.'
    }
  }
}, null, 2), 'utf8');

const writeRun = prepareSillyTavernExternalContextFixture({
  dataRoot: root,
  userHandle: 'directive-soak-a',
  write: true,
  validate: true
});
assert.equal(writeRun.status, 'pass');
assert.equal(writeRun.mode, 'write');
assert.equal(writeRun.validation.status, 'pass');
assert.equal(writeRun.validation.fixtureDepth.status, 'pass');
assert.deepEqual(writeRun.validation.fixtureDepth.fullFixtureUserHandles, ['directive-soak-a']);
assert.deepEqual(writeRun.validation.fixtureDepth.missingTargets, []);

const userRoot = path.join(root, 'directive-soak-a');
const settings = readJson(path.join(userRoot, 'settings.json'));
assert.equal(settings.extensions.disabledExtensions.includes('VectFox'), false);
assert.equal(settings.extensions.disabledExtensions.includes('third-party/VectFox'), false);
assert.equal(settings.extensions.disabledExtensions.includes('Extension-Summaryception'), false);
assert.equal(settings.extensions.disabledExtensions.includes('SillyTavern-MemoryBooks'), false);
assert.equal(settings.extensions.disabledExtensions.includes('unrelated-extension'), true);
assert.equal(settings.disabledExtensions.includes('third-party/VectFox'), false);
assert.equal(settings.disabledExtensions.includes('other-root-disabled'), true);
assert.equal(settings.extension_settings.disabledExtensions.includes('third-party/VectFox'), false);
assert.equal(settings.extension_settings.disabledExtensions.includes('Extension-Summaryception'), false);
assert.equal(settings.extension_settings.disabledExtensions.includes('extension-settings-unrelated'), true);
assert.equal(settings.extension_settings.note.default, '');
assert.equal(settings.world_info_settings.world_info.globalSelect.includes(EXTERNAL_CONTEXT_FIXTURE_WORLD), true);
assert.equal(settings.extension_settings.STMemoryBooks.moduleSettings.enabled, true);
assert.equal(settings.extension_settings.STMemoryBooks.ranges.length, 1);
assert.equal(settings.extension_settings.STMemoryBooks.moduleSettings.ranges.length, 1);
assert.equal(settings.extension_settings.summaryception.enabled, true);
assert.equal(settings.extension_settings.summaryception.staleness.status, 'observed');
assert.equal(settings.extension_settings.vectfox.enabled, true);
assert.equal(settings.extension_settings.vectfox.vector_backend, 'fixture-local');

const world = readJson(path.join(userRoot, 'worlds', `${EXTERNAL_CONTEXT_FIXTURE_WORLD}.json`));
assert.equal(Object.values(world.entries).some((entry) => entry.comment === 'directive-fixture-native-wi'), true);
assert.equal(Object.values(world.entries).some((entry) => entry.stmemorybooks === true), true);

const chatPath = path.join(userRoot, 'chats', EXTERNAL_CONTEXT_FIXTURE_CHAT_FOLDER, EXTERNAL_CONTEXT_FIXTURE_CHAT_FILE);
const chatLines = fs.readFileSync(chatPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
assert.equal(chatLines.length, 5);
assert.equal(chatLines[0].chat_metadata.note_prompt, '');
assert.equal(chatLines[0].chat_metadata.world_info, EXTERNAL_CONTEXT_FIXTURE_WORLD);
assert.equal(chatLines[0].chat_metadata.STMemoryBooks.entryCount, 1);
assert.equal(chatLines[0].chat_metadata.summaryception.ghostedIndices.length, 1);
assert.equal(chatLines[2].extra.sc_ghosted, true);
assert.equal(chatLines[3].extra.stmb_hidden, true);
assert.equal(chatLines[3].extra.memoryBooks.hidden, true);
assert.equal(chatLines[4].extra.vectfox_prompt_ghosted, true);
assert.equal(chatLines[4].extra.vectfox.promptGhosted, true);

const validationOnly = validateSillyTavernExternalContextFixture({
  dataRoot: root,
  userHandle: 'directive-soak-a'
});
assert.equal(validationOnly.status, 'pass');
assert.equal(validationOnly.fixtureDepth.targetCoverage.stLorebooks.richUserCount, 1);
assert.equal(validationOnly.fixtureDepth.targetCoverage.memoryBooks.richUserCount, 1);
assert.equal(validationOnly.fixtureDepth.targetCoverage.summaryception.richUserCount, 1);
assert.equal(validationOnly.fixtureDepth.targetCoverage.vectFox.richUserCount, 1);
assert.equal(validationOnly.compatibility.externalPromptEnvironment.knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(validationOnly.compatibility.externalPromptEnvironment.knownExternalPromptKeys.includes('3_vectfox'), true);
assert.equal(validationOnly.compatibility.externalPromptEnvironment.knownExternalPromptKeys.includes('3_vectfox_summarizer'), true);
assert.equal(validationOnly.compatibility.externalPromptEnvironment.redactionReasons.includes('raw-payload'), true);

const browserSnapshot = buildExternalContextFixtureBrowserSnapshot({ userHandle: 'directive-soak-a' });
assert.equal(browserSnapshot.hostPromptRegistry.promptKeys.includes('worldInfoBefore'), true);
assert.equal(browserSnapshot.hostPromptRegistry.promptKeys.includes('summaryception'), true);
assert.equal(browserSnapshot.vectFox.promptKeys.includes('3_vectfox_summarizer'), true);
assert.equal(browserSnapshot.memoryBooks.rangeDiagnostics.status, 'valid');
assert.equal(browserSnapshot.summaryception.staleness.status, 'observed');
assert.equal(browserSnapshot.vectFox.backendDiagnostics.status, 'local-backend-configured');
assert.equal(writeRun.validation.fixtureDepth.targetCoverage.memoryBooks.handles.includes('directive-soak-a'), true);
assert.equal(writeRun.validation.fixtureDepth.targetCoverage.summaryception.handles.includes('directive-soak-a'), true);
assert.equal(writeRun.validation.fixtureDepth.targetCoverage.vectFox.handles.includes('directive-soak-a'), true);

const fixtureMetadata = buildExternalContextFixtureChatMetadata();
assert.equal(fixtureMetadata.STMemoryBooks.sceneStart, 0);
assert.equal(fixtureMetadata.STMemoryBooks.sceneEnd, 3);
assert.equal(fixtureMetadata.summaryception.staleness.status, 'observed');
assert.equal(JSON.stringify(fixtureMetadata).includes('Raw'), false);

const serialized = JSON.stringify(writeRun);
assert.equal(serialized.includes('api_key'), false);
assert.equal(serialized.includes('qdrant_api_key'), false);
assert.equal(serialized.includes('SECRET'), false);

fs.rmSync(root, { recursive: true, force: true });

console.log('External context fixture prep tests passed.');
