// E2E Mini App di Chromium (lokal, TIDAK di CI). Butuh: npm i --no-save playwright-core
//   SEED=1 FIXED_NOW=2026-10-20T03:00:00Z node scripts/dev-server.mjs 5173 &   (data contoh)
//   FIXED_NOW=2026-10-20T03:00:00Z node scripts/dev-server.mjs 5174 &          (kosong → onboarding)
//   node scripts/e2e-miniapp.mjs <folder-screenshot>
// Menjalankan LAYANAN ASLI (tgcloud/lib/service.js) dengan repo in-memory; keluaran: daftar "ok" + error JS bila ada.
import { chromium } from 'playwright-core';
const S = process.argv[2] ?? '.';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/fonts|telegram\.org|ERR_/.test(m.text()) && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.route(/telegram\.org|fonts\.g/, (r) => r.abort());
const ok = (c, m) => { if (!c) errors.push('ASSERT: ' + m); else console.log('ok  -', m); };
const toast = async () => (await page.waitForSelector('.toast.on', { timeout: 3000 })).innerText();
const shot = async (n) => { await page.waitForTimeout(1700); await page.screenshot({ path: `${S}/${n}.png` }); };

// ── onboarding (server kosong, port 5174)
await page.goto('http://localhost:5174/'); await page.waitForSelector('.ob');
await shot('10-onboarding');
await page.click('[data-k=next]');
await page.click('[data-k=next]'); ok((await toast()).includes('Pilih tanggal'), 'validasi tanggal onboarding');
await page.fill('#ob-date', '2026-10-10');
await page.click('[data-a=obstep][data-k=cycle][data-n="1"]'); await page.click('[data-a=obstep][data-k=cycle][data-n="1"]');
await page.click('[data-k=next]'); await page.click('[data-k=mode-pregnant]'); await shot('11-onboarding-mode');
await page.click('[data-k=finish]'); await page.waitForSelector('.hero');
ok(await page.isVisible('text=Mode Program Hamil'), 'mode hamil tampil setelah onboarding');
ok((await page.innerText('.ring-lbl')).includes('30'), 'panjang siklus 30 dari stepper');
await shot('12-today-new');

// ── catat gejala
await page.click('[data-a=open][data-k=symptom]'); await page.waitForSelector('#f-notes');
await page.click('.chip:has-text("Sedang")'); await page.click('.chip:has-text("Cemas")'); await page.click('.chip:has-text("Kembung")'); await page.click('.chip:has-text("Mual")');
await page.fill('#f-notes', 'tes <b>catatan</b>');
await shot('13-symptom-form');
await page.click('#saveBtn'); ok((await toast()).includes('Gejala tersimpan'), 'gejala tersimpan');
await page.click('[data-k=data]'); await page.click('[data-a=sub][data-k=gejala]');
ok(await page.isVisible('text=Cemas'), 'gejala tampil di log'); ok(!(await page.content()).includes('<b>catatan</b>'), 'catatan di-escape (tanpa XSS)');
await page.click('[data-a=sub][data-k=analisis]'); await shot('14-analisis-kosong');

// ── suhu & validasi tanggal masa depan di server
await page.click('[data-k=today]'); await page.click('[data-a=open][data-k=bbt]'); await page.waitForSelector('#f-temp');
await page.click('[data-a=temp][data-n="0.05"]'); await page.click('#saveBtn'); ok((await toast()).includes('Suhu'), 'suhu tersimpan');
await page.click('[data-a=open][data-k=lh]'); await page.waitForSelector('#f-date');
await page.click('#saveBtn'); ok((await toast()).includes('Pilih hasil'), 'validasi klien LH');
await page.click('.chip:has-text("Peak")'); await page.click('#saveBtn'); await toast();
ok(await page.isVisible('text=Lonjakan LH'), 'alert LH peak muncul di beranda');

// ── haid + hapus + riwayat
await page.click('[data-k=siklus]'); await page.click('[data-a=open][data-k=period]'); await page.waitForSelector('#f-date');
await page.fill('#f-date', '2026-09-10'); await page.dispatchEvent('#f-date', 'change'); await page.click('#saveBtn'); await toast();
ok((await page.innerText('.card:has-text("Riwayat Siklus")')).includes('10 Sep 2026'), 'riwayat siklus bertambah');
await page.click('.x[data-kind=cycle][data-date="2026-09-10"]'); await toast();
ok(!(await page.innerText('.card:has-text("Riwayat Siklus")')).includes('10 Sep 2026'), 'hapus siklus bekerja');
await page.click('[data-a=month][data-n="-1"]'); await shot('15-prev-month');

// ── lainnya: tema, zona, laporan, reset
await page.click('[data-k=more]'); await page.selectOption('#tz', '480'); await toast();
await page.click('[data-a=open][data-k=report]'); await page.waitForSelector('pre'); ok((await page.innerText('pre')).includes('LAPORAN SIKLUS'), 'laporan dokter tampil'); await shot('16-report');
await page.click('.backdrop', { position: { x: 20, y: 30 } }); await page.waitForTimeout(700);
await page.click('[data-a=open][data-k=reset]'); await page.waitForSelector('#f-confirm');
ok(await page.isDisabled('#saveBtn'), 'tombol reset nonaktif sebelum konfirmasi');
await page.fill('#f-confirm', 'HAPUS'); await page.click('#saveBtn'); await page.waitForSelector('.ob');
ok(true, 'reset → kembali ke onboarding');
console.log(JSON.stringify(errors, null, 1));
await b.close();
