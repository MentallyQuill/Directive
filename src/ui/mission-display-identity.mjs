function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function recordId(record = {}) {
  return text(record.missionId || record.questId || record.templateId || record.id);
}

function authoredTitle(value, missionId) {
  const title = text(value);
  return title && title !== missionId ? title : '';
}

function records(value) {
  return Array.isArray(value) ? value : [];
}

function humanizeMissionId(missionId) {
  return text(missionId)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function resolveMissionDisplayIdentity({
  missionId = '',
  explicitTitle = '',
  questLedger = null,
  packageData = null,
  missionGraphs = []
} = {}) {
  const id = text(missionId);
  const ledgerRecord = records(questLedger?.instances)
    .find((record) => recordId(record) === id);
  const packageRecord = [
    ...records(packageData?.questTemplates?.templates),
    ...records(packageData?.campaign?.quests),
    ...records(packageData?.quests)
  ].find((record) => recordId(record) === id);
  const graphRecord = records(missionGraphs)
    .find((record) => recordId(record?.manifest || record?.graph?.manifest || record) === id);
  const title = authoredTitle(ledgerRecord?.title, id)
    || authoredTitle(packageRecord?.title, id)
    || authoredTitle(graphRecord?.manifest?.title || graphRecord?.graph?.manifest?.title || graphRecord?.title, id)
    || authoredTitle(explicitTitle, id)
    || humanizeMissionId(id);
  return { id, title, category: 'main' };
}
