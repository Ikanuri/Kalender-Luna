// Pintu masuk sapuan reminder untuk pemicu terjadwal (endpoints/cron). Hanya admin.
import { ServiceError } from './service.js';
import { runReminders } from './reminder-runner.js';

export async function runCron({ api, repo, config, uid, input = {}, nowMs = Date.now() }) {
  if (!config.adminIds?.includes(uid)) throw new ServiceError('Hanya untuk admin.', 'FORBIDDEN');
  const dry = input.dry === true;
  const of = input.of ?? 1, shard = input.shard ?? 0;
  if (!Number.isInteger(of) || of < 1 || of > 100 || !Number.isInteger(shard) || shard < 0 || shard >= of) {
    throw new ServiceError('shard/of tidak valid.', 'INVALID');
  }
  // Sapuan sebelumnya dibaca SEBELUM yang ini mencatat dirinya → bukti bahwa tulisan DB bertahan.
  const prev = (await repo.recentEvents('cron', 1))[0] ?? null;
  const result = await runReminders({ api, repo, nowMs, defaultTz: config.defaultTzOffset, dry, shard, of });
  return { ...result, previousRun: prev ? { ts: prev.ts, detail: prev.detail } : null };
}
