import test from 'node:test';
import assert from 'node:assert/strict';
import { createService, ServiceError } from '../tgcloud/lib/service.js';
import { runEndpoint } from '../tgcloud/lib/endpoint.js';
import { fakeRepo } from './helpers/fakes.js';

const NOW = Date.UTC(2026, 9, 20, 3, 0); // 20 Okt 2026 10:00 WIB
const setup = () => {
  const repo = fakeRepo();
  const svc = createService({ repo, config: { defaultTzOffset: 420 }, now: () => NOW });
  return { repo, svc, act: (i, uid = 1) => svc.act(uid, i) };
};
const onboard = (t, uid = 1) => t.act({ type: 'onboard', lastPeriodDate: '2026-10-10', cycleLength: 28, periodLength: 5, mode: 'normal' }, uid);
const fails = async (p, code) => {
  await assert.rejects(p, (e) => { assert.ok(e instanceof ServiceError, String(e)); if (code) assert.equal(e.code, code); return true; });
};

test('state kosong untuk pengguna baru; opsi chip tersedia untuk UI', async () => {
  const t = setup();
  const s = await t.svc.getState(1);
  assert.equal(s.configured, false); assert.equal(s.onboarded, false); assert.equal(s.today, '2026-10-20');
  assert.equal(s.cycle, undefined);
  assert.ok(s.options.chips.mood.includes('Bahagia 😊'));
  assert.deepEqual(s.ranges.cycleLength, [21, 45]);
});

test('onboard → state lengkap dengan fase, prediksi, analisis, laporan', async () => {
  const t = setup();
  const s = await onboard(t);
  assert.equal(s.configured, true); assert.equal(s.onboarded, true);
  assert.equal(s.cycle.phase, 'fertile');              // 20 Okt: masa subur (ovulasi 24 Okt)
  assert.equal(s.cycle.cycleDay, 11);
  assert.equal(s.cycle.nextPeriod, '2026-11-07'); assert.equal(s.cycle.daysToPeriod, 18);
  assert.equal(s.cycle.nextOvulation.date, '2026-10-24'); assert.equal(s.cycle.nextOvulation.source, 'calendar');
  assert.equal(s.cycle.phases['2026-10-10'], 'm'); assert.equal(s.cycle.phases['2026-10-24'], 'p'); assert.equal(s.cycle.phases['2026-10-26'], 'l');
  assert.ok(Object.keys(s.cycle.phases).length >= 8 * 28);
  assert.equal(s.data.history.length, 1);
  assert.match(s.report, /LAPORAN SIKLUS/); assert.match(s.share, /Haid berikutnya/);
  assert.equal(s.analysis, null); assert.equal(s.pregnancy, null);
  assert.ok(!JSON.stringify(s).includes('userId'));
});

test('onboard divalidasi; lewati onboarding menandai selesai tanpa data siklus', async () => {
  const t = setup();
  await fails(t.act({ type: 'onboard', lastPeriodDate: '2026-10-10', cycleLength: 10, periodLength: 5 }));
  await fails(t.act({ type: 'onboard', lastPeriodDate: '2099-01-01', cycleLength: 28, periodLength: 5 }));
  await fails(t.act({ type: 'onboard', lastPeriodDate: 'x', cycleLength: 28, periodLength: 5 }));
  const s = await t.act({ type: 'skipOnboarding' });
  assert.equal(s.onboarded, true); assert.equal(s.configured, false);
  await fails(t.act({ type: 'period', date: '2026-10-10' }), 'SETUP_REQUIRED');
});

