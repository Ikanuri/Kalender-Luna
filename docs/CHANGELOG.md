# Changelog

## [0.5.1] - 2026-10-23
### Diubah
- `miniAppUrl` diisi (`https://app8956021829.tgcloud.ai/`, terverifikasi: file statis 200 dengan header `no-cache`, API menolak tanpa autentikasi dengan 401) sehingga `/app` menampilkan tombol buka Mini App.

## [0.5.0] - 2026-10-23
### Ditambahkan
- **Mini App** (`miniapp/`, tanpa build): UI bergaya Luna v7.1 dengan animasi halus — onboarding 3 langkah, Hari Ini (cincin fase animasi, peringatan, prediksi, PMS, mode hamil), Siklus (kalender berwarna + sheet detail tanggal + riwayat), Data (analisis, log gejala, wellbeing, tracker BBT/LH/KB/test pack), Lainnya (pengaturan, zona waktu, tema, laporan dokter, berbagi, reset).
- `lib/service.js` (getState/act): seluruh logika dari `tgcloud/lib` disajikan ke UI; UI tidak punya algoritma siklus. Endpoint `getState` dan `act` (otentikasi initData), pembungkus `lib/endpoint.js` dengan pencatatan error tanpa data pengguna.
- Perintah `/app` (tombol `web_app`), konfigurasi `miniAppUrl`; `tgcloud.jsonc` mendaftarkan folder statis + header `no-cache`.
- `scripts/dev-server.mjs` (server dev dengan layanan asli) dan `scripts/e2e-miniapp.mjs` (uji Chromium lokal); tes Mini App; total 55 tes.

## [0.4.0] - 2026-10-22
### Diubah
- Kalender kembali ke **tombol di badan pesan** (rich message `<tg-button-row>`/`<tg-button>`), bukan inline keyboard: warna fase lewat `style` (merah/hijau/biru), header hari tombol nonaktif, navigasi & detail tanggal mengedit pesan yang sama.
### Ditambahkan
- Fallback otomatis ke teks + inline keyboard bila API menolak rich message; dicatat sebagai event `warn` dan tampil di `/diag`.

## [0.3.1] - 2026-10-22
### Diperbaiki
- Deploy CI merah padahal kode sudah terupload: `@tgcloud/cli` 0.2.0 crash saat menulis snapshot lokal (`ERR_INVALID_ARG_TYPE`, server mengirim isi modul `false`). Workflow kini menoleransi crash spesifik itu dan memverifikasi deploy lewat smoke test yang membandingkan versi di platform dengan `package.json`.

## [0.3.0] - 2026-10-22
### Diubah
- Kalender sekarang **grid tombol di chat** (tanpa tabel rich HTML) dengan warna asli tombol per fase: merah=haid, hijau=masa subur, biru+⭐=ovulasi; luteal ditandai 🟣. Navigasi bulan & detail tanggal mengedit pesan yang sama.
### Dihapus
- Jalur rich message / `clickableCells` dan ketergantungan pada `sendRichMessage`. PRD §14 diberi keputusan desain final.

## [0.2.1] - 2026-10-22
### Diperbaiki
- Deploy CI gagal pada run kedua ("never synced with it"): ditambah `tgcloud fetch` sebelum `push` di `ci-cd.yml`.

## [0.2.0] - 2026-10-22
### Ditambahkan
- GitHub Actions: `ci-cd.yml` (tes di setiap push/PR; deploy otomatis dari `main`: `tgcloud push` → `migrate --safe` → smoke test) dan `monitor.yml` (health check terjadwal tiap 6 jam).
- Diagnosis: `/diag` (admin: ringkasan, `errors`, `error <id>`, `audit`, `self`), penangkap error terpusat dengan kode `#id` + notifikasi admin, tabel `diag_events`, `endpoints/health`, self-test fixture emas (`lib/selftest.js`), audit integritas data (`lib/audit.js`), `docs/DIAGNOSA.md`.
- Tes struktur (aturan platform tgcloud & arsitektur) dan tes diagnosis; total 37 tes.
- Skema: tabel baru `diag_events` (aditif, aman untuk `migrate --safe`).

## [0.1.0] - 2026-10-22
### Ditambahkan
- Logika inti PRD §5–§13, §15–§19 sebagai modul murni di `tgcloud/lib/` (siklus, LH, BBT 3-over-6, statistik, anomali, luteal, PMS, korelasi, perbandingan, kehamilan/DPO, laporan dokter, insight, reminder, berbagi).
- Tiga bug lama (PRD §24) ditulis dalam bentuk benar, masing-masing punya tes.
- Skema DB (`tgcloud/schema.js`) dan lapisan akses data (`lib/repo.js`).
- Bot: onboarding 3 langkah, kalender rich HTML berwarna (emoji) dengan navigasi edit-di-tempat, detail tanggal, input gejala via chip, perintah pencatatan, analisis, laporan, berbagi, pengaturan, reset dengan konfirmasi.
- Penyapu reminder harian (`/_cron`).
- 24 tes (`npm test`).
### Diubah
- PRD §14.1 dikoreksi: rich message bisa diedit via `editMessageText`. PRD §18: tidak ada cron bawaan (terkonfirmasi).
