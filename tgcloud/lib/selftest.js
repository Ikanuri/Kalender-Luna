// Uji mandiri berbasis fixture emas. Dijalankan di CI (npm test), di runtime
// platform (endpoint `health`, `/diag self`) — mendeteksi regresi algoritma
// dan perbedaan perilaku runtime V8 di tgcloud vs Node lokal.
import { addDays, diffDays, isValidDate } from './dates.js';
import { CHIP_DEFS, NEUTRAL_MOODS } from './constants.js';
import { detectLHSurge } from './lh.js';
import { detectBBTOvulation } from './bbt.js';
import { computeAvgCycle, createCycleModel, phaseOfDay } from './cycle.js';
import { computeAnalysis, predictPMS } from './analysis.js';
import { parseDate, parseTemp } from './parse.js';
import { renderMonth } from './calendar-render.js';

const t = (name, fn) => {
  try { const r = fn(); return { name, ok: r === true, detail: r === true ? '' : String(r) }; }
  catch (e) { return { name, ok: false, detail: `exception: ${e?.message ?? e}` }; }
};
const eq = (a, b) => (JSON.stringify(a) === JSON.stringify(b) ? true : `${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const base = { lastPeriodDate: '2026-01-01', cycleLength: 28, periodLength: 5 };
const temps = ['2026-01-10', ...[36.3, 36.3, 36.4, 36.3, 36.35, 36.3, 36.6, 36.7, 36.65]]
  .slice(1).map((v, i) => ({ date: addDays('2026-01-10', i), tempCelsius: v }));

export function runSelfTest() {
  return [
    t('tanggal: lompat bulan/tahun kabisat', () => eq([addDays('2024-02-28', 2), diffDays('2026-03-01', '2026-02-01'), isValidDate('2026-02-30')], ['2024-03-01', 28, false])),
    t('§24.1 LH: peak TERBARU menang', () => detectLHSurge([{ date: '2026-01-10', result: 'peak' }, { date: '2026-02-08', result: 'peak' }]).date === '2026-02-08' || 'ambil peak pertama'),
    t('§24.2 mood netral ada persis di CHIP_DEFS (termasuk emoji)', () => NEUTRAL_MOODS.every((m) => CHIP_DEFS.mood.includes(m)) || 'NEUTRAL_MOODS tak sinkron dengan CHIP_DEFS.mood'),
    t('§24.2 PMS: Bahagia 😊 tidak dihitung gejala', () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({ date: `2026-01-2${i}`, mood: 'Bahagia 😊', pain: 'Tidak ada', other: [] }));
      return predictPMS(rows, () => 'luteal').skor === 0 || 'mood positif ikut menaikkan skor';
    }),
    t('§24.3 BBT: deteksi di data kontinu', () => detectBBTOvulation(temps, '2026-01-01', '2026-01-31') === '2026-01-15' || 'tidak terdeteksi'),
    t('§24.3 BBT: window bolong di-skip', () => detectBBTOvulation(temps.map((e, i) => (i >= 6 ? { ...e, date: addDays(e.date, 3) } : e)), '2026-01-01', '2026-01-31') === null || 'window bolong dianggap valid'),
    t('§5.3 urutan fase', () => eq([phaseOfDay(0, 5, -3), phaseOfDay(6, 5, -3), phaseOfDay(14, 5, 0), phaseOfDay(20, 5, 3), phaseOfDay(7, 5, -9)], ['menstruation', 'fertile', 'peak', 'luteal', 'safe'])),
    t('§5.1 rata-rata siklus + fallback', () => eq([computeAvgCycle([], 30), computeAvgCycle([{ date: '2026-01-01' }, { date: '2026-01-29' }, { date: '2026-02-28' }], 30)], [30, 29])),
    t('§5 model: ovulasi kalender & haid berikutnya', () => {
      const m = createCycleModel({ settings: base, history: [], lh: [], bbt: [] }, '2026-01-20');
      return eq([m.nextPeriod, m.nextOvulation.date, m.phaseOn('2026-01-15')], ['2026-01-29', '2026-02-12', 'peak']);
    }),
    t('§8 statistik: std sampel', () => {
      const a = computeAnalysis([{ date: '2026-01-01' }, { date: '2026-01-27' }, { date: '2026-02-27' }, { date: '2026-03-27' }]);
      return Math.abs(a.std - 2.5166) < 1e-3 || `std=${a.std}`; // lengths 26,31,28 → var 6.333
    }),
    t('parser tanggal & suhu', () => eq([parseDate('03/10/2026', '2026-10-20'), parseDate('kemarin', '2026-10-20'), parseTemp('36,6'), parseTemp('40')], ['2026-10-03', '2026-10-19', 36.6, null])),
    t('render kalender: 7 kolom, hari ini [ ], fase berwarna', () => {
      const m = createCycleModel({ settings: base, history: [], lh: [], bbt: [] }, '2026-01-20');
      const r = renderMonth({ ym: '2026-01', model: m, today: '2026-01-20' });
      const cells = r.keyboard.slice(0, -1);
      const flat = cells.flat();
      const styleOf = (label) => flat.find((b) => b.text.startsWith(label))?.style;
      return (cells.every((row) => row.length === 7) && flat.some((b) => b.text.startsWith('[20'))
        && styleOf('1') === 'danger' && styleOf('10') === 'success' && styleOf('15') === 'primary') || 'grid/warna salah';
    }),
  ];
}

export const summarize = (results) => ({
  total: results.length,
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).map((r) => ({ name: r.name, detail: r.detail })),
});
