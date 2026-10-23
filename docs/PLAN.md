# Rencana

## Selesai (0.1.0)
Semua fitur PRD §5–§21 di sisi bot. Lihat `docs/CHANGELOG.md`.

## Berikutnya
0. Isi secret `TGCLOUD_TOKEN` di GitHub, merge ke `main` → deploy otomatis (lihat `docs/DIAGNOSA.md`).
1. **Deploy & validasi nyata** (butuh token bot + CLI): `npm create @tgcloud/bot`-style `tgcloud login`, `push`, `migrate`; coba `tgcloud run handlers/message` dengan payload contoh.
3. **Pemicu reminder harian**: `reminders.yml` (GitHub Action) — verifikasi dry-run lalu run nyata; naikkan `SHARDS` bila pengguna ribuan.
4. Mini App (opsional, `miniapp/` + `endpoints/`): grafik BBT, perbandingan siklus.
5. Ekspor data pribadi (PRD §23, bila diminta).
