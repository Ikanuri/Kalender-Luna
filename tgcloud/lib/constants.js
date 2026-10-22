// Konstanta domain — PRD §5.3, §7.1, §14.2, §22, §24.2.

export const CHIP_DEFS = {
  flow: ['Tidak ada', 'Flek', 'Ringan', 'Sedang', 'Deras'],
  pain: ['Tidak ada', 'Ringan', 'Sedang', 'Berat', 'Nyeri punggung'],
  // Emoji adalah BAGIAN dari nilai string (PRD §7.1, §24.2).
  mood: ['Normal', 'Bahagia 😊', 'Sensitif 😢', 'Cemas 😟', 'Mudah marah 😤', 'Kelelahan 😴', 'Depresi'],
  discharge: ['Tidak ada', 'Sedikit', 'Bening/stretchy 🥚', 'Putih keruh', 'Kuning/hijau ⚠️'],
  other: ['Kembung', 'Sakit kepala', 'Payudara nyeri', 'Mual', 'Jerawat', 'Insomnia',
    'Libido tinggi', 'Libido rendah', 'Kram', 'Lelah', 'Nafsu makan meningkat'],
};

export const CHIP_LABELS = {
  flow: 'Aliran haid', pain: 'Nyeri/kram', mood: 'Mood', discharge: 'Keputihan', other: 'Lain-lain',
};

// Satu-satunya tempat daftar mood "netral" — jangan bandingkan string manual (PRD §24.2).
export const NEUTRAL_MOODS = ['Normal', 'Bahagia 😊'];

export const PHASES = ['menstruation', 'fertile', 'peak', 'luteal', 'safe'];
export const PHASE_EMOJI = { menstruation: '🔴', fertile: '🟢', peak: '🟡', luteal: '🟣', safe: '⚪' };
export const PHASE_ICON = { menstruation: '🩸', fertile: '🌿', peak: '⭐', luteal: '🌙', safe: '✨' };
export const PHASE_LABEL = {
  menstruation: 'Haid', fertile: 'Masa subur', peak: 'Puncak kesuburan (ovulasi)',
  luteal: 'Fase luteal', safe: 'Fase folikular (relatif aman)',
};

export const LH_LABEL = { negative: 'Negatif', high: 'Tinggi', peak: 'Peak' };
export const PREG_LABEL = { positive: 'Positif', faint: 'Samar', negative: 'Negatif' };
export const KB_TYPES = ['Pil KB', 'Kondom', 'IUD', 'Implan', 'Suntik', 'Lainnya'];
export const KB_STATUS_LABEL = { taken: 'Diminum', missed: 'Lupa' };

export const RANGE = {
  cycleLength: [21, 45],
  periodLength: [2, 10],
  bbt: [35.0, 38.5],
  validCycleGap: [18, 50],
  validLuteal: [7, 20],
};
