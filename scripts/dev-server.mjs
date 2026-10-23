// Server dev lokal untuk Mini App: menyajikan miniapp/ dan menjalankan LAYANAN ASLI
// (tgcloud/lib/service.js) dengan repo in-memory. Bukan bagian dari deploy.
//   node scripts/dev-server.mjs [port]        env: SEED=1 (data contoh), FIXED_NOW=2026-10-20T03:00:00Z
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fakeRepo } from '../test/helpers/fakes.js';
import { createService } from '../tgcloud/lib/service.js';
import { runEndpoint } from '../tgcloud/lib/endpoint.js';
import { addDays } from '../tgcloud/lib/dates.js';

const port = Number(process.argv[2] ?? 5173);
const root = new URL('../miniapp/', import.meta.url).pathname;
const now = () => (process.env.FIXED_NOW ? new Date(process.env.FIXED_NOW).getTime() : Date.now());
const repo = fakeRepo();
const svc = createService({ repo, config: { defaultTzOffset: 420 }, now });
class EndpointError extends Error { constructor(m, p) { super(m); this.parameters = p; } }
const UID = 1;
const USER = { name: process.env.DEV_NAME ?? 'Rina' }; // meniru first_name dari initData

if (process.env.SEED) {
  const today = new Date(now() + 7 * 3600e3).toISOString().slice(0, 10);
  const start = addDays(today, -10);
  await svc.act(UID, { type: 'onboard', lastPeriodDate: addDays(start, -84), cycleLength: 28, periodLength: 5, mode: 'normal' });
  for (const k of [-56, -28, 0]) await svc.act(UID, { type: 'period', date: addDays(start, k) });
  const moods = ['Normal', 'Bahagia 😊', 'Cemas 😟', 'Sensitif 😢'];
  for (let i = 1; i <= 40; i++) {
    const d = addDays(today, -i);
    await svc.act(UID, { type: 'symptom', date: d, flow: i % 28 < 5 ? 'Sedang' : 'Tidak ada', pain: i % 9 === 0 ? 'Ringan' : 'Tidak ada', mood: moods[i % 4], other: i % 6 === 0 ? ['Kembung', 'Sakit kepala'] : [] });
  }
  for (let i = 1; i <= 24; i++) await svc.act(UID, { type: 'bbt', date: addDays(today, -i), temp: (36.35 + (i < 8 ? 0.35 : 0) + (i % 3) * 0.04).toFixed(2) });
  await svc.act(UID, { type: 'wellbeing', date: addDays(today, -1), energy: 4, sleep: 3, appetite: 4, mood: 5 });
  await svc.act(UID, { type: 'lh', date: addDays(today, -4), result: 'high' });
  await svc.act(UID, { type: 'kb', date: addDays(today, -1), kbType: 'Pil KB', status: 'taken' });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url.startsWith('/api/')) {
      const name = req.url.slice(5);
      const body = JSON.parse(await new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b || '{}')); }));
      const fn = { getState: (uid, u) => svc.getState(uid, u), act: (uid, u) => svc.act(uid, body, u) }[name];
      res.setHeader('content-type', 'application/json');
      if (!fn) { res.statusCode = 404; return res.end('{"error":{"message":"endpoint tidak ada"}}'); }
      try { return res.end(JSON.stringify({ result: await runEndpoint({ EndpointError, repo, ctx: { initData: { user: { id: UID, first_name: USER.name } } }, name, fn }) })); }
      catch (e) { res.statusCode = 400; return res.end(JSON.stringify({ error: { message: e.message, parameters: e.parameters } })); }
    }
    const path = normalize(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const data = await readFile(join(root, path));
    res.setHeader('content-type', TYPES[extname(path)] ?? 'application/octet-stream');
    res.end(data);
  } catch { res.statusCode = 404; res.end('not found'); }
}).listen(port, () => console.log(`Luna Mini App dev: http://localhost:${port}`));
