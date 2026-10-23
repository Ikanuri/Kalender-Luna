// Menjaga Mini App (tanpa build) tetap utuh: berkas ada, modul valid, util tanggal sama dengan server,
// dan UI tidak memuat logika siklus (semua dari server).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as ui from '../miniapp/util.js';
import * as srv from '../tgcloud/lib/dates.js';

const read = (f) => readFileSync(new URL(`../miniapp/${f}`, import.meta.url), 'utf8');

test('index.html merujuk berkas yang ada; static folder terdaftar di tgcloud.jsonc', () => {
  const html = read('index.html');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^https?:/.test(m[1])) continue;
    assert.ok(existsSync(new URL(`../miniapp/${m[1]}`, import.meta.url)), `berkas hilang: ${m[1]}`);
  }
  assert.match(readFileSync(new URL('../tgcloud.jsonc', import.meta.url), 'utf8'), /"source":\s*"miniapp"/);
});

test('util tanggal UI konsisten dengan server', () => {
  for (const d of ['2026-02-27', '2024-02-28', '2026-12-31']) {
    assert.equal(ui.addDays(d, 3), srv.addDays(d, 3)); assert.equal(ui.dow(d), srv.dow(d));
    assert.equal(ui.fmtLong(d), srv.formatLong(d)); assert.equal(ui.fmtShort(d), srv.formatShort(d));
  }
  assert.equal(ui.diffDays('2026-03-01', '2026-02-01'), 28);
  const g = ui.monthGrid('2026-10'); // 1 Okt 2026 = Kamis
  assert.equal(g[0].filter(Boolean).length, 3); assert.equal(g[0][4], '2026-10-01'); assert.ok(g.every((w) => w.length === 7));
  assert.equal(ui.nextMonth('2026-12'), '2027-01'); assert.equal(ui.prevMonth('2026-01'), '2025-12');
  assert.equal(ui.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

test('UI tanpa logika siklus: tak mengimpor tgcloud/ dan tak menghitung fase/prediksi', () => {
  const src = ['app.js', 'util.js', 'api.js'].map(read).join('\n');
  assert.ok(!/tgcloud\//.test(src.replace(/Telegram\.WebApp\.Serverless/g, '')), 'UI tidak boleh mengimpor kode server');
  for (const w of ['detectLHSurge', 'detectBBTOvulation', 'computeAvgCycle', 'buildCycleMap', 'getNextPeriod']) assert.ok(!src.includes(w), `logika siklus bocor ke UI: ${w}`);
});

test('semua data dinamis di-escape sebelum masuk innerHTML', () => {
  const app = read('app.js');
  for (const v of ['r.notes', 's.notes', 'x.alasan', 'r.tag', 'st.pregnancy.label', 'st.pregnancy.advice']) assert.ok(!app.includes('${' + v + '}'), `${v} disisipkan tanpa esc()`);
});

test('CSS kalender: ruang untuk tanggal terpilih (tak terpotong) dan semua sel punya latar', () => {
  const css = read('style.css');
  // wadah dengan overflow:hidden harus punya padding & margin negatif yang saling meniadakan
  const body = css.match(/\.cal-body\s*\{([^}]*)\}/)?.[1] ?? '';
  const pad = body.match(/padding:\s*(\d+)px\s+(\d+)px/), mar = body.match(/margin:\s*-(\d+)px\s+-(\d+)px/);
  assert.ok(pad && mar && pad[1] === mar[1] && pad[2] === mar[2] && +pad[1] >= 6 && +pad[2] >= 6, '.cal-body: padding/margin negatif tidak seimbang');
  const day = css.match(/\.day\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(day, /background:/, '.day harus punya latar dasar');
  assert.match(css, /\.day\[data-p="s"\]\s*\{[^}]*background:/, 'fase folikular harus punya latar');
});

test('fmtRange: satu hari, satu bulan, lintas bulan', () => {
  assert.equal(ui.fmtRange('2026-10-24', '2026-10-24'), '24 Okt');
  assert.equal(ui.fmtRange('2026-10-13', '2026-10-17'), '13–17 Okt');
  assert.equal(ui.fmtRange('2026-10-25', '2026-11-06'), '25 Okt – 6 Nov');
});
