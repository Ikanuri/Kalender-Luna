// Pencatatan error terstruktur & ringkasan diagnosis (/diag).
// Privasi: yang disimpan hanya label perintah/callback (BUKAN teks pengguna),
// nama+pesan error terpotong, dan frame stack. Jangan tambahkan isi pesan pengguna.
import { VERSION } from './version.js';
import { runSelfTest, summarize } from './selftest.js';
import { auditData } from './audit.js';
import { esc } from './html.js';

export const sanitizeError = (e) => ({
  name: String(e?.name ?? 'Error').slice(0, 60),
  message: String(e?.message ?? e).slice(0, 200),
  stack: String(e?.stack ?? '').split('\n').filter((l) => /^\s*at /.test(l)).slice(0, 8).join('\n').slice(0, 1200),
});

/** Label aman dari callback_data: hanya awalan sebelum ':' (tanpa tanggal/id). */
export const callbackLabel = (data) => `cb:${String(data ?? '').split(':')[0].slice(0, 20)}`;

export async function recordError(repo, { source, label, userId }, err) {
  const s = sanitizeError(err);
  console.error(JSON.stringify({ level: 'error', source, label, version: VERSION, ...s }));
  try {
    return await repo.logEvent?.({ kind: 'error', source, label, userId: userId ?? null, detail: s });
  } catch (e2) {
    console.error(JSON.stringify({ level: 'error', source: 'diag', message: String(e2?.message ?? e2) }));
    return null;
  }
}

const ago = (ts, nowMs) => {
  if (!ts) return '—';
  const m = Math.round((nowMs - new Date(ts).getTime()) / 60000);
  return m < 60 ? `${m} mnt lalu` : m < 2880 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`;
};

export async function diagSummary(repo, { today, nowMs }) {
  const [counts, errors, lastCron] = await Promise.all([repo.tableCounts(), repo.recentEvents('error', 5), repo.recentEvents('cron', 1)]);
  const st = summarize(runSelfTest());
  const L = [`🩺 <b>Diagnosis Luna v${VERSION}</b>`, `Self-test: ${st.passed}/${st.total} ${st.failed.length ? '❌' : '✅'}`];
  st.failed.forEach((f) => L.push(`  • ${esc(f.name)}: ${esc(f.detail)}`));
  L.push('', '<b>Baris data</b>: ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' · '));
  const c = lastCron[0];
  L.push(`<b>Reminder terakhir</b>: ${c ? `${ago(c.ts, nowMs)} — ${esc(JSON.stringify(c.detail))}` : 'belum pernah (pasang pemicu /_cron!)'}`);
  L.push('', `<b>Error terbaru</b> (${errors.length ? 'lihat /diag error &lt;id&gt;' : 'tidak ada'}):`);
  errors.forEach((e) => L.push(`#${e.id} ${ago(e.ts, nowMs)} · ${esc(e.label)} · ${esc(e.detail?.message ?? '')}`));
  const audit = auditData(await repo.allForAudit(), today);
  L.push('', `<b>Audit data</b>: ${audit.length ? `⚠️ ${audit.length} temuan (/diag audit)` : '✅ bersih'}`);
  return L.join('\n');
}

export async function diagAudit(repo, today) {
  const issues = auditData(await repo.allForAudit(), today);
  if (!issues.length) return '✅ Audit data bersih.';
  return ['⚠️ <b>Temuan audit</b>', ...issues.map((i) => `• ${i.table}: ${esc(i.issue)} — ${i.count}${i.sample ? ` (mis. ${esc(i.sample.join(', '))})` : ''}`)].join('\n');
}

export function diagSelfTest() {
  const r = runSelfTest();
  return [`Self-test ${r.filter((x) => x.ok).length}/${r.length}`, ...r.map((x) => `${x.ok ? '✅' : '❌'} ${esc(x.name)}${x.ok ? '' : ` — ${esc(x.detail)}`}`)].join('\n');
}

export async function diagErrorDetail(repo, id) {
  const e = await repo.getEvent(id);
  if (!e || e.kind !== 'error') return 'Event tidak ditemukan.';
  return `<b>Error #${e.id}</b> · ${esc(e.label)} · ${esc(String(e.ts))}\n<pre>${esc(`${e.detail.name}: ${e.detail.message}\n${e.detail.stack}`)}</pre>`;
}
