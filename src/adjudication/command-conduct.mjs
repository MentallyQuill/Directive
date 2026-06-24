const CONDUCT_FLAGS = Object.freeze({
  publicCaptainChallenge: 'command-conduct.public-insubordination',
  impairedOnDuty: 'command-conduct.impaired-duty',
  assaultsOfficer: 'command-conduct.assaulted-officer',
  unlawfulCommandUsurpation: 'command-conduct.unlawful-command-usurpation'
});

const CONDUCT_FLAG_IDS = Object.freeze(Object.values(CONDUCT_FLAGS));

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function includesAny(text, values = []) {
  return values.some((value) => text.includes(value));
}

export function detectCommandConductSignalsFromText(text = '') {
  const input = compact(text).toLowerCase();
  const publicCaptainChallenge = (
    includesAny(input, ['captain', 'whitaker'])
    && includesAny(input, ['abdication', 'if you will not make the call', 'i will', 'undermine', 'publicly challenge', 'public verbal fight'])
  );
  const impairedOnDuty = (
    includesAny(input, ['unlogged stimulant', 'illicit substance', 'illicit substances', 'inebriated', 'intoxicated', 'drunk', 'altered by', 'stimulant'])
    && includesAny(input, ['bridge', 'duty', 'watch', 'orders', 'course', 'sensor'])
  );
  const assaultsOfficer = (
    includesAny(input, ['shove', 'shoved', 'strike', 'struck', 'hit ', 'punch', 'physically attack', 'slam'])
    && includesAny(input, ['officer', 'console', 'bridge', 'watch'])
  );
  const unlawfulConfinement = includesAny(input, ['confine any officer', 'confine officers', 'detain any officer', 'arrest any officer', 'security to confine']);
  const overridesCaptain = includesAny(input, ['ignore the captain', 'ignore captain', 'unless i personally confirm', 'unless i confirm']);
  const weaponsThreatAgainstApproaches = includesAny(input, ['firing solution on any vessel', 'fire on any vessel', 'weapons on any vessel', 'target any vessel that approaches']);
  const unlawfulCommandUsurpation = unlawfulConfinement || overridesCaptain || weaponsThreatAgainstApproaches;
  return {
    publicCaptainChallenge,
    impairedOnDuty,
    assaultsOfficer,
    unlawfulConfinement,
    overridesCaptain,
    weaponsThreatAgainstApproaches,
    unlawfulCommandUsurpation,
    commandConductMisconduct: publicCaptainChallenge || impairedOnDuty || assaultsOfficer || unlawfulCommandUsurpation
  };
}

export function commandConductRequiresDirectiveOwnership(text = '') {
  return detectCommandConductSignalsFromText(text).commandConductMisconduct === true;
}

export function commandConductFlagRecords(signals = {}) {
  const records = [];
  if (signals.publicCaptainChallenge) records.push({ id: CONDUCT_FLAGS.publicCaptainChallenge, value: true });
  if (signals.impairedOnDuty) records.push({ id: CONDUCT_FLAGS.impairedOnDuty, value: true });
  if (signals.assaultsOfficer) records.push({ id: CONDUCT_FLAGS.assaultsOfficer, value: true });
  if (signals.unlawfulCommandUsurpation) records.push({ id: CONDUCT_FLAGS.unlawfulCommandUsurpation, value: true });
  return records;
}

export function existingCommandConductCount(campaignState = {}) {
  const flags = campaignState.flags || {};
  return CONDUCT_FLAG_IDS.filter((id) => flags[id] === true).length;
}

export function commandConductRemovalRequired(signals = {}, campaignState = {}) {
  const priorCount = existingCommandConductCount(campaignState);
  const severeUsurpation = signals.unlawfulCommandUsurpation === true;
  const violentMisconduct = signals.assaultsOfficer === true;
  const impairedCommand = signals.impairedOnDuty === true;

  if (signals.permanentCommandRemoval === true) return true;
  if (severeUsurpation && (priorCount >= 2 || violentMisconduct || impairedCommand)) return true;
  if (violentMisconduct && impairedCommand && priorCount >= 1) return true;
  return false;
}

