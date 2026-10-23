// Util UI murni (format tanggal, escape, haptic). BUKAN logika siklus — itu urusan server.
const MS = 86400000;
export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const DOW_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const pad = (n) => String(n).padStart(2, '0');
export const toDay = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / MS; };
export const fromDay = (n) => { const d = new Date(n * MS); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const addDays = (s, n) => fromDay(toDay(s) + n);
export const diffDays = (a, b) => toDay(a) - toDay(b);
export const dow = (s) => new Date(toDay(s) * MS).getUTCDay();
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const prevMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`; };
export const nextMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`; };
export const fmtLong = (s) => { const [y, m, d] = s.split('-').map(Number); return `${WEEKDAYS[dow(s)]}, ${d} ${MONTHS[m - 1]} ${y}`; };
export const fmtShort = (s) => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
export const fmtDM = (s) => { const [, m, d] = s.split('-').map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)}`; };

/** Sel bulan: matriks minggu × 7, null = kosong. */
export function monthGrid(ym) {
  const [y, m] = ym.split('-').map(Number);
  const flat = [...Array(dow(`${ym}-01`)).fill(null), ...Array.from({ length: daysInMonth(y, m) }, (_, i) => `${ym}-${pad(i + 1)}`)];
  while (flat.length % 7) flat.push(null);
  return Array.from({ length: flat.length / 7 }, (_, i) => flat.slice(i * 7, i * 7 + 7));
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const tg = () => window.Telegram?.WebApp;
export const haptic = {
  tap: () => { try { tg()?.HapticFeedback?.selectionChanged(); } catch {} },
  light: () => { try { tg()?.HapticFeedback?.impactOccurred('light'); } catch {} },
  ok: () => { try { tg()?.HapticFeedback?.notificationOccurred('success'); } catch {} },
  err: () => { try { tg()?.HapticFeedback?.notificationOccurred('error'); } catch {} },
};
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
