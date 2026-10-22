import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, diffDays, isValidDate, todayIn } from '../tgcloud/lib/dates.js';
import { detectLHSurge } from '../tgcloud/lib/lh.js';
import { detectBBTOvulation } from '../tgcloud/lib/bbt.js';
import { computeAvgCycle, createCycleModel, determineOvulation, getNextPeriod } from '../tgcloud/lib/cycle.js';
import { computeAnalysis, detectAnomalies, predictPMS, computeCorrelation, getLutealStats } from '../tgcloud/lib/analysis.js';
import { pregnancyStatus } from '../tgcloud/lib/pregnancy.js';
import { decideReminder } from '../tgcloud/lib/reminders.js';
import { buildSharePayload } from '../tgcloud/lib/share.js';
import { monthlyInsights } from '../tgcloud/lib/insights.js';

const h = (date, cl = 28, pl = 5) => ({ date, cycleLength: cl, periodLength: pl });
const temps = (start, vals) => vals.map((t, i) => ({ date: addDays(start, i), tempCelsius: t }));

test('dates', () => {
  assert.equal(addDays('2026-02-27', 2), '2026-03-01');
  assert.equal(diffDays('2026-03-01', '2026-02-01'), 28);
  assert.ok(!isValidDate('2026-02-30'));
  assert.equal(todayIn(420, Date.UTC(2026, 0, 1, 20, 0)), '2026-01-02');
});

test('avg cycle: fallback, filter 18–50, rounding', () => {
  assert.equal(computeAvgCycle([h('2026-01-01')], 30), 30);
  assert.equal(computeAvgCycle([h('2026-01-01'), h('2026-01-08')], 30), 30); // gap 7 dibuang
  assert.equal(computeAvgCycle([h('2026-01-01'), h('2026-01-29'), h('2026-02-28')], 30), 29);
});

test('LH: ambil peak TERBARU (§24.1)', () => {
  const e = [{ date: '2026-01-10', result: 'peak' }, { date: '2026-02-08', result: 'peak' }, { date: '2026-02-10', result: 'high' }];
  assert.equal(detectLHSurge(e).date, '2026-02-08');
  assert.equal(detectLHSurge([{ date: '2026-01-01', result: 'high' }, { date: '2026-01-03', result: 'high' }]).date, '2026-01-03');
  assert.equal(detectLHSurge([{ date: '2026-01-01', result: 'negative' }]), null);
});

test('BBT 3-over-6 terdeteksi; window bolong di-skip (§24.3)', () => {
  const ok = temps('2026-01-10', [36.3, 36.3, 36.4, 36.3, 36.35, 36.3, 36.6, 36.7, 36.65]);
  assert.equal(detectBBTOvulation(ok, '2026-01-01', '2026-01-31'), '2026-01-15');
  const gap = ok.map((e, i) => (i >= 6 ? { ...e, date: addDays(e.date, 3) } : e)); // bolong 3 hari
  assert.equal(detectBBTOvulation(gap, '2026-01-01', '2026-01-31'), null);
  const flat = temps('2026-01-10', Array(9).fill(36.4));
  assert.equal(detectBBTOvulation(flat, '2026-01-01', '2026-01-31'), null);
});

test('ovulasi: prioritas LH > BBT > kalender', () => {
  const base = { cycleStart: '2026-01-01', cycleEnd: '2026-01-28', avg: 28 };
  assert.deepEqual(determineOvulation({ ...base, lh: [], bbt: [] }), { date: '2026-01-15', source: 'calendar' });
  assert.deepEqual(determineOvulation({ ...base, lh: [{ date: '2026-01-12', result: 'peak' }], bbt: [] }), { date: '2026-01-13', source: 'lh' });
  assert.deepEqual(determineOvulation({ ...base, lh: [{ date: '2026-01-12', result: 'high' }], bbt: [] }).date, '2026-01-14');
  // LH di luar window siklus → diabaikan
  assert.equal(determineOvulation({ ...base, lh: [{ date: '2026-03-12', result: 'peak' }], bbt: [] }).source, 'calendar');
});

