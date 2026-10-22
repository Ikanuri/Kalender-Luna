# Arsitektur — Luna Telegram

Logika produk: `PRD.md`. Dokumen ini menjelaskan bagaimana kode memetakannya.

## Lapisan

```
handlers/message.js, callback_query.js     ← tipis: memanggil createBot({ api, repo })
        │
tgcloud/lib/bot.js                          ← orkestrasi perintah & callback (dependency injection)
        │                                      │
        ├─ onboarding.js, symptom-flow.js     ← mesin status murni (PRD §20, §7.1)
        ├─ calendar-render.js                 ← HTML rich + inline keyboard (§14)
        └─ logika murni: cycle, lh, bbt, analysis, insights, pregnancy,
           reminders, share, report, parse, dates, constants   (tanpa sdk)
        │
tgcloud/lib/repo.js  ── sdk/db ──▶ tgcloud/schema.js           ← satu-satunya kode yang menyentuh DB
tgcloud/lib/reminder-runner.js               ← penyapu reminder (§18)
```

Aturan: modul murni **tidak** mengimpor `sdk`; `bot.js` menerima `api` dan `repo` lewat
parameter. Akibatnya seluruh logika dan alur percakapan diuji dengan `node --test`
memakai repo/API palsu (`test/helpers/fakes.js`) — tanpa Telegram, tanpa DB.

## Keputusan penting

| Topik | Keputusan | Alasan |
|---|---|---|
| Tanggal | string `YYYY-MM-DD`, aritmetika via nomor hari UTC (`lib/dates.js`) | bebas DST/zona waktu mesin |
| Zona waktu | `settings.tzOffset` (menit, default 420 = WIB), diubah `/atur zona` | "hari ini" harus mengikuti pengguna, bukan server |
| Kalender | **Jalur B**: tabel rich HTML (tampilan) + inline keyboard 7 kolom (klik) | `<tg-button>` di dalam sel tabel belum terkonfirmasi; `config.clickableCells` mengaktifkan Jalur A setelah divalidasi |
| Navigasi bulan | `editMessageText` + `rich_message` (edit di tempat), fallback kirim baru | dokumentasi menyatakan edit rich message didukung (koreksi PRD §14.1) |
| Warna fase | emoji (🔴🟢🟡🟣⚪) | Telegram tak mendukung warna sel |
| Proyeksi fase | 8 siklus (−2…+5) sesuai PRD, diperpanjang ke belakang agar gejala lama tetap punya fase (maks 36) | PMS/korelasi butuh fase untuk catatan lama |
| Riwayat awal | HPHT dari onboarding ikut dimasukkan ke `cycle_history` | agar `/haid` berikutnya langsung menghasilkan selisih siklus |
| `last_period_date` | hanya maju; `/haid` untuk tanggal lama tidak memundurkannya | mencegah prediksi rusak saat melengkapi riwayat |
| Privasi | hanya chat pribadi; Mode Berbagi = `/bagikan` menghasilkan teks fase+prediksi saja untuk di-forward manual | PRD §19 |
| Reminder | tgcloud tidak punya cron terdokumentasi → sapuan dipicu `/_cron` oleh `config.adminIds` | lihat di bawah |

## Reminder (§18) — ketergantungan eksternal

Dokumentasi Telegram Serverless (dicek 2026-10-22) hanya punya `handlers/` dan
`endpoints/`; tidak ada scheduled trigger. `decideReminder` (logika) dan
`runReminders` (sapuan: baca semua `settings` terkonfigurasi, hitung hari-ini per zona
waktu, kirim, catat `lastReminderDate`) sudah ada dan diuji. Yang **belum** ada adalah
pemicu berkala: isi `config.adminIds` lalu jadwalkan pengiriman pesan `/_cron` dari akun
admin tiap pagi (mis. skrip userbot dengan cron). Alternatif bila Telegram menambah cron
bawaan: panggil `runReminders` dari sana.

## Skema data

Lihat `tgcloud/schema.js` (PRD §4) + dua tambahan: `conversations` (status alur
multi-langkah) dan kolom `tz_offset`, `last_reminder_date` di `settings`. Tanpa foreign
key (dilarang runtime); `resetAll` menghapus semua tabel per `user_id`.

## Perintah bot

`/start /bantuan /kalender /status /haid /gejala /suhu /lh /tes /kb /wellbeing /analisis
/laporan /bagikan /atur /reset /lewati` + `/_cron` (admin). Callback: `cal:`, `cal-month:`,
`ob:`, `log:`, `sym:`, `reset:`, `noop`.
