// Transport: di dalam Telegram memakai Serverless.call (initData diverifikasi platform);
// di luar Telegram (pratinjau/dev lokal) jatuh ke POST /api/<nama> milik scripts/dev-server.mjs.
function viaTelegram(name, input) {
  return new Promise((resolve, reject) => {
    window.Telegram.WebApp.Serverless.call(name, input, (err, res) => {
      if (err) { const e = new Error(err.message || 'Gagal memuat'); e.code = err.parameters?.code ?? err.type; reject(e); } else resolve(res);
    });
  });
}
async function viaFetch(name, input) {
  const r = await fetch(`/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const j = await r.json();
  if (!r.ok || j.error) { const e = new Error(j.error?.message || 'Gagal memuat'); e.code = j.error?.parameters?.code; throw e; }
  return j.result;
}
const inTelegram = () => !!window.Telegram?.WebApp?.initData && !!window.Telegram?.WebApp?.Serverless;

export const getState = () => (inTelegram() ? viaTelegram : viaFetch)('getState', {});
/** Semua aksi tulis; mengembalikan state terbaru. */
export const act = (input) => (inTelegram() ? viaTelegram : viaFetch)('act', input);