test('fase harian: haid menang atas fertile; urutan fase', () => {
  const settings = { lastPeriodDate: '2026-01-01', cycleLength: 28, periodLength: 5 };
  const m = createCycleModel({ settings, history: [], lh: [], bbt: [] }, '2026-01-03');
  assert.equal(m.phaseOn('2026-01-01'), 'menstruation');
  assert.equal(m.phaseOn('2026-01-05'), 'menstruation');
  assert.equal(m.phaseOn('2026-01-06'), 'safe');
  assert.equal(m.phaseOn('2026-01-09'), 'safe'); // ov=15 → fertile 10..14
  assert.equal(m.phaseOn('2026-01-14'), 'fertile');
  assert.equal(m.phaseOn('2026-01-10'), 'fertile');
  assert.equal(m.phaseOn('2026-01-15'), 'peak');
  assert.equal(m.phaseOn('2026-01-16'), 'luteal');
  assert.equal(m.phaseOn('2026-01-29'), 'menstruation'); // siklus berikut
  const short = createCycleModel({ settings: { ...settings, cycleLength: 21, periodLength: 10 }, history: [], lh: [], bbt: [] }, '2026-01-03');
  assert.equal(short.phaseOn('2026-01-05'), 'menstruation'); // ov hari 7 → window 2–6, tetap haid
});

test('prediksi haid & ovulasi berikutnya', () => {
  assert.equal(getNextPeriod('2026-01-01', 28, '2026-01-01'), '2026-01-29');
  assert.equal(getNextPeriod('2026-01-01', 28, '2026-01-28'), '2026-01-29');
  const settings = { lastPeriodDate: '2026-01-01', cycleLength: 28, periodLength: 5 };
  const m = createCycleModel({ settings, history: [], lh: [], bbt: [] }, '2026-01-20');
  assert.equal(m.nextOvulation.date, '2026-02-12'); // ov siklus ini (15 Jan) sudah lewat
  assert.equal(m.nextPeriod, '2026-01-29');
  const lh = createCycleModel({ settings, history: [], lh: [{ date: '2026-01-21', result: 'peak' }], bbt: [] }, '2026-01-20');
  assert.deepEqual(lh.nextOvulation, { date: '2026-01-22', source: 'lh' });
});

test('analisis: std sampel & keteraturan; anomali', () => {
  const hist = [h('2026-01-01'), h('2026-01-29'), h('2026-02-26'), h('2026-03-26'), h('2026-04-23')];
  const a = computeAnalysis(hist);
  assert.equal(a.avg, 28); assert.equal(a.std, 0); assert.equal(a.regularity, 'Sangat Teratur');
  assert.equal(computeAnalysis([h('2026-01-01')]), null);
  const wide = [h('2026-01-01'), h('2026-01-29'), h('2026-02-26'), h('2026-04-20')]; // 28,28,53 → 53 dibuang (>50)
  assert.deepEqual(computeAnalysis(wide).lengths, [28, 28]);
  const anomal = [h('2026-01-01'), h('2026-01-29'), h('2026-02-26'), h('2026-03-26'), h('2026-04-23'), h('2026-06-20')]; // 58 > 50 buang
  assert.equal(detectAnomalies(anomal).length, 0);
  const real = [h('2026-01-01'), h('2026-01-19'), h('2026-02-16'), h('2026-03-16'), h('2026-04-13'), h('2026-05-11'), h('2026-06-08'), h('2026-07-06'), h('2026-08-03'), h('2026-09-01')];
  assert.ok(detectAnomalies(real).some((x) => x.deviasi < -7)); // siklus 18 hari
});

