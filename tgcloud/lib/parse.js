// Parser input teks pengguna — semua murni, mudah diuji.
import { addDays, isValidDate } from './dates.js';
import { RANGE } from './constants.js';

/** Terima YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, 'hari ini', 'kemarin'. */
export function parseDate(input, today) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (s === 'hari ini' || s === 'today' || s === 'hariini') return today;
  if (s === 'kemarin') return addDays(today, -1);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return norm(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return norm(+m[3], +m[2], +m[1]);
  return null;
}
function norm(y, mo, d) {
  const s = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidDate(s) ? s : null;
}

export function parseIntInRange(input, [min, max]) {
  const s = String(input ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}
export const parseCycleLength = (i) => parseIntInRange(i, RANGE.cycleLength);
export const parsePeriodLength = (i) => parseIntInRange(i, RANGE.periodLength);

/** Terima '36.6' atau '36,6'. */
export function parseTemp(input) {
  const s = String(input ?? '').trim().replace(',', '.');
  if (!/^\d{2}(\.\d+)?$/.test(s)) return null;
  const t = Number(s);
  return t >= RANGE.bbt[0] && t <= RANGE.bbt[1] ? Math.round(t * 100) / 100 : null;
}

const LH = { negatif: 'negative', negative: 'negative', tinggi: 'high', high: 'high', peak: 'peak', positif: 'peak' };
export const parseLH = (i) => LH[String(i ?? '').trim().toLowerCase()] ?? null;

const PREG = { positif: 'positive', positive: 'positive', samar: 'faint', faint: 'faint', negatif: 'negative', negative: 'negative' };
export const parsePregTest = (i) => PREG[String(i ?? '').trim().toLowerCase()] ?? null;

const KB_STATUS = { diminum: 'taken', minum: 'taken', taken: 'taken', lupa: 'missed', missed: 'missed' };
export const parseKbStatus = (i) => KB_STATUS[String(i ?? '').trim().toLowerCase()] ?? null;

/** Pecah teks perintah: "/cmd a b c" → { cmd, args }. Mendukung "/cmd@botname". */
export function parseCommand(text) {
  const m = String(text ?? '').trim().match(/^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), args: (m[2] ?? '').trim().split(/\s+/).filter(Boolean) };
}
