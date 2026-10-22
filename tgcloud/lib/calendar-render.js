// PRD §14 — kalender di chat = GRID TOMBOL DI BADAN PESAN (rich message:
// <tg-button-row> + <tg-button type="callback_data" style="…">). Warna fase =
// style tombol (danger=merah, success=hijau, primary=biru); fase tanpa warna asli
// dibedakan penanda emoji. Setiap render juga menyertakan versi klasik
// (teks + inline keyboard) sebagai FALLBACK bila API rich message menolak.
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

/** Warna asli tombol per fase (hanya danger/success/primary yang berwarna). */
export const PHASE_STYLE = { menstruation: 'danger', fertile: 'success', peak: 'primary' };
const PHASE_MARK = { peak: '⭐', luteal: '🟣' };

/** Label tombol: <hari>[penanda fase][·]; hari ini dibungkus [ ]. */
export function cellLabel({ day, phase, isToday, hasData }) {
  const core = `${day}${phase ? (PHASE_MARK[phase] ?? '') : ''}${hasData ? '·' : ''}`;
  return isToday ? `[${core}]` : core;
}

/** Model tombol netral: baris-baris { text, data?, style? }; tanpa data = nonaktif. */
function monthRows({ ym, model, today, recorded }) {
  const rows = [HEAD.map((text) => ({ text }))];
  for (const week of monthCells(ym)) {
    rows.push(week.map((day) => {
      if (!day) return { text: '·' };
      const date = dateOf(ym, day);
      const phase = model?.phaseOn(date) ?? null;
      const b = { text: cellLabel({ day, phase, isToday: date === today, hasData: recorded.has(date) }), data: `cal:${date}` };
      if (phase && PHASE_STYLE[phase]) b.style = PHASE_STYLE[phase];
      return b;
    }));
  }
  rows.push([
    { text: '‹ Sebelumnya', data: `cal-month:${prevMonth(ym)}` },
    { text: 'Hari ini', data: `cal-month:${today.slice(0, 7)}` },
    { text: 'Berikutnya ›', data: `cal-month:${nextMonth(ym)}` },
  ]);
  return rows;
}

// ── penerjemah model tombol → rich <tg-button-row> dan inline_keyboard ──
const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export const richButton = (b) => (b.data
  ? `<tg-button type="callback_data"${b.style ? ` style="${b.style}"` : ''} data="${attr(b.data)}">${esc(b.text)}</tg-button>`
  : `<tg-button type="disabled">${esc(b.text)}</tg-button>`);
export const richRows = (rows) => rows.map((r) => `<tg-button-row>${r.map(richButton).join('')}</tg-button-row>`).join('');
export const inlineRows = (rows) => rows.map((r) => r.map((b) => ({
  text: b.text, callback_data: b.data ?? 'noop', ...(b.style ? { style: b.style } : {}),
})));

/** Teks klasik (HTML Telegram) → blok rich: tiap baris jadi <p>. */
export const richFromText = (text) => text.split('\n').filter((l) => l.trim()).map((l) => `<p>${l}</p>`).join('');

/**
 * @returns { html, text, keyboard } — html = rich message (tombol di badan pesan);
 * text+keyboard = versi klasik untuk fallback.
 */
export function renderMonth({ ym, model, today, recorded = new Set() }) {
  const [y, m] = ym.split('-').map(Number);
  const rows = monthRows({ ym, model, today, recorded });
  const legend = '🟥 Haid · 🟩 Masa subur · 🟦⭐ Ovulasi · 🟣 Luteal · ⬜ Aman';
  const hint = '[ ] hari ini · · ada catatan · ketuk tanggal untuk detail';
  const setup = model ? '' : 'Isi data siklus lewat /start agar kalender berwarna.';
  const html = `<h3>📅 ${MONTHS[m - 1]} ${y}</h3><p>${legend}</p><p><i>${hint}</i></p>${setup ? `<p>${setup}</p>` : ''}${richRows(rows)}`;
  const text = `📅 <b>${MONTHS[m - 1]} ${y}</b>\n${legend}\n<i>${hint}</i>${setup ? `\n\n${setup}` : ''}`;
  return { html, text, keyboard: inlineRows(rows) };
}

/** §14.5 — detail tanggal. */
export function renderDayDetail({ date, phase, isHPHT, rows, today }) {
  const { symptoms: s, bbt, wellbeing: w, lh, kb = [], preg = [] } = rows;
  const L = [`📅 <b>${esc(formatLong(date))}</b>`];
  if (phase) L.push(`${PHASE_ICON[phase]} ${esc(PHASE_LABEL[phase])}`);
  if (isHPHT) L.push('🩸 HPHT tercatat di tanggal ini');
  let any = false;
  if (s) {
    any = true;
    L.push('📋 <b>Gejala</b>');
    if (s.flow) L.push(`• Aliran: ${esc(s.flow)}`);
    if (s.pain) L.push(`• Nyeri: ${esc(s.pain)}`);
    if (s.mood) L.push(`• Mood: ${esc(s.mood)}`);
    if (s.discharge) L.push(`• Keputihan: ${esc(s.discharge)}`);
    if (s.other?.length) L.push(`• Lainnya: ${esc(s.other.join(', '))}`);
    if (s.notes) L.push(`• Catatan: “${esc(s.notes)}”`);
  }
  if (bbt) { any = true; L.push(`🌡️ Suhu Basal: ${bbt.tempCelsius}°C`); }
  if (w) { any = true; L.push(`🌟 Wellbeing: Energi ${w.energy}/5 · Tidur ${w.sleep}/5 · Nafsu makan ${w.appetite}/5 · Mood ${w.mood}/5`); }
  if (lh) { any = true; L.push(`🧪 Tes LH: ${LH_LABEL[lh.result]}`); }
  for (const k of kb) { any = true; L.push(`💊 Kontrasepsi: ${esc(k.type)} — ${KB_STATUS_LABEL[k.status]}`); }
  for (const p of preg) { any = true; L.push(`🧪 Test Pack: ${PREG_LABEL[p.result]}`); }
  if (!any) L.push('Belum ada catatan untuk tanggal ini.');

  const btnRows = [];
  if (date <= today) btnRows.push([{ text: '📝 Catat Gejala Hari Ini', data: `log:${date}` }]);
  btnRows.push([{ text: '« Kembali ke Kalender', data: `cal-month:${date.slice(0, 7)}` }]);
  const text = L.join('\n');
  return { html: richFromText(text) + richRows(btnRows), text, keyboard: inlineRows(btnRows) };
}
