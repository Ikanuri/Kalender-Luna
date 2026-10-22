// PRD §16 — laporan untuk dokter (teks monospace).
import { formatLong, formatShort } from './dates.js';
import { LH_LABEL } from './constants.js';
import { computeAnalysis } from './analysis.js';
import { detectLHSurge } from './lh.js';

const LH_REPORT = { negative: 'Negatif', high: 'Tinggi', peak: 'Peak/Positif (LH Surge)' };
const fix1 = (n) => (Math.round(n * 10) / 10).toString();

export function buildDoctorReport({ today, settings, model, history, bbt, lh, symptomCount }) {
  const L = [];
  const line = '─'.repeat(40);
  L.push('LAPORAN SIKLUS MENSTRUASI — LUNA', `Dicetak: ${formatLong(today)}`, line, '');
  L.push('DATA SIKLUS AKTIF',
    `• Hari pertama haid terakhir : ${formatShort(settings.lastPeriodDate)}`,
    `• Panjang siklus (input)      : ${settings.cycleLength} hari`,
    `• Durasi haid                 : ${settings.periodLength} hari`,
    `• Rata-rata siklus (historis) : ${model.avg} hari`, '');
  L.push('PREDIKSI',
    `• Haid berikutnya    : ${formatShort(model.nextPeriod)}`,
    `• Ovulasi berikutnya : ${formatShort(model.nextOvulation.date)}`, '');

  const a = computeAnalysis(history);
  if ((history ?? []).length >= 2 && a) {
    L.push(`ANALISIS SIKLUS (${a.lengths.length} siklus tercatat)`,
      `• Rata-rata siklus : ${fix1(a.avg)} hari`,
      `• Siklus terpendek : ${a.min} hari`,
      `• Siklus terpanjang: ${a.max} hari`,
      `• Standar deviasi  : ±${fix1(a.std)} hari`,
      `• Keteraturan      : ${a.regularity}`, '');
  }
  if ((history ?? []).length) {
    L.push('RIWAYAT 6 SIKLUS TERAKHIR');
    const rows = a ? a.pairs.slice(-6) : [];
    if (rows.length) rows.forEach((p) => L.push(`• ${formatShort(p.start)} (siklus ${p.length}h, haid ${p.periodLength}h)`));
    else [...history].sort((x, y) => (x.date < y.date ? -1 : 1)).slice(-6)
      .forEach((h) => L.push(`• ${formatShort(h.date)} (haid ${h.periodLength}h)`));
    L.push('');
  }
  if ((bbt ?? []).length) {
    L.push('SUHU BASAL (BBT) 7 TERAKHIR');
    [...bbt].sort((x, y) => (x.date < y.date ? -1 : 1)).slice(-7)
      .forEach((b) => L.push(`• ${formatShort(b.date)}: ${b.tempCelsius}°C`));
    L.push('');
  }
  if ((lh ?? []).length) {
    L.push('HASIL LH STRIP (TES OVULASI)');
    [...lh].sort((x, y) => (x.date < y.date ? -1 : 1)).slice(-10)
      .forEach((e) => L.push(`• ${formatShort(e.date)}: ${LH_REPORT[e.result] ?? LH_LABEL[e.result]}`));
    const surge = detectLHSurge(lh);
    if (surge) L.push(`→ LH Surge terdeteksi: ${formatShort(surge.date)}`);
    L.push('');
  }
  L.push(`CATATAN GEJALA: ${symptomCount} hari tercatat`, '', line,
    'Dibuat oleh Luna — Kalender Siklus Cerdas', '⚠️ Bukan pengganti diagnosis medis.');
  return L.join('\n');
}
