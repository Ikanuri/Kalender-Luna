import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGreeting, buildNarrative, cleanName } from '../tgcloud/lib/narrative.js';
import { createService } from '../tgcloud/lib/service.js';
import { fakeRepo } from './helpers/fakes.js';

const EMOJI = /\p{Extended_Pictographic}/u;
const base = { today: '2026-10-20', daysToPeriod: 10, mode: 'normal', pms: null, pregnancy: null };

test('sapaan menurut jam, menyebut nama; tanpa nama tetap wajar', () => {
  const g = (hour, name) => buildGreeting({ hour, name });
  assert.equal(g(7, 'Rina'), 'Selamat pagi, Rina'); assert.equal(g(12, 'Rina'), 'Selamat siang, Rina');
  assert.equal(g(16, 'Rina'), 'Selamat sore, Rina'); assert.equal(g(21, 'Rina'), 'Selamat malam, Rina');
  assert.equal(g(2, 'Rina'), 'Selamat malam, Rina'); assert.equal(g(7), 'Selamat pagi'); assert.equal(g(7, '   '), 'Selamat pagi');
});

test('nama dibersihkan: kontrol/markup dibuang, spasi dirapikan, dipotong 30 karakter', () => {
  assert.equal(cleanName('  <b>Ri\nna</b>  Putri '), 'bRi na/b Putri');
  assert.equal(cleanName('x'.repeat(80)).length, 30);
  assert.equal(cleanName(null), ''); assert.equal(cleanName(undefined), '');
});

test('setiap fase punya narasi singkat tanpa emoji; stabil dalam sehari, bervariasi antar hari', () => {
  for (const phase of ['menstruation', 'safe', 'fertile', 'peak', 'luteal']) {
    const seen = new Set();
    for (let d = 1; d <= 20; d++) {
      const t = buildNarrative({ ...base, phase, today: `2026-10-${String(d).padStart(2, '0')}` });
      assert.ok(t.length > 20 && t.length <= 130, `${phase}: panjang ${t.length}`);
      assert.ok(!EMOJI.test(t), `${phase}: ada emoji`); assert.ok(!/[!]{2,}/.test(t));
      seen.add(t);
    }
    assert.equal(buildNarrative({ ...base, phase }), buildNarrative({ ...base, phase }));
    if (phase !== 'fertile' && phase !== 'peak') assert.ok(seen.size > 1, `${phase}: tak bervariasi`);
  }
});

test('prioritas: haid hari ini/besok, mode hamil, PMS berat', () => {
  assert.match(buildNarrative({ ...base, phase: 'luteal', daysToPeriod: 0 }), /hari ini/);
  assert.match(buildNarrative({ ...base, phase: 'luteal', daysToPeriod: 1 }), /besok/);
  assert.doesNotMatch(buildNarrative({ ...base, phase: 'menstruation', daysToPeriod: 0 }), /diperkirakan datang hari ini/); // sedang haid
  assert.match(buildNarrative({ ...base, phase: 'fertile', mode: 'pregnant', pregnancy: { kind: 'fertile' } }), /merencanakan kehamilan/);
  assert.match(buildNarrative({ ...base, phase: 'luteal', mode: 'pregnant', pregnancy: { kind: 'testable' } }), /dites/);
  assert.match(buildNarrative({ ...base, phase: 'luteal', pms: { show: true, level: 'Berat' } }), /Catat saja/);
  assert.doesNotMatch(buildNarrative({ ...base, phase: 'luteal', pms: { show: true, level: 'Ringan' } }), /Catat saja/);
  for (const k of ['early', 'implantation', 'testable', 'late', 'waiting']) {
    const t = buildNarrative({ ...base, phase: 'luteal', mode: 'pregnant', pregnancy: { kind: k } });
    assert.ok(!EMOJI.test(t) && t.length <= 130, k);
  }
});

test('service: sapaan memuat nama & jam zona pengguna; narasi hanya saat data siklus ada', async () => {
  const repo = fakeRepo();
  // 20 Okt 2026 03:00 UTC = 10:00 WIB → pagi
  const svc = createService({ repo, config: { defaultTzOffset: 420 }, now: () => Date.UTC(2026, 9, 20, 3, 0) });
  let s = await svc.getState(1, { name: 'Rina' });
  assert.equal(s.greeting, 'Selamat pagi, Rina'); assert.equal(s.narrative, undefined);
  s = await svc.act(1, { type: 'onboard', lastPeriodDate: '2026-10-10', cycleLength: 28, periodLength: 5 }, { name: 'Rina' });
  assert.equal(s.greeting, 'Selamat pagi, Rina'); assert.ok(s.narrative.length > 20);
  s = await svc.act(1, { type: 'settings', tzOffset: 0 }, { name: 'Rina' }); // 03:00 UTC → malam
  assert.equal(s.greeting, 'Selamat malam, Rina');
  assert.equal((await svc.getState(1)).greeting, 'Selamat malam');
  assert.ok(!JSON.stringify(await repo.getSettings(1)).includes('Rina'), 'nama tidak boleh tersimpan');
});
