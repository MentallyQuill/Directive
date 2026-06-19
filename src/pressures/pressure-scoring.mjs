import { PRESSURE_ESCALATION_BANDS, PRESSURE_URGENCY_BANDS } from './pressure-ledger.mjs';

const urgencyScore = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4
});

const escalationScore = Object.freeze({
  latent: 0,
  signal: 1,
  escalation: 2,
  crisis: 3,
  consequence: 4
});

function includesAny(values = [], expected = []) {
  const set = new Set(values);
  return expected.some((value) => set.has(value));
}

function templatePressureMatches(template = [], pressure) {
  if (!Array.isArray(template) || template.length === 0) {
    return false;
  }
  return template.some((match) => {
    if (match.pressureType && match.pressureType !== pressure.type) {
      return false;
    }
    if (Array.isArray(match.tags) && match.tags.length > 0 && !includesAny(pressure.tags, match.tags)) {
      return false;
    }
    if (Array.isArray(match.crewIds) && match.crewIds.length > 0 && !includesAny(pressure.linkedCrewIds, match.crewIds)) {
      return false;
    }
    if (Array.isArray(match.systemIds) && match.systemIds.length > 0 && !includesAny(pressure.linkedSystemIds, match.systemIds)) {
      return false;
    }
    return true;
  });
}

export function pressureMatchesTemplate(pressure, template) {
  return (pressure.linkedTemplateIds || []).includes(template.id)
    || templatePressureMatches(template.pressureMatches, pressure);
}

export function scorePressureForTemplate(pressure, template) {
  if (!pressureMatchesTemplate(pressure, template)) {
    return null;
  }
  const urgency = PRESSURE_URGENCY_BANDS.includes(pressure.urgencyBand) ? pressure.urgencyBand : 'medium';
  const escalation = PRESSURE_ESCALATION_BANDS.includes(pressure.escalationBand) ? pressure.escalationBand : 'signal';
  const directTemplateScore = (pressure.linkedTemplateIds || []).includes(template.id) ? 4 : 2;
  const ignoredScore = Math.min(Number(pressure.cooldown?.ignoredBeatCount || 0), 3);
  return directTemplateScore + urgencyScore[urgency] + escalationScore[escalation] + ignoredScore;
}
