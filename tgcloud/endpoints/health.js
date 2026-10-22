// Pemeriksaan kesehatan untuk CI/monitor: self-test algoritma + koneksi DB.
// Tidak memanggil Bot API dan tidak mengembalikan data pengguna.
//   tgcloud run endpoints/health '{}' --ctx '{ initData: { user: { id: 1 } } }'
import { db } from 'sdk';
import { settings } from '../schema.js';
import { runSelfTest, summarize } from '../lib/selftest.js';
import { VERSION } from '../lib/version.js';

export default async function () {
  const st = summarize(runSelfTest());
  const users = await db.$count(settings);
  return { ok: st.failed.length === 0, version: VERSION, users, selftest: st };
}