export function commandConductResultBand(signals = {}, campaignState = {}) {
  if (commandConductRemovalRequired(signals, campaignState)) return 'Failure';
  if (signals.assaultsOfficer || signals.impairedOnDuty || signals.unlawfulCommandUsurpation) return 'Partial Failure';
  return 'Partial Success';
}

export function commandConductSummary(signals = {}, campaignState = {}) {
  if (commandConductRemovalRequired(signals, campaignState)) {
    return 'The player crosses from command misconduct into command-usurpation and removal pressure. Captain, medical, and security authority interrupt ordinary bridge command before the campaign can continue normally.';
  }
  if (signals.assaultsOfficer) {
    return 'The player physically assaults a fellow officer during a bridge dispute. The act is treated as a serious breach of command fitness, not as a successful way to force compliance.';
  }
  if (signals.impairedOnDuty) {
    return 'The player reports to bridge duty under the influence of an unlogged substance. Medical and watch officers begin treating the behavior as a fitness-for-duty problem.';
  }
  if (signals.publicCaptainChallenge) {
    return 'The player publicly challenges Captain Whitaker in front of the bridge watch. The disagreement becomes a visible command-discipline problem rather than free authority transfer.';
  }
  return 'The player creates a command-conduct problem that the crew must treat as observable behavior with consequences.';
}

export function commandConductCosts(signals = {}, campaignState = {}) {
  const costs = [];
  if (signals.publicCaptainChallenge) {
    costs.push('Captain Whitaker and the bridge watch register a public command-discipline breach');
  }
  if (signals.impairedOnDuty) {
    costs.push('medical fitness-for-duty scrutiny begins');
    costs.push('bridge officers hesitate to treat the player as fully reliable');
  }
  if (signals.assaultsOfficer) {
    costs.push('security and medical response becomes justified by the player assaulting an officer');
    costs.push('crew trust in the player command role collapses sharply');
  }
  if (signals.unlawfulCommandUsurpation) {
    costs.push('officers are ordered to refuse illegal or usurping command instructions');
    costs.push('Captain, security, and medical authority move to interrupt the command breakdown');
  }
  if (commandConductRemovalRequired(signals, campaignState)) {
    costs.push('the player is removed from ordinary command and confined pending inquiry');
    costs.push('Directive must pause on a checkpoint before continuing this branch');
  }
  return unique(costs);
}

export function commandConductLogSummaryInputs(signals = {}, campaignState = {}) {
  const inputs = [];
  if (signals.publicCaptainChallenge) inputs.push('The player publicly challenged Captain Whitaker in front of the bridge watch.');
  if (signals.impairedOnDuty) inputs.push('The player attempted bridge duty while impaired by an unlogged substance.');
  if (signals.assaultsOfficer) inputs.push('The player physically assaulted a Starfleet officer during a command dispute.');
  if (signals.unlawfulCommandUsurpation) inputs.push('The player tried to override captain authority and confine dissenting officers.');
  if (commandConductRemovalRequired(signals, campaignState)) {
    inputs.push('The accumulated conduct plausibly breaks command fitness and ordinary mission command.');
  }
  return inputs.length ? inputs : ['The player created a command-conduct incident requiring crew and command response.'];
}

export function commandConductRelationshipChanges(signals = {}) {
  const changes = [];
  if (signals.publicCaptainChallenge) changes.push('Whitaker treats the player as publicly challenging lawful command authority.');
  if (signals.impairedOnDuty) changes.push('Medical and watch officers begin questioning the player fitness for duty.');
  if (signals.assaultsOfficer) changes.push('Security, medical, and bridge officers have cause to intervene against the player.');
  if (signals.unlawfulCommandUsurpation) changes.push('Captain and crew authority shifts toward containment, refusal, and relief from duty.');
  return changes;
}
