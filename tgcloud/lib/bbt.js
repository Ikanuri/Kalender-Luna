// PRD §7.2 — deteksi ovulasi dari BBT, aturan 3-over-6.
import { diffDays } from './dates.js';

/**
 * entries: [{ date, tempCelsius }]. Kembalikan tanggal hari TERAKHIR sebelum
 * kenaikan suhu dalam [cycleStart, cycleEnd], atau null.
 */
export function detectBBTOvulation(entries, cycleStart, cycleEnd) {
  const list = (entries ?? [])
    .filter((e) => e.date >= cycleStart && e.date <= cycleEnd)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (list.length < 9) return null;

  for (let i = 6; i <= list.length - 3; i++) {
    const win = list.slice(i - 6, i + 3); // 6 baseline + 3 elevated
    // Harus 9 hari KALENDER berturut-turut, bukan sekadar 9 index (PRD §24.3).
    let contiguous = true;
    for (let k = 1; k < win.length; k++) {
      if (diffDays(win[k].date, win[k - 1].date) !== 1) { contiguous = false; break; }
    }
    if (!contiguous) continue;

    const baseline = win.slice(0, 6).map((e) => e.tempCelsius);
    const elevated = win.slice(6).map((e) => e.tempCelsius);
    const coverline = Math.max(...baseline);
    const allElevated = elevated.every((t) => t >= coverline + 0.1 - 1e-9);
    const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    if (allElevated && avg(elevated) - avg(baseline) >= 0.2 - 1e-9) return win[5].date;
  }
  return null;
}
