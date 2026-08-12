const DAY_MINUTES = 1440;
const FINAL_TIME_FOOTER = /(?:^|\r?\n)[\t ]*(\*Stardate\s+(\d{4,6}(?:\.\d+)?)\s*\|\s*(\d{2})(\d{2})\s+hours\*)[\t ]*(?:\r?\n[\t ]*)*$/i;

export function formatShipTimeFooter({ stardate, minuteOfDay } = {}) {
  const numericStardate = Number(stardate);
  const numericMinute = Number(minuteOfDay);
  if (!Number.isFinite(numericStardate) || !Number.isFinite(numericMinute)) return '';
  const minute = ((Math.round(numericMinute) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const clock = `${String(Math.floor(minute / 60)).padStart(2, '0')}${String(minute % 60).padStart(2, '0')}`;
  return `*Stardate ${numericStardate.toFixed(1).padStart(7, '0')} | ${clock} hours*`;
}

export function extractShipTimeFooter(text = '') {
  const source = String(text ?? '');
  const match = source.match(FINAL_TIME_FOOTER);
  if (!match) return { narrativeText: source.trim(), footer: null };
  const hour = Number(match[3]);
  const minute = Number(match[4]);
  const stardate = Number(match[2]);
  if (!Number.isFinite(stardate) || hour > 23 || minute > 59) {
    return { narrativeText: source.trim(), footer: null };
  }
  return {
    narrativeText: source.slice(0, match.index).trim(),
    footer: {
      kind: 'directive.shipTimeFooter.v1',
      text: match[1],
      stardate,
      minuteOfDay: (hour * 60) + minute
    }
  };
}
