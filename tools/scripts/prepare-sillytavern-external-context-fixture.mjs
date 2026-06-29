import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_SILLYTAVERN_DATA_ROOT,
  buildExternalContextBrowserProbe,
  ensureDirectory,
  errorSummary,
  inspectSillyTavernExternalContextCompatibility,
  readJsonFile,
  sha256Text,
  writeJsonFile,
  writeTextFile
} from './lib/sillytavern-live-harness.mjs';

export const EXTERNAL_CONTEXT_FIXTURE_WORLD = 'Directive External Context Fixture';
export const EXTERNAL_CONTEXT_FIXTURE_CHAT_FOLDER = 'Directive - Ashes of Peace';
export const EXTERNAL_CONTEXT_FIXTURE_CHAT_FILE = 'Directive - Ashes - external-context-fixture.jsonl';
export const EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS = Object.freeze([
  'directive-soak-a',
  'directive-soak-b',
  'directive-soak-c',
  'directive-soak-d',
  'directive-soak-e'
]);

function usage() {
  return `Prepare a rich SillyTavern external-context fixture for one non-human soak user.

Dry run:
  node tools\\scripts\\prepare-sillytavern-external-context-fixture.mjs --data-root F:\\SillyTavern\\SillyTavern\\data --user directive-soak-a

Write and validate:
  node tools\\scripts\\prepare-sillytavern-external-context-fixture.mjs --data-root F:\\SillyTavern\\SillyTavern\\data --user directive-soak-a --write

Validate existing fixture only:
  node tools\\scripts\\prepare-sillytavern-external-context-fixture.mjs --data-root F:\\SillyTavern\\SillyTavern\\data --user directive-soak-a --validate

The tool refuses default-user. It writes only bounded fixture settings, one World Info file,
and one chat fixture with redacted marker data for ST Lorebooks/World Info, Memory Books,
Summaryception, and VectFox compatibility proof. It does not copy extension source code,
store API keys, or import external extension content into Directive state.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    help: false,
    dataRoot: process.env.DIRECTIVE_SILLYTAVERN_DATA_ROOT
      || process.env.SILLYTAVERN_DATA_ROOT
      || process.env.ST_DATA_ROOT
      || DEFAULT_SILLYTAVERN_DATA_ROOT,
    userHandle: process.env.DIRECTIVE_EXTERNAL_CONTEXT_FIXTURE_USER || 'directive-soak-a',
    write: false,
    validate: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--data-root') {
      options.dataRoot = argv[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--data-root=')) {
      options.dataRoot = arg.slice('--data-root='.length);
    } else if (arg === '--user' || arg === '--user-handle') {
      options.userHandle = argv[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--user=')) {
      options.userHandle = arg.slice('--user='.length);
    } else if (arg.startsWith('--user-handle=')) {
      options.userHandle = arg.slice('--user-handle='.length);
    } else if (arg === '--write') {
      options.write = true;
      options.validate = true;
    } else if (arg === '--validate') {
      options.validate = true;
    } else if (arg === '--no-validate') {
      options.validate = false;
    }
  }
  return options;
}

function normalizeUserHandle(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function assertSafeFixtureUser(userHandle) {
  const handle = normalizeUserHandle(userHandle);
  if (handle === 'default-user') {
    throw new Error('default-user is reserved for human testing and cannot receive automated external-context fixtures.');
  }
  if (!EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS.includes(handle)) {
    throw new Error(`External-context fixtures may only target ${EXTERNAL_CONTEXT_FIXTURE_ALLOWED_USERS.join(', ')}; got "${handle || '(empty)'}".`);
  }
  return handle;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return readJsonFile(filePath);
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function filterExternalFixtureDisabledEntries(value = []) {
  return Array.isArray(value)
    ? value.filter((entry) => !/^(?:third-party\/)?(?:vectfox|extension-summaryception|sillytavern-memorybooks|memorybooks)$/i.test(String(entry || '').trim()))
    : [];
}

function fixtureMemoryBookRanges() {
  return [
    {
      source: 'directive-external-context-fixture',
      start: 0,
      end: 2,
      STMB_start: 0,
      STMB_end: 2
    }
  ];
}

export function buildExternalContextFixtureChatMetadata() {
  return {
    world_info: EXTERNAL_CONTEXT_FIXTURE_WORLD,
    STMemoryBooks: {
      entryCount: 1,
      entryHash: sha256Text(`${EXTERNAL_CONTEXT_FIXTURE_WORLD}:stmb-entry`).slice(0, 32),
      sceneStart: 0,
      sceneEnd: 3,
      highestMemoryProcessed: 1,
      manualLorebook: true
    },
    summaryception: {
      summarizedUpTo: 2,
      layers: [[{ hash: sha256Text('directive-summaryception-layer').slice(0, 16) }]],
      layerCount: 1,
      ghostedIndices: [1],
      ghostedCount: 1,
      staleness: {
        status: 'observed',
        chatLength: 5,
        summarizedRangeBeyondChat: false,
        staleAfterMutation: false,
        ghostedSystemVisibleCount: 0,
        summarizedOnlyCount: 0
      }
    },
    vectFox: {
      promptExcludedIndices: [2]
    }
  };
}

function fixtureSettings(existing = {}) {
  const worldInfoSettings = existing.world_info_settings || {};
  const worldInfo = worldInfoSettings.world_info || {};
  const extensionSettings = existing.extension_settings || {};
  const stmbModule = extensionSettings.STMemoryBooks?.moduleSettings || {};
  const ranges = fixtureMemoryBookRanges();
  const fixtureMetadata = buildExternalContextFixtureChatMetadata();
  return {
    ...existing,
    extensions: {
      ...(existing.extensions || {}),
      disabledExtensions: filterExternalFixtureDisabledEntries(existing.extensions?.disabledExtensions)
    },
    disabledExtensions: filterExternalFixtureDisabledEntries(existing.disabledExtensions),
    world_info_settings: {
      ...worldInfoSettings,
      world_info: {
        ...worldInfo,
        globalSelect: uniqueStrings([
          ...(Array.isArray(worldInfo.globalSelect) ? worldInfo.globalSelect : []),
          EXTERNAL_CONTEXT_FIXTURE_WORLD
        ])
      },
      world_info_depth: worldInfoSettings.world_info_depth ?? 4,
      world_info_budget: worldInfoSettings.world_info_budget ?? 100,
      world_info_recursive: worldInfoSettings.world_info_recursive ?? true
    },
    extension_settings: {
      ...extensionSettings,
      note: {
        ...(extensionSettings.note || {}),
        default: ''
      },
      disabledExtensions: filterExternalFixtureDisabledEntries(extensionSettings.disabledExtensions),
      STMemoryBooks: {
        ...(extensionSettings.STMemoryBooks || {}),
        enabled: true,
        entryCount: Math.max(1, Number(extensionSettings.STMemoryBooks?.entryCount || 0)),
        entryHash: sha256Text(`${EXTERNAL_CONTEXT_FIXTURE_WORLD}:stmb-entry`).slice(0, 32),
        ranges,
        entryRanges: ranges,
        moduleSettings: {
          ...stmbModule,
          enabled: true,
          autoSummaryEnabled: true,
          autoCreateEnabled: true,
          unhideBeforeMemory: true,
          sidePromptsEnabled: true,
          ranges,
          entryRanges: ranges,
          summaryEntrySettings: {
            ...(stmbModule.summaryEntrySettings || {}),
            position: 4
          }
        }
      },
      summaryception: {
        ...(extensionSettings.summaryception || {}),
        enabled: true,
        injectionTemplate: '[Directive external-context fixture]\\n{{summary}}',
        connectionSource: extensionSettings.summaryception?.connectionSource || 'profile',
        summarizedUpTo: fixtureMetadata.summaryception.summarizedUpTo,
        layerCount: fixtureMetadata.summaryception.layerCount,
        ghostedCount: fixtureMetadata.summaryception.ghostedCount,
        staleness: fixtureMetadata.summaryception.staleness,
        fixtureDiagnostics: fixtureMetadata.summaryception
      },
      vectfox: {
        ...(extensionSettings.vectfox || {}),
        enabled: true,
        vector_backend: extensionSettings.vectfox?.vector_backend || 'fixture-local',
        enabled_world_info: true,
        summarizer_injection_enabled: true,
        eventbase_ghost_enabled: true,
        position: extensionSettings.vectfox?.position ?? 2,
        depth: extensionSettings.vectfox?.depth ?? 4
      }
    }
  };
}

function fixtureWorld() {
  return {
    entries: {
      100000: {
        uid: 100000,
        key: ['directive-external-context-fixture'],
        keysecondary: [],
        comment: 'directive-fixture-native-wi',
        content: 'Safe fixture marker for external-context readiness.',
        constant: true,
        selective: false,
        disable: false,
        position: 0,
        depth: 3
      },
      100001: {
        uid: 100001,
        key: ['directive-memory-books-fixture'],
        keysecondary: [],
        comment: 'directive-fixture-stmb',
        content: 'Safe fixture marker for Memory Books readiness.',
        constant: true,
        selective: false,
        disable: false,
        position: 4,
        depth: 3,
        STMB_start: 0,
        STMB_end: 2,
        displayIndex: 1,
        stmemorybooks: true,
        extensions: {
          stmemorybooks: true
        }
      }
    }
  };
}

function fixtureChatLines() {
  const fixtureMetadata = buildExternalContextFixtureChatMetadata();
  const metadataLine = {
    name: 'Directive Fixture',
    is_system: true,
    mes: 'Directive external context fixture metadata row.',
    chat_metadata: {
      note_prompt: '',
      ...fixtureMetadata
    }
  };
  const visibleLine = {
    name: 'Sam Vickers',
    is_user: true,
    mes: 'Safe visible fixture row.'
  };
  const summaryceptionLine = {
    name: 'Sam Vickers',
    is_user: true,
    mes: 'Safe Summaryception fixture row.',
    extra: {
      sc_ghosted: true
    }
  };
  const memoryBooksLine = {
    name: 'Directive Fixture',
    is_user: false,
    mes: 'Safe Memory Books fixture row.',
    extra: {
      stmb_hidden: true,
      memoryBooks: {
        hidden: true
      }
    }
  };
  const vectFoxLine = {
    name: 'Sam Vickers',
    is_user: true,
    mes: 'Safe VectFox fixture row.',
    extra: {
      vectfox_prompt_ghosted: true,
      vectfox: {
        promptGhosted: true
      }
    }
  };
  return [metadataLine, visibleLine, summaryceptionLine, memoryBooksLine, vectFoxLine];
}

function plannedPaths(dataRoot, userHandle) {
  const userRoot = path.resolve(dataRoot, userHandle);
  const paths = {
    userRoot,
    settingsPath: path.join(userRoot, 'settings.json'),
    worldPath: path.join(userRoot, 'worlds', `${EXTERNAL_CONTEXT_FIXTURE_WORLD}.json`),
    chatPath: path.join(userRoot, 'chats', EXTERNAL_CONTEXT_FIXTURE_CHAT_FOLDER, EXTERNAL_CONTEXT_FIXTURE_CHAT_FILE)
  };
  for (const [key, value] of Object.entries(paths)) {
    const resolved = path.resolve(value);
    if (key !== 'userRoot' && !resolved.startsWith(`${userRoot}${path.sep}`)) {
      throw new Error(`Resolved fixture path ${resolved} escapes user root ${userRoot}.`);
    }
  }
  return paths;
}

function relativePlan(dataRoot, paths) {
  return Object.fromEntries(Object.entries(paths).map(([key, value]) => [
    key,
    path.relative(path.resolve(dataRoot), value).replace(/\\/g, '/')
  ]));
}

export function buildExternalContextFixtureBrowserSnapshot({ userHandle } = {}) {
  const handle = assertSafeFixtureUser(userHandle || 'directive-soak-a');
  return {
    handle,
    resolvedBrowserUserHandle: handle,
    href: 'http://127.0.0.1:8000/',
    contextReady: true,
    currentChatId: EXTERNAL_CONTEXT_FIXTURE_CHAT_FILE,
    chatLength: 5,
    hostPromptRegistry: {
      available: true,
      promptKeys: [
        'worldInfoBefore',
        'worldInfoAfter',
        'summaryception',
        'st_memory_books',
        '3_vectfox',
        '3_vectfox_eventbase',
        '3_vectfox_summarizer'
      ]
    },
    worldInfo: {
      settingsSeen: true,
      globalSignatureSeen: true,
      enabled: true,
      activeNames: [EXTERNAL_CONTEXT_FIXTURE_WORLD],
      promptPositions: ['before', 'after', 'atDepth']
    },
    memoryBooks: {
      settingsSeen: true,
      globalSignatureSeen: true,
      installed: true,
      enabled: true,
      activeBookName: EXTERNAL_CONTEXT_FIXTURE_WORLD,
      entryCount: 1,
      entryHash: sha256Text(`${EXTERNAL_CONTEXT_FIXTURE_WORLD}:stmb-entry`).slice(0, 32),
      rangeDiagnostics: {
        status: 'valid',
        entryRangeCount: 1,
        chatRangeCount: 1,
        validRangeCount: 2,
        invertedRangeCount: 0,
        outOfBoundsRangeCount: 0,
        staleRangeCount: 0,
        rangeHash: sha256Text(`${EXTERNAL_CONTEXT_FIXTURE_WORLD}:stmb-range`).slice(0, 32)
      },
      riskyModes: {
        autoSummary: true,
        autoCreate: true,
        autoHideUnhide: true,
        sidePrompts: true,
        atDepthUserOrAssistant: true
      }
    },
    summaryception: {
      settingsSeen: true,
      globalSignatureSeen: true,
      installed: true,
      enabled: true,
      staleness: {
        status: 'observed',
        chatLength: 5,
        summarizedRangeBeyondChat: false,
        staleAfterMutation: false,
        ghostedSystemVisibleCount: 0,
        summarizedOnlyCount: 0
      },
      injectionHash: sha256Text('directive-summaryception-layer').slice(0, 32)
    },
    vectFox: {
      settingsSeen: true,
      globalSignatureSeen: true,
      installed: true,
      enabled: true,
      backendType: 'fixture-local',
      semanticWorldInfoEnabled: true,
      summarizerInjectionEnabled: true,
      ghostingEnabled: true,
      generationInterceptorActive: true,
      backendDiagnostics: {
        status: 'local-backend-configured',
        backendType: 'fixture-local',
        unavailable: false,
        externalTimingObserved: true,
        interceptorLatencyMs: 7,
        retrievalLatencyMs: 11,
        timingHash: sha256Text('fixture-local:7:11').slice(0, 32)
      },
      promptKeys: ['3_vectfox', '3_vectfox_eventbase', '3_vectfox_summarizer']
    },
    chatMetadata: {
      worldInfo: EXTERNAL_CONTEXT_FIXTURE_WORLD,
      summaryception: {
        summarizedUpTo: 2,
        layerCount: 1,
        ghostedCount: 2
      }
    },
    messageMarkerCounts: {
      summaryceptionGhosted: 1,
      memoryBooksHidden: 1,
      vectFoxGhosted: 1
    }
  };
}

export function validateSillyTavernExternalContextFixture({
  dataRoot,
  userHandle = 'directive-soak-a',
  capturedAt = '2026-06-28T00:00:00.000Z'
} = {}) {
  const handle = assertSafeFixtureUser(userHandle);
  const compatibility = inspectSillyTavernExternalContextCompatibility({
    users: [handle],
    dataRoot,
    required: true
  });
  const browserSnapshot = buildExternalContextFixtureBrowserSnapshot({ userHandle: handle });
  const probe = buildExternalContextBrowserProbe({
    runId: 'external-context-fixture-validation',
    capturedAt,
    required: true,
    users: [handle],
    diskCompatibility: compatibility,
    browserSnapshots: [browserSnapshot]
  });
  const fixtureDepth = probe.fixtureDepth || null;
  const status = compatibility.status === 'pass' && fixtureDepth?.status === 'pass' ? 'pass' : 'fail';
  return {
    kind: 'directive.sillytavern.externalContextFixtureValidation.v1',
    schemaVersion: 1,
    status,
    userHandle: handle,
    compatibility: {
      status: compatibility.status,
      checkedUserCount: compatibility.checkedUserCount,
      externalPromptEnvironment: compatibility.users?.[0]?.externalPromptEnvironment
        ? {
            hash: compatibility.users[0].externalPromptEnvironment.hash,
            byteLength: compatibility.users[0].externalPromptEnvironment.byteLength,
            knownExternalPromptKeys: compatibility.users[0].externalPromptEnvironment.knownExternalPromptKeys,
            redactionReasons: [...new Set((compatibility.users[0].externalPromptEnvironment.redactions || []).map((entry) => entry.reason))]
          }
        : null
    },
    fixtureDepth: fixtureDepth
      ? {
          status: fixtureDepth.status,
          fullFixtureUserHandles: fixtureDepth.fullFixtureUserHandles,
          missingTargets: fixtureDepth.missingTargets,
          targetCoverage: fixtureDepth.targetCoverage
        }
      : null
  };
}

export function prepareSillyTavernExternalContextFixture({
  dataRoot,
  userHandle = 'directive-soak-a',
  write = false,
  validate = false
} = {}) {
  if (!dataRoot) throw new Error('A SillyTavern data root is required.');
  const resolvedDataRoot = path.resolve(dataRoot);
  const handle = assertSafeFixtureUser(userHandle);
  const paths = plannedPaths(resolvedDataRoot, handle);
  const planned = relativePlan(resolvedDataRoot, paths);
  const existingSettings = readJsonIfExists(paths.settingsPath) || {};
  const nextSettings = fixtureSettings(existingSettings);
  const world = fixtureWorld();
  const chatLines = fixtureChatLines();

  if (write) {
    ensureDirectory(paths.userRoot);
    ensureDirectory(path.dirname(paths.worldPath));
    ensureDirectory(path.dirname(paths.chatPath));
    writeJsonFile(paths.settingsPath, nextSettings);
    writeJsonFile(paths.worldPath, world);
    writeTextFile(paths.chatPath, `${chatLines.map((line) => JSON.stringify(line)).join('\n')}\n`);
  }

  const validation = validate
    ? validateSillyTavernExternalContextFixture({ dataRoot: resolvedDataRoot, userHandle: handle })
    : null;

  return {
    kind: 'directive.sillytavern.externalContextFixturePrep.v1',
    schemaVersion: 1,
    status: validate ? validation.status : write ? 'written' : 'planned',
    mode: write ? 'write' : 'dry-run',
    userHandle: handle,
    dataRoot: resolvedDataRoot,
    planned,
    writes: {
      settings: write,
      world: write,
      chat: write
    },
    validation
  };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = prepareSillyTavernExternalContextFixture({
    dataRoot: options.dataRoot,
    userHandle: options.userHandle,
    write: options.write,
    validate: options.validate
  });
  console.log(JSON.stringify({
    ok: result.status !== 'fail',
    status: result.status,
    mode: result.mode,
    userHandle: result.userHandle,
    dataRoot: result.dataRoot,
    planned: result.planned,
    validation: result.validation
      ? {
          status: result.validation.status,
          fixtureDepth: result.validation.fixtureDepth,
          compatibility: result.validation.compatibility
        }
      : null
  }, null, 2));
  if (result.status === 'fail') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(errorSummary(error));
    process.exit(1);
  });
}
