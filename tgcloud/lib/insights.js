// PRD §17 — insight bulanan rule-based, maksimal 2.
import { computeAnalysis, getLutealStats } from './analysis.js';

export function monthlyInsights(history, bbt) {
  const a = computeAnalysis(history);
  const out = [];
  if (a) {
    const std = Math.round(a.std * 10) / 10;
    if (a.std <= 2) out.push(`Siklusmu sangat teratur (variasi hanya ±${std} hari). Prediksi cenderung akurat.`);
    if (a.std > 7) out.push(`Siklusmu cukup bervariasi (±${std} hari). Catat rutin agar prediksi membaik.`);
    const L = a.lengths;
    if (L.length >= 3 && L[L.length - 1] > L[L.length - 3] + 3) {
      out.push('Tiga siklus terakhir cenderung makin panjang. Pantau terus; jika berlanjut, diskusikan dengan dokter.');
    }
    if (L.length >= 3 && L[L.length - 1] < L[L.length - 3] - 3) {
      out.push(`Tiga siklus terakhir cenderung makin pendek${L[L.length - 1] < 21 ? ' dan sudah di bawah 21 hari — sebaiknya konsultasi ke dokter' : ''}.`);
    }
  }
  const luteal = getLutealStats(history, bbt);
  if (luteal && luteal.avg < 10) out.push('Fase lutealmu tercatat pendek (<10 hari). Bila sedang program hamil, bicarakan dengan dokter.');
  const nBbt = (bbt ?? []).length;
  if (nBbt > 0 && nBbt < 9) out.push('Lengkapi catatan suhu basal (BBT) minimal 9 hari berturut-turut agar ovulasi bisa dikonfirmasi dari suhu.');
  return out.slice(0, 2);
}