test('PMS: mood netral dikecualikan lewat NEUTRAL_MOODS (§24.2)', () => {
  const luteal = () => 'luteal';
  const rows = [
    { date: '2026-01-20', mood: 'Bahagia 😊', pain: 'Tidak ada', other: [] },
    { date: '2026-01-21', mood: 'Bahagia 😊', pain: 'Tidak ada', other: [] },
    { date: '2026-01-22', mood: 'Normal', pain: 'Tidak ada', other: [] },
    { date: '2026-01-23', mood: 'Normal', pain: 'Tidak ada', other: [] },
    { date: '2026-01-24', mood: 'Normal', pain: 'Tidak ada', other: [] },
  ];
  assert.equal(predictPMS(rows, luteal).skor, 0);
  const bad = rows.map((r) => ({ ...r, mood: 'Cemas 😟', pain: 'Berat', other: ['Kembung'] }));
  const r = predictPMS(bad, luteal);
  assert.equal(r.skor, 100); assert.equal(r.level, 'Berat');
  assert.equal(predictPMS(rows.slice(0, 4), luteal), null);
  assert.equal(predictPMS(rows, () => 'safe'), null);
});

test('korelasi & luteal', () => {
  assert.equal(computeCorrelation([], () => 'safe').insufficient, true);
  const rows = [
    { date: 'a', other: ['Kembung'], mood: 'Normal' }, { date: 'b', other: ['Kembung'], mood: 'Cemas 😟' },
    { date: 'c', other: [], pain: 'Ringan' },
  ];
  const c = computeCorrelation(rows, (d) => (d === 'c' ? 'safe' : 'luteal'));
  assert.equal(c.rows[0].tag, 'Kembung');
  assert.equal(c.rows[0].perPhase.luteal, 100);
  assert.equal(getLutealStats([h('2026-01-01')], []), null);
});

test('kehamilan (DPO), reminder, berbagi, insight', () => {
  const settings = { lastPeriodDate: '2026-01-01', cycleLength: 28, periodLength: 5 };
  const mk = (today) => createCycleModel({ settings, history: [], lh: [], bbt: [] }, today);
  assert.match(pregnancyStatus(mk('2026-01-10'), '2026-01-10').label, /Masa Subur — 5 hari/);
  assert.match(pregnancyStatus(mk('2026-01-18'), '2026-01-18').label, /3 DPO/);
  assert.match(pregnancyStatus(mk('2026-01-24'), '2026-01-24').label, /9 DPO — Jendela/);
  assert.match(pregnancyStatus(mk('2026-01-28'), '2026-01-28').label, /13 DPO — Bisa mulai test/);
  const late = createCycleModel({ settings: { ...settings, lastPeriodDate: '2025-12-20' }, history: [], lh: [], bbt: [] }, '2026-01-20');
  // siklus aktif dihitung otomatis maju; telat hanya terdeteksi dalam siklus yg sama
  assert.ok(pregnancyStatus(late, '2026-01-20'));

  assert.equal(decideReminder({ model: mk('2026-01-28'), mode: 'normal', today: '2026-01-28', lastReminderDate: null }).kind, 'period-tomorrow');
  assert.equal(decideReminder({ model: mk('2026-01-28'), mode: 'normal', today: '2026-01-28', lastReminderDate: '2026-01-28' }), null);
  assert.equal(decideReminder({ model: mk('2026-01-14'), mode: 'pregnant', today: '2026-01-14', lastReminderDate: null }).kind, 'ovulation-tomorrow');
  assert.equal(decideReminder({ model: mk('2026-01-12'), mode: 'normal', today: '2026-01-12', lastReminderDate: null }).kind, 'fertile');
  assert.equal(decideReminder({ model: mk('2026-01-07'), mode: 'normal', today: '2026-01-07', lastReminderDate: null }), null);

  const p = buildSharePayload(mk('2026-01-15'), '2026-01-15');
  assert.deepEqual(Object.keys(p).sort(), ['fase_hari_ini', 'hari_menuju_haid', 'hari_menuju_ovulasi', 'label_fase']);
  assert.equal(p.fase_hari_ini, 'peak');

  const reg = [h('2026-01-01'), h('2026-01-29'), h('2026-02-26'), h('2026-03-26')];
  assert.ok(monthlyInsights(reg, []).length <= 2);
  assert.match(monthlyInsights(reg, [])[0], /sangat teratur/);
});
