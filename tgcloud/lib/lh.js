// PRD §6 — deteksi LH surge.
import { addDays } from './dates.js';

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/**
 * Kembalikan { date, result } surge terbaru, atau null.
 * 'peak' diprioritaskan; yang diambil yang PALING BARU, bukan yang pertama
 * (PRD §24.1).
 */
export function detectLHSurge(entries) {
  const sorted = [...(entries ?? [])].sort(byDate);
  const peaks = sorted.filter((e) => e.result === 'peak');
  if (peaks.length) return peaks[peaks.length - 1];
  const highs = sorted.filter((e) => e.result === 'high');
  if (highs.length) return highs[highs.length - 1];
  return null;
}

/** Ovulasi ≈ peak + 1 hari, high + 2 hari. */
export const lhOvulationDate = (surge) => addDays(surge.date, surge.result === 'peak' ? 1 : 2);
