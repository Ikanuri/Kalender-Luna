# CLAUDE.md — luna-telegram

Kamu sedang bekerja di **Luna Telegram** — Mini App + bot Telegram untuk
pelacakan siklus menstruasi & kesuburan, dibangun di atas
[Telegram Serverless](https://core.telegram.org/bots/serverless) (`tgcloud`).
Ini adalah **saudara terpisah** dari `luna-kalender-siklus` (proyek lain,
versi single-file HTML5 client-only, tanpa server, hidup di repo
`html5-project`) — bukan penggantinya, dan bukan hasil migrasi.

**Status saat ini: PERENCANAAN. Belum ada satu baris kode implementasi.**
Baca `PRD.md` di root repo dulu — itu satu-satunya sumber kebenaran untuk
logika produk (perhitungan fase siklus, deteksi ovulasi, analisis, reminder,
kalender di chat, dst). Jangan mulai coding tanpa baca PRD.md lengkap dulu,
termasuk §2 (struktur folder) dan §14 (kalender rich HTML di chat).

**Repo berdiri sendiri — bukan bagian dari monorepo `html5-project`.**
Proyek ini sengaja dikembangkan di luar `html5-project` (rencana awalnya
di `apps/luna-telegram/` sana) karena kebutuhan teknis
proyek ini (Node.js multi-file, CLI `tgcloud`) tidak cocok dengan konvensi
monorepo itu ("single-file HTML5, tanpa build step") — lihat bagian di
bawah. Karena itu, aturan "merge terbatas ke folder proyek" dari `CLAUDE.md` root
`html5-project` tidak berlaku di sini — repo ini sudah terisolasi, jadi
semua foldernya boleh disentuh sesuai kebutuhan proyek ini. Konvensi lain dari
root `html5-project` yang TETAP relevan secara prinsip (meski tidak lagi
secara harfiah "root CLAUDE.md" karena repo sudah terpisah): dokumentasi
wajib per proyek (`docs/ARSITEKTUR.md`, `CHANGELOG.md`, `PATCHNOTES.md`,
`HANDOFF.md`, `PLAN.md`), SemVer untuk versi rilis, commit message berbahasa
Indonesia yang menjelaskan kenapa bukan cuma apa.

## Kenapa proyek ini beda dari proyek lain di monorepo `html5-project`

`CLAUDE.md` root mendeskripsikan repo ini sebagai *"kumpulan aplikasi
HTML5 single-file... vanilla JS, tanpa build step, tanpa framework"*, dan
Aturan Wajib #1/#6 (root `html5-project`) mewajibkan file utama bernama
`<nama-proyek>-MAJOR.MINOR.PATCH.html`. **Proyek ini adalah pengecualian
yang disengaja dan sudah dikonfirmasi dengan user** — dicatat di sini
supaya tidak dikira pelanggaran konvensi yang terlewat:

- Backend `tgcloud` butuh Node.js 18+, CLI `tgcloud`, dan struktur
  multi-file (`tgcloud/schema.js`, `tgcloud/handlers/*.js`,
  `tgcloud/endpoints/*.js`, `tgcloud/lib/`) — **tidak mungkin** jadi satu
  file HTML tanpa build step.
- Karena itu, **jangan paksakan nama file utama `luna-telegram-X.Y.Z.html`**
  seperti proyek lain. Versi tetap dilacak lewat `CHANGELOG.md`/
  `PATCHNOTES.md` dengan heading SemVer `## [MAJOR.MINOR.PATCH] - YYYY-MM-DD`
  (bagian dari Aturan Wajib #6 root yang tetap berlaku), dan lewat
  `package.json`/`tgcloud.jsonc` versi proyek Node-nya — bukan lewat nama
  file.
- Mini App (frontend) adalah proyek web biasa (bisa React/vanilla/apa pun
  yang dipilih saat desain teknis) yang di-build & di-deploy terpisah dari
  logic backend `tgcloud/` — strukturnya `tgcloud/` (backend) + `miniapp/`
  (frontend) di root repo (lihat PRD.md §2) atau serupa,
  ditentukan saat fase implementasi dimulai.

## Perbedaan model privasi & distribusi — WAJIB dipahami sebelum menambah fitur

`luna-kalender-siklus` punya janji eksplisit ke user: *"tidak ada server,
tidak ada akun, tidak dikirim ke mana pun"*. **Luna Telegram justru
kebalikannya** — semua data (siklus, gejala, BBT, hasil test pack) memang
disimpan di database server `tgcloud`, terikat ke `telegram_user_id`.
Ini pilihan desain sadar (lihat PRD.md §1–§2), BUKAN sesuatu yang perlu
"diperbaiki" supaya mirip versi web. Tapi karena ini data kesehatan
reproduksi yang sensitif:

- Kapan pun fitur baru ditambah yang menyentuh data pengguna, pikirkan
  ulang implikasi privasinya secara eksplisit (siapa yang bisa akses data
  siapa, terutama untuk fitur berbagi/Mode Berbagi di PRD.md §19).
  **Mode Berbagi HARUS tetap cuma mengirim ringkasan fase & prediksi** —
  jangan pernah diam-diam diperluas untuk menyertakan gejala/catatan
  pribadi tanpa didiskusikan dulu dengan user.
- Begitu UI/bot mulai dibangun, user perlu tahu dengan jelas (lewat pesan
  bot atau Mini App) bahwa datanya tersimpan di server — jangan
  menduplikasi copy "semua data cuma di perangkat ini" dari versi web,
  itu akan jadi klaim yang salah di konteks ini.

## Hal lain yang perlu diperhatikan

- **Jangan ulangi 3 bug yang sudah ditemukan & diperbaiki** di
  `luna-kalender-siklus` — PRD.md §24 mendokumentasikan persis apa
  bug-nya dan kenapa, karena algoritmanya di-port ke proyek ini. Baca
  bagian itu sebelum menulis ulang `detectLHSurge`, perbandingan mood
  netral, atau `detectBBTOvulation` dari nol.
- **Scheduling/reminder (PRD.md §18) punya ketergantungan teknis yang
  belum terkonfirmasi**: belum jelas apakah `tgcloud` punya mekanisme
  cron/time-based trigger bawaan (dokumentasi yang tersedia saat ini cuma
  menyebut `handlers/` yang event-driven dari update Telegram, dan
  `endpoints/` yang dipanggil dari Mini App). Ini harus dikonfirmasi dulu
  sebelum desain teknis reminder dimulai — jangan asumsikan ada cron tanpa
  verifikasi ke dokumentasi `tgcloud` terbaru.
- Dokumentasi wajib lengkap (ARSITEKTUR.md/DOKUMENTASI-TEKNIS.md,
  CHANGELOG.md, PATCHNOTES.md, HANDOFF.md, PLAN.md — sesuai Aturan Wajib #3
  root `html5-project`) belum dibuat karena belum ada implementasi — lengkapi begitu
  development dimulai. `PRD.md` saat ini berperan sebagian sebagai
  `ARSITEKTUR.md` (logika) dan sebagian `PLAN.md` (fitur yang akan
  dibangun), akan dipecah jadi dokumen-dokumen terpisah begitu kode mulai
  ditulis.
- Pendaftaran proyek di landing page `index.html` milik `html5-project`
  tidak relevan di repo ini.
