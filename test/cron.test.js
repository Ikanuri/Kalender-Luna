import test from 'node:test';
import assert from 'node:assert/strict';
import { runCron } from '../tgcloud/lib/cron.js';
import { ServiceError } from '../tgcloud/lib/service.js';
import { fakeApi, fakeRepo } from './helpers/fakes.js';

const NOW = Date.UTC(2026, 9, 20, 3, 0); // 20 Okt 2026 10:00 WIB; haid berikutnya 21 Okt → "Haid besok"
const config = { adminIds: [99], defaultTzOffset: 420 };
const DUE = { lastPeriodDate: '2026-09-23', cycleLength: 28, periodLength: 5 };
const NOT_DUE = { lastPeriodDate: '2026-10-10', cycleLength: 28, periodLength: 5 };

async function setup(users = { 1: DUE, 2: DUE, 3: NOT_DUE, 4: DUE }) {
  const repo = fakeRepo(), api = fakeApi();
  for (const [id, s] of Object.entries(users)) await repo.saveSettings(Number(id), s);
  const run = (input, uid = 99) => runCron({ api, repo, config, uid, input, nowMs: NOW });
  return { repo, api, run };
}
const sentTo = (api) => api.calls.filter((c) => c.m === 'sendMessage').map((c) => c.p.chat_id).sort();

test('hanya admin yang boleh memicu sapuan', async () => {
  const t = await setup();
  await assert.rejects(t.run({}, 1), (e) => e instanceof ServiceError && e.code === 'FORBIDDEN');
  assert.equal(t.api.calls.length, 0);
});

test('dry-run: menghitung yang jatuh tempo, tidak mengirim, tidak menandai, tetap tercatat', async () => {
  const t = await setup();
  const r = await t.run({ dry: true });
  assert.deepEqual([r.users, r.due, r.sent, r.failed, r.dry], [4, 3, 0, 0, true]);
  assert.equal(t.api.calls.length, 0);
  assert.equal((await t.repo.getSettings(1)).lastReminderDate, undefined);
  assert.equal((await t.repo.recentEvents('cron'))[0].detail.dry, true);
});

test('sapuan nyata: terkirim sekali per hari per pengguna; previousRun membuktikan catatan bertahan', async () => {
  const t = await setup();
  const r1 = await t.run({});
  assert.deepEqual([r1.due, r1.sent, r1.failed], [3, 3, 0]); assert.equal(r1.previousRun, null);
  assert.deepEqual(sentTo(t.api), [1, 2, 4]);
  assert.match(t.api.calls[0].p.text, /Haid besok/);
  assert.equal((await t.repo.getSettings(1)).lastReminderDate, '2026-10-20');
  const r2 = await t.run({});
  assert.deepEqual([r2.due, r2.sent], [0, 0]);            // sudah terkirim hari ini
  assert.equal(sentTo(t.api).length, 3);
  assert.equal(r2.previousRun.detail.sent, 3);              // sapuan pertama terbaca di sapuan kedua
});

test('satu pengguna gagal (bot diblokir) tidak menghentikan yang lain; ia dicoba lagi besok', async () => {
  const t = await setup();
  const orig = t.api.sendMessage;
  t.api.sendMessage = async (p) => { if (p.chat_id === 2) { const e = new Error('x'); e.description = 'Forbidden: bot was blocked by the user'; throw e; } return orig(p); };
  const r = await t.run({});
  assert.deepEqual([r.sent, r.failed], [2, 1]);
  assert.equal((await t.repo.getSettings(2)).lastReminderDate, undefined); // tidak ditandai → dicoba lagi
  assert.equal((await t.repo.getSettings(1)).lastReminderDate, '2026-10-20');
});

test('shard membagi pengguna tanpa tumpang tindih; semua shard = sapuan penuh', async () => {
  const t = await setup({ 1: DUE, 2: DUE, 3: DUE, 4: DUE, 5: DUE });
  const a = await t.run({ shard: 0, of: 2 }), b = await t.run({ shard: 1, of: 2 });
  assert.deepEqual([a.users, b.users], [2, 3]);             // genap: 2,4 · ganjil: 1,3,5
  assert.deepEqual(sentTo(t.api), [1, 2, 3, 4, 5]);
});

test('validasi shard/of', async () => {
  const t = await setup();
  for (const bad of [{ of: 0 }, { of: 2, shard: 2 }, { shard: -1 }, { of: 1.5 }, { of: 101 }]) {
    await assert.rejects(t.run(bad), (e) => e instanceof ServiceError && e.code === 'INVALID', JSON.stringify(bad));
  }
});

test('pengguna tanpa data siklus lengkap tidak ikut disapu', async () => {
  const t = await setup({ 1: DUE, 2: { mode: 'normal' } });
  const r = await t.run({});
  assert.deepEqual([r.users, r.sent], [1, 1]);
});
