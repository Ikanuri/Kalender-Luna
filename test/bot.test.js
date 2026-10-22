import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../tgcloud/lib/bot.js';
import { fakeApi, fakeRepo, msg, cb } from './helpers/fakes.js';

const NOW = Date.UTC(2026, 9, 20, 3, 0); // 20 Okt 2026 10:00 WIB
const setup = (config = {}) => {
  const api = fakeApi(), repo = fakeRepo();
  const bot = createBot({ api, repo, now: () => NOW, config: { adminIds: [1], defaultTzOffset: 420, ...config } });
  return { api, repo, bot, say: (t, uid = 1) => bot.handleMessage(msg(uid, t)), tap: (d, uid = 1) => bot.handleCallback(cb(uid, d)) };
};

async function onboard(t) {
  await t.say('/start');
  await t.tap('ob:start');
  await t.say('2026-10-10');
  await t.say('28');
  await t.say('5');
  await t.tap('ob:mode:normal');
}

test('onboarding lengkap menyimpan settings + riwayat awal', async () => {
  const t = setup();
  await onboard(t);
  const s = await t.repo.getSettings(1);
  assert.equal(s.lastPeriodDate, '2026-10-10'); assert.equal(s.cycleLength, 28); assert.equal(s.periodLength, 5);
  assert.ok(s.onboardedAt);
  assert.equal((await t.repo.listHistory(1)).length, 1);
  assert.equal(await t.repo.getConv(1), null);
});

test('onboarding: validasi, kembali, dan lewati tanpa menyimpan settings siklus', async () => {
  const t = setup();
  await t.say('/start'); await t.tap('ob:start');
  await t.say('bukan tanggal'); assert.match(t.api.last('sendMessage').text, /tidak dikenali/);
  await t.say('2099-01-01'); assert.match(t.api.last('sendMessage').text, /masa depan/);
  await t.say('2026-10-10'); await t.say('10'); assert.match(t.api.last('sendMessage').text, /21–45/);
  await t.tap('ob:back'); // dari cycle ke hpht
  assert.equal((await t.repo.getConv(1)).step, 'hpht');
  await t.tap('ob:skip');
  const s = await t.repo.getSettings(1);
  assert.ok(s.onboardedAt); assert.equal(s.lastPeriodDate ?? null, null);
  await t.say('/status'); assert.match(t.api.last('sendMessage').text, /belum lengkap/);
});

