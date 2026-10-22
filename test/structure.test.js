// Menjaga aturan platform tgcloud & arsitektur proyek agar pelanggaran ketahuan di CI,
// bukan saat deploy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../tgcloud', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(root);
const rel = (f) => relative(root, f);

test('hanya .js, dan di lokasi yang dideploy (schema, lib, handlers, endpoints)', () => {
  for (const f of files) {
    assert.match(rel(f), /^(schema\.js|lib\/.+\.js|handlers\/[^/]+\.js|endpoints\/[^/]+\.js)$/, `lokasi tak valid: ${rel(f)}`);
  }
});

test('impor relatif berakhiran .js dan tidak keluar dari tgcloud/', () => {
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'(\.[^']*)'/g)) {
      assert.ok(m[1].endsWith('.js'), `${rel(f)}: impor tanpa .js → ${m[1]}`);
    }
  }
});

test('hanya paket yang ada di runtime: sdk dan impor relatif', () => {
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'([^'.][^']*)'/g)) {
      assert.match(m[1], /^sdk(\/(db|api|fetch))?$/, `${rel(f)}: paket tak tersedia di runtime → ${m[1]}`);
    }
  }
});

test('lib murni: hanya repo.js yang mengimpor sdk (agar bisa diuji tanpa platform)', () => {
  for (const f of files.filter((x) => rel(x).startsWith('lib/') && rel(x) !== 'lib/repo.js')) {
    assert.ok(!/from\s+'sdk/.test(readFileSync(f, 'utf8')), `${rel(f)} mengimpor sdk`);
  }
});

test('schema tidak memakai foreign key (dilarang runtime)', () => {
  assert.ok(!/\.references\(|foreignKey\(/.test(readFileSync(join(root, 'schema.js'), 'utf8')));
});

test('callback_data ≤ 64 byte untuk semua tombol kalender (batas Telegram)', async () => {
  const { renderMonth, renderDayDetail } = await import('../tgcloud/lib/calendar-render.js');
  const r = renderMonth({ ym: '2026-12', model: null, today: '2026-12-31' });
  const all = [...r.keyboard.flat(), ...renderDayDetail({ date: '2026-12-31', phase: 'safe', isHPHT: false, rows: {}, today: '2026-12-31' }).keyboard.flat()];
  for (const b of all) assert.ok(Buffer.byteLength(b.callback_data) <= 64, b.callback_data);
});
