# Diagnosa & Deteksi Bug

Lima lapis, dari yang paling murah (sebelum merge) sampai produksi.

## 1. Sebelum merge — CI (`npm test`)
| Tes | Menangkap |
|---|---|
| `logic.test.js` | regresi algoritma PRD (termasuk 3 bug §24) |
| `bot.test.js` | alur percakapan end-to-end dengan repo/API palsu |
| `diag.test.js` | pencatat error, `/diag`, audit, versi sinkron |
| `structure.test.js` | pelanggaran aturan platform tgcloud: impor tanpa `.js`, paket npm yang tak ada di runtime, file di lokasi salah, foreign key, `sdk` bocor ke lib murni, `callback_data` >64 byte |

Setiap bug yang ditemukan **wajib** menambah satu tes yang gagal dulu, baru diperbaiki.

## 2. Saat deploy — smoke test di platform
`ci-cd.yml` menjalankan `tgcloud run endpoints/health` **di runtime tgcloud** setelah push. Ini menjalankan `selftest.js` (fixture emas) dan membaca DB; gagal → job merah. Menangkap perbedaan runtime V8 vs Node lokal dan schema yang belum termigrasi.

## 3. Produksi, aktif — error terpusat
Semua error tak terduga di handler:
1. dicatat ke log (`console.error` JSON) dan tabel `diag_events` (pesan + stack terpotong; **tanpa teks pengguna** — hanya label seperti `/suhu` atau `cb:sym`);
2. pengguna menerima “kesalahan (kode #N)”;
3. admin (`adminIds`) menerima notifikasi `🚨 Error #N di /suhu`.

Perintah admin (diam untuk non-admin):
| Perintah | Isi |
|---|---|
| `/diag` | versi, self-test, jumlah baris per tabel, reminder terakhir, 5 error terbaru, ringkasan audit |
| `/diag errors` · `/diag error <id>` | daftar / detail + stack |
| `/diag audit` | temuan integritas data (agregat) |
| `/diag self` | self-test rinci |

## 4. Produksi, pasif — audit data
`audit.js` memeriksa invarian data: nilai chip tak dikenal (drift string/emoji, jebakan §24.2), suhu di luar 35–38.5, skor wellbeing di luar 1–5, tanggal tak valid/masa depan, hasil LH/test/KB tak dikenal, pengaturan di luar rentang. Hanya mengembalikan jumlah dan nilai enum, bukan isi catatan.

## 5. Pemantauan terjadwal
`monitor.yml` (harian 01:37 UTC) menjalankan health check; workflow merah → notifikasi GitHub. Reminder: `/diag` menampilkan kapan sapuan terakhir berjalan (dari `reminders.yml` atau `/_cron`) — jika “belum pernah” atau lebih dari ±1 hari, pemicu mati; cek tab Actions → Reminders.

## Alur investigasi bug
1. Pengguna lapor / notifikasi 🚨 → `/diag error <id>` (label + stack).
2. Bila data dicurigai: `/diag audit`.
3. Reproduksi di tes (`test/helpers/fakes.js` memudahkan skenario percakapan), perbaiki, merge → deploy otomatis → `health` memverifikasi.
4. Log mentah: `npx tgcloud run ...` menampilkan `console.*` per level; log produksi tersimpan di `diag_events` (maks 500 baris terakhir).

## Privasi
Data kesehatan sensitif: jangan menambah isi pesan pengguna, catatan, atau nilai gejala ke `diag_events`/`console`. Tes `diag.test.js` memeriksa teks pengguna tidak ikut tersimpan.

## Setup sekali
1. GitHub → Settings → Secrets and variables → Actions → `TGCLOUD_TOKEN` (token dari BotFather → Serverless → CLI Access).
2. Isi `adminIds` di `tgcloud/lib/config.js` dengan user ID Telegram-mu.
3. Merge ke `main` → deploy berjalan. Lalu jadwalkan pesan `/_cron` harian (reminder).
