// Tanggal disimpan sebagai string 'YYYY-MM-DD'. Semua aritmetika dilakukan
// dalam "nomor hari" UTC supaya bebas dari DST/zona waktu mesin.
const MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
  'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const toDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MS;
};
export const fromDay = (n) => {
  const dt = new Date(n * MS);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
export const addDays = (s, n) => fromDay(toDay(s) + n);
/** a - b dalam hari. */
export const diffDays = (a, b) => toDay(a) - toDay(b);
export const dow = (s) => new Date(toDay(s) * MS).getUTCDay();
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromDay(toDay(s)) === s;
}

/** Tanggal "hari ini" di zona waktu pengguna (offset menit dari UTC). */
export const todayIn = (offsetMin = 0, now = Date.now()) =>
  fromDay(Math.floor((now + offsetMin * 60000) / MS));

export function formatLong(s) {
  const [y, m, d] = s.split('-').map(Number);
  return `${WEEKDAYS[dow(s)]}, ${d} ${MONTHS[m - 1]} ${y}`;
}
export function formatShort(s) {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}
export const monthKey = (s) => s.slice(0, 7);
