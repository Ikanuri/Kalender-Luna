// Layanan Mini App: SATU-SATUNYA tempat logika bisnis dipanggil dari UI.
// UI tidak punya algoritma siklus; ia hanya merender state hasil getState().
// Dependensi (repo) disuntikkan → seluruhnya teruji tanpa platform.
import { addDays, isValidDate, todayIn } from './dates.js';
import { CHIP_DEFS, KB_STATUS_LABEL, KB_TYPES, LH_LABEL, PREG_LABEL, RANGE } from './constants.js';
import { parseIntInRange, parseTemp } from './parse.js';
import { createCycleModel } from './cycle.js';
import { compareCycles, computeAnalysis, computeCorrelation, detectAnomalies, getLutealStats, predictPMS, shouldShowPMS } from './analysis.js';
import { monthlyInsights } from './insights.js';
import { pregnancyStatus } from './pregnancy.js';
import { buildDoctorReport } from './report.js';
import { buildSharePayload, formatSharePayload } from './share.js';
import { buildGreeting, buildNarrative } from './narrative.js';
import { VERSION } from './version.js';

export class ServiceError extends Error {
  constructor(message, code = 'INVALID') { super(message); this.name = 'ServiceError'; this.code = code; }
}
const bad = (msg, code) => { throw new ServiceError(msg, code); };

const PHASE_CODE = { menstruation: 'm', fertile: 'f', peak: 'p', luteal: 'l', safe: 's' };
const clean = (rows) => rows.map(({ userId, ...r }) => r);
const configured = (s) => !!(s && s.lastPeriodDate && s.cycleLength && s.periodLength);