test('catat haid: maju-saja, riwayat bertambah, analisis muncul', async () => {
  const t = setup(); await onboard(t);
  let s = await t.act({ type: 'period', date: '2026-09-12' });
  assert.equal(s.settings.lastPeriodDate, '2026-10-10');
  assert.equal(s.data.history.length, 2);
  assert.equal(s.analysis.avg, 28); assert.equal(s.analysis.regularity, 'Sangat Teratur');
  assert.equal(s.compare.cycles.length, 1);
  s = await t.act({ type: 'period', date: '2026-10-20' });
  assert.equal(s.settings.lastPeriodDate, '2026-10-20'); assert.equal(s.cycle.phase, 'menstruation');
  await fails(t.act({ type: 'period', date: '2026-10-21' }));
});

test('gejala: simpan, ubah sebagian tidak menghapus yang lain, kosongkan, hapus bila kosong semua', async () => {
  const t = setup(); await onboard(t);
  let s = await t.act({ type: 'symptom', date: '2026-10-19', flow: 'Ringan', mood: 'Bahagia 😊', other: ['Kembung', 'Mual'], notes: ' capek ' });
  let row = s.data.symptoms[0];
  assert.deepEqual([row.flow, row.mood, row.other, row.notes], ['Ringan', 'Bahagia 😊', ['Kembung', 'Mual'], 'capek']);
  s = await t.act({ type: 'symptom', date: '2026-10-19', notes: 'baik' }); // hanya catatan
  row = s.data.symptoms[0];
  assert.deepEqual([row.flow, row.other, row.notes], ['Ringan', ['Kembung', 'Mual'], 'baik']);
  s = await t.act({ type: 'symptom', date: '2026-10-19', flow: null, mood: '', other: [], notes: '' });
  assert.equal(s.data.symptoms.length, 0); // semuanya kosong → baris dihapus
  await fails(t.act({ type: 'symptom', date: '2026-10-19', mood: 'Bahagia' })); // tanpa emoji = drift §24.2
  await fails(t.act({ type: 'symptom', date: '2026-10-19', other: ['Pusing'] }));
  await fails(t.act({ type: 'symptom', date: '2026-10-19' }));
  await fails(t.act({ type: 'symptom', date: '2026-10-19', notes: 'x'.repeat(501) }));
});

test('BBT, wellbeing, LH, KB, test pack: simpan & validasi; LH memengaruhi ovulasi', async () => {
  const t = setup(); await onboard(t);
  let s = await t.act({ type: 'bbt', date: '2026-10-19', temp: '36,6' });
  assert.equal(s.data.bbt[0].tempCelsius, 36.6);
  await fails(t.act({ type: 'bbt', date: '2026-10-19', temp: 40 }));
  s = await t.act({ type: 'wellbeing', date: '2026-10-19', energy: 3, sleep: 4, appetite: 2, mood: 5 });
  assert.equal(s.data.wellbeing[0].appetite, 2);
  await fails(t.act({ type: 'wellbeing', date: '2026-10-19', energy: 6, sleep: 4, appetite: 2, mood: 5 }));
  s = await t.act({ type: 'lh', date: '2026-10-19', result: 'peak' });
  assert.deepEqual(s.cycle.nextOvulation, { date: '2026-10-20', source: 'lh' });
  assert.equal(s.cycle.phases['2026-10-20'], 'p');
  await fails(t.act({ type: 'lh', date: '2026-10-19', result: 'xx' }));
  await fails(t.act({ type: 'kb', date: '2026-10-19', kbType: 'Tidak ada', status: 'taken' }));
});

test('KB & test pack: id dikembalikan dan bisa dihapus per id', async () => {
  const t = setup(); await onboard(t);
  let s = await t.act({ type: 'kb', kbType: 'Pil KB', status: 'taken', date: '2026-10-19' });
  assert.equal(s.data.kb.length, 1); const id = s.data.kb[0].id; assert.ok(Number.isInteger(id));
  await t.act({ type: 'kb', kbType: 'Kondom', status: 'missed', date: '2026-10-19' });
  s = await t.act({ type: 'delete', kind: 'kb', id });
  assert.deepEqual(s.data.kb.map((r) => r.type), ['Kondom']);
  s = await t.act({ type: 'preg', date: '2026-10-19', result: 'positive' });
  assert.equal(s.data.preg[0].result, 'positive');
  await fails(t.act({ type: 'delete', kind: 'kb' }));
});

