// Pembungkus endpoint Mini App: otentikasi (initData sudah diverifikasi platform),
// pemetaan ServiceError → EndpointError (pesan aman ke klien), dan pencatatan error
// tak terduga tanpa isi data pengguna. EndpointError disuntikkan (sdk tak boleh diimpor di lib).
import { ServiceError } from './service.js';
import { recordError } from './diag.js';

export async function runEndpoint({ EndpointError, repo, ctx, name, fn }) {
  const uid = ctx?.initData?.user?.id;
  if (!Number.isInteger(uid)) throw new EndpointError('Tidak terautentikasi.', { code: 'UNAUTHORIZED' });
  try {
    return await fn(uid);
  } catch (e) {
    if (e instanceof ServiceError) throw new EndpointError(e.message, { code: e.code });
    const id = await recordError(repo, { source: 'endpoint', label: `api:${name}`, userId: uid }, e);
    throw new EndpointError(`Terjadi kesalahan${id ? ` (kode #${id})` : ''}.`, { code: 'INTERNAL', eventId: id ?? null });
  }
}
