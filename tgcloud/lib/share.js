// PRD §19 — Mode Berbagi: HANYA fase & prediksi. Jangan diperluas tanpa diskusi.
import { PHASE_ICON, PHASE_LABEL } from './constants.js';

export function buildSharePayload(model, today) {
  const phase = model.phaseOn(today) ?? 'safe';
  return {
    fase_hari_ini: phase,
    label_fase: PHASE_LABEL[phase],
    hari_menuju_haid: model.daysToPeriod ?? null,
    hari_menuju_ovulasi: model.daysToOvulation ?? null,
  };
}

export function formatSharePayload(p) {
  const lines = [`${PHASE_ICON[p.fase_hari_ini]} Hari ini: ${p.label_fase}`];
  if (p.hari_menuju_haid != null) lines.push(`🩸 Haid berikutnya: ${p.hari_menuju_haid} hari lagi`);
  if (p.hari_menuju_ovulasi != null) lines.push(`⭐ Ovulasi berikutnya: ${p.hari_menuju_ovulasi} hari lagi`);
  lines.push('', 'Ringkasan satu arah dari Luna — bukan data langsung.');
  return lines.join('\n');
}
