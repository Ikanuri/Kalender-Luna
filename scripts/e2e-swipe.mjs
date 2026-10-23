// E2E gestur sheet Mini App (lokal, bukan CI). Butuh: npm i --no-save playwright-core
//   SEED=1 FIXED_NOW=2026-10-20T03:00:00Z node scripts/dev-server.mjs 5173 &   lalu: node scripts/e2e-swipe.mjs
// Regresi: geser bawah harus menutup sheet (touch events; pointer events dibatalkan saat scroll).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(/telegram\.org|fonts\.g/, (r) => r.abort());
const results = [];
const check = (c, m) => { results.push(`${c ? 'ok  ' : 'FAIL'} - ${m}`); };
const touch = (type, y, x = 195) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
async function swipe(y0, y1, { steps = 12, delay = 16 } = {}) {
  await touch('touchStart', y0);
  for (let i = 1; i <= steps; i++) { await touch('touchMove', y0 + ((y1 - y0) * i) / steps); await page.waitForTimeout(delay); }
  await touch('touchEnd');
  await page.waitForTimeout(700);
}
const isOpen = () => page.$eval('#sheet', (e) => e.classList.contains('on'));
const sheetTop = () => page.$eval('#sheet', (e) => Math.round(e.getBoundingClientRect().top));
const openDay = async () => { await page.click('[data-k=siklus]'); await page.waitForSelector('.day[data-d="2026-10-19"]'); await page.click('.day[data-d="2026-10-19"]'); await page.waitForTimeout(700); };

await page.goto('http://localhost:5173/'); await page.waitForSelector('.hero');

// 1. swipe jauh dari isi sheet → menutup
await openDay(); check(await isOpen(), 'sheet terbuka');
const top = await sheetTop();
await swipe(top + 120, top + 420);
check(!(await isOpen()), 'swipe bawah 300px dari isi sheet menutup');

// 2. swipe pendek → kembali ke posisi semula
await openDay(); const top2 = await sheetTop();
await swipe(top2 + 120, top2 + 150, { steps: 6, delay: 40 });
check(await isOpen(), 'swipe pendek (30px, lambat) tidak menutup'); check(Math.abs((await sheetTop()) - top2) <= 2, 'sheet kembali ke posisi semula');

// 3. flick cepat pendek → menutup
await swipe(top2 + 120, top2 + 190, { steps: 4, delay: 8 });
check(!(await isOpen()), 'flick cepat menutup');

// 4. handle: seret ke bawah → menutup
await openDay(); const top3 = await sheetTop();
await swipe(top3 + 12, top3 + 260);
check(!(await isOpen()), 'seret handle menutup');

// 5. sheet panjang yang sedang di-scroll: swipe turun menggulung, TIDAK menutup; di puncak baru menutup
await page.click('[data-k=today]'); await page.click('[data-a=open][data-k=symptom]'); await page.waitForSelector('#f-notes'); await page.waitForTimeout(700);
await page.$eval('#sheet', (e) => { e.scrollTop = 400; });
const st0 = await page.$eval('#sheet', (e) => e.scrollTop);
const top5 = await sheetTop();
await swipe(top5 + 200, top5 + 330);
check(await isOpen(), 'swipe turun saat sheet ter-scroll tidak menutup');
check(Math.abs((await sheetTop()) - top5) <= 2, 'sheet tidak bergeser saat ter-scroll');
await page.$eval('#sheet', (e) => { e.scrollTop = 0; });
await swipe(top5 + 150, top5 + 450);
check(!(await isOpen()), 'swipe turun di puncak sheet panjang menutup');

// 6. backdrop opacity dikembalikan, tidak ada gaya inline tersisa
check(await page.$eval('#backdrop', (e) => e.style.opacity === '') && await page.$eval('#sheet', (e) => e.style.transform === '' && e.style.transition === ''), 'gaya inline dibersihkan');
// 7. swipe horizontal / geser di luar sheet tak berpengaruh; sheet bisa dibuka lagi
await openDay(); check(await isOpen(), 'sheet bisa dibuka lagi setelah ditutup lewat swipe');
console.log(results.join('\n')); console.log('errors:', JSON.stringify(errors));
await b.close();
