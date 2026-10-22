// PRD §14 — kalender rich HTML di chat. Warna = emoji (Telegram tidak
// mendukung warna sel). Jalur B: tabel untuk tampilan + inline keyboard untuk klik.
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

/** Teks sel §14.2: <hari><emoji>[·], tebal bila hari ini. */
export function cellLabel({ day, phase, isToday, hasData, html = false }) {
  const core = `${day}${phase ? PHASE_EMOJI[phase] : ''}${hasData ? '·' : ''}`;
  return html && isToday ? `<b>${core}</b>` : core;
}

/**
 * @param model createCycleModel(...) atau null (belum onboarding)
 * @param recorded Set tanggal yang punya catatan apa pun
 * @param clickableCells true = Jalur A (tg-button di dalam sel), false = Jalur B
 */
export function renderMonth({ ym, model, today, recorded = new Set(), clickableCells = false }) {
  const [y, m] = ym.split('-').map(Number);
  const weeks = monthCells(ym);
  const cell = (day, html) => {
    if (!day) return null;
    const date = dateOf(ym, day);
    return {
      date,
      label: cellLabel({ day, phase: model?.phaseOn(date) ?? null, isToday: date === today, hasData: recorded.has(date), html }),
    };
  };

  let html = `<h3>${MONTHS[m - 1]} ${y}</h3><table bordered><tr>${HEAD.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  for (const week of weeks) {
    html += '<tr>' + week.map((day) => {
      const c = cell(day, true);
      if (!c) return '<td>&nbsp;</td>';
      return clickableCells
        ? `<td><tg-button type="callback_data" style="link" data="cal:${c.date}">${c.label}</tg-button></td>`
        : `<td>${c.label}</td>`;
    }).join('') + '</tr>';
  }
  html += '</table>';
  html += `<p>${['menstruation', 'fertile', 'peak', 'luteal', 'safe'].map((p) => `${PHASE_EMOJI[p]} ${PHASE_LABEL[p].split(' (')[0]}`).join(' · ')}</p>`;
  html += '<p><i>· = ada catatan, tebal = hari ini</i></p>';

  const keyboard = [];
  if (!clickableCells) {
    for (const week of weeks) {
      keyboard.push(week.map((day) => {
        const c = cell(day, false);
        return c ? { text: c.label, callback_data: `cal:${c.date}` } : { text: '·', callback_data: 'noop' };
      }));
    }
  }
  keyboard.push(navRow(ym, today));
  return { html, keyboard };
}

function navRow(ym, today) {
  return [
    { text: '‹ Sebelumnya', callback_data: `cal-month:${prevMonth(ym)}` },
    { text: 'Hari ini', callback_data: `cal-month:${today.slice(0, 7)}` },
    { text: 'Berikutnya ›', callback_data: `cal-month:${nextMonth(ym)}` },
  ];
}

/** §14.5 — detail tanggal. rows = { symptoms, bbt, wellbeing, lh, kb[], preg[] } + isHPHT, phase. */
export function renderDayDetail({ date, phase, isHPHT, rows, today }) {
  const { symptoms: s, bbt, wellbeing: w, lh, kb = [], preg = [] } = rows;
  let h = `<h3>📅 ${esc(formatLong(date))}</h3>`;
  if (phase) h += `<p>${PHASE_ICON[phase]} ${esc(PHASE_LABEL[phase])}</p>`;
  if (isHPHT) h += '<p>🩸 HPHT tercatat di tanggal ini</p>';
  let any = false;
  if (s) {
    any = true;
    const li = [];
    if (s.flow) li.push(`Aliran: ${esc(s.flow)}`);
    if (s.pain) li.push(`Nyeri: ${esc(s.pain)}`);
    if (s.mood) li.push(`Mood: ${esc(s.mood)}`);
    if (s.discharge) li.push(`Keputihan: ${esc(s.discharge)}`);
    if (s.other?.length) li.push(`Lainnya: ${esc(s.other.join(', '))}`);
    if (s.notes) li.push(`Catatan: “${esc(s.notes)}”`);
    h += `<p>📋 <b>Gejala</b></p><ul>${li.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  }
  if (bbt) { any = true; h += `<p>🌡️ Suhu Basal: ${bbt.tempCelsius}°C</p>`; }
  if (w) { any = true; h += `<p>🌟 Wellbeing: Energi ${w.energy}/5 · Tidur ${w.sleep}/5 · Nafsu makan ${w.appetite}/5 · Mood ${w.mood}/5</p>`; }
  if (lh) { any = true; h += `<p>🧪 Tes LH: ${LH_LABEL[lh.result]}</p>`; }
  for (const k of kb) { any = true; h += `<p>💊 Kontrasepsi: ${esc(k.type)} — ${KB_STATUS_LABEL[k.status]}</p>`; }
  for (const p of preg) { any = true; h += `<p>🧪 Test Pack: ${PREG_LABEL[p.result]}</p>`; }
  if (!any) h += '<p>Belum ada catatan untuk tanggal ini.</p>';

  const keyboard = [];
  if (date <= today) keyboard.push([{ text: '📝 Catat Gejala Hari Ini', callback_data: `log:${date}` }]);
  keyboard.push([{ text: '« Kembali ke Kalender', callback_data: `cal-month:${date.slice(0, 7)}` }]);
  return { html: h, keyboard };
}

