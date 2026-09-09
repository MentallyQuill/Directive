export const PROGRESS_STAGES = Object.freeze({
  'reviewing-events': 'Reviewing recent events',
  'directing-story': 'Preparing story direction',
  'reviewing-episode': 'Reviewing the episode',
  'updating-characters': 'Updating character records',
  saving: 'Saving story progress',
  'activating-preset': 'Selecting narration settings',
  'building-context': 'Reading campaign state',
  'assembling-prompt': 'Assembling reply context',
  'installing-prompt': 'Installing reply context',
});
export const PROGRESS_PHASES = Object.freeze({
  'waiting-model': 'Wait for model response',
  'validating-response': 'Validate model response',
});
const LOCAL_LABELS = Object.freeze({
  'activating-preset': 'Select narration settings',
  'building-context': 'Read campaign state',
  'assembling-prompt': 'Assemble reply context',
  'installing-prompt': 'Install reply context',
});
const MODEL_LABELS = Object.freeze({
  'reviewing-events': 'Interpret recent exchange',
  'directing-story': 'Plan story direction',
  'reviewing-episode': 'Review episode',
  'updating-characters': 'Write character records',
});
export function formatProgressDuration(milliseconds) {
  const value = Math.max(0, milliseconds);
  if (value < 1000) return '<1s';
  const seconds = Math.floor(value / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function stateOf(item) { return item.endedAt === undefined ? 'active' : item.outcome || 'ended'; }
function aggregateState(items) {
  const states = items.map(stateOf);
  // An earlier failure remains visible even if a later refresh succeeds.
  if (states.includes('active')) return 'active';
  if (states.includes('failed')) return 'failed';
  if (states.includes('canceled')) return 'canceled';
  return states.every(state => state === 'complete') ? 'complete' : 'ended';
}
function timedRow(id, label, items, now, extra = {}) {
  return {
    id, label, state: aggregateState(items), count: items.reduce((sum, item) => sum + (item.count ?? 1), 0),
    failures: items.reduce((sum, item) => sum + (item.failures ?? Number(item.outcome === 'failed')), 0),
    duration: formatProgressDuration(items.reduce((sum, item) => sum + Math.max(0, (item.endedAt ?? now) - item.startedAt), 0)),
    ...extra,
  };
}

// Keep a fixed-size summary of completed context work evicted from raw history.
// Synthetic timing stores summed observed duration, never an estimated interval.
export function retainCompletedContextProgress(archive, item) {
  if (!Object.hasOwn(LOCAL_LABELS, item.stage) || item.endedAt === undefined) return;
  const previous = archive.get(item.stage);
  const items = previous ? [previous, item] : [item];
  archive.set(item.stage, {
    stage: item.stage, startedAt: 0,
    endedAt: items.reduce((sum, entry) => sum + Math.max(0, entry.endedAt - entry.startedAt), 0),
    count: items.reduce((sum, entry) => sum + (entry.count ?? 1), 0),
    failures: items.reduce((sum, entry) => sum + (entry.failures ?? Number(entry.outcome === 'failed')), 0),
    outcome: aggregateState(items),
  });
}

// Projection only: ownership and raw observations remain in the indicator.
export function createProgressMenuRows(history, now = performance.now()) {
  const rows = [];
  const contextItems = history.filter(item => Object.hasOwn(LOCAL_LABELS, item.stage));
  let contextAdded = false;
  for (const item of history) {
    if (Object.hasOwn(LOCAL_LABELS, item.stage)) {
      if (contextAdded) continue;
      contextAdded = true;
      const stages = [...new Set(contextItems.map(entry => entry.stage))];
      rows.push({
        id: 'turn-context', label: 'Turn context', source: 'Local', state: aggregateState(contextItems),
        failures: contextItems.reduce((sum, entry) => sum + (entry.failures ?? Number(entry.outcome === 'failed')), 0),
        children: stages.map(stage => timedRow(stage, LOCAL_LABELS[stage], contextItems.filter(entry => entry.stage === stage), now)),
      });
    } else if (Object.hasOwn(MODEL_LABELS, item.stage)) {
      rows.push(timedRow(item.operationId, MODEL_LABELS[item.stage], [item], now, {
        source: 'Model', attempt: item.attempt,
        children: (item.phases || []).map((phase, index) => timedRow(
          `${item.operationId}.phase.${index}`, PROGRESS_PHASES[phase.phase], [phase], now, {attempt: phase.attempt}
        )),
      }));
    } else if (item.stage === 'saving') {
      rows.push(timedRow(item.operationId, 'Save story progress', [item], now, {source:'Local'}));
    } else if (!item.stage && ['Waiting for the reply', 'Receiving the reply'].includes(item.title)) {
      rows.push(timedRow(`${item.operationId}.${item.title}`, item.title, [item], now, {source:'Host'}));
    }
  }
  return rows;
}
