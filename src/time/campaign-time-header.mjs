function compact(value) {
  return String(value ?? '').trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeMinuteOfDay(value) {
  const numeric = numberOrNull(value);
  if (numeric === null) return null;
  const minutes = Math.round(numeric);
  return ((minutes % 1440) + 1440) % 1440;
}

function minuteFromShipTimeDisplay(value) {
  const text = compact(value).toLowerCase();
  if (!text) return null;
  const match = text.match(/^(\d{1,2})(?::?([0-5]\d))\s*(?:hours?)?$/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23) return null;
  return hour * 60 + minute;
}

function minuteFromClockObject(value) {
  if (!value || typeof value !== 'object') return null;
  const direct = normalizeMinuteOfDay(
    value.minuteOfDay
      ?? value.shipMinuteOfDay
      ?? value.currentMinuteOfDay
      ?? value.minutesSinceMidnight
  );
  if (direct !== null) return direct;
  const display = minuteFromShipTimeDisplay(value.display ?? value.shipTime ?? value.time ?? value.label);
  if (display !== null) return display;
  const hour = numberOrNull(value.hour ?? value.hours);
  const minute = numberOrNull(value.minute ?? value.minutes);
  if (hour !== null && minute !== null && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
    return Math.round(hour) * 60 + Math.round(minute);
  }
  return null;
}

function firstMinute(values = []) {
  for (const value of values) {
    const minute = typeof value === 'object'
      ? minuteFromClockObject(value)
      : (minuteFromShipTimeDisplay(value) ?? normalizeMinuteOfDay(value));
    if (minute !== null) return minute;
  }
  return null;
}

function firstNumber(values = []) {
  for (const value of values) {
    const numeric = numberOrNull(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

export const CAMPAIGN_REPLY_HEADER_PATTERN = /^\s*\*?Stardate\s+\d{4,6}(?:\.\d+)?\s*\|\s*\d{4}\s+hours\*?(?:\s*(?:\r?\n)+|\s*$)/i;

export function formatShipTime(value) {
  const minuteOfDay = normalizeMinuteOfDay(value);
  if (minuteOfDay === null) return null;
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')} hours`;
}

export function formatStardate(value) {
  const display = typeof value === 'object' ? value?.display : null;
  const source = display ?? value;
  const numeric = numberOrNull(source);
  if (numeric === null) return null;
  const fixed = numeric.toFixed(1);
  const [whole, fraction = '0'] = fixed.split('.');
  return `${whole.padStart(5, '0')}.${fraction.slice(0, 1)}`;
}

export function resolveCampaignStardate(campaignState = {}) {
  return formatStardate(
    campaignState?.campaignTime?.stardate
      ?? campaignState?.timeLedger?.stardate
      ?? campaignState?.worldState?.currentStardate
      ?? campaignState?.campaign?.currentStardate
      ?? campaignState?.campaign?.openingStardate
  );
}

export function resolveCampaignMinuteOfDay(campaignState = {}) {
  const explicit = firstMinute([
    campaignState?.campaignTime?.shipClock,
    campaignState?.campaignTime?.shipTime,
    campaignState?.campaignTime,
    campaignState?.timeLedger?.shipClock,
    campaignState?.timeLedger?.shipTime,
    campaignState?.worldState?.shipClock,
    campaignState?.worldState?.shipTime,
    campaignState?.worldState?.minuteOfDay,
    campaignState?.campaign?.shipClock,
    campaignState?.campaign?.shipTime,
    campaignState?.campaign?.minuteOfDay
  ]);
  if (explicit !== null) return explicit;

  const opening = firstMinute([
    campaignState?.campaignTime?.openingShipClock,
    campaignState?.campaignTime?.openingShipTime,
    campaignState?.campaignTime?.openingMinuteOfDay,
    campaignState?.timeLedger?.openingShipClock,
    campaignState?.timeLedger?.openingShipTime,
    campaignState?.worldState?.openingShipClock,
    campaignState?.worldState?.openingShipTime,
    campaignState?.worldState?.openingMinuteOfDay,
    campaignState?.campaign?.openingShipClock,
    campaignState?.campaign?.openingShipTime,
    campaignState?.campaign?.openingMinuteOfDay
  ]) ?? 0;

  const elapsedMinutes = firstNumber([
    campaignState?.campaignTime?.absoluteMinute,
    campaignState?.campaignTime?.elapsedMinutes,
    campaignState?.timeLedger?.absoluteMinute,
    campaignState?.timeLedger?.elapsedMinutes,
    campaignState?.worldState?.elapsedMinutes,
    numberOrNull(campaignState?.worldState?.elapsedHours) === null
      ? null
      : Number(campaignState.worldState.elapsedHours) * 60,
    numberOrNull(campaignState?.campaign?.elapsedHours) === null
      ? null
      : Number(campaignState.campaign.elapsedHours) * 60
  ]) ?? 0;

  return normalizeMinuteOfDay(opening + elapsedMinutes);
}

export function buildCampaignReplyHeader(campaignState = {}) {
  const stardate = resolveCampaignStardate(campaignState);
  const shipTime = formatShipTime(resolveCampaignMinuteOfDay(campaignState));
  if (!stardate || !shipTime) return '';
  return `*Stardate ${stardate} | ${shipTime}*`;
}

export function stripCampaignReplyHeader(text = '') {
  return String(text ?? '').replace(CAMPAIGN_REPLY_HEADER_PATTERN, '').trimStart();
}

export function prefixCampaignReplyHeader(text = '', campaignState = {}) {
  const body = stripCampaignReplyHeader(text).trim();
  const header = buildCampaignReplyHeader(campaignState);
  if (!header) return body;
  return body ? `${header}\n\n${body}` : header;
}

export function createCampaignReplyHeaderPromptBlock(campaignState = {}) {
  const header = buildCampaignReplyHeader(campaignState);
  if (!header) return null;
  return {
    id: 'reply-header',
    title: 'Reply Header',
    mustInclude: true,
    salienceScore: 100,
    placement: 'inChat',
    depth: 0,
    ttl: 'turn',
    priority: 999,
    reason: 'The current stardate and ship time header must lead every assistant reply.',
    content: [
      'Begin every assistant reply in this bound Directive chat with exactly this first line:',
      header,
      '',
      'This header is a display artifact generated from Directive state, not narrative evidence. Do not infer time passage from prior reply headers in chat history.',
      'Do not recalculate, advance, omit, alter, or add location text to this header. Start in-character prose on the next line.'
    ].join('\n')
  };
}
