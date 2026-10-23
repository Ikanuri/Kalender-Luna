// Penyapu reminder harian (PRD §18). tgcloud tidak punya cron bawaan yang
// terdokumentasi, jadi sapuan dipicu eksternal: GitHub Action terjadwal memanggil
// endpoints/cron (lihat .github/workflows/reminders.yml); `/_cron` = pemicu manual admin.
import { todayIn } from './dates.js';
import { createCycleModel } from './cycle.js';
import { decideReminder } from './reminders.js';
import { esc } from './html.js';

/**
 * dry  : hitung siapa yang jatuh tempo tanpa mengirim & tanpa menandai (uji aman).
 * shard/of : hanya pengguna dengan user_id % of === shard (untuk membagi sapuan bila pengguna banyak).
 */
export async function runReminders({ api, repo, nowMs = Date.now(), defaultTz = 420, dry = false, shard = 0, of = 1 }) {
  const users = (await repo.listConfiguredSettings()).filter((s) => s.userId % of === shard);
  let sent = 0, failed = 0, due = 0;
  for (const s of users) {
    try {
      const today = todayIn(s.tzOffset ?? defaultTz, nowMs);
      if (s.lastReminderDate === today) continue;
      const [history, lh, bbt] = await Promise.all([repo.listHistory(s.userId), repo.listLH(s.userId), repo.listBBT(s.userId)]);
      const model = createCycleModel({ settings: s, history, lh, bbt }, today);
      const r = decideReminder({ model, mode: s.mode, today, lastReminderDate: s.lastReminderDate });
      if (!r) continue;
      due++;
      if (dry) continue;
      await api.sendMessage({ chat_id: s.userId, parse_mode: 'HTML', text: `<b>${esc(r.title)}</b>\n${esc(r.body)}` });
      await repo.saveSettings(s.userId, { lastReminderDate: today });
      sent++;
    } catch (e) {
      failed++; // mis. 403 bot diblokir — lanjut ke pengguna berikutnya
      console.warn('reminder gagal', s.userId, e?.description ?? e?.message ?? e);
    }
  }
  const result = { users: users.length, due, sent, failed, dry, shard, of };
  await repo.logEvent?.({ kind: 'cron', source: 'reminders', detail: result }).catch(() => {});
  return result;
}
