// PRD §5 — perhitungan fase siklus & prediksi.
import { addDays, diffDays } from './dates.js';
import { RANGE } from './constants.js';
import { detectLHSurge, lhOvulationDate } from './lh.js';
import { detectBBTOvulation } from './bbt.js';

const sortHist = (history) => [...(history ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1));

/** Selisih hari antar siklus berurutan yang masih valid (18–50). */
export function validGaps(history) {
  const h = sortHist(history);
  const gaps = [];
  for (let i = 1; i < h.length; i++) {
    const diff = diffDays(h[i].date, h[i - 1].date);
    if (diff >= RANGE.validCycleGap[0] && diff <= RANGE.validCycleGap[1]) {
      gaps.push({ start: h[i - 1].date, end: h[i].date, length: diff, periodLength: h[i - 1].periodLength });
    }
  }
  return gaps;
}

/** §5.1 */
export function computeAvgCycle(history, fallback) {
  if ((history ?? []).length < 2) return fallback;
  const gaps = validGaps(history);
  if (!gaps.length) return fallback;
  return Math.round(gaps.reduce((s, g) => s + g.length, 0) / gaps.length);
}

/** §5.2 — LH > BBT > kalender. Kembalikan { date, source }. */
export function determineOvulation({ cycleStart, cycleEnd, avg, lh, bbt }) {
  const surge = detectLHSurge(lh);
  if (surge) {
    const ov = lhOvulationDate(surge);
    if (ov >= cycleStart && ov <= cycleEnd) return { date: ov, source: 'lh' };
  }
  const bbtOv = detectBBTOvulation(bbt, cycleStart, cycleEnd);
  if (bbtOv) return { date: bbtOv, source: 'bbt' };
  return { date: addDays(cycleStart, avg - 14), source: 'calendar' };
}

/** §5.3 — urutan pengecekan WAJIB persis begini. */
export function phaseOfDay(d, periodLength, daysDiff) {
  if (d < periodLength) return 'menstruation';
  if (daysDiff >= -5 && daysDiff <= -1) return 'fertile';
  if (daysDiff === 0) return 'peak';
  if (daysDiff > 0) return 'luteal';
  return 'safe';
}

/**
 * §5.3 — Map tanggal → { phase, cycleStart, ovulation }.
 * Default 8 siklus (c = -2 … 5). `backCycles` dapat diperbesar agar gejala
 * lama tetap punya fase (lihat createCycleModel).
 */
export function buildCycleMap({ settings, avg, lh, bbt }, backCycles = 2, forwardCycles = 6) {
  const map = new Map();
  const pl = settings.periodLength;
  for (let c = -backCycles; c < forwardCycles; c++) {
    const cycleStart = addDays(settings.lastPeriodDate, c * avg);
    const cycleEnd = addDays(cycleStart, avg - 1);
    const ovulation = determineOvulation({ cycleStart, cycleEnd, avg, lh, bbt });
    for (let d = 0; d < avg; d++) {
      const date = addDays(cycleStart, d);
      const phase = phaseOfDay(d, pl, diffDays(date, ovulation.date));
      map.set(date, { phase, cycleStart, ovulation, cycleDay: d + 1 });
    }
  }
  return map;
}

/** §5.4 */
export function getNextPeriod(lastPeriodDate, avg, today) {
  let next = lastPeriodDate;
  while (next <= today) next = addDays(next, avg);
  return next;
}

/** Awal siklus aktif: start terbesar ≤ today (dari proyeksi last_period + k*avg). */
export function activeCycleStart(lastPeriodDate, avg, today) {
  const k = Math.floor(diffDays(today, lastPeriodDate) / avg);
  return addDays(lastPeriodDate, k * avg);
}

/** §5.5 → { date, source } */
export function getNextOvulation({ settings, avg, lh, bbt }, today) {
  const cycleStart = activeCycleStart(settings.lastPeriodDate, avg, today);
  const cycleEnd = addDays(cycleStart, avg - 1);
  const detected = determineOvulation({ cycleStart, cycleEnd, avg, lh, bbt });
  if (detected.source !== 'calendar' && detected.date >= today) return detected;

  let base = settings.lastPeriodDate;
  let ov;
  for (let i = 0; i < 100; i++) {
    ov = addDays(base, avg - 14);
    base = addDays(base, avg);
    if (ov >= today) break;
  }
  return { date: ov, source: 'calendar' };
}

/**
 * Bungkus semua perhitungan untuk satu pengguna & satu "hari ini".
 * data = { settings, history, lh, bbt }; settings wajib punya lastPeriodDate,
 * cycleLength, periodLength. `minDate` (opsional) memperpanjang proyeksi ke
 * belakang supaya catatan lama tetap terpetakan ke fase (maks 36 siklus).
 */
export function createCycleModel(data, today, minDate = null) {
  const { settings, history, lh, bbt } = data;
  const avg = computeAvgCycle(history, settings.cycleLength);
  let back = 2;
  if (minDate && minDate < settings.lastPeriodDate) {
    back = Math.min(36, Math.max(2, Math.ceil(diffDays(settings.lastPeriodDate, minDate) / avg) + 1));
  }
  const map = buildCycleMap({ settings, avg, lh, bbt }, back);
  const cycleStart = activeCycleStart(settings.lastPeriodDate, avg, today);
  const active = {
    start: cycleStart,
    end: addDays(cycleStart, avg - 1),
    ovulation: determineOvulation({ cycleStart, cycleEnd: addDays(cycleStart, avg - 1), avg, lh, bbt }),
  };
  const nextPeriod = getNextPeriod(settings.lastPeriodDate, avg, today);
  const nextOvulation = getNextOvulation({ settings, avg, lh, bbt }, today);
  return {
    avg, map, today, active, nextPeriod, nextOvulation,
    daysToPeriod: diffDays(nextPeriod, today),
    daysToOvulation: diffDays(nextOvulation.date, today),
    /** Fase pada tanggal; null bila di luar rentang proyeksi. */
    phaseOn: (date) => map.get(date)?.phase ?? null,
    infoOn: (date) => map.get(date) ?? null,
  };
}
