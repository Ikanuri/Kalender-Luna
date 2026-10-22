# PRD — Luna Telegram (Mini App Kalender Siklus di atas Telegram Serverless)

Status: **perencanaan — belum ada implementasi.** Dokumen ini adalah satu-
satunya sumber kebenaran untuk logika produk sebelum kode ditulis. Semua
algoritma di sini di-port dari aplikasi kakaknya, `apps/luna-kalender-siklus`
di repo `html5-project` (single-file HTML5, lihat `docs/ARSITEKTUR.md` di
sana), dengan 3 bug yang sudah pernah diperbaiki di sana **sengaja ditulis
ulang dalam bentuk yang sudah benar** — lihat §24 "Jangan Ulangi Bug Ini".

**Rencana repo**: proyek ini akan dikembangkan di **repo Git berdiri
sendiri**, terpisah dari monorepo `html5-project` (lihat §2 untuk struktur
folder). Saat dokumen ini ditulis, file-filenya masih sementara berada di
`apps/luna-telegram/` di `html5-project` — pindah ke repo baru adalah
langkah administratif terpisah (pembuatan repo GitHub, pemindahan file),
tidak mengubah isi logika di dokumen ini.

**Di luar cakupan dokumen ini** (diminta eksplisit untuk dilewati): sinkronisasi
antar-perangkat, mode offline/PWA, caching, strategi deploy/infra tgcloud
detail. Dokumen ini fokus murni ke **logika produk & aturan bisnis** — apa
yang sistem harus hitung, kapan, dan dengan aturan apa.

---

## 1. Apa dan Kenapa

