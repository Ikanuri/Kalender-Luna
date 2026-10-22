// PRD §8–§13 — statistik, anomali, luteal, PMS, korelasi, perbandingan.
import { diffDays } from './dates.js';
import { NEUTRAL_MOODS, PHASES, RANGE } from './constants.js';
import { validGaps } from './cycle.js';
import { detectBBTOvulation } from './bbt.js';

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sortHist = (h) => [...(h ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1));

/** §8 */
export function computeAnalysis(history) {
  const sorted = sortHist(history);
  if (sorted.length < 2) return null;
  const pairs = validGaps(sorted); // [{ start, end, length, periodLength }]
  if (!pairs.length) return null;
  const lengths = pairs.map((p) => p.length);
  const avg = mean(lengths);
  // Simpangan baku sampel (Bessel, n-1); 0 bila hanya satu data.
  const std = lengths.length > 1
    ? Math.sqrt(lengths.reduce((s, x) => s + (x - avg) ** 2, 0) / (lengths.length - 1))
    : 0;
  const regularity = std <= 2 ? 'Sangat Teratur' : std <= 4 ? 'Cukup Teratur'
    : std <= 7 ? 'Kurang Teratur' : 'Tidak Teratur';
  return { avg, min: Math.min(...lengths), max: Math.max(...lengths), std, regularity, lengths, pairs, sorted };
}

/** §9 */
export function detectAnomalies(history) {
  const a = computeAnalysis(history);
  if (!a || a.lengths.length < 3) return [];
  const out = [];
  for (const p of a.pairs) {
    const deviasi = p.length - a.avg;
    if (Math.abs(deviasi) > 7) {
      out.push({
        siklus: p.start, panjang: p.length, deviasi,
        alasan: deviasi > 7
          ? 'Siklus jauh lebih panjang dari biasanya. Bisa karena stres, perubahan berat badan, gangguan tiroid, atau PCOS.'
          : 'Siklus jauh lebih pendek dari biasanya. Bisa karena stres, perubahan hormonal, atau mendekati perimenopause.',
      });
    }
  }
  if (a.avg < 21) out.push({ siklus: 'Rata-rata', panjang: a.avg, deviasi: 0, alasan: 'Rata-rata siklus di bawah 21 hari (polymenorrhea). Sebaiknya diperiksakan.' });
  if (a.avg > 35) out.push({ siklus: 'Rata-rata', panjang: a.avg, deviasi: 0, alasan: 'Rata-rata siklus di atas 35 hari (oligomenorrhea). Bisa terkait PCOS atau gangguan hormonal.' });
  return out;
}

/** §10 */
export function getLutealStats(history, bbt) {
  const hist = sortHist(history);
  if (hist.length < 2 || (bbt ?? []).length < 9) return null;
  const lengths = [];
  for (let i = 0; i < hist.length - 1; i++) {
    const ov = detectBBTOvulation(bbt, hist[i].date, hist[i + 1].date);
    if (ov) {
      const luteal = diffDays(hist[i + 1].date, ov);
      if (luteal >= RANGE.validLuteal[0] && luteal <= RANGE.validLuteal[1]) lengths.push(luteal);
    }
  }
  if (!lengths.length) return null;
  const avg = mean(lengths);
  const status = avg < 10 ? 'Pendek — konsultasi disarankan' : avg > 16 ? 'Lebih panjang dari normal' : 'Normal (10–16 hari)';
  return { avg, count: lengths.length, status };
}

/** §11 — phaseOf(date) → fase atau null. */
export function predictPMS(symptoms, phaseOf) {
  if ((symptoms ?? []).length < 5) return null;
  let lutealDays = 0, painDays = 0, moodDays = 0, otherDays = 0;
  const freq = {};
  const bump = (k) => { freq[k] = (freq[k] ?? 0) + 1; };
  for (const e of symptoms) {
    if (phaseOf(e.date) !== 'luteal') continue;
    lutealDays++;
    if (e.pain && e.pain !== 'Tidak ada') painDays++;
    if (e.mood && !NEUTRAL_MOODS.includes(e.mood)) moodDays++;
    const other = e.other ?? [];
    if (other.length) otherDays++;
    other.forEach(bump);
    // Di sini hanya 'Normal' yang dikecualikan (bukan NEUTRAL_MOODS) supaya
    // 'Bahagia 😊' tetap bisa muncul di pola gejala (PRD §11).
    if (e.mood && e.mood !== 'Normal') bump(e.mood);
  }
  if (lutealDays < 3) return null;
  const skor = Math.round(((painDays / lutealDays) * 0.4 + (moodDays / lutealDays) * 0.35 + (otherDays / lutealDays) * 0.25) * 100);
  const level = skor < 25 ? 'Ringan' : skor < 55 ? 'Sedang' : 'Berat';
  const topSymptoms = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  return { skor, level, topSymptoms, lutealDays };
}

/** PMS hanya ditampilkan saat fase luteal atau 0–10 hari menjelang haid. */
export const shouldShowPMS = (phase, daysToPeriod) =>
  phase === 'luteal' || (daysToPeriod >= 0 && daysToPeriod <= 10);

/** §12 */
export function computeCorrelation(symptoms, phaseOf) {
  if ((symptoms ?? []).length < 3) return { insufficient: true };
  const counts = Object.fromEntries(PHASES.map((p) => [p, {}]));
  const totals = Object.fromEntries(PHASES.map((p) => [p, 0]));
  for (const e of symptoms) {
    const phase = phaseOf(e.date) ?? 'safe';
    totals[phase]++;
    const tags = [...(e.other ?? [])];
    if (e.pain && e.pain !== 'Tidak ada') tags.push('Nyeri: ' + e.pain);
    if (e.mood && !NEUTRAL_MOODS.includes(e.mood)) tags.push(e.mood);
    tags.forEach((t) => { counts[phase][t] = (counts[phase][t] ?? 0) + 1; });
  }
  const allTags = {};
  for (const p of PHASES) for (const [t, n] of Object.entries(counts[p])) allTags[t] = (allTags[t] ?? 0) + n;
  const top = Object.entries(allTags).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rows = top.map(([tag, total]) => ({
    tag, total,
    perPhase: Object.fromEntries(PHASES.map((p) => [p, totals[p] ? Math.round(((counts[p][tag] ?? 0) / totals[p]) * 100) : 0])),
  }));
  return { insufficient: false, rows, phaseTotals: totals };
}

/** §13 — 6 siklus terakhir + garis rata-rata. */
export function compareCycles(history) {
  const a = computeAnalysis(history);
  if (!a) return null;
  return {
    avg: a.avg,
    cycles: a.pairs.slice(-6).map((p) => ({ tanggalMulai: p.start, panjangSiklus: p.length, durasiHaid: p.periodLength })),
  };
}
