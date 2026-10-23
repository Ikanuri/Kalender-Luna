// Narasi sapaan hangat di beranda Mini App: singkat, tanpa emoji, menyebut nama pengguna.
// Murni (tanpa sdk). Nama hanya untuk tampilan — tidak pernah disimpan.
import { toDay } from './dates.js';

const pick = (list, seed) => list[((seed % list.length) + list.length) % list.length];

/** Nama dari Telegram → teks aman & pendek (tanpa kontrol/markup), atau ''. */
export function cleanName(name) {
  return String(name ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
}

export function buildGreeting({ name, hour }) {
  const part = hour >= 4 && hour < 11 ? 'pagi' : hour >= 11 && hour < 15 ? 'siang' : hour >= 15 && hour < 18 ? 'sore' : 'malam';
  const n = cleanName(name);
  return n ? `Selamat ${part}, ${n}` : `Selamat ${part}`;
}

const PHASE_TEXT = {
  menstruation: [
    'Tubuhmu sedang bekerja keras hari ini. Pelan-pelan saja, kamu boleh beristirahat lebih banyak.',
    'Hari-hari haid memang menuntut banyak energi. Minum yang hangat dan beri dirimu jeda.',
    'Tidak apa-apa bila hari ini terasa berat. Dengarkan apa yang tubuhmu butuhkan.',
  ],
  safe: [
    'Energimu cenderung naik di fase ini. Waktu yang baik untuk memulai hal yang sempat tertunda.',
    'Tubuhmu mulai terasa lebih ringan. Manfaatkan untuk hal-hal yang kamu sukai.',
    'Fase yang biasanya terasa segar. Nikmati ritme harimu.',
  ],
  fertile: [
    'Kamu sedang di masa subur, dan ovulasi sudah dekat. Semoga harimu berjalan menyenangkan.',
    'Masa subur sedang berlangsung. Jaga tubuhmu tetap segar dan terhidrasi.',
  ],
  peak: [
    'Hari ini puncak kesuburanmu. Biasanya energi dan suasana hati sedang di titik terbaik.',
    'Ovulasi jatuh hari ini. Nikmati harimu dengan tenang.',
  ],
  luteal: [
    'Energi mulai melambat, dan itu wajar. Beri ruang untuk istirahat dan makan yang cukup.',
    'Fase yang lebih tenang menjelang haid. Bila suasana hati naik turun, kamu tidak sendirian.',
    'Tubuhmu sedang bersiap untuk siklus berikutnya. Pelan-pelan saja hari ini.',
  ],
};
const FERTILE_PLANNING = 'Masa subur sedang berlangsung, waktu yang baik bila kamu merencanakan kehamilan.';
const PREG_TEXT = {
  early: 'Masa menunggu memang tidak mudah. Tarik napas pelan-pelan, kamu sudah melakukan yang terbaik.',
  implantation: 'Masa menunggu memang tidak mudah. Tarik napas pelan-pelan, kamu sudah melakukan yang terbaik.',
  testable: 'Sudah masuk waktu yang bisa dites. Apa pun hasilnya, kamu tidak menjalaninya sendirian.',
  late: 'Haidmu terlambat dari perkiraan. Bila belum tes, urin pagi pertama memberi hasil paling jelas.',
  waiting: 'Masih dalam masa menunggu. Jaga dirimu baik-baik selama itu.',
};

/**
 * Satu atau dua kalimat. Prioritas: haid hari ini/besok → mode hamil (selain masa subur) →
 * PMS berat di fase luteal → teks fase. Variasi dipilih tetap per hari (tidak berubah saat dibuka ulang).
 */
export function buildNarrative({ phase, today, daysToPeriod, mode, pms, pregnancy }) {
  const seed = toDay(today);
  if (daysToPeriod === 0 && phase !== 'menstruation') return 'Haidmu diperkirakan datang hari ini. Siapkan yang kamu butuhkan, dan tetap jaga dirimu.';
  if (daysToPeriod === 1) return 'Haid diperkirakan datang besok. Siapkan perlengkapanmu dan istirahat lebih awal malam ini.';
  if (mode === 'pregnant' && pregnancy) {
    if (pregnancy.kind === 'fertile') return phase === 'peak' ? 'Hari ini puncak kesuburanmu, waktu yang baik bila kamu merencanakan kehamilan.' : FERTILE_PLANNING;
    if (PREG_TEXT[pregnancy.kind]) return PREG_TEXT[pregnancy.kind];
  }
  if (phase === 'luteal' && pms?.show && pms.level === 'Berat') {
    return 'Gejala menjelang haid mungkin terasa lebih kuat belakangan ini. Catat saja, kita pantau polanya bersama.';
  }
  return pick(PHASE_TEXT[phase] ?? PHASE_TEXT.safe, seed);
}