test('/kalender: grid tombol berwarna per fase, navigasi mengedit di tempat', async () => {
  const t = setup(); await onboard(t);
  await t.say('/kalender');
  const p = t.api.last('sendMessage');
  assert.match(p.text, /Oktober 2026/);
  const kbd = p.reply_markup.inline_keyboard;
  assert.deepEqual(kbd[0].map((b) => b.text), ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']);
  const btn = (label) => kbd.flat().find((b) => b.callback_data === `cal:2026-10-${label}`);
  assert.equal(btn('10').style, 'danger');   // haid
  assert.equal(btn('14').style, 'danger');
  assert.equal(btn('15').style, undefined);  // folikular: warna bawaan
  assert.equal(btn('19').style, 'success');  // masa subur
  assert.equal(btn('24').style, 'primary');  // ovulasi
  assert.match(btn('24').text, /⭐/);
  assert.match(btn('26').text, /🟣/);        // luteal
  assert.equal(btn('20').text.startsWith('[20'), true); // hari ini
  assert.ok(kbd.flat().length <= 100); // batas Telegram
  assert.ok(kbd.flat().some((b) => b.callback_data === 'cal-month:2026-11'));
  await t.tap('cal-month:2026-11');
  const e = t.api.last('editMessageText');
  assert.match(e.text, /November 2026/);
  assert.equal(e.message_id, 7); assert.equal(e.parse_mode, 'HTML');
});

test('kalender tanpa data siklus tetap tampil (tanpa warna) dengan petunjuk', async () => {
  const t = setup();
  await t.say('/kalender');
  const p = t.api.last('sendMessage');
  assert.match(p.text, /\/start/);
  assert.ok(p.reply_markup.inline_keyboard.flat().every((b) => !b.style));
});

test('catat gejala lewat chip lalu lihat detail tanggal', async () => {
  const t = setup(); await onboard(t);
  await t.tap('log:2026-10-20');
  await t.tap('sym:flow:2');   // Ringan
  await t.tap('sym:pain:0');   // Tidak ada
  await t.tap('sym:mood:1');   // Bahagia 😊
  await t.tap('sym:discharge:0');
  await t.tap('sym:other:0'); await t.tap('sym:other:3'); await t.tap('sym:other:3'); // toggle Mual on/off
  await t.tap('sym:next');
  await t.say('capek <banget>');
  const rows = await t.repo.listSymptoms(1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mood, 'Bahagia 😊'); assert.deepEqual(rows[0].other, ['Kembung']); assert.equal(rows[0].notes, 'capek <banget>');
  await t.tap('cal:2026-10-20');
  const h = t.api.last('editMessageText').text;
  assert.match(h, /Bahagia 😊/); assert.match(h, /capek &lt;banget&gt;/);
  assert.match(h, /HPHT|Kembung/);
});

test('detail tanggal kosong & HPHT; tanggal masa depan tanpa tombol catat', async () => {
  const t = setup(); await onboard(t);
  await t.tap('cal:2026-10-10');
  let p = t.api.last('editMessageText');
  assert.match(p.text, /HPHT tercatat/); assert.match(p.text, /Belum ada catatan/);
  await t.tap('cal:2026-10-25');
  p = t.api.last('editMessageText');
  assert.ok(!p.reply_markup.inline_keyboard.flat().some((b) => b.callback_data.startsWith('log:')));
});

test('/haid maju-saja, /suhu /lh /tes /kb /wellbeing dengan validasi', async () => {
  const t = setup(); await onboard(t);
  await t.say('/haid 2026-09-12');
  assert.equal((await t.repo.getSettings(1)).lastPeriodDate, '2026-10-10'); // tidak mundur
  assert.equal((await t.repo.listHistory(1)).length, 2);
  await t.say('/suhu 36,6'); assert.equal((await t.repo.listBBT(1))[0].tempCelsius, 36.6);
  await t.say('/suhu 40'); assert.match(t.api.last('sendMessage').text, /Format/);
  await t.say('/lh peak kemarin'); assert.deepEqual((await t.repo.listLH(1))[0], { userId: 1, date: '2026-10-19', result: 'peak' });
  await t.say('/tes positif'); assert.match(t.api.last('sendMessage').text, /Selamat/);
  await t.say('/kb pil lupa'); assert.equal(t.repo.db.kb[0].status, 'missed');
  await t.say('/wellbeing 3 4 2 5'); assert.equal(t.repo.db.wellbeing[0].appetite, 2);
  await t.say('/suhu 36.5 2099-01-01'); assert.match(t.api.last('sendMessage').text, /masa depan/);
});

test('/status, /analisis, /laporan, /bagikan memakai data pengguna', async () => {
  const t = setup(); await onboard(t);
  for (const d of ['2026-08-15', '2026-09-12']) await t.say(`/haid ${d}`);
  await t.say('/status');
  assert.match(t.api.last('sendMessage').text, /Haid berikutnya/);
  await t.say('/analisis'); assert.match(t.api.last('sendMessage').text, /Keteraturan/);
  await t.say('/laporan'); assert.match(t.api.last('sendMessage').text, /LAPORAN SIKLUS/);
  await t.say('/bagikan');
  const share = t.api.last('sendMessage').text;
  assert.match(share, /Haid berikutnya/); assert.ok(!/gejala:|catatan:/i.test(share.split('\n\n').slice(1).join('')));
});

test('mode hamil menampilkan status DPO', async () => {
  const t = setup(); await onboard(t);
  await t.say('/atur mode hamil'); await t.say('/status');
  assert.match(t.api.last('sendMessage').text, /🤰/);
});

test('reset butuh konfirmasi dan menghapus semuanya', async () => {
  const t = setup(); await onboard(t); await t.say('/suhu 36.5');
  await t.say('/reset'); assert.equal((await t.repo.listBBT(1)).length, 1);
  await t.tap('reset:cancel'); assert.equal((await t.repo.listBBT(1)).length, 1);
  await t.tap('reset:confirm');
  assert.equal(await t.repo.getSettings(1), null); assert.equal((await t.repo.listBBT(1)).length, 0);
});

test('data antar-pengguna terisolasi; grup ditolak', async () => {
  const t = setup(); await onboard(t); await t.say('/suhu 36.5');
  assert.equal((await t.repo.listBBT(2)).length, 0);
  await t.bot.handleMessage(msg(1, '/status', 'group'));
  assert.match(t.api.last('sendMessage').text, /chat pribadi/);
});

test('reminder: terkirim sekali per hari, hanya admin yang boleh /_cron', async () => {
  const t = setup();
  await t.say('/start'); await t.tap('ob:start');
  await t.say('2026-09-23'); await t.say('28'); await t.say('5'); await t.tap('ob:mode:normal'); // haid berikutnya 21 Okt = besok
  const before = t.api.calls.length;
  await t.say('/_cron', 2); // bukan admin
  assert.equal(t.api.calls.length, before);
  await t.say('/_cron', 1);
  const sent = t.api.calls.filter((c) => c.m === 'sendMessage' && /Haid besok/.test(c.p.text));
  assert.equal(sent.length, 1);
  await t.say('/_cron', 1);
  assert.equal(t.api.calls.filter((c) => c.m === 'sendMessage' && /Haid besok/.test(c.p.text)).length, 1);
});
