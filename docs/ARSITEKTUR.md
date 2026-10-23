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
| Kalender | **Grid `<tg-button>` di badan rich message** (`<tg-button-row>` per minggu), warna lewat `style` (danger/success/primary) + penanda emoji; fallback otomatis ke teks + inline keyboard | desain final dari pemilik produk; fallback melindungi dari penolakan API |
| Navigasi bulan | `editMessageText` + `rich_message` (edit di tempat), fallback edit klasik / kirim baru | tidak memenuhi chat dengan pesan kalender |
| Warna fase | merah=haid, hijau=subur, biru+⭐=ovulasi, 🟣=luteal | Bot API hanya menyediakan 3 warna tombol |
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

## CI/CD & diagnosis

- `.github/workflows/ci-cd.yml`: `npm test` → (main) `tgcloud push` → `migrate --safe` → smoke `endpoints/health`.
- `.github/workflows/monitor.yml`: health check tiap 6 jam.
- Error handling: `bot.js` membungkus `handleMessage`/`handleCallback` dengan `guarded()` → `diag.recordError` → tabel `diag_events`. Detail di `docs/DIAGNOSA.md`.

## Mini App (`miniapp/`)

- **Tanpa build.** Folder disajikan apa adanya oleh tgcloud (`tgcloud.jsonc` → `static.source`); `tgcloud push` mengunggah kode dan file statis sekaligus. Modul ES biasa: `index.html`, `style.css`, `app.js`, `util.js`, `api.js`.
- **Server menghitung, UI merender.** `endpoints/getState` mengembalikan data + hasil hitungan (peta fase, prediksi, analisis, PMS, korelasi, laporan); `endpoints/act` menerima `{ type, ... }` untuk semua aksi tulis dan mengembalikan state terbaru. Keduanya tipis: `lib/endpoint.js` (otentikasi + pemetaan error) → `lib/service.js` (validasi + pemanggilan logika murni). `test/miniapp.test.js` menjaga UI tak memuat logika siklus.
- **Identitas** dari `ctx.initData.user.id` (diverifikasi platform) — tidak ada PIN/login.
- **Dev lokal**: `node scripts/dev-server.mjs` (layanan asli + repo in-memory; `SEED=1` untuk data contoh). `api.js` memakai `Serverless.call` di Telegram dan `fetch('/api/…')` di luar Telegram.
- **Uji visual/alur**: `scripts/e2e-miniapp.mjs` (Chromium, lokal).
- **Setelah deploy pertama**: salin alamat `https://app<id>.tgcloud.ai/` dari log `tgcloud push` ke `lib/config.js → miniAppUrl` (tombol `/app`) dan ke BotFather (Menu Button / Mini App).
- **Narasi beranda**: `lib/narrative.js` (murni) menghasilkan `greeting` + `narrative`; `service.getState(uid, { name })` menerima nama dari `ctx.initData.user.first_name` (lewat `lib/endpoint.js`). Nama hanya dipakai untuk tampilan dan tidak disimpan. Salinan teks tinggal di server agar teruji dan UI tetap tanpa logika.
