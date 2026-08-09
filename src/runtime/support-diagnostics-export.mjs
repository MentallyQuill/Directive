function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function publicRole(message = {}) {
  const role = text(message.role || message.authorRole).toLowerCase();
  if (message.isUser === true || role === 'user') return 'user';
  if (message.isAssistant === true || role === 'assistant') return 'assistant';
  return '';
}

function visibleMessageText(message = {}) {
  return text(message.text || message.mes || message.content);
}

function providerSummary(configuration = {}) {
  const result = {};
  for (const kind of ['utility', 'reasoning']) {
    const status = configuration.status?.[kind];
    if (!status || typeof status !== 'object') continue;
    result[kind] = {
      ready: status.ready === true,
      model: text(status.model || status.label) || null
    };
  }
  return result;
}

export function buildSupportDiagnosticsExport({
  exportedAt = new Date().toISOString(),
  extensionVersion = '',
  activeCampaignId = '',
  activeSaveId = '',
  host = {},
  storageDiagnostics = {},
  providerConfiguration = {},
  tracking = {},
  messages = [],
  includeStoryTranscript = false
} = {}) {
  const diagnostics = {
    kind: 'directive.supportDiagnostics',
    schemaVersion: 1,
    exportedAt,
    extension: {
      version: text(extensionVersion) || null
    },
    activeRecord: {
      campaignId: text(activeCampaignId) || null,
      saveId: text(activeSaveId) || null
    },
    host: {
      id: text(host.id) || null,
      displayName: text(host.displayName) || null,
      capabilities: clone(host.capabilities || {})
    },
    storage: {
      status: text(storageDiagnostics.status) || 'unknown',
      summary: text(storageDiagnostics.summary) || null,
      counts: clone(storageDiagnostics.counts || {})
    },
    providers: providerSummary(providerConfiguration),
    tracking: {
      modelCallCount: Number(tracking.modelCallCount || 0),
      latestStatus: text(tracking.latestStatus) || null
    }
  };
  if (includeStoryTranscript) {
    diagnostics.storyTranscript = (Array.isArray(messages) ? messages : [])
      .map((message) => ({ role: publicRole(message), text: visibleMessageText(message) }))
      .filter((message) => message.role && message.text);
  }
  return diagnostics;
}