test('hapus siklus terbaru memundurkan last_period_date ke riwayat sebelumnya', async () => {
  const t = setup(); await onboard(t);
  await t.act({ type: 'period', date: '2026-09-12' });
  const s = await t.act({ type: 'delete', kind: 'cycle', date: '2026-10-10' });
  assert.equal(s.settings.lastPeriodDate, '2026-09-12'); assert.equal(s.data.history.length, 1);
  await fails(t.act({ type: 'delete', kind: 'zzz', date: '2026-10-10' }));
});

test('pengaturan: mode hamil → status DPO; zona waktu mengubah "hari ini"', async () => {
  const t = setup(); await onboard(t);
  let s = await t.act({ type: 'settings', mode: 'pregnant' });
  assert.match(s.pregnancy.label, /Masa Subur/);
  s = await t.act({ type: 'settings', tzOffset: -480 }); // UTC-8 → 19 Okt
  assert.equal(s.today, '2026-10-19');
  await fails(t.act({ type: 'settings', cycleLength: 99 }));
  await fails(t.act({ type: 'settings', tzOffset: 9999 }));
  await fails(t.act({ type: 'settings' }));
  await fails(t.act({ type: 'nope' }), 'UNKNOWN_ACTION');
});

test('PMS & korelasi muncul dari data gejala fase luteal', async () => {
  const t = setup(); await onboard(t);
  // gejala di fase luteal siklus September (ovulasi ~26 Sep → luteal 27 Sep–9 Okt)
  await t.act({ type: 'period', date: '2026-09-12' });
  const lut = ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
  let s;
  for (const d of lut) s = await t.act({ type: 'symptom', date: d, mood: 'Cemas 😟', pain: 'Berat', other: ['Kembung'] });
  assert.ok(s.pms, 'PMS terhitung'); assert.equal(s.pms.level, 'Berat');
  assert.equal(s.correlation.insufficient, false); assert.equal(s.correlation.rows[0].tag, 'Kembung');
});

test('reset butuh konfirmasi persis; data pengguna lain tak tersentuh', async () => {
  const t = setup(); await onboard(t, 1); await onboard(t, 2);
  await fails(t.act({ type: 'reset', confirm: 'ya' }, 1));
  const s = await t.act({ type: 'reset', confirm: 'HAPUS' }, 1);
  assert.equal(s.configured, false); assert.equal(s.data.history.length, 0);
  assert.equal((await t.svc.getState(2)).configured, true);
});

test('runEndpoint: auth, pemetaan error aman, error internal dicatat tanpa data pengguna', async () => {
  class EndpointError extends Error { constructor(m, p) { super(m); this.parameters = p; } }
  const repo = fakeRepo();
  const ctx = { initData: { user: { id: 7 } } };
  await assert.rejects(runEndpoint({ EndpointError, repo, ctx: {}, name: 'x', fn: async () => 1 }), (e) => e.parameters.code === 'UNAUTHORIZED');
  assert.equal(await runEndpoint({ EndpointError, repo, ctx, name: 'x', fn: async (uid) => uid }), 7);
  await assert.rejects(runEndpoint({ EndpointError, repo, ctx, name: 'x', fn: async () => { throw new ServiceError('salah', 'INVALID'); } }),
    (e) => e.message === 'salah' && e.parameters.code === 'INVALID');
  await assert.rejects(runEndpoint({ EndpointError, repo, ctx, name: 'act', fn: async () => { throw new Error('SQL secret=36.6'); } }),
    (e) => /kode #1/.test(e.message) && e.parameters.code === 'INTERNAL' && !/secret/.test(e.message));
  const ev = (await repo.recentEvents('error'))[0];
  assert.equal(ev.label, 'api:act'); assert.equal(ev.userId, 7);
});