export function createService({ repo, config = {}, now = () => Date.now() }) {
  const tzOf = (s) => s?.tzOffset ?? config.defaultTzOffset ?? 420;

  const hourOf = (tz) => Math.floor((((now() + tz * 60000) % 86400000) + 86400000) % 86400000 / 3600000);

  /** user = { name } dari initData Telegram (hanya untuk sapaan; tidak disimpan). */
  async function getState(uid, user = {}) {
    const settings = await repo.getSettings(uid);
    const today = todayIn(tzOf(settings), now());
    const base = {
      version: VERSION, today, greeting: buildGreeting({ name: user.name, hour: hourOf(tzOf(settings)) }), tzOffset: tzOf(settings), onboarded: !!settings?.onboardedAt,
      configured: configured(settings), mode: settings?.mode ?? 'normal',
      settings: settings ? { lastPeriodDate: settings.lastPeriodDate ?? null, cycleLength: settings.cycleLength ?? null, periodLength: settings.periodLength ?? null } : null,
      ranges: { cycleLength: RANGE.cycleLength, periodLength: RANGE.periodLength, bbt: RANGE.bbt },
      options: { chips: CHIP_DEFS, kbTypes: KB_TYPES, lh: LH_LABEL, preg: PREG_LABEL, kbStatus: KB_STATUS_LABEL },
    };
    const [history, lh, bbt, symptoms, wellbeing, kb, preg] = await Promise.all([
      repo.listHistory(uid), repo.listLH(uid), repo.listBBT(uid), repo.listSymptoms(uid),
      repo.listWellbeing(uid), repo.listKB(uid), repo.listPreg(uid)]);
    const data = { history: clean(history), symptoms: clean(symptoms), bbt: clean(bbt), wellbeing: clean(wellbeing), lh: clean(lh), kb: clean(kb), preg: clean(preg) };
    if (!configured(settings)) return { ...base, data };

    const model = createCycleModel({ settings, history, lh, bbt }, today, symptoms[0]?.date ?? null);
    const phase = model.phaseOn(today) ?? 'safe';
    const info = model.infoOn(today);
    const phases = {};
    const ovulations = {};
    for (const [date, i] of model.map) { phases[date] = PHASE_CODE[i.phase]; ovulations[i.cycleStart] = i.ovulation; }
    const pms = predictPMS(symptoms, model.phaseOn);
    const pmsOut = pms ? { ...pms, show: shouldShowPMS(phase, model.daysToPeriod) } : null;
    const pregnancy = settings.mode === 'pregnant' ? pregnancyStatus(model, today) : null;
    return {
      ...base, data,
      cycle: {
        avg: model.avg, phase, cycleDay: info?.cycleDay ?? null, cycleStart: model.active.start,
        nextPeriod: model.nextPeriod, daysToPeriod: model.daysToPeriod,
        nextOvulation: model.nextOvulation, daysToOvulation: model.daysToOvulation,
        phases, ovulations,
      },
      narrative: buildNarrative({ phase, today, daysToPeriod: model.daysToPeriod, mode: settings.mode, pms: pmsOut, pregnancy }),
      pms: pmsOut,
      pregnancy,
      analysis: (() => { const a = computeAnalysis(history); return a ? { avg: a.avg, min: a.min, max: a.max, std: a.std, regularity: a.regularity, lengths: a.lengths } : null; })(),
      compare: compareCycles(history),
      anomalies: detectAnomalies(history),
      luteal: getLutealStats(history, bbt),
      correlation: computeCorrelation(symptoms, model.phaseOn),
      insights: monthlyInsights(history, bbt),
      report: buildDoctorReport({ today, settings, model, history, bbt, lh, symptomCount: symptoms.length }),
      share: formatSharePayload(buildSharePayload(model, today)),
    };
  }

  // ───────────── tulis ─────────────
  const handlers = {
    async onboard(uid, i, ctx) {
      const date = needDate(i.lastPeriodDate, ctx);
      const cl = needInt(i.cycleLength, RANGE.cycleLength, 'Panjang siklus');
      const pl = needInt(i.periodLength, RANGE.periodLength, 'Durasi haid');
      const mode = needMode(i.mode ?? 'normal');
      await repo.saveSettings(uid, { lastPeriodDate: date, cycleLength: cl, periodLength: pl, mode, onboardedAt: new Date() });
      await repo.addCycle(uid, { date, cycleLength: cl, periodLength: pl });
    },
    async skipOnboarding(uid) { await repo.saveSettings(uid, { onboardedAt: new Date() }); },
    async settings(uid, i) {
      const patch = {};
      if (i.cycleLength != null) patch.cycleLength = needInt(i.cycleLength, RANGE.cycleLength, 'Panjang siklus');
      if (i.periodLength != null) patch.periodLength = needInt(i.periodLength, RANGE.periodLength, 'Durasi haid');
      if (i.mode != null) patch.mode = needMode(i.mode);
      if (i.tzOffset != null) {
        if (!Number.isInteger(i.tzOffset) || i.tzOffset < -720 || i.tzOffset > 840) bad('Zona waktu tidak valid.');
        patch.tzOffset = i.tzOffset;
      }
      if (!Object.keys(patch).length) bad('Tidak ada perubahan.');
      await repo.saveSettings(uid, patch);
    },
    async period(uid, i, ctx) {
      const date = needDate(i.date, ctx);
      const s = ctx.settings;
      if (!s?.cycleLength || !s?.periodLength) bad('Isi panjang siklus dan durasi haid dulu.', 'SETUP_REQUIRED');
      await repo.addCycle(uid, { date, cycleLength: s.cycleLength, periodLength: s.periodLength });
      // last_period_date hanya maju; mencatat haid lama tak boleh memundurkannya.
      if (!s.lastPeriodDate || date > s.lastPeriodDate) await repo.saveSettings(uid, { lastPeriodDate: date });
    },
    async symptom(uid, i, ctx) {
      const date = needDate(i.date, ctx);
      // Kunci yang tidak dikirim = dibiarkan; null/'' = sengaja dikosongkan.
      const patch = {};
      for (const f of ['flow', 'pain', 'mood', 'discharge']) {
        if (!(f in i)) continue;
        if (i[f] == null || i[f] === '') { patch[f] = null; continue; }
        if (!CHIP_DEFS[f].includes(i[f])) bad(`Nilai ${f} tidak dikenal.`);
        patch[f] = i[f];
      }
      if ('other' in i) {
        if (i.other != null && (!Array.isArray(i.other) || i.other.some((o) => !CHIP_DEFS.other.includes(o)))) bad('Gejala lain tidak dikenal.');
        patch.other = [...new Set(i.other ?? [])];
      }
      if ('notes' in i) {
        if (i.notes != null && (typeof i.notes !== 'string' || i.notes.length > 500)) bad('Catatan maksimal 500 karakter.');
        patch.notes = (i.notes ?? '').trim() || null;
      }
      if (!Object.keys(patch).length) bad('Tidak ada gejala yang dikirim.');
      const existing = (await repo.listSymptoms(uid)).find((r) => r.date === date);
      const merged = { ...(existing ?? {}), ...patch };
      const empty = ['flow', 'pain', 'mood', 'discharge', 'notes'].every((f) => !merged[f]) && !(merged.other ?? []).length;
      if (empty) { await repo.deleteEntry(uid, 'symptom', { date }); return; }
      await repo.upsertSymptom(uid, date, patch);
    },
    async bbt(uid, i, ctx) {
      const date = needDate(i.date, ctx);
      const t = parseTemp(String(i.temp));
      if (t == null) bad(`Suhu harus ${RANGE.bbt[0]}–${RANGE.bbt[1]} °C.`);
      await repo.upsertBBT(uid, date, t);
    },
    async wellbeing(uid, i, ctx) {
      const date = needDate(i.date, ctx);
      const v = {};
      for (const f of ['energy', 'sleep', 'appetite', 'mood']) {
        v[f] = parseIntInRange(String(i[f]), [1, 5]);
        if (v[f] == null) bad('Skor wellbeing harus 1–5.');
      }
      await repo.upsertWellbeing(uid, date, v);
    },
    async lh(uid, i, ctx) {
      const date = needDate(i.date, ctx);
      if (!(i.result in LH_LABEL)) bad('Hasil LH tidak dikenal.');
      await repo.upsertLH(uid, date, i.result);
    },
    async kb(uid, i, ctx) {
      const date = needDate(i.date, ctx);
      // `type` sudah dipakai sebagai jenis aksi → jenis kontrasepsi dikirim sebagai `kbType`.
      if (!KB_TYPES.includes(i.kbType) || !(i.status in KB_STATUS_LABEL)) bad('Data kontrasepsi tidak valid.');
      await repo.addKB(uid, date, i.kbType, i.status);
    },
    async preg(uid, i, ctx) {
      const date = needDate(i.date, ctx);
      if (!(i.result in PREG_LABEL)) bad('Hasil test pack tidak dikenal.');
      await repo.addPreg(uid, date, i.result);
    },
    async delete(uid, i, ctx) {
      const kinds = ['symptom', 'bbt', 'wellbeing', 'lh', 'kb', 'preg', 'cycle'];
      if (!kinds.includes(i.kind)) bad('Jenis data tidak dikenal.');
      if (i.kind === 'kb' || i.kind === 'preg') {
        if (!Number.isInteger(i.id)) bad('ID entri wajib.');
        await repo.deleteEntry(uid, i.kind, { id: i.id });
        return;
      }
      if (!isValidDate(i.date)) bad('Tanggal tidak valid.');
      await repo.deleteEntry(uid, i.kind, { date: i.date });
      if (i.kind === 'cycle' && ctx.settings?.lastPeriodDate === i.date) {
        const rest = await repo.listHistory(uid);
        if (rest.length) await repo.saveSettings(uid, { lastPeriodDate: rest[rest.length - 1].date });
      }
    },
    async reset(uid, i) {
      if (i.confirm !== 'HAPUS') bad('Konfirmasi tidak cocok.');
      await repo.resetAll(uid);
    },
  };

  const needMode = (m) => (['normal', 'pregnant'].includes(m) ? m : bad('Mode tidak dikenal.'));
  function needInt(v, range, label) {
    const n = parseIntInRange(String(v), range);
    return n ?? bad(`${label} harus ${range[0]}–${range[1]} hari.`);
  }
  function needDate(d, ctx) {
    if (!isValidDate(d)) bad('Tanggal tidak valid.');
    if (d > addDays(ctx.today, 0)) bad('Tanggal tidak boleh di masa depan.');
    return d;
  }

  /** Jalankan satu aksi tulis lalu kembalikan state terbaru (satu round-trip). */
  async function act(uid, input, user = {}) {
    const fn = handlers[input?.type];
    if (!fn) bad('Aksi tidak dikenal.', 'UNKNOWN_ACTION');
    const settings = await repo.getSettings(uid);
    await fn(uid, input, { settings, today: todayIn(tzOf(settings), now()) });
    return getState(uid, user);
  }

  return { getState, act };
}
