// PRD §15 — mode perencanaan kehamilan (DPO).
import { diffDays } from './dates.js';

/** model = createCycleModel(...); kembalikan status pertama yang cocok. */
export function pregnancyStatus(model, today) {
  const dpo = diffDays(today, model.active.ovulation.date);
  const cycleDayNow = diffDays(today, model.active.start) + 1;
  const daysLate = cycleDayNow - model.avg;
  const base = { dpo, daysLate };

  if (dpo < 0) {
    return { ...base, kind: 'fertile', label: `Masa Subur — ${-dpo} hari menuju ovulasi`,
      advice: 'Waktu terbaik berhubungan, frekuensi tiap 1–2 hari.' };
  }
  if (daysLate > 0 && dpo > 14) {
    return { ...base, kind: 'late', label: `Haid telat ${daysLate} hari`,
      advice: daysLate >= 3 ? 'Sebaiknya lakukan test pack sekarang (urin pagi pertama).' : 'Tunggu 2–3 hari lagi, lalu lakukan test pack bila haid belum datang.' };
  }
  if (dpo <= 6) return { ...base, kind: 'early', label: `${dpo} DPO — Fase implantasi awal`, advice: 'Belum ada gejala yang bisa diandalkan.' };
  if (dpo <= 11) return { ...base, kind: 'implantation', label: `${dpo} DPO — Jendela implantasi`, advice: 'Implantasi biasa terjadi 6–12 DPO; test pack belum akurat.' };
  if (dpo <= 14) return { ...base, kind: 'testable', label: `${dpo} DPO — Bisa mulai test`, advice: 'hCG mulai terdeteksi; pakai urin pagi pertama.' };
  return { ...base, kind: 'waiting', label: `${dpo} DPO — Menunggu`, advice: 'Sudah lewat masa subur; tunggu beberapa hari.' };
}

export const positiveTestMessage = '🎉 Selamat! Segera konsultasikan ke dokter kandungan untuk konfirmasi.';
