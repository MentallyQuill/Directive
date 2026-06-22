import { createCampaignPackageSummary } from '../packages/campaign-package-context.mjs';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function playerName(campaignState) {
  return campaignState.player?.name || 'Player';
}

function saveSummary(campaignState) {
  const latestLog = campaignState.commandLog?.entries?.at?.(-1);
  if (latestLog?.summaryInputs?.length > 0) {
    return latestLog.summaryInputs[0];
  }
  return `${playerName(campaignState)} aboard ${campaignState.ship?.name || 'active ship'}.`;
}

function autosaveName(campaignState) {
  const campaignTitle = campaignState.campaign?.title || 'Campaign';
  const stardate = campaignState.campaign?.currentStardate ?? campaignState.campaign?.openingStardate ?? 'unknown';
  return `Autosave - ${campaignTitle} - ${stardate}`;
}

export function deriveDefaultCampaignSaveName(campaignState) {
  const name = playerName(campaignState);
  const campaignTitle = campaignState.campaign?.title || 'Campaign';
  const stardate = campaignState.campaign?.currentStardate ?? campaignState.campaign?.openingStardate ?? 'unknown';
  return `${name} - ${campaignTitle} - ${stardate}`;
}

export function createCampaignSaveMetadata({ campaignState, packageData, savedAt, summary = null }) {
  requireObject(campaignState, 'campaignState');
  const packageSummary = createCampaignPackageSummary(packageData);

  return {
    campaignId: campaignState.campaign?.id,
    campaignTitle: campaignState.campaign?.title,
    packageId: packageSummary.packageId,
    packageTitle: packageSummary.title,
    packageVersion: packageSummary.version,
    shipId: campaignState.ship?.id || packageSummary.ship.id,
    shipName: campaignState.ship?.name || packageSummary.ship.name,
    playerName: playerName(campaignState),
    stardate: campaignState.campaign?.currentStardate,
    activeMissionId: campaignState.mission?.activeMissionId,
    activeMissionType: campaignState.mission?.activeMissionType,
    activePhaseId: campaignState.mission?.activePhaseId,
    simulationMode: campaignState.settings?.simulationMode,
    lastUpdatedAt: savedAt,
    summary: summary || saveSummary(campaignState)
  };
}

export function createCampaignSaveRecord({
  campaignState,
  packageData,
  saveId,
  name = null,
  savedAt,
  slotType = 'manual',
  current = true,
  summary = null
}) {
  requireObject(campaignState, 'campaignState');
  const id = requireNonEmptyString(saveId, 'saveId');
  const timestamp = requireNonEmptyString(savedAt, 'savedAt');
  const metadata = createCampaignSaveMetadata({ campaignState, packageData, savedAt: timestamp, summary });

  return {
    kind: 'directive.campaignSave',
    schemaVersion: 1,
    id,
    revision: 1,
    slotType,
    name: name?.trim() || deriveDefaultCampaignSaveName(campaignState),
    createdAt: timestamp,
    updatedAt: timestamp,
    current: current === true,
    metadata,
    payload: {
      campaignState: cloneJson(campaignState)
    }
  };
}

export function createFirstCampaignSaveRecord({ campaignState, packageData, saveId, savedAt }) {
  return createCampaignSaveRecord({
    campaignState,
    packageData,
    saveId,
    savedAt,
    slotType: 'firstSave'
  });
}

export function createAutosaveCampaignSaveRecord({
  campaignState,
  packageData,
  saveId,
  savedAt,
  summary = null
}) {
  return createCampaignSaveRecord({
    campaignState,
    packageData,
    saveId,
    savedAt,
    slotType: 'autosave',
    name: autosaveName(campaignState),
    current: false,
    summary
  });
}

export function overwriteCampaignSaveRecord(saveRecord, {
  campaignState,
  packageData,
  savedAt,
  summary = null
}) {
  requireObject(saveRecord, 'saveRecord');
  if (saveRecord.kind !== 'directive.campaignSave') {
    throw new Error('saveRecord must be a directive.campaignSave record');
  }

  const timestamp = requireNonEmptyString(savedAt, 'savedAt');
  const next = cloneJson(saveRecord);
  next.revision += 1;
  next.updatedAt = timestamp;
  next.metadata = createCampaignSaveMetadata({ campaignState, packageData, savedAt: timestamp, summary });
  next.payload = {
    campaignState: cloneJson(campaignState)
  };
  return next;
}

export function createCampaignSaveAsRecord(saveRecord, {
  newSaveId,
  name = null,
  savedAt,
  branchFrom = null,
  campaignState = null,
  packageData = null,
  summary = null
}) {
  requireObject(saveRecord, 'saveRecord');
  if (saveRecord.kind !== 'directive.campaignSave') {
    throw new Error('saveRecord must be a directive.campaignSave record');
  }

  const timestamp = requireNonEmptyString(savedAt, 'savedAt');
  const next = cloneJson(saveRecord);
  next.id = requireNonEmptyString(newSaveId, 'newSaveId');
  next.revision = 1;
  next.slotType = 'manual';
  next.name = name?.trim() || `${saveRecord.name} Copy`;
  next.createdAt = timestamp;
  next.updatedAt = timestamp;
  if (campaignState && packageData) {
    next.metadata = createCampaignSaveMetadata({ campaignState, packageData, savedAt: timestamp, summary });
    next.payload = {
      campaignState: cloneJson(campaignState)
    };
  } else {
    next.metadata.lastUpdatedAt = timestamp;
  }
  next.metadata.branch = {
    parentSaveId: saveRecord.id,
    parentSaveName: saveRecord.name,
    divergenceOutcomeId: branchFrom?.divergenceOutcomeId || saveRecord.payload?.campaignState?.turnLedger?.lastCommittedOutcomeId || null,
    branchedAt: timestamp
  };
  return next;
}

export function loadCampaignSaveRecord(saveRecord) {
  requireObject(saveRecord, 'saveRecord');
  if (saveRecord.kind !== 'directive.campaignSave') {
    throw new Error('saveRecord must be a directive.campaignSave record');
  }
  return cloneJson(saveRecord.payload?.campaignState);
}

export function createSaveListEntry(saveRecord) {
  requireObject(saveRecord, 'saveRecord');
  return {
    id: saveRecord.id,
    name: saveRecord.name,
    slotType: saveRecord.slotType,
    revision: saveRecord.revision,
    updatedAt: saveRecord.updatedAt,
    metadata: cloneJson(saveRecord.metadata)
  };
}
