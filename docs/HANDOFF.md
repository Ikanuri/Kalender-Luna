# Handoff

**Keadaan:** semua logika PRD terimplementasi dan teruji lokal (`npm test`, 24 tes lolos). **Belum pernah dijalankan di platform tgcloud sungguhan** — `lib/repo.js` (Drizzle-style via `sdk/db`) dan pemanggilan Bot API (`sendRichMessage`, `editMessageText` dengan `rich_message`) ditulis dari dokumentasi, belum diuji terhadap runtime.

**Langkah pertama berikutnya:** `tgcloud login` → `push` → `migrate`, lalu `tgcloud run handlers/message '{ chat:{id:1,type:"private"}, from:{id:1}, text:"/start" }'`.

**Risiko yang diketahui**
- `onConflictDoUpdate({ target: [kolomA, kolomB] })` (target komposit) diasumsikan didukung seperti Drizzle; bila tidak, ganti dengan select-lalu-insert/update di `repo.js`.
- Tombol di dalam sel tabel (Jalur A) belum divalidasi; default Jalur B.
- Reminder butuh pemicu eksternal.
- `lib/config.js` menyimpan `adminIds` di kode (SDK tak mendokumentasikan env var).
