// PRD §20 — onboarding 3 langkah sebagai mesin status murni.
import { parseCycleLength, parseDate, parsePeriodLength } from './parse.js';
import { RANGE } from './constants.js';

const kb = (...rows) => rows;
const btn = (text, data) => ({ text, callback_data: `ob:${data}` });

export const startOnboarding = () => ({
  state: { flow: 'ob', step: 'welcome', data: {} },
  reply: {
    text: '👋 Halo, aku <b>Luna</b> — pelacak siklus, kesuburan, dan kesehatan reproduksi.\n\n'
      + 'ℹ️ Datamu disimpan di server bot ini (terikat ke akun Telegram-mu) supaya bisa dipakai lintas perangkat dan untuk mengirim pengingat. '
      + 'Kamu bisa menghapus semuanya kapan saja dengan /reset.\n\nSiap mulai?',
    keyboard: kb([btn('Mulai', 'start'), btn('Lewati, isi nanti', 'skip')]),
  },
});

const ask = {
  hpht: (back) => ({ text: '🗓 Langkah 1/3 — Kapan <b>hari pertama haid terakhir</b>-mu?\nKetik tanggal, mis. <code>2026-10-03</code>, <code>03/10/2026</code>, atau “kemarin”.', keyboard: kb([btn('« Kembali', back), btn('Lewati', 'skip')]) }),
  cycle: () => ({ text: `🔁 Langkah 2/3 — Biasanya berapa <b>hari panjang siklusmu</b>? (${RANGE.cycleLength[0]}–${RANGE.cycleLength[1]})`, keyboard: kb([btn('« Kembali', 'back'), btn('Lewati', 'skip')]) }),
  period: () => ({ text: `🩸 Berapa <b>hari durasi haidmu</b>? (${RANGE.periodLength[0]}–${RANGE.periodLength[1]})`, keyboard: kb([btn('« Kembali', 'back'), btn('Lewati', 'skip')]) }),
  mode: () => ({ text: '🎯 Langkah 3/3 — Pilih mode:', keyboard: kb([btn('Pantau siklus (normal)', 'mode:normal')], [btn('Program hamil', 'mode:pregnant')], [btn('« Kembali', 'back')]) }),
};

const PREV = { hpht: 'welcome', cycle: 'hpht', period: 'cycle', mode: 'period' };

/** event: { type:'cb', value } | { type:'text', value }. → { state, reply, done } */
export function onboardingStep(state, event, today) {
  const { step, data } = state;
  if (event.type === 'cb') {
    const v = event.value;
    if (v === 'skip') return { state: null, done: { skipped: true }, reply: { text: 'Oke, dilewati. Isi data lengkap kapan saja lewat /atur atau /haid. Ketik /bantuan untuk daftar perintah.' } };
    if (v === 'start' && step === 'welcome') return { state: { ...state, step: 'hpht' }, reply: ask.hpht('back') };
    if (v === 'back') {
      const prev = PREV[step];
      if (!prev) return { state, reply: null };
      if (prev === 'welcome') return { state: { ...state, step: 'welcome' }, reply: startOnboarding().reply };
      return { state: { ...state, step: prev }, reply: ask[prev]('back') };
    }
    if (v.startsWith('mode:') && step === 'mode') {
      const settings = { lastPeriodDate: data.hpht, cycleLength: data.cycle, periodLength: data.period, mode: v.slice(5) };
      return { state: null, done: { settings }, reply: { text: '✅ Selesai! Datamu tersimpan. Coba /kalender atau /status.' } };
    }
    return { state, reply: null };
  }
  // teks
  if (step === 'hpht') {
    const d = parseDate(event.value, today);
    if (!d) return { state, reply: { text: 'Format tanggal tidak dikenali. Contoh: <code>2026-10-03</code> atau <code>03/10/2026</code>.' } };
    if (d > today) return { state, reply: { text: 'Tanggal haid terakhir tidak boleh di masa depan.' } };
    return { state: { ...state, step: 'cycle', data: { ...data, hpht: d } }, reply: ask.cycle() };
  }
  if (step === 'cycle') {
    const n = parseCycleLength(event.value);
    if (n == null) return { state, reply: { text: `Masukkan angka ${RANGE.cycleLength[0]}–${RANGE.cycleLength[1]}.` } };
    return { state: { ...state, step: 'period', data: { ...data, cycle: n } }, reply: ask.period() };
  }
  if (step === 'period') {
    const n = parsePeriodLength(event.value);
    if (n == null) return { state, reply: { text: `Masukkan angka ${RANGE.periodLength[0]}–${RANGE.periodLength[1]}.` } };
    return { state: { ...state, step: 'mode', data: { ...data, period: n } }, reply: ask.mode() };
  }
  return { state, reply: null };
}
