# Handoff

**Keadaan:** semua logika PRD terimplementasi dan teruji lokal (`npm test`, 24 tes lolos). **Belum pernah dijalankan di platform tgcloud sungguhan** — `lib/repo.js` (Drizzle-style via `sdk/db`) dan pemanggilan Bot API (`sendMessage`/`editMessageText` dengan `style` pada tombol) ditulis dari dokumentasi, belum diuji terhadap runtime.

**Langkah pertama berikutnya:** `tgcloud login` → `push` → `migrate`, lalu `tgcloud run handlers/message '{ chat:{id:1,type:"private"}, from:{id:1}, text:"/start" }'`.

**Risiko yang diketahui**
- `onConflictDoUpdate({ target: [kolomA, kolomB] })` (target komposit) diasumsikan didukung seperti Drizzle; bila tidak, ganti dengan select-lalu-insert/update di `repo.js`.
- Tombol rich (`sendRichMessage` + `<tg-button>`) ditulis dari dokumentasi dan belum dilihat di klien sungguhan. Jika ditolak, bot otomatis fallback ke inline keyboard; `/diag` menampilkan baris “Fallback rich→inline”.
- Warna tombol butuh klien Telegram terbaru; klien lama menampilkan tombol bawaan (penanda emoji tetap terlihat).
- Reminder butuh pemicu eksternal.
- `lib/config.js` menyimpan `adminIds` di kode (SDK tak mendokumentasikan env var).

**Deploy otomatis:** `.github/workflows/ci-cd.yml` men-deploy dari `main`; perlu secret repo `TGCLOUD_TOKEN`. Diagnosis: `docs/DIAGNOSA.md`.

**Deploy manual (CLI 0.2.0 terpasang sebagai devDependency; struktur proyek sudah dikenali `tgcloud status`)**
1. @BotFather → bot → Serverless → ON → CLI Access → salin token `app<id>:<secret>`.
2. `TGCLOUD_TOKEN=<token> npx tgcloud push` lalu `npx tgcloud migrate` (konfirmasi tabel baru).
3. Uji: `npx tgcloud run handlers/message '{ chat:{id:1,type:"private"}, from:{id:1}, text:"/bantuan" }'`.
4. Kirim /start ke bot di Telegram.

**Bug CLI yang diketahui:** `@tgcloud/cli` 0.2.0 kadang crash di `writeSnapshotFile` setelah push sukses (isi modul `false` dari server). Dilaporkan perlu ke tim tgcloud; workflow sudah menoleransinya (lihat `ci-cd.yml`). Bila muncul lagi di komputer lokal: `npx tgcloud fetch` lalu `status`.

**Mini App:** diuji di Chromium lokal dengan layanan asli (14 skenario alur + screenshot), **belum** di klien Telegram sungguhan. Yang perlu dicek di ponsel: tampilan di dalam Telegram (tema, safe area, header), `BackButton`, haptic, dan `Serverless.call`. Isi `miniAppUrl` setelah deploy.

**Alamat Mini App (terdeploy):** `https://app8956021829.tgcloud.ai/` (`miniAppUrl` sudah diisi). Tersisa di sisi BotFather: pasang alamat yang sama sebagai Menu Button / Mini App agar tombol “Open” muncul di chat (tidak bisa dilakukan dari kode).
