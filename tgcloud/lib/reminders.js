// PRD §18 — logika KAPAN reminder dikirim (1 per hari, kondisi pertama menang).
// Mekanisme penjadwalan harian ada di lib/reminder-runner.js.

/**
 * model = createCycleModel(...). Kembalikan { kind, title, body } atau null.
 * `lastReminderDate` = tanggal terakhir reminder terkirim (atau null).
 */
export function decideReminder({ model, mode, today, lastReminderDate }) {
  if (!model) return null;
  if (lastReminderDate === today) return null;
  const toPeriod = model.daysToPeriod;
  const toOv = model.daysToOvulation;
  const phase = model.phaseOn(today);

  if (toPeriod === 1) return { kind: 'period-tomorrow', title: '🩸 Haid besok', body: 'Haidmu diperkirakan mulai besok. Siapkan perlengkapanmu ya 💕' };
  if (toPeriod === 0) return { kind: 'period-today', title: '🩸 Haid hari ini', body: 'Haidmu diperkirakan mulai hari ini.' };
  if (toOv === 1) {
    return { kind: 'ovulation-tomorrow', title: '⭐ Ovulasi besok',
      body: mode === 'pregnant'
        ? 'Besok puncak kesuburan! Waktu terbaik jika merencanakan kehamilan.'
        : 'Besok ovulasi — masa paling subur. Gunakan kontrasepsi jika belum ingin hamil.' };
  }
  if (phase === 'fertile' && toOv <= 3) return { kind: 'fertile', title: '🌿 Masa subur', body: `Kamu sedang dalam masa subur. Ovulasi ~${toOv} hari lagi.` };
  return null;
}
