const DAY_SECONDS = 86400;
const FINAL_TIME_FOOTER = /(?:^|\r?\n)[\t ]*(\*Stardate\s+(\d{4,6}(?:\.\d+)?)\s*\|\s*(\d{2}):(\d{2}):(\d{2})\s+hours\*)[\t ]*(?:\r?\n[\t ]*)*$/i;
const LEGACY_FINAL_TIME_FOOTER = /(?:^|\r?\n)[\t ]*(\*Stardate\s+(\d{4,6}(?:\.\d+)?)\s*\|\s*(\d{2})(\d{2})\s+hours\*)[\t ]*(?:\r?\n[\t ]*)*$/i;
const GENERATED_FINAL_TIME_FOOTER = /(?:^|\r?\n)[\t ]*(\*?\s*Stardate\s+\d{4,6}(?:\.\d+)?\s*\|\s*(?:\d{2}:\d{2}:\d{2}|\d{4}:\d{2}|\d{4})\s+hours\s*\*?)[\t ]*(?:\r?\n[\t ]*)*$/i;

export function formatShipClock({ secondOfDay, minuteOfDay } = {}) {
  const numericSecond = Number(secondOfDay ?? (Number(minuteOfDay) * 60));
  if (!Number.isFinite(numericSecond)) return '';
  const second = ((Math.round(numericSecond) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  const hour = Math.floor(second / 3600);
  const minute = Math.floor((second % 3600) / 60);
  const clockSecond = second % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(clockSecond).padStart(2, '0')}`;
}

export function formatStardate(stardate) {
  if (stardate === null || stardate === undefined || (typeof stardate === 'string' && !stardate.trim())) return '';
  const numeric = Number(stardate);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : '';
}

export function formatShipTimeFooter({ stardate, secondOfDay, minuteOfDay } = {}) {
  const stardateDisplay = formatStardate(stardate);
  const clock = formatShipClock({ secondOfDay, minuteOfDay });
  if (!stardateDisplay || !clock) return '';
  return `*Stardate ${stardateDisplay.padStart(7, '0')} | ${clock} hours*`;
}

export function extractShipTimeFooter(text = '') {
  const source = String(text ?? '');
  const match = source.match(FINAL_TIME_FOOTER) || source.match(LEGACY_FINAL_TIME_FOOTER);
  if (!match) return { narrativeText: source.trim(), footer: null };
  const hour = Number(match[3]);
  const minute = Number(match[4]);
  const second = match.length > 5 ? Number(match[5]) : 0;
  const stardate = Number(match[2]);
  if (!Number.isFinite(stardate) || hour > 23 || minute > 59 || second > 59) {
    return { narrativeText: source.trim(), footer: null };
  }
  const secondOfDay = (hour * 3600) + (minute * 60) + second;
  return {
    narrativeText: source.slice(0, match.index).trim(),
    footer: {
      kind: 'directive.shipTimeFooter.v1',
      text: match[1],
      stardate,
      secondOfDay,
      minuteOfDay: Math.floor(secondOfDay / 60)
    }
  };
}

export function stripGeneratedShipTimeFooter(text = '') {
  const source = String(text ?? '');
  const match = source.match(GENERATED_FINAL_TIME_FOOTER);
  if (!match) return { text: source, stripped: false, footerText: null };
  return {
    text: source.slice(0, match.index).replace(/\s+$/, ''),
    stripped: true,
    footerText: match[1].trim()
  };
}
