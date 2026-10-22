// PRD §14 — kalender di chat berupa GRID TOMBOL (inline keyboard). Warna fase =
// `style` tombol Bot API (danger=merah, success=hijau, primary=biru); fase tanpa
// warna asli dibedakan lewat penanda emoji. Pesan berisi teks HTML klasik.
import { MONTHS, daysInMonth, dow, formatLong } from './dates.js';
import { KB_STATUS_LABEL, LH_LABEL, PHASE_EMOJI, PHASE_ICON, PHASE_LABEL, PREG_LABEL } from './constants.js';
import { esc } from './html.js';

const HEAD = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
export function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Sel-sel bulan sebagai matriks minggu × 7; null = sel kosong. */
export function monthCells(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lead = dow(`${ym}-01`);
  const days = daysInMonth(y, m);
  const flat = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (flat.length % 7) flat.push(null);
  const weeks = [];
  for (let i = 0; i < flat.length; i += 7) weeks.push(flat.slice(i, i + 7));
  return weeks;
}

const dateOf = (ym, d) => `${ym}-${String(d).padStart(2, '0')}`;

/** Warna asli tombol per fase (Bot API hanya punya 3 warna). */
export const PHASE_STYLE = { menstruation: 'danger', fertile: 'success', peak: 'primary' };
// Penanda untuk fase yang tidak punya warna asli / sebagai pembeda tambahan.
const PHASE_MARK = { peak: '⭐', luteal: '🟣' };

/** Label tombol: <hari>[penanda fase][·]; hari ini dibungkus [ ]. */
export function cellLabel({ day, phase, isToday, hasData }) {
  const core = `${day}${phase ? (PHASE_MARK[phase] ?? '') : ''}${hasData ? '·' : ''}`;
  return isToday ? `[${core}]` : core;
}

/**
 * @param model createCycleModel(...) atau null (belum onboarding)
 * @param recorded Set tanggal yang punya catatan apa pun
 * @returns { text, keyboard } — text = HTML Telegram klasik (parse_mode HTML)
 */
export function renderMonth({ ym, model, today, recorded = new Set() }) {
  const [y, m] = ym.split('-').map(Number);
  const keyboard = [HEAD.map((h) => ({ text: h, callback_data: 'noop' }))];
  for (const week of monthCells(ym)) {
    keyboard.push(week.map((day) => {
      if (!day) return { text: '·', callback_data: 'noop' };
      const date = dateOf(ym, day);
      const phase = model?.phaseOn(date) ?? null;
      const b = { text: cellLabel({ day, phase, isToday: date === today, hasData: recorded.has(date) }), callback_data: `cal:${date}` };
      if (phase && PHASE_STYLE[phase]) b.style = PHASE_STYLE[phase];
      return b;
    }));
  }
  keyboard.push(navRow(ym, today));
  const text = `📅 <b>${MONTHS[m - 1]} ${y}</b>\n`
    + '🟥 Haid · 🟩 Masa subur · 🟦⭐ Ovulasi · 🟣 Luteal · ⬜ Aman\n'
    + '<i>[ ] hari ini · · ada catatan · ketuk tanggal untuk detail</i>'
    + (model ? '' : '\n\n<i>Isi data siklus lewat /start agar kalender berwarna.</i>');
  return { text, keyboard };
}

function navRow(ym, today) {
  return [
    { text: '‹ Sebelumnya', callback_data: `cal-month:${prevMonth(ym)}` },
    { text: 'Hari ini', callback_data: `cal-month:${today.slice(0, 7)}` },
    { text: 'Berikutnya ›', callback_data: `cal-month:${nextMonth(ym)}` },
  ];
}

/** §14.5 — detail tanggal (HTML Telegram klasik). */
export function renderDayDetail({ date, phase, isHPHT, rows, today }) {
  const { symptoms: s, bbt, wellbeing: w, lh, kb = [], preg = [] } = rows;
  const L = [`📅 <b>${esc(formatLong(date))}</b>`];
  if (phase) L.push(`${PHASE_ICON[phase]} ${esc(PHASE_LABEL[phase])}`);
  if (isHPHT) L.push('🩸 HPHT tercatat di tanggal ini');
  let any = false;
  if (s) {
    any = true;
    L.push('', '📋 <b>Gejala</b>');
    if (s.flow) L.push(`• Aliran: ${esc(s.flow)}`);
    if (s.pain) L.push(`• Nyeri: ${esc(s.pain)}`);
    if (s.mood) L.push(`• Mood: ${esc(s.mood)}`);
    if (s.discharge) L.push(`• Keputihan: ${esc(s.discharge)}`);
    if (s.other?.length) L.push(`• Lainnya: ${esc(s.other.join(', '))}`);
    if (s.notes) L.push(`• Catatan: “${esc(s.notes)}”`);
  }
  if (bbt) { any = true; L.push('', `🌡️ Suhu Basal: ${bbt.tempCelsius}°C`); }
  if (w) { any = true; L.push('', `🌟 Wellbeing: Energi ${w.energy}/5 · Tidur ${w.sleep}/5 · Nafsu makan ${w.appetite}/5 · Mood ${w.mood}/5`); }
  if (lh) { any = true; L.push('', `🧪 Tes LH: ${LH_LABEL[lh.result]}`); }
  for (const k of kb) { any = true; L.push(`💊 Kontrasepsi: ${esc(k.type)} — ${KB_STATUS_LABEL[k.status]}`); }
  for (const p of preg) { any = true; L.push(`🧪 Test Pack: ${PREG_LABEL[p.result]}`); }
  if (!any) L.push('', 'Belum ada catatan untuk tanggal ini.');

  const keyboard = [];
  if (date <= today) keyboard.push([{ text: '📝 Catat Gejala Hari Ini', callback_data: `log:${date}` }]);
  keyboard.push([{ text: '« Kembali ke Kalender', callback_data: `cal-month:${date.slice(0, 7)}` }]);
  return { text: L.join('\n'), keyboard };
}
