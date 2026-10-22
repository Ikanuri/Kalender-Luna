# CLAUDE.md — luna-telegram

Kamu sedang bekerja di **Luna Telegram** — Mini App + bot Telegram untuk
pelacakan siklus menstruasi & kesuburan, dibangun di atas
[Telegram Serverless](https://core.telegram.org/bots/serverless) (`tgcloud`).
Ini adalah **saudara terpisah** dari `luna-kalender-siklus` (proyek lain,
versi single-file HTML5 client-only, tanpa server, hidup di repo
`html5-project`) — bukan penggantinya, dan bukan hasil migrasi.

**Status saat ini: PERENCANAAN. Belum ada satu baris kode implementasi.**
Baca `PRD.md` di folder ini dulu — itu satu-satunya sumber kebenaran untuk
logika produk (perhitungan fase siklus, deteksi ovulasi, analisis, reminder,
kalender di chat, dst). Jangan mulai coding tanpa baca PRD.md lengkap dulu,
termasuk §2 (struktur folder) dan §14 (kalender rich HTML di chat).

**Repo berdiri sendiri — bukan bagian dari monorepo `html5-project`.**
Proyek ini sengaja DIPINDAHKAN keluar dari `html5-project` (di mana
sebelumnya sempat berada di `apps/luna-telegram/`) karena kebutuhan teknis
proyek ini (Node.js multi-file, CLI `tgcloud`) tidak cocok dengan konvensi
monorepo itu ("single-file HTML5, tanpa build step") — lihat bagian di
bawah. Karena itu, **Aturan Wajib #2 (merge terbatas ke folder proyek) dari
`CLAUDE.md` root `html5-project` TIDAK berlaku lagi di sini** — repo ini
sudah terisolasi secara struktural (repo Git-nya sendiri), jadi semua
foldernya boleh disentuh sesuai kebutuhan proyek ini. Konvensi lain dari
root `html5-project` yang TETAP relevan secara prinsip (meski tidak lagi
secara harfiah "root CLAUDE.md" karena repo sudah terpisah): dokumentasi
wajib per proyek (`docs/ARSITEKTUR.md`, `CHANGELOG.md`, `PATCHNOTES.md`,
`HANDOFF.md`, `PLAN.md`), SemVer untuk versi rilis, commit message berbahasa
Indonesia yang menjelaskan kenapa bukan cuma apa.

## Kenapa proyek ini beda dari semua proyek lain di monorepo ini

`CLAUDE.md` root mendeskripsikan repo ini sebagai *"kumpulan aplikasi
HTML5 single-file... vanilla JS, tanpa build step, tanpa framework"*, dan
Aturan Wajib #1/#6 mewajibkan file utama bernama
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
  (ini bagian dari Aturan Wajib #6 yang TETAP berlaku), dan lewat
  `package.json`/`tgcloud.jsonc` versi proyek Node-nya — bukan lewat nama
  file.
- Mini App (frontend) adalah proyek web biasa (bisa React/vanilla/apa pun
  yang dipilih saat desain teknis) yang di-build & di-deploy terpisah dari
  logic backend `tgcloud/` — strukturnya akan jadi `apps/luna-telegram/tgcloud/`
  (backend) + `apps/luna-telegram/miniapp/` (frontend) atau serupa,
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
  siapa, terutama untuk fitur berbagi/Mode Berbagi di PRD.md §17).
  **Mode Berbagi HARUS tetap cuma mengirim ringkasan fase & prediksi** —
  jangan pernah diam-diam diperluas untuk menyertakan gejala/catatan
  pribadi tanpa didiskusikan dulu dengan user.
- Begitu UI/bot mulai dibangun, user perlu tahu dengan jelas (lewat pesan
  bot atau Mini App) bahwa datanya tersimpan di server — jangan
  menduplikasi copy "semua data cuma di perangkat ini" dari versi web,
  itu akan jadi klaim yang salah di konteks ini.

## Hal lain yang perlu diperhatikan

- **Jangan ulangi 3 bug yang sudah ditemukan & diperbaiki** di
  `luna-kalender-siklus` — PRD.md §22 mendokumentasikan persis apa
  bug-nya dan kenapa, karena algoritmanya di-port ke proyek ini. Baca
  bagian itu sebelum menulis ulang `detectLHSurge`, perbandingan mood
  netral, atau `detectBBTOvulation` dari nol.
- **Scheduling/reminder (PRD.md §16) punya ketergantungan teknis yang
  belum terkonfirmasi**: belum jelas apakah `tgcloud` punya mekanisme
  cron/time-based trigger bawaan (dokumentasi yang tersedia saat ini cuma
  menyebut `handlers/` yang event-driven dari update Telegram, dan
  `endpoints/` yang dipanggil dari Mini App). Ini harus dikonfirmasi dulu
  sebelum desain teknis reminder dimulai — jangan asumsikan ada cron tanpa
  verifikasi ke dokumentasi `tgcloud` terbaru.
- Dokumentasi wajib lengkap (ARSITEKTUR.md/DOKUMENTASI-TEKNIS.md,
  CHANGELOG.md, PATCHNOTES.md, HANDOFF.md, PLAN.md — sesuai Aturan Wajib #3
  root) belum dibuat karena belum ada implementasi — lengkapi begitu
  development dimulai. `PRD.md` saat ini berperan sebagian sebagai
  `ARSITEKTUR.md` (logika) dan sebagian `PLAN.md` (fitur yang akan
  dibangun), akan dipecah jadi dokumen-dokumen terpisah begitu kode mulai
  ditulis.
- Proyek ini **belum didaftarkan** di `index.html` root (landing page) —
  itu perubahan ke root repo yang butuh instruksi eksplisit terpisah
  (Aturan Wajib #2), belum diminta.
