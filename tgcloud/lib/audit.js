// Audit integritas data — mendeteksi data yang melanggar invarian (mis. string
// chip yang tak dikenal akibat drift emoji, §24.2). Hanya mengembalikan AGREGAT
// (jumlah & nilai enum), tidak pernah isi catatan pribadi.
import { CHIP_DEFS, LH_LABEL, PREG_LABEL, RANGE, KB_TYPES, KB_STATUS_LABEL } from './constants.js';
import { addDays, isValidDate } from './dates.js';

const CHIP_FIELDS = ['flow', 'pain', 'mood', 'discharge'];

export function auditData(d, today) {
  const issues = [];
  const add = (table, issue, count, sample) => { if (count) issues.push({ table, issue, count, ...(sample?.length ? { sample: [...new Set(sample)].slice(0, 3) } : {}) }); };
  const horizon = addDays(today, 2); // toleransi zona waktu
  const badDate = (rows) => rows.filter((r) => !isValidDate(r.date) || r.date > horizon).length;

  for (const [name, rows] of Object.entries({ cycle_history: d.history, symptoms: d.symptoms, bbt: d.bbt, wellbeing: d.wellbeing, lh: d.lh, kb: d.kb, pregtest: d.preg })) {
    add(name, 'tanggal tidak valid / di masa depan', badDate(rows ?? []));
  }
  const unknown = [];
  let badChip = 0, badOther = 0;
  for (const r of d.symptoms ?? []) {
    for (const f of CHIP_FIELDS) if (r[f] != null && !CHIP_DEFS[f].includes(r[f])) { badChip++; unknown.push(`${f}=${r[f]}`); }
    for (const o of r.other ?? []) if (!CHIP_DEFS.other.includes(o)) { badOther++; unknown.push(`other=${o}`); }
  }
  add('symptoms', 'nilai chip tidak dikenal (cek drift string/emoji, PRD §24.2)', badChip + badOther, unknown);
  add('bbt', 'suhu di luar rentang', (d.bbt ?? []).filter((r) => r.tempCelsius < RANGE.bbt[0] || r.tempCelsius > RANGE.bbt[1]).length);
  add('wellbeing', 'skor di luar 1–5', (d.wellbeing ?? []).filter((r) => [r.energy, r.sleep, r.appetite, r.mood].some((v) => !(v >= 1 && v <= 5))).length);
  add('lh', 'hasil tidak dikenal', (d.lh ?? []).filter((r) => !(r.result in LH_LABEL)).length);
  add('pregtest', 'hasil tidak dikenal', (d.preg ?? []).filter((r) => !(r.result in PREG_LABEL)).length);
  add('kb', 'jenis/status tidak dikenal', (d.kb ?? []).filter((r) => !KB_TYPES.includes(r.type) || !(r.status in KB_STATUS_LABEL)).length);
  add('settings', 'panjang siklus/haid di luar rentang', (d.settings ?? []).filter((s) =>
    (s.cycleLength != null && (s.cycleLength < RANGE.cycleLength[0] || s.cycleLength > RANGE.cycleLength[1]))
    || (s.periodLength != null && (s.periodLength < RANGE.periodLength[0] || s.periodLength > RANGE.periodLength[1]))).length);
  add('settings', 'mode tidak dikenal', (d.settings ?? []).filter((s) => !['normal', 'pregnant'].includes(s.mode)).length);
  return issues;
}