**Apa**: Luna Telegram adalah Mini App + bot Telegram untuk pelacakan siklus
menstruasi, kesuburan, dan kesehatan reproduksi — versi server-backed dari
`luna-kalender-siklus`, dibangun di atas [Telegram Serverless](https://core.telegram.org/bots/serverless)
(`tgcloud`): sandbox V8 per-invocation + database SQLite terkelola + akses
Bot API, dikelola lewat CLI `tgcloud`.

**Kenapa dipisah dari `luna-kalender-siklus`, bukan migrasi**:
1. `luna-kalender-siklus` punya janji privasi eksplisit ke user ("tidak ada
   server, tidak ada akun, tidak dikirim ke mana pun") yang akan dilanggar
   kalau datanya dipindah ke backend tgcloud.
2. Model distribusi beda total — Mini App cuma bisa dipakai lewat client
   Telegram (perlu akun Telegram), bukan "buka file HTML di browser mana
   pun".
3. tgcloud butuh Node.js 18+, CLI, struktur proyek multi-file
   (`schema.js`/`handlers/`/`endpoints/`) — bentrok dengan konvensi monorepo
   `html5-project` ("vanilla JS, tanpa build step"). Ini juga alasan proyek
   ini dipindah ke repo sendiri (lihat §2), bukan ditumpuk terus di
   `apps/luna-telegram/`.

**Siapa penggunanya**: pengguna yang sudah terbiasa pakai Telegram sehari-hari
dan lebih memilih reminder siklus datang sebagai pesan chat (andal, tidak
tergantung tab browser tetap terbuka) dibanding notifikasi web biasa.

---

## 2. Struktur Folder (Repo Berdiri Sendiri)

Repo baru, root-level (bukan nested di bawah `apps/` seperti di
`html5-project`). Struktur di bawah representatif — tata letak persis
`tgcloud/` sebagian ditentukan oleh scaffold `npm create @tgcloud/bot` saat
proyek pertama kali di-init, tapi pembagian modul `lib/` per domain logika
ini WAJIB diikuti supaya tiap bagian PRD punya rumah kode yang jelas:

```
luna-telegram/                      ← root repo (baru)
├── README.md                       ← ringkasan + status proyek
├── CLAUDE.md                       ← konteks & aturan kerja utk sesi AI
├── PRD.md                          ← dokumen ini
├── package.json                    ← root-level, scripts & deps Node
├── tgcloud.jsonc                   ← konfigurasi proyek tgcloud
│
├── tgcloud/                        ← backend serverless (struktur wajib tgcloud)
│   ├── schema.js                   ← definisi tabel DB, lihat §4
│   ├── handlers/                   ← flat, 1 file per tipe update Telegram
│   │   ├── message.js              ← command teks (/start, /kalender, /pengaturan, dst)
│   │   └── callback_query.js       ← tombol kalender & inline keyboard lain ditekan
│   ├── endpoints/                  ← flat, dipanggil dari Mini App (kalau Mini App dipakai)
│   └── lib/                        ← kode bersama — algoritma inti PRD tinggal di sini
│       ├── cycle.js                ← §5 perhitungan fase, §5.4–5.5 prediksi haid/ovulasi
│       ├── lh.js                   ← §6 deteksi LH surge
│       ├── bbt.js                  ← §7.2 deteksi ovulasi dari BBT
│       ├── analysis.js             ← §8–§12 statistik, anomali, luteal, PMS, korelasi
│       ├── calendar-render.js      ← §14 kalender rich HTML di chat
│       ├── pregnancy.js            ← §15 mode perencanaan kehamilan
│       ├── report.js               ← §16 laporan untuk dokter
│       ├── insights.js             ← §17 insight bulanan
│       ├── reminders.js            ← §18 reminder/notifikasi
│       └── share.js                ← §19 mode berbagi
│
├── miniapp/                        ← (opsional — kalau Mini App webview jadi dipakai nanti,
│                                       di luar fitur kalender-di-chat yang sudah cukup
│                                       lewat bot langsung)
│
└── docs/                           ← dokumentasi wajib (diisi begitu implementasi dimulai,
    ├── ARSITEKTUR.md                  lihat Aturan Wajib #3 di CLAUDE.md repo lama untuk
    ├── CHANGELOG.md                   polanya — repo baru ini bebas menyesuaikan)
    ├── PATCHNOTES.md
    ├── HANDOFF.md
    └── PLAN.md
```

Catatan penamaan: karena ini proyek Node multi-file (bukan satu file HTML),
pelacakan versi memakai heading SemVer `## [MAJOR.MINOR.PATCH] - YYYY-MM-DD`
di `CHANGELOG.md`/`PATCHNOTES.md` dan versi di `package.json` — **bukan**
nama file utama ber-versi seperti konvensi proyek single-file di
`html5-project`. Lihat `CLAUDE.md` repo ini untuk penjelasan lengkap
pengecualian ini.

---

## 3. Model Pengguna & Identitas

- **Tidak ada PIN, tidak ada WebAuthn.** Identitas pengguna = Telegram
  `user_id`, diverifikasi lewat **initData** Mini App (ditandatangani
  Telegram, diverifikasi server-side sebelum kode `endpoints/` jalan — lihat
  dokumentasi `tgcloud`), atau lewat `message.from.id`/`callback_query.from.id`
  untuk interaksi lewat bot langsung. Setiap baris data di database selalu
  terikat ke `telegram_user_id` ini — satu akun Telegram = satu set data
  siklus, tidak ada konsep "kunci aplikasi" terpisah karena aksesnya sudah
  dibatasi oleh autentikasi Telegram itu sendiri.
- **Tidak ada mode "tamu"/anonim.** Setiap interaksi (lewat bot command atau
  Mini App) butuh `telegram_user_id` yang valid.
- **Multi-device otomatis "gratis"**: karena data di server (bukan
  `localStorage`), buka Mini App dari HP lain dengan akun Telegram yang sama
  = data yang sama muncul, tanpa perlu fitur sync apa pun (ini keuntungan
  desain yang eksplisit DIAKUI, bukan dijelaskan detail — di luar cakupan
  dokumen ini).

---

## 4. Model Data

Entitas-entitas berikut digantikan dari key `localStorage` versi lama
menjadi tabel/baris di database `tgcloud`, selalu di-scope per
`telegram_user_id`. Field per entitas (bentuk logis — tipe kolom konkret
ditentukan saat implementasi lewat `schema.js`):

### 4.1 `settings` (satu baris per user — snapshot keadaan siklus SEKARANG)
| Field | Tipe | Keterangan |
|---|---|---|
| `telegram_user_id` | ID | kunci utama |
| `last_period_date` | tanggal | hari pertama haid terakhir (HPHT) |
| `cycle_length` | integer | input manual, **validasi 21–45 hari** |
| `period_length` | integer | input manual, **validasi 2–10 hari** |
| `mode` | enum `normal` \| `pregnant` | lihat §15 |
| `onboarded_at` | timestamp \| null | kapan wizard onboarding selesai/dilewati |

### 4.2 `cycle_history` (ledger — banyak baris per user, satu per siklus tercatat)
| Field | Tipe | Keterangan |
|---|---|---|
| `date` | tanggal | hari pertama haid siklus itu |
| `cycle_length` | integer | panjang siklus yang di-input saat itu |
| `period_length` | integer | durasi haid yang di-input saat itu |

### 4.3 `symptoms` (ledger — satu baris per tanggal per user)
| Field | Tipe | Keterangan |
|---|---|---|
| `date` | tanggal | kunci (1 entri per hari) |
| `flow` | enum | lihat §7.1 `CHIP_DEFS.flow` |
| `pain` | enum | lihat §7.1 `CHIP_DEFS.pain` |
| `mood` | enum | lihat §7.1 `CHIP_DEFS.mood` — **string harus persis**, lihat §24.2 |
| `discharge` | enum | lihat §7.1 `CHIP_DEFS.discharge` |
| `other` | array string | multi-select, lihat §7.1 `CHIP_DEFS.other` |
| `notes` | teks bebas | opsional |

### 4.4 `bbt` (ledger — satu baris per tanggal per user)
| Field | Tipe | Keterangan |
|---|---|---|
| `date` | tanggal | kunci |
| `temp_celsius` | desimal | **validasi 35.0–38.5°C** |

### 4.5 `wellbeing` (ledger — satu baris per tanggal per user)
| Field | Tipe | Keterangan |
|---|---|---|
| `date` | tanggal | kunci |
| `energy` | integer 1–5 | |
| `sleep` | integer 1–5 | |
| `appetite` | integer 1–5 | |
| `mood` | integer 1–5 | field terpisah dari `symptoms.mood` (yang itu enum kategori, ini skala angka) |

### 4.6 `kb` (ledger append-only — banyak baris per tanggal per user)
| Field | Tipe | Keterangan |
|---|---|---|
| `date` | tanggal | |
| `type` | enum | `Pil KB`, `Kondom`, `IUD`, `Implan`, `Suntik`, `Lainnya` |
| `status` | enum | `taken` (✅ Diminum) \| `missed` (❌ Lupa) |

### 4.7 `lh` (ledger — satu baris per tanggal per user)
| Field | Tipe | Keterangan |
|---|---|---|
| `date` | tanggal | kunci |
| `result` | enum | `negative` \| `high` \| `peak` |

### 4.8 `pregtest` (ledger append-only — banyak baris per tanggal per user)
| Field | Tipe | Keterangan |
|---|---|---|
| `date` | tanggal | |
| `result` | enum | `positive` \| `faint` \| `negative` |

**Catatan desain**: pembagian "snapshot" (`settings`, diganti utuh saat
di-update) vs "ledger" (semua tabel lain, append/upsert per tanggal, tidak
pernah ditimpa massal) ini persis filosofi yang sama dipakai
`apps/berkah-admin` dan `apps/luna-kalender-siklus` untuk sync — tapi di sini
relevan sebagai **model data**, bukan untuk sync (karena tidak ada sync,
semua langsung baca/tulis ke satu sumber data server).

---

## 5. Perhitungan Fase Siklus — Logika Inti

Ini fungsi paling sering dipanggil & paling kritis — salah di sini,
salah semua prediksi turunannya.

### 5.1 Rata-rata panjang siklus (`computeAvgCycle`)
```
INPUT: cycle_history milik user, S.cycleLength (fallback dari settings)
1. Kalau cycle_history < 2 baris → pakai S.cycleLength langsung.
2. Urutkan cycle_history ascending by date.
3. Untuk tiap pasangan baris berurutan, hitung selisih hari.
4. Buang selisih yang di luar rentang [18, 50] hari (data anomali/salah input).
5. Kalau tidak ada selisih valid tersisa → pakai S.cycleLength.
6. Kalau ada → hasilnya rata-rata (dibulatkan) dari selisih-selisih valid itu.
```

### 5.2 Penentuan tanggal ovulasi per siklus — prioritas 3 lapis
Untuk **setiap** siklus yang dihitung (baik siklus sekarang maupun proyeksi
ke depan/belakang untuk kalender), tentukan tanggal ovulasi dengan urutan
prioritas (yang lebih tinggi menang kalau tersedia & valid untuk window
siklus itu):

1. **LH strip** (`detectLHSurge`, lihat §6) — paling akurat.
2. **BBT** (`detectBBTOvulation`, lihat §7.2) — kalau LH tidak ada/tidak
   valid untuk window siklus ini.
3. **Fallback kalender**: `ovulasi = awal_siklus + (panjang_siklus - 14)`.

```
FUNGSI tentukanOvulasi(cycleStart, cycleEnd, avgCycleLength):
  surge = detectLHSurge()
  JIKA surge ADA:
    offset = (hasil_surge == 'peak') ? 1 hari : 2 hari   // lihat §6
    ovTanggal = tanggal_surge + offset
    JIKA ovTanggal berada di antara cycleStart..cycleEnd:
      KEMBALIKAN { tanggal: ovTanggal, sumber: 'lh' }

  bbtOv = detectBBTOvulation(cycleStart, cycleEnd)
  JIKA bbtOv ADA:
    KEMBALIKAN { tanggal: bbtOv, sumber: 'bbt' }

  KEMBALIKAN { tanggal: cycleStart + (avgCycleLength - 14), sumber: 'calendar' }
```

### 5.3 Penentuan fase harian (`buildCycleMap`)
Untuk tiap hari `d` dalam satu siklus (dihitung dari 0 = hari pertama haid),
dengan `pl` = durasi haid user, dan `daysDiff` = selisih hari antara hari itu
dan tanggal ovulasi siklus tersebut (`daysDiff = hari - tanggal_ovulasi`,
bisa negatif):

| Kondisi | Fase | Arti |
|---|---|---|
| `d < pl` | `menstruation` 🩸 | sedang haid |
| `daysDiff` di `[-5, -1]` | `fertile` 🌿 | masa subur (5 hari sebelum ovulasi — daya tahan sperma) |
| `daysDiff == 0` | `peak` ⭐ | hari ovulasi, kesuburan tertinggi |
| `daysDiff > 0` | `luteal` 🌙 | fase luteal, pasca-ovulasi |
| selain semua di atas | `safe` ✨ | fase folikular, relatif aman |

**Urutan pengecekan ini WAJIB persis seperti di atas** (menstruation dicek
duluan, baru fertile/peak/luteal, baru fallback safe) — kalau dibalik, hari
haid yang kebetulan jatuh di window fertile akan salah diberi label fertile,
bukan menstruation.

Proyeksi dilakukan untuk rentang **8 siklus**: 2 siklus ke belakang sampai
5 siklus ke depan dari `last_period_date` (`c = -2` sampai `c < 6`), supaya
kalender bisa menampilkan bulan-bulan sebelum/sesudah siklus aktif.

### 5.4 Prediksi haid berikutnya (`getNextPeriod`)
```
next = last_period_date
SELAMA next <= hari_ini:
  next = next + avgCycleLength
KEMBALIKAN next
```

### 5.5 Prediksi ovulasi berikutnya (`getNextOvulation`)
```
JIKA ada ovulasi-terdeteksi untuk siklus aktif (dari §5.2, sumber lh/bbt)
   DAN tanggalnya >= hari ini:
  KEMBALIKAN tanggal itu langsung (lebih akurat dari kalkulasi kalender)

// fallback kalkulasi kalender murni, dengan pengaman infinite-loop
base = last_period_date
ULANGI (maks 100 iterasi):
  ov = base + (avgCycleLength - 14)
  base = base + avgCycleLength
SAMPAI ov >= hari_ini
KEMBALIKAN ov
```

---

## 6. Deteksi LH Surge (Tes Ovulasi)

`result` tes LH punya 3 nilai: `negative`, `high`, `peak`.

```
FUNGSI detectLHSurge():
  entries = semua baris `lh` milik user, urut ascending by date

  // Prioritas 1: cari hasil 'peak'. HARUS AMBIL YANG PALING BARU,
  // bukan yang pertama kali tercatat — lihat §24.1.
  peaks = entries dengan result == 'peak'
  JIKA peaks tidak kosong:
    KEMBALIKAN tanggal dari peaks TERAKHIR (paling baru, bukan peaks[0])

  // Prioritas 2 (fallback): hasil 'high' terakhir
  highs = entries dengan result == 'high'
  JIKA highs tidak kosong:
    KEMBALIKAN tanggal dari highs TERAKHIR
  KEMBALIKAN null
```

**Offset ke tanggal ovulasi** (dipakai di §5.2):
- `peak` → ovulasi diperkirakan **surge + 1 hari** (ovulasi terjadi 24–36 jam
  setelah LH surge).
- `high` (tanpa peak) → ovulasi diperkirakan **surge + 2 hari** (estimasi
  kasar, surge sedang mendekat).

---

## 7. Gejala Harian

### 7.1 Taksonomi gejala (opsi chip, semua single-select KECUALI `other`)

```
flow      (aliran haid):   ['Tidak ada', 'Flek', 'Ringan', 'Sedang', 'Deras']
pain      (nyeri/kram):    ['Tidak ada', 'Ringan', 'Sedang', 'Berat', 'Nyeri punggung']
mood      (mood):          ['Normal', 'Bahagia 😊', 'Sensitif 😢', 'Cemas 😟',
                             'Mudah marah 😤', 'Kelelahan 😴', 'Depresi']
discharge (keputihan):     ['Tidak ada', 'Sedikit', 'Bening/stretchy 🥚',
                             'Putih keruh', 'Kuning/hijau ⚠️']
other     (lain-lain, MULTI-select): ['Kembung', 'Sakit kepala', 'Payudara nyeri',
                             'Mual', 'Jerawat', 'Insomnia', 'Libido tinggi',
                             'Libido rendah', 'Kram', 'Lelah', 'Nafsu makan meningkat']
```

⚠️ Emoji di atas adalah **bagian dari nilai string**, bukan dekorasi tampilan
semata — `'Bahagia 😊'` HARUS disimpan & dibandingkan persis dengan emoji-nya,
karena ada logika (§11, §12) yang membandingkan string ini secara eksak.

### 7.2 Deteksi ovulasi dari BBT — aturan "3-over-6" (modifikasi Marshall)

```
FUNGSI detectBBTOvulation(cycleStart, cycleEnd):
  entries = baris `bbt` milik user dalam rentang [cycleStart, cycleEnd],
            urut ascending by date
  JIKA entries.length < 9: KEMBALIKAN null

  UNTUK i DARI 6 SAMPAI (entries.length - 3):
    window = entries[i-6 .. i+3]   // 9 entri: 6 baseline + 3 elevated

    // WAJIB: 9 entri ini harus 9 HARI KALENDER BERTURUT-TURUT, bukan
    // cuma 9 index array yang berdekatan — lihat §24.3.
    JIKA selisih tanggal antar entri berurutan di `window` ADA yang != 1 hari:
      LEWATI window ini, lanjut ke i berikutnya

    baseline = window[0..5].suhu   // 6 nilai
    elevated = window[6..8].suhu   // 3 nilai
    coverline = MAX(baseline)

    semuaElevated = SEMUA nilai di elevated >= (coverline + 0.1°C)
    rataBaseline = RATA(baseline)
    rataElevated = RATA(elevated)

    JIKA semuaElevated DAN (rataElevated - rataBaseline) >= 0.2°C:
      KEMBALIKAN window[5].tanggal   // hari TERAKHIR sebelum kenaikan suhu

  KEMBALIKAN null
```

---

## 8. Analisis Statistik Siklus (`computeAnalysis`)

```
FUNGSI computeAnalysis():
  hist = cycle_history, urut ascending
  JIKA hist.length < 2: KEMBALIKAN null

  lengths = []
  UNTUK tiap pasangan baris berurutan di hist:
    diff = selisih_hari(baris_i, baris_i-1)
    JIKA diff ADA DI [18, 50]: lengths.push(diff)
  JIKA lengths kosong: KEMBALIKAN null

  avg = RATA(lengths)
  min = MIN(lengths)
  max = MAX(lengths)
  // Standar deviasi SAMPEL (pakai Bessel's correction, pembagi n-1,
  // bukan n) — lebih akurat untuk sampel kecil seperti ini.
  std = SQRT( SUM((x - avg)^2 untuk x di lengths) / (lengths.length - 1) )
        // kalau lengths.length == 1 → std = 0

  regularity =
    std <= 2 → "Sangat Teratur"
    std <= 4 → "Cukup Teratur"
    std <= 7 → "Kurang Teratur"
    lainnya  → "Tidak Teratur"

  KEMBALIKAN { avg, min, max, std, regularity, lengths, sorted: hist }
```

---

## 9. Deteksi Anomali Siklus (`detectAnomalies`)

```
FUNGSI detectAnomalies():
  a = computeAnalysis()
  JIKA a null ATAU a.lengths.length < 3: KEMBALIKAN []

  anomalies = []
  UNTUK tiap panjang siklus `len` di a.lengths (dengan tanggal siklus terkait):
    deviasi = len - a.avg
    JIKA |deviasi| > 7 hari:
      alasan = deviasi > 7
        ? "Siklus jauh lebih panjang dari biasanya. Bisa karena stres,
           perubahan berat badan, gangguan tiroid, atau PCOS."
        : "Siklus jauh lebih pendek dari biasanya. Bisa karena stres,
           perubahan hormonal, atau mendekati perimenopause."
      anomalies.push({ siklus, panjang: len, deviasi, alasan })

  JIKA a.avg < 21:
    anomalies.push({ siklus: "Rata-rata", panjang: a.avg, deviasi: 0,
      alasan: "Rata-rata siklus di bawah 21 hari (polymenorrhea). Sebaiknya diperiksakan." })
  JIKA a.avg > 35:
    anomalies.push({ siklus: "Rata-rata", panjang: a.avg, deviasi: 0,
      alasan: "Rata-rata siklus di atas 35 hari (oligomenorrhea). Bisa terkait PCOS atau gangguan hormonal." })

  KEMBALIKAN anomalies
```
Ditampilkan dengan disclaimer eksplisit: *"ini bukan diagnosis — gunakan
sebagai bahan diskusi dengan dokter."*

---

## 10. Fase Luteal dari BBT

```
FUNGSI getLutealStats():
  JIKA cycle_history.length < 2 ATAU jumlah baris `bbt` < 9: KEMBALIKAN null

  hist = cycle_history urut ascending
  lutealLengths = []
  UNTUK i DARI 0 SAMPAI hist.length - 2:
    cycleStart = hist[i].date
    cycleEnd   = hist[i+1].date
    ovStr = detectBBTOvulation(cycleStart, cycleEnd)
    JIKA ovStr ADA:
      luteal = selisih_hari(cycleEnd, ovStr)
      JIKA luteal ADA DI [7, 20]: lutealLengths.push(luteal)

  JIKA lutealLengths kosong: KEMBALIKAN null
  KEMBALIKAN { avg: RATA(lutealLengths), count: lutealLengths.length }
```

Status ditampilkan:
- `avg < 10` → **"Pendek — konsultasi disarankan"** (indikator potensi
  kesulitan implantasi).
- `avg > 16` → **"Lebih panjang dari normal"**.
- selain itu → **"Normal (10–16 hari)"**.

---

## 11. Prediksi Keparahan PMS (`predictPMS`)

```
FUNGSI predictPMS():
  entries = semua baris `symptoms` milik user
  JIKA entries.length < 5: KEMBALIKAN null

  lutealDays = 0; painDays = 0; moodDays = 0; otherDays = 0
  symptomFreq = {}  // peta tag → hitungan kemunculan

  UNTUK tiap entri:
    JIKA fase_hari_itu != 'luteal': LEWATI entri ini
    lutealDays += 1
    JIKA entri.pain ADA DAN entri.pain != 'Tidak ada': painDays += 1
    // PAKAI NEUTRAL_MOODS, bukan perbandingan string manual — lihat §24.2
    JIKA entri.mood ADA DAN entri.mood TIDAK DI NEUTRAL_MOODS: moodDays += 1
    JIKA entri.other.length > 0: otherDays += 1
    UNTUK tiap tag di entri.other: symptomFreq[tag] += 1
    JIKA entri.mood ADA DAN entri.mood != 'Normal':
      symptomFreq[entri.mood] += 1   // catatan: exclude hanya 'Normal' di sini,
                                      // BUKAN NEUTRAL_MOODS — supaya 'Bahagia 😊'
                                      // tetap bisa muncul sebagai salah satu
                                      // "pola gejala biasanya" (lihat §24.2 catatan)

  JIKA lutealDays < 3: KEMBALIKAN null

  painPct  = painDays  / lutealDays
  moodPct  = moodDays  / lutealDays
  otherPct = otherDays / lutealDays
  skor = BULATKAN( (painPct*0.4 + moodPct*0.35 + otherPct*0.25) * 100 )

  level =
    skor < 25 → "Ringan"
    skor < 55 → "Sedang"
    lainnya   → "Berat"

  topSymptoms = 3 tag dengan symptomFreq tertinggi, urut descending

  KEMBALIKAN { skor, level, topSymptoms, lutealDays }
```

**Bobot skor (0.4 / 0.35 / 0.25) WAJIB persis** — ini bukan angka sembarang,
mencerminkan nyeri dianggap indikator PMS paling kuat, lalu mood, lalu
gejala lain.

Ditampilkan hanya ketika fase sekarang = `luteal`, ATAU `daysToPeriod` ada
di rentang `[0, 10]` (mendekati haid).

---

## 12. Korelasi Gejala × Fase (`renderCorrelationInner`)

```
FUNGSI hitungKorelasi():
  entries = semua baris `symptoms` milik user
  JIKA entries.length < 3: KEMBALIKAN "belum cukup data"

  phaseCount  = { menstruation:{}, fertile:{}, peak:{}, luteal:{}, safe:{} }
  phaseTotals = { menstruation:0, fertile:0, peak:0, luteal:0, safe:0 }

  UNTUK tiap entri (date, data):
    fase = fase_pada_tanggal(date) ATAU 'safe'
    phaseTotals[fase] += 1
    tags = salin(data.other)
    JIKA data.pain ADA DAN data.pain != 'Tidak ada': tags.push('Nyeri: ' + data.pain)
    JIKA data.mood ADA DAN data.mood TIDAK DI NEUTRAL_MOODS: tags.push(data.mood)
    UNTUK tiap tag di tags: phaseCount[fase][tag] += 1

  allTags = gabungan semua tag dari phaseCount, dengan total hitungan
  top5 = 5 tag dengan hitungan tertinggi

  UNTUK tiap tag di top5:
    UNTUK tiap fase di [menstruation, fertile, peak, luteal, safe]:
      persen = BULATKAN( phaseCount[fase][tag] / phaseTotals[fase] * 100 )
      // tampilkan sebagai bar: "% hari dengan gejala itu, di fase ini"

  KEMBALIKAN hasil per tag × fase
```

---

## 13. Perbandingan Siklus Terakhir

Data untuk chart "bandingkan 6 siklus terakhir": ambil `a.lengths` dan
`a.sorted` dari §8 (`computeAnalysis`), pasangkan tiap panjang siklus dengan
`period_length` siklus itu (dari `cycle_history`), ambil **6 entri
terakhir** (paling baru). Untuk tiap entri, data yang dibutuhkan konsumen
(UI apa pun, termasuk kalau nanti direpresentasikan sebagai pesan bot):
`{ tanggal_mulai, panjang_siklus, durasi_haid }`, plus `rata-rata` dari §8
sebagai garis acuan.

---

## 14. Kalender di Chat (Rich HTML)

**Tujuan**: kalender siklus bisa dibuka & dibaca langsung di dalam chat
Telegram (bukan cuma lewat Mini App terpisah), berbentuk tabel berwarna per
fase, dan tiap tanggal bisa di-tap untuk melihat semua atribut yang pernah
dicatat untuk hari itu.

### 14.1 Kendala teknis nyata — WAJIB dipahami sebelum desain teknis

Dicek langsung ke dokumentasi resmi Telegram Bot API (bagian "Rich
messages" / "Rich HTML style", method `sendRichMessage` + objek
`InputRichMessage`, terpisah dari `sendMessage`/`parse_mode=HTML` klasik
yang jauh lebih terbatas):

| Yang diminta | Status dukungan Telegram | Implikasi desain |
|---|---|---|
| Tabel HTML sungguhan di dalam pesan chat | ✅ Didukung — `<table>` jadi blok tabel asli, sel (`RichBlockTableCell`) punya teks, header, `colspan`/`rowspan`, perataan horizontal/vertikal, serta flag tabel `bordered`/`striped`/`compact` + caption. Maks **20 kolom** per tabel. | Kalender bulanan (7 kolom hari) muat nyaman. |
| **Warna** per sel sesuai fase | ❌ **Tidak didukung.** Tidak ada atribut warna/background apa pun yang terdokumentasi untuk sel atau baris tabel — satu-satunya kata "colors" di seluruh dokumentasi format ini soal warna tombol yang ikut tema aplikasi Telegram, bukan sesuatu yang bisa kita atur. | "Berwarna" dicapai lewat **emoji berwarna** di dalam teks sel (lihat §14.2), bukan CSS/atribut warna — ini bukan kompromi kosmetik kecil, ini satu-satunya cara yang benar-benar tersedia. |
| Sel tabel **bisa diklik** langsung | ⚠️ **Belum terkonfirmasi penuh.** Dokumentasi bilang "Table cells can contain only inline formatting", dan tombol (`<tg-button>`, lewat tipe `RichTextButton`) adalah bagian dari sistem `RichText` yang sama — jadi secara skema MUNGKIN bisa, tapi tidak ada contoh eksplisit "tombol di dalam sel tabel" di dokumentasi yang terbaca. **WAJIB divalidasi lewat `tgcloud run` di awal implementasi** sebelum desain final sel-per-sel diandalkan. | Kalau ternyata TIDAK bisa: fallback ke Inline Keyboard terpisah (lihat §14.3) — ini yang dipakai hampir semua bot kalender Telegram yang sudah ada, dan dijamin berfungsi. |
| Update kalender in-place (ganti bulan tanpa kirim pesan baru) | ❌ **Tidak ada method edit untuk rich message** yang terdokumentasi (beda dari `editMessageText` di pesan klasik). Yang ada `sendRichMessageDraft` — itu preview SEMENTARA 30 detik sebelum di-"commit" lewat `sendRichMessage`, bukan mekanisme edit pesan yang sudah terkirim. | Navigasi bulan (§14.4) mengirim **pesan baru** tiap kali, bukan edit pesan lama. Chat history terisi tiap kali pindah bulan — ini trade-off yang diterima sadar, bukan bug. |

### 14.2 Pemetaan fase → emoji warna

Karena warna sungguhan tidak tersedia, dipakai emoji lingkaran/simbol warna
sebagai pengganti — SELALU konsisten dengan §5.3:

| Fase | Emoji | Dipakai di tiap sel sebagai |
|---|---|---|
| `menstruation` 🩸 | 🔴 | `<angka hari>🔴` |
| `fertile` 🌿 | 🟢 | `<angka hari>🟢` |
| `peak` ⭐ | 🟡 | `<angka hari>🟡` |
| `luteal` 🌙 | 🟣 | `<angka hari>🟣` |
| `safe` ✨ | ⚪ | `<angka hari>⚪` |
| Hari ini (tambahan, DI ATAS warna fase) | tebalkan teks (`<b>`) | `<b><angka hari>🔴</b>` |
| Hari dengan data tercatat (tambahan) | tambahkan `·` kecil di bawah/sebelah angka | `<angka hari>🔴·` |

### 14.3 Layout tabel kalender bulanan

```
HEADER (tidak diklik): Min | Sen | Sel | Rab | Kam | Jum | Sab
BARIS per minggu: 7 sel, satu per hari — sel kosong untuk tanggal
  sebelum tanggal 1 / setelah akhir bulan (sama seperti kalender web, §5.3).
Tiap sel berisi: <angka hari><emoji fase>[·]   (lihat §14.2)
```

**Jalur klik** — dua desain, dipilih SETELAH validasi teknis §14.1:
- **Jalur A (kalau tombol di dalam sel tabel terkonfirmasi bisa)**: tiap sel
  tabel adalah `<tg-button>` dengan `callback_data` berisi tanggal
  (`cal:<YYYY-MM-DD>`), tabel itu sendiri yang jadi "kalender yang bisa
  diklik" secara visual persis seperti dibayangkan.
- **Jalur B (fallback, kalau Jalur A tidak didukung)**: tabel rich HTML
  dipakai HANYA untuk tampilan (header bulan + grid berwarna, tanpa
  interaksi), lalu **Inline Keyboard terpisah** di bawah pesan — tombol per
  tanggal berlabel `<angka><emoji>` dalam grid 7 kolom yang sama persis
  posisinya dengan tabel di atasnya, `callback_data` = `cal:<YYYY-MM-DD>`.
  Secara visual tetap terasa satu kalender yang bisa diklik, cuma
  mekanismenya dua elemen terpisah (tabel tampilan + keyboard interaksi).

### 14.4 Navigasi bulan

Dua tombol di baris terpisah (Inline Keyboard, bukan bagian tabel):
`‹ Bulan Sebelumnya` dan `Bulan Berikutnya ›`, `callback_data` berisi bulan
target (`cal-month:<YYYY-MM>`). Menekan salah satu **mengirim pesan
kalender baru** untuk bulan itu (lihat batasan §14.1 — tidak ada edit
in-place untuk rich message).

### 14.5 Detail per tanggal (aksi utama saat sel/tombol diklik)

```
FUNGSI tampilkanDetailTanggal(telegram_user_id, tanggal):
  fase = fase_pada_tanggal(tanggal)   // dari §5.3
  sym  = baris `symptoms` di tanggal itu (kalau ada)
  bbt  = baris `bbt` di tanggal itu (kalau ada)
  wb   = baris `wellbeing` di tanggal itu (kalau ada)
  lh   = baris `lh` di tanggal itu (kalau ada)
  kb   = semua baris `kb` di tanggal itu (bisa lebih dari satu)
  preg = semua baris `pregtest` di tanggal itu (bisa lebih dari satu)
  isHPHT = tanggal ini ADA sebagai `date` di cycle_history ATAU == settings.last_period_date

  KIRIM pesan baru berisi SEMUA field yang ADA (field yang kosong/tidak
  pernah diisi untuk tanggal itu TIDAK ditampilkan — bukan ditampilkan
  sebagai "-" atau kosong, supaya ringkas):
```

**Format pesan detail** (semua bagian kondisional, cuma muncul kalau
datanya ada untuk tanggal itu):

```
📅 <tanggal lengkap>
<emoji fase> <label fase>
[🩸 HPHT tercatat di tanggal ini]

[JIKA ada `symptoms`:]
📋 Gejala
• Aliran: <flow>
• Nyeri: <pain>
• Mood: <mood>
• Keputihan: <discharge>
• Lainnya: <other, gabung koma>
• Catatan: "<notes>"

[JIKA ada `bbt`:]
🌡️ Suhu Basal: <temp_celsius>°C

[JIKA ada `wellbeing`:]
🌟 Wellbeing: Energi <energy>/5 · Tidur <sleep>/5 · Nafsu makan <appetite>/5 · Mood <mood>/5

[JIKA ada `lh`:]
🧪 Tes LH: <label hasil: Negatif/Tinggi/Peak>

[JIKA ada `kb`, bisa >1 baris:]
💊 Kontrasepsi: <type> — <status: Diminum/Lupa>

[JIKA ada `pregtest`, bisa >1 baris:]
🧪 Test Pack: <label hasil: Positif/Samar/Negatif>

[JIKA TIDAK ADA satupun data di atas:]
Belum ada catatan untuk tanggal ini.
```

Di bawah pesan detail, Inline Keyboard dengan tombol `📝 Catat Gejala Hari
Ini` (kalau tanggalnya hari ini atau di masa lalu) yang membuka alur input
gejala (di luar cakupan rinci dokumen ini — ikuti taksonomi §7.1), dan
tombol `« Kembali ke Kalender` yang mengirim ulang pesan kalender bulan
yang sama.

### 14.6 Entry point

Command `/kalender` (tanpa argumen = bulan berjalan) atau tombol menu
persisten "📅 Kalender" → kirim pesan kalender bulan ini (§14.3).

---

## 15. Mode Perencanaan Kehamilan

Aktif kalau `settings.mode == 'pregnant'`. Menghitung **DPO (Days Past
Ovulation)** untuk siklus AKTIF saat ini, dan memetakan ke salah satu status
berikut (dicek **urut sesuai daftar ini**, kondisi pertama yang cocok
dipakai):

```
cycleStart = awal siklus aktif (hari pertama haid terakhir yang relevan)
ovDate = tanggal ovulasi siklus ini (dari §5.2, prioritas lh > bbt > kalender)
dpo = selisih_hari(hari_ini, ovDate)
cycleDayNow = selisih_hari(hari_ini, cycleStart) + 1
daysLate = cycleDayNow - avgCycleLength
```

| Kondisi | Status | Saran |
|---|---|---|
| `dpo < 0` | "Masa Subur — N hari menuju ovulasi" | Waktu terbaik berhubungan, frekuensi tiap 1–2 hari |
| `daysLate > 0` DAN `dpo > 14` | "Haid telat N hari" | `daysLate >= 3` → sarankan test pack sekarang; kalau belum, saran tunggu 2–3 hari lagi |
| `dpo <= 6` | "N DPO — Fase implantasi awal" | belum ada gejala yang bisa diandalkan |
| `dpo <= 11` | "N DPO — Jendela implantasi" | implantasi biasa 6–12 DPO, test pack belum akurat |
| `dpo <= 14` | "N DPO — Bisa mulai test" | hCG mulai terdeteksi, pakai urin pagi pertama |
| lainnya (`dpo > 14`, belum telat) | "N DPO — Menunggu" | sudah lewat masa subur, tunggu beberapa hari |

**Hasil test pack** (`pregtest`) punya 3 nilai: `positive` (➕ Positif),
`faint` (🌫️ Samar), `negative` (➖ Negatif). Kalau user mencatat hasil
`positive`, tampilkan pesan selamat + anjuran segera konsultasi dokter
kandungan untuk konfirmasi.

---

## 16. Laporan untuk Dokter

Fungsi `showDoctorReport` menghasilkan teks terstruktur berikut (dipakai
sebagai dasar — bentuk pengiriman konkret di Telegram, misal sebagai pesan
atau file, ditentukan saat implementasi):

```
LAPORAN SIKLUS MENSTRUASI — LUNA
Dicetak: <tanggal hari ini>
────────────────────────────────────────

DATA SIKLUS AKTIF
• Hari pertama haid terakhir : <tanggal>
• Panjang siklus (input)      : <N> hari
• Durasi haid                 : <N> hari
• Rata-rata siklus (historis) : <N> hari

PREDIKSI
• Haid berikutnya    : <tanggal>
• Ovulasi berikutnya : <tanggal>

[JIKA ada ≥2 riwayat siklus:]
ANALISIS SIKLUS (<N> siklus tercatat)
• Rata-rata siklus : <N> hari
• Siklus terpendek : <N> hari
• Siklus terpanjang: <N> hari
• Standar deviasi  : ±<N> hari
• Keteraturan      : <label>

[JIKA ada riwayat:]
RIWAYAT 6 SIKLUS TERAKHIR
• <tanggal> (siklus <N>h, haid <N>h)   [maks 6 baris]

[JIKA ada data BBT:]
SUHU BASAL (BBT) 7 TERAKHIR
• <tanggal>: <suhu>°C   [maks 7 baris]

[JIKA ada data LH:]
HASIL LH STRIP (TES OVULASI)
• <tanggal>: <Negatif|Tinggi|Peak/Positif (LH Surge)>   [maks 10 baris]
→ LH Surge terdeteksi: <tanggal>   [kalau ada]

CATATAN GEJALA: <N> hari tercatat

────────────────────────────────────────
Dibuat oleh Luna — Kalender Siklus Cerdas
⚠️ Bukan pengganti diagnosis medis.
```

---

## 17. Insight Bulanan (Proaktif, Rule-Based)

Ditampilkan maksimal **2 insight sekaligus**, dipilih dari daftar ini (urut
cek sesuai urutan di bawah, tambahkan ke daftar kandidat kalau kondisinya
terpenuhi, lalu ambil 2 teratas):

1. `std <= 2` → *"Siklusmu sangat teratur (variasi hanya ±N hari). Prediksi
   cenderung akurat."*
2. `std > 7` → *"Siklusmu cukup bervariasi (±N hari). Catat rutin agar
   prediksi membaik."*
3. 3 siklus terakhir memanjang berturut (`lengths[-1] > lengths[-3] + 3`) →
   insight tren memanjang.
4. 3 siklus terakhir memendek berturut (`lengths[-1] < lengths[-3] - 3`) →
   insight tren memendek, sarankan konsultasi kalau di bawah 21 hari.
5. `getLutealStats().avg < 10` → insight fase luteal pendek.
6. Jumlah data BBT tercatat `> 0` tapi `< 9` → dorong user melengkapi
   pencatatan BBT supaya sistem bisa konfirmasi ovulasi dari suhu.

---

## 18. Reminder / Notifikasi (Logika Trigger)

**Ini keunggulan utama versi Telegram** dibanding versi web (notifikasi chat
jauh lebih andal daripada Web Notifications API yang butuh tab/PWA tetap
hidup). Logika KAPAN reminder terkirim (bukan cara infra mengeksekusinya —
itu di luar cakupan dokumen ini, lihat catatan di bawah):

```
FUNGSI tentukanReminderHariIni(user):
  JIKA user belum isi settings: TIDAK ADA reminder
  JIKA sudah pernah kirim reminder untuk tanggal hari ini: TIDAK ADA reminder (sekali per hari)

  daysToPeriod = selisih_hari(nextPeriod, hari_ini)
  daysToOv     = selisih_hari(nextOvulation, hari_ini)
  fase         = fase_pada(hari_ini)

  JIKA daysToPeriod == 1:
    KIRIM "🩸 Haid besok" — "Haidmu diperkirakan mulai besok. Siapkan perlengkapanmu ya 💕"
  LAINNYA JIKA daysToPeriod == 0:
    KIRIM "🩸 Haid hari ini" — "Haidmu diperkirakan mulai hari ini."
  LAINNYA JIKA daysToOv == 1:
    KIRIM "⭐ Ovulasi besok" — teks beda tergantung mode:
      mode pregnant: "Besok puncak kesuburan! Waktu terbaik jika merencanakan kehamilan."
      mode normal:   "Besok ovulasi — masa paling subur. Gunakan kontrasepsi jika belum ingin hamil."
  LAINNYA JIKA fase == 'fertile' DAN daysToOv <= 3:
    KIRIM "🌿 Masa subur" — "Kamu sedang dalam masa subur. Ovulasi ~N hari lagi."
```

Urutan pengecekan ini penting — hanya **1 reminder per hari** per user,
kondisi pertama yang cocok yang menang.

**Catatan implementasi (di luar cakupan PRD ini, WAJIB dikonfirmasi sebelum
desain teknis)**: dokumentasi `tgcloud` yang tersedia saat ini hanya
menjelaskan `handlers/` (reaksi ke update Telegram) dan `endpoints/`
(dipanggil dari Mini App) — keduanya **event-driven**, bukan time-driven.
Belum jelas apakah `tgcloud` punya mekanisme cron/scheduled trigger bawaan
untuk menjalankan `tentukanReminderHariIni()` tiap hari per user tanpa event
masuk dulu. Ini harus dikonfirmasi ke dokumentasi/tim Telegram sebelum fase
desain teknis — kalau tidak ada, perlu pemicu eksternal (mis. cron job di
luar tgcloud yang memanggil sebuah endpoint/handler secara berkala).

---

## 19. Mode Berbagi (Ringkasan Read-Only ke Kontak Lain)

Fitur ini **BUKAN** fitur sinkronisasi (data tidak digabung ke akun
penerima) — ini murni berbagi **ringkasan satu arah, read-only**, cocok
dikirim ke pasangan via bot (mis. bot forward pesan ringkasan ke chat lain
atas izin pengirim).

Payload ringkasan **HANYA** berisi:
```
{
  fase_hari_ini: <enum fase>,
  label_fase: <teks label>,
  hari_menuju_haid: <integer | null>,
  hari_menuju_ovulasi: <integer | null>,
}
```
**TIDAK PERNAH** menyertakan: gejala, catatan bebas, riwayat siklus, data
BBT, data LH, data KB, hasil test pack — sengaja dibatasi supaya aman
dibagikan ke orang lain tanpa membocorkan data kesehatan pribadi yang lebih
sensitif. Penerima ringkasan ini TIDAK bisa melihat/mengubah data siklus
pengirim — ini satu kali kirim, bukan langganan live.

---

## 20. Onboarding (3 Langkah)

Ditampilkan sekali untuk user baru (belum pernah isi `settings` ATAU belum
pernah menekan "lewati"), lewat percakapan bot atau Mini App:

1. **Welcome** — perkenalan singkat + tombol "Mulai" / "Lewati, isi nanti".
2. **Data siklus** — input HPHT (wajib), panjang siklus (wajib,
   validasi 21–45), durasi haid (wajib, validasi 2–10). Tombol "Lanjut" /
   "Kembali".
3. **Mode** — pilih `normal` atau `pregnant`. Tombol "Selesai" (simpan
   semua ke `settings`, tandai onboarding selesai) / "Kembali".

"Lewati" di langkah manapun → tandai onboarding selesai TANPA menyimpan
`settings` (user isi data lengkap nanti lewat command/menu pengaturan).

---

## 21. Reset Data

User bisa minta hapus semua datanya (`settings`, `cycle_history`,
`symptoms`, `bbt`, `wellbeing`, `kb`, `lh`, `pregtest`, flag onboarding) —
WAJIB ada konfirmasi eksplisit sebelum eksekusi (aksi destruktif, tidak bisa
dibatalkan), sama persis semangatnya dengan `resetAll()` di versi web.

---

## 22. Rentang Validasi Input (Referensi Cepat)

| Input | Rentang valid |
|---|---|
| Panjang siklus (`cycle_length`) | 21–45 hari |
| Durasi haid (`period_length`) | 2–10 hari |
| Suhu BBT (`temp_celsius`) | 35.0–38.5 °C |
| Selisih siklus dianggap valid (dipakai §5.1, §8, §9) | 18–50 hari |
| Fase luteal dianggap valid (dipakai §10) | 7–20 hari |

---

## 23. Hal yang Sengaja TIDAK Dibawa dari Versi Web

Daftar ini supaya tidak ada yang bertanya "kok fitur X hilang" — ini
keputusan desain sadar, bukan kelupaan:

| Fitur di `luna-kalender-siklus` | Kenapa tidak dibawa |
|---|---|
| PIN Lock | Digantikan autentikasi Telegram (initData) — lihat §3 |
| WebAuthn (sidik jari/wajah) | Sama alasannya dengan PIN — tidak relevan kalau akses sudah dibatasi akun Telegram |
| Sync P2P (WebRTC/PeerJS) | Tidak perlu — data sudah di server, otomatis sama di semua device (lihat §3) |
| Kode Teks sync (base64) | Idem |
| Export/Import Backup JSON | Idem — opsi export data tetap bisa dipikirkan lagi nanti kalau user minta portabilitas data keluar dari Telegram, tapi bukan untuk sync antar-device |
| Mode offline / PWA | Mini App selalu butuh koneksi ke Telegram untuk berfungsi, tidak ada mode offline |
| AI Chat (sudah dihapus juga di versi web) | Tetap tidak dibawa, tidak diminta |
| Integrasi Web Bluetooth termometer | API browser-spesifik, tidak applicable di konteks Mini App/bot — kalau dibutuhkan lagi, perlu didesain ulang terpisah |

---

## 24. Jangan Ulangi Bug Ini

Tiga bug ini pernah ada di `luna-kalender-siklus` dan sudah diperbaiki di
sana — algoritma di dokumen ini **sudah dalam bentuk yang benar**, tapi
dicatat eksplisit di sini supaya siapa pun yang implementasi tahu PERSIS
jebakannya kalau nanti menulis ulang dari nol atau "menyederhanakan" kode:

### 24.1 `detectLHSurge` harus ambil peak TERBARU, bukan yang pertama ditemukan
Kalau filter `result == 'peak'` lalu `.find()`/ambil elemen pertama dari
array yang diurutkan ascending (tanggal lama → baru), itu mengembalikan
peak **tertua**. Begitu user pernah mencatat 1x hasil "Peak", deteksi
ovulasi otomatis akan macet terkunci ke tanggal lama itu selamanya untuk
siklus-siklus berikutnya. **Harus ambil elemen TERAKHIR** dari array hasil
filter (atau cari dari belakang) — lihat §6.

### 24.2 Perbandingan mood "netral" harus exact-match string TERMASUK emoji
`CHIP_DEFS.mood` berisi `'Bahagia 😊'` (dengan emoji), bukan `'Bahagia'`
polos. Logika yang mengecualikan mood positif dari skor PMS (§11) dan
korelasi gejala (§12) **harus** membandingkan ke string persis
`'Bahagia 😊'` (atau pakai daftar konstanta `NEUTRAL_MOODS = ['Normal',
'Bahagia 😊']` dan cek keanggotaan, bukan perbandingan `!==` manual berulang
di berbagai tempat — supaya kalau label berubah, cukup update satu
konstanta, tidak perlu grep semua tempat yang membandingkan string secara
manual).

### 24.3 Deteksi BBT 3-over-6 harus cek kontinuitas tanggal, bukan cuma index array
Kalau window 9-hari diambil dari 9 **index** berurutan di array hasil
`filter()`, itu TIDAK menjamin 9 hari **kalender** berurutan — kalau user
bolong mencatat BBT (lewat beberapa hari), index yang "berdekatan" secara
array sebenarnya terentang lebih dari 9 hari kalender asli. Window WAJIB
divalidasi: selisih tanggal antar entri berurutan dalam window itu harus
tepat 1 hari, sebelum window itu dievaluasi aturan 3-over-6-nya (lihat
§7.2). Window yang gagal validasi ini di-skip, bukan dianggap valid.

---

## 25. Ringkasan Daftar Fitur (Checklist Cakupan)

- [x] §2 Struktur folder repo berdiri sendiri
- [x] §5 Perhitungan fase siklus harian + proyeksi 8 siklus
- [x] §5.4–5.5 Prediksi haid & ovulasi berikutnya
- [x] §6 Deteksi LH surge (dengan fix bug "ambil terbaru")
- [x] §7.1 Taksonomi gejala harian (5 kategori + notes bebas)
- [x] §7.2 Deteksi ovulasi dari BBT "3-over-6" (dengan fix bug kontinuitas)
- [x] §8 Statistik siklus (avg/min/max/std dev + label keteraturan)
- [x] §9 Deteksi anomali siklus
- [x] §10 Analisis fase luteal dari BBT
- [x] §11 Prediksi keparahan PMS (dengan fix bug NEUTRAL_MOODS)
- [x] §12 Korelasi gejala × fase
- [x] §13 Perbandingan siklus terakhir
- [x] §14 Kalender di chat (rich HTML, berwarna via emoji, bisa diklik) — dengan catatan validasi teknis §14.1
- [x] §15 Mode perencanaan kehamilan (status DPO) + log hasil test pack
- [x] §16 Laporan untuk dokter
- [x] §17 Insight bulanan proaktif
- [x] §18 Reminder/notifikasi (logika trigger — mekanisme jadwal server perlu dikonfirmasi)
- [x] §19 Mode Berbagi (ringkasan read-only)
- [x] §20 Onboarding 3 langkah
- [x] §21 Reset data
- [x] Wellbeing (energi/tidur/nafsu makan/mood, skala 1–5) — lihat §4.5
- [x] Tracker kontrasepsi (KB) — lihat §4.6
