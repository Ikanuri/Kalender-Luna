# Changelog

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
