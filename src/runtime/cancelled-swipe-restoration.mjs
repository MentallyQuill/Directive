import { stableJsonStringify } from './v1-host-message-contracts.mjs';

// SillyTavern overswipes before GENERATION_STARTED: the old text remains,
// selected metadata is cleared, and swipe_id points one past the saved variants.
// Retain only an unambiguous, exact witness of the row native restoration loads.
export function captureCancelledSwipeRestoration(baseline) {
  if (!baseline) return null;
  const rows = JSON.parse(baseline), row = rows.at(-1);
  if (!row || row.is_user || row.isUser || row.is_system || row.isSystem
    || ['user', 'system'].includes(row.role) || typeof row.mes !== 'string'
    || !Array.isArray(row.swipes) || !row.swipes.length
    || row.swipe_id !== row.swipes.length || !Array.isArray(row.swipe_info)
    || Object.hasOwn(row, 'gen_started') || Object.hasOwn(row, 'gen_finished')) return null;
  const matches = row.swipes.flatMap((text, index) => text === row.mes ? [index] : []);
  if (matches.length !== 1) return null;
  const index = matches[0], info = row.swipe_info[index];
  if (!info || !['send_date', 'gen_started', 'gen_finished', 'extra'].every(key => Object.hasOwn(info, key))
    || !info.extra || typeof info.extra !== 'object' || Array.isArray(info.extra)
    || row.send_date !== info.send_date) return null;
  const cleared = { ...info.extra };
  for (const key of ['memory', 'display_text', 'media', 'inline_image', 'files', 'fileLength',
    'generationType', 'negative', 'title', 'append_title']) delete cleared[key];
  if (stableJsonStringify(row.extra) !== stableJsonStringify(cleared)) return null;
  Object.assign(row, { swipe_id: index, send_date: info.send_date,
    gen_started: info.gen_started, gen_finished: info.gen_finished, extra: info.extra });
  return stableJsonStringify(rows);
}

export function matchesCancelledSwipeRestoration(witness, observed) {
  return witness != null && observed != null && stableJsonStringify(JSON.parse(observed)) === witness;
}
