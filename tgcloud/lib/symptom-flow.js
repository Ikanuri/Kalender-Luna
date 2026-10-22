// Alur input gejala (PRD §7.1, §14.5) — mesin status murni.
import { CHIP_DEFS, CHIP_LABELS } from './constants.js';
import { formatShort } from './dates.js';

const ORDER = ['flow', 'pain', 'mood', 'discharge', 'other'];

export const startSymptomFlow = (date) => ({ flow: 'sym', date, step: 'flow', values: { other: [] } });

function promptFor(state) {
  const f = state.step;
  const head = `📝 Gejala ${formatShort(state.date)}\n<b>${CHIP_LABELS[f]}</b>`;
  const opts = CHIP_DEFS[f];
  const rows = [];
  const per = 2;
  for (let i = 0; i < opts.length; i += per) {
    rows.push(opts.slice(i, i + per).map((label, k) => {
      const idx = i + k;
      const on = f === 'other' && state.values.other.includes(label);
      return { text: `${on ? '✅ ' : ''}${label}`, callback_data: `sym:${f}:${idx}` };
    }));
  }
  rows.push([{ text: f === 'other' ? 'Lanjut ›' : 'Lewati ›', callback_data: 'sym:next' }]);
  return { text: f === 'other' ? `${head} (boleh lebih dari satu)` : head, keyboard: rows };
}

export function initialPrompt(state) { return promptFor(state); }

const notesPrompt = {
  text: '🗒 Tambahkan catatan bebas? Ketik sekarang, atau kirim /lewati untuk menyimpan.',
  keyboard: [[{ text: 'Simpan tanpa catatan', callback_data: 'sym:save' }]],
};

/** event: { type:'cb', value } | { type:'text', value }. → { state, reply, done } */
export function symptomStep(state, event) {
  if (event.type === 'text') {
    if (state.step !== 'notes') return { state, reply: null };
    const notes = event.value.trim();
    const values = notes && notes !== '/lewati' ? { ...state.values, notes } : state.values;
    return { state: null, done: { date: state.date, values } };
  }
  const [, a, b] = event.value.split(':');
  if (a === 'save' && state.step === 'notes') return { state: null, done: { date: state.date, values: state.values } };
  const advance = () => {
    const i = ORDER.indexOf(state.step);
    if (i === ORDER.length - 1) return { state: { ...state, step: 'notes' }, reply: notesPrompt };
    const next = { ...state, step: ORDER[i + 1] };
    return { state: next, reply: promptFor(next) };
  };
  if (a === 'next') return state.step === 'notes' ? { state, reply: null } : advance();
  if (a !== state.step || state.step === 'notes') return { state, reply: null };
  const label = CHIP_DEFS[a]?.[Number(b)];
  if (label == null) return { state, reply: null };
  if (a === 'other') {
    const cur = state.values.other;
    const other = cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label];
    const next = { ...state, values: { ...state.values, other } };
    return { state: next, reply: promptFor(next), edit: true };
  }
  const withVal = { ...state, values: { ...state.values, [a]: label } };
  const r = (() => {
    const i = ORDER.indexOf(a);
    const next = { ...withVal, step: ORDER[i + 1] };
    return { state: next, reply: promptFor(next) };
  })();
  return r;
}
