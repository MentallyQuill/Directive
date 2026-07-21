function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compact(value = '') {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizedEvidence(value) {
  return compact(value).toLowerCase();
}

function activeMissionId(campaignState = {}, scene = null) {
  return compact(
    scene?.activeMissionId
    || scene?.missionId
    || campaignState?.mission?.activeMissionId
    || campaignState?.mission?.activeMissionGraphId
  );
}

function activePhaseId(campaignState = {}, scene = null) {
  return compact(
    scene?.activePhaseId
    || scene?.phaseId
    || campaignState?.mission?.activePhaseId
    || campaignState?.mission?.phase
  );
}

function missionEvidenceText(campaignState = {}) {
  return [
    campaignState?.mission?.phase,
    campaignState?.mission?.activePhaseId,
    campaignState?.mission?.activeMissionId,
    campaignState?.mission?.activeMissionGraphId,
    ...asArray(campaignState?.mission?.formalObjectives).map((entry) => entry?.text || entry?.summary || entry?.id),
    ...asArray(campaignState?.mission?.objectiveStates).map((entry) => entry?.summary || entry?.text || entry?.id)
  ].map(compact).filter(Boolean).join(' ');
}

export function isAshesOfPeaceCampaign({ campaignState = {}, packageData = null } = {}) {
  const candidates = [
    packageData?.manifest?.id,
    packageData?.id,
    campaignState?.packageId,
    campaignState?.runtimePackageId,
    campaignState?.campaign?.templateCampaignId,
    campaignState?.campaign?.packageId,
    campaignState?.campaign?.packageTitle,
    campaignState?.mission?.activeMissionGraphId,
    campaignState?.mission?.activeMissionGraphPath
  ].map(normalizedEvidence).filter(Boolean);
  return candidates.some((value) => (
    value === 'directive:campaign-package:breckenridge-ashes-of-peace'
    || value === 'ashes-of-peace'
    || value.includes('breckenridge-ashes-of-peace')
    || value.includes('ashes-of-peace')
  ));
}

export function ashesHesperusGuardrailApplies({
  campaignState = {},
  packageData = null,
  scene = null,
  playerText = ''
} = {}) {
  if (!isAshesOfPeaceCampaign({ campaignState, packageData })) return false;
  if (activeMissionId(campaignState, scene) !== 'prelude-a-ship-underway') return false;
  const phaseId = activePhaseId(campaignState, scene);
  if (phaseId === 'hesperus-diversion' || phaseId === 'hesperus-aftermath') return true;
  return /\bhesperus\b/i.test(`${compact(playerText)} ${missionEvidenceText(campaignState)}`);
}

export function ashesHesperusGuardrailLines() {
  return [
    'Keep Hesperus focused on rescue, repair limits, passenger safety, and accountability.',
    'Treat theft, piracy, sabotage, or wider plot explanations as unconfirmed hypotheses unless visible evidence has established them.',
    'Do not escalate Hesperus into a new conspiracy, combat encounter, or unrelated anomaly.',
    'If evidence is incomplete, let officers frame uncertainty and next safe checks rather than declaring a hidden cause.'
  ];
}

export function reviewAshesHesperusGuardrailText({
  text = '',
  campaignState = {},
  packageData = null,
  scene = null,
  playerText = ''
} = {}) {
  if (!ashesHesperusGuardrailApplies({
    campaignState,
    packageData,
    scene,
    playerText: playerText || text
  })) return [];
  const normalized = compact(text);
  const marksSpeculation = /\b(?:maybe|possibly|could|might|hypothesis|unconfirmed|not\s+there\s+yet|one\s+possibility)\b/i.test(normalized);
  const assertsPiracy = /\b(?:pirates?|raiders?)\b.{0,120}\b(?:took|stole|hit|robbed|attacked|forced|ambushed)\b/i.test(normalized)
    || /\b(?:cargo|grain|shipment)\b.{0,120}\b(?:was|were)\s+(?:stolen|taken)\b/i.test(normalized);
  if (assertsPiracy && !marksSpeculation) {
    return [{
      kind: 'mission-guardrail-violation',
      factId: 'ashes.prelude.hesperus.ordinary-rescue-guardrail',
      severity: 'blocker',
      summary: 'Generated text asserts piracy, theft, or raider causality as fact during Hesperus instead of preserving it as unconfirmed speculation.'
    }];
  }
  const assertsSabotage = /\b(?:sabotage|conspiracy|inside\s+job|secret\s+plot|trap)\b/i.test(normalized)
    && !marksSpeculation;
  if (assertsSabotage) {
    return [{
      kind: 'mission-guardrail-violation',
      factId: 'ashes.prelude.hesperus.ordinary-rescue-guardrail',
      severity: 'blocker',
      summary: 'Generated text escalates Hesperus into sabotage or conspiracy without player-visible support.'
    }];
  }
  return [];
}
