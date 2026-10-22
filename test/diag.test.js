import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBot } from '../tgcloud/lib/bot.js';
import { runSelfTest, summarize } from '../tgcloud/lib/selftest.js';
import { auditData } from '../tgcloud/lib/audit.js';
import { sanitizeError, callbackLabel } from '../tgcloud/lib/diag.js';
import { VERSION } from '../tgcloud/lib/version.js';
import { fakeApi, fakeRepo, msg, cb } from './helpers/fakes.js';

const NOW = Date.UTC(2026, 9, 20, 3, 0);
const setup = () => {
  const api = fakeApi(), repo = fakeRepo();
  const bot = createBot({ api, repo, now: () => NOW, config: { adminIds: [99], clickableCells: false, defaultTzOffset: 420 } });
  return { api, repo, bot, say: (t, uid = 1) => bot.handleMessage(msg(uid, t)), tap: (d, uid = 1) => bot.handleCallback(cb(uid, d)) };
};

test('versi di version.js sama dengan package.json', () => {
  assert.equal(VERSION, JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version);
});

test('self-test fixture emas lolos semua', () => {
  const s = summarize(runSelfTest());
  assert.deepEqual(s.failed, []);
  assert.ok(s.total >= 10);
});

test('audit mendeteksi drift string chip (§24.2), suhu, skor, tanggal masa depan', () => {
  const issues = auditData({
    settings: [{ userId: 1, cycleLength: 60, periodLength: 5, mode: 'aneh' }],
    history: [], bbt: [{ date: '2026-10-01', tempCelsius: 41 }],
    symptoms: [{ date: '2026-10-01', mood: 'Bahagia', other: ['Kembung', 'Pusing'] }, { date: '2099-01-01' }],
    wellbeing: [{ date: '2026-10-01', energy: 9, sleep: 3, appetite: 3, mood: 3 }], lh: [{ date: '2026-10-01', result: 'xx' }], kb: [], preg: [],
  }, '2026-10-20');
  const has = (t, re) => issues.some((i) => i.table === t && re.test(i.issue));
  assert.ok(has('symptoms', /chip tidak dikenal/)); assert.ok(has('bbt', /suhu/)); assert.ok(has('wellbeing', /1–5/));
  assert.ok(has('lh', /tidak dikenal/)); assert.ok(has('settings', /rentang/)); assert.ok(has('settings', /mode/)); assert.ok(has('symptoms', /masa depan/));
  assert.deepEqual(auditData({ settings: [], history: [], bbt: [], symptoms: [], wellbeing: [], lh: [], kb: [], preg: [] }, '2026-10-20'), []);
});

test('sanitasi error & label callback tidak membawa data pengguna', () => {
  const e = sanitizeError(new TypeError('boom'));
  assert.equal(e.name, 'TypeError'); assert.ok(e.stack.split('\n').every((l) => /^\s*at /.test(l)));
  assert.equal(callbackLabel('cal:2026-10-20'), 'cb:cal');
});

test('error tak terduga: dicatat, pengguna dapat kode, admin diberi tahu, teks pengguna tidak tersimpan', async () => {
  const t = setup();
  t.repo.upsertBBT = async () => { throw new Error('db down'); };
  await t.say('/suhu 36.6 RAHASIA-123');
  const user = t.api.calls.find((c) => c.p.chat_id === 1 && /kesalahan/.test(c.p.text));
  assert.match(user.p.text, /kode #1/);
  const adminMsg = t.api.calls.find((c) => c.p.chat_id === 99);
  assert.match(adminMsg.p.text, /Error #1 di \/suhu/);
  const ev = (await t.repo.recentEvents('error'))[0];
  assert.equal(ev.label, '/suhu');
  assert.ok(!JSON.stringify(ev).includes('RAHASIA'));
  // callback juga terlindungi
  t.repo.getConv = async () => { throw new Error('conv fail'); };
  await t.tap('sym:flow:1');
  assert.equal((await t.repo.recentEvents('error')).length, 2);
});

test('/diag hanya untuk admin; ringkasan, error, audit, self', async () => {
  const t = setup();
  await t.say('/diag', 1);
  assert.equal(t.api.calls.length, 0); // non-admin: diam
  await t.say('/diag', 99);
  const sum = t.api.last('sendMessage').text;
  assert.match(sum, /Diagnosis Luna v/); assert.match(sum, /Self-test: \d+\/\d+ ✅/); assert.match(sum, /belum pernah/);
  t.repo.upsertBBT = async () => { throw new Error('x'); };
  await t.say('/suhu 36.5', 1);
  await t.say('/diag error 1', 99); assert.match(t.api.last('sendMessage').text, /Error #1/);
  await t.say('/diag errors', 99); assert.match(t.api.last('sendMessage').text, /#1 \/suhu/);
  await t.say('/diag audit', 99); assert.match(t.api.last('sendMessage').text, /bersih/);
  await t.say('/diag self', 99); assert.match(t.api.last('sendMessage').text, /Self-test \d+\/\d+/);
});

test('sapuan reminder mencatat event cron yang muncul di /diag', async () => {
  const t = setup();
  await t.bot.runReminders();
  assert.equal((await t.repo.recentEvents('cron'))[0].source, 'reminders');
});
