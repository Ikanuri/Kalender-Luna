// Orkestrasi bot: perintah teks & callback. Semua dependensi (api, repo)
// disuntikkan supaya seluruh alur bisa diuji tanpa Telegram/DB.
import { formatLong, formatShort, isValidDate, todayIn } from './dates.js';
import { KB_TYPES, LH_LABEL, PHASE_ICON, PHASE_LABEL, PHASES, PHASE_EMOJI, PREG_LABEL, RANGE } from './constants.js';
import { parseCommand, parseCycleLength, parseDate, parseKbStatus, parseLH, parsePeriodLength, parsePregTest, parseTemp, parseIntInRange } from './parse.js';
import { createCycleModel } from './cycle.js';
import { compareCycles, computeAnalysis, computeCorrelation, detectAnomalies, getLutealStats, predictPMS, shouldShowPMS } from './analysis.js';
import { monthlyInsights } from './insights.js';
import { pregnancyStatus, positiveTestMessage } from './pregnancy.js';
import { buildDoctorReport } from './report.js';
import { buildSharePayload, formatSharePayload } from './share.js';
import { renderDayDetail, renderMonth } from './calendar-render.js';
import { onboardingStep, startOnboarding } from './onboarding.js';
import { initialPrompt, startSymptomFlow, symptomStep } from './symptom-flow.js';
import { runReminders } from './reminder-runner.js';
import { esc } from './html.js';
import defaultConfig from './config.js';

const HELP = `<b>Luna — perintah</b>
/kalender [YYYY-MM] — kalender berwarna, tap tanggal untuk detail
/status — fase hari ini, prediksi haid & ovulasi
/haid [tanggal] — catat hari pertama haid
/gejala [tanggal] — catat gejala harian
/suhu 36.6 [tanggal] — catat suhu basal (BBT)
/lh negatif|tinggi|peak [tanggal] — hasil tes LH
/tes positif|samar|negatif [tanggal] — hasil test pack
/kb pil|kondom|iud|implan|suntik|lainnya diminum|lupa [tanggal]
/wellbeing energi tidur nafsu mood (1–5) [tanggal]
/analisis — statistik, pola PMS, korelasi gejala
/laporan — laporan untuk dokter
/bagikan — ringkasan fase & prediksi untuk dibagikan
/atur — lihat/ubah pengaturan (siklus, haid, mode, zona)
/reset — hapus semua datamu

Tanggal: <code>2026-10-03</code>, <code>03/10/2026</code>, “kemarin”.
Datamu disimpan di server bot ini, terikat ke akun Telegram-mu.`;

const DISCLAIMER = '\n\n<i>Bukan diagnosis medis — gunakan sebagai bahan diskusi dengan dokter.</i>';

export function createBot({ api, repo, config = defaultConfig, now = () => Date.now() }) {
  const html = (chat_id, text, keyboard) => api.sendMessage({
    chat_id, text, parse_mode: 'HTML', ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
  const sendRich = (chat_id, h, keyboard) => api.sendRichMessage({
    chat_id, rich_message: { html: h }, reply_markup: { inline_keyboard: keyboard },
  });
  /** Edit di tempat; bila gagal (pesan lama/tipe beda) kirim pesan baru. */
  async function showRich(msg, h, keyboard) {
    try {
      await api.editMessageText({ chat_id: msg.chat.id, message_id: msg.message_id, rich_message: { html: h }, reply_markup: { inline_keyboard: keyboard } });
    } catch (e) {
      if (e?.description && /not modified/i.test(e.description)) return;
      await sendRich(msg.chat.id, h, keyboard);
    }
  }
  async function showText(msg, text, keyboard) {
    try {
      await api.editMessageText({ chat_id: msg.chat.id, message_id: msg.message_id, text, parse_mode: 'HTML', ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) });
    } catch (e) {
      if (e?.description && /not modified/i.test(e.description)) return;
      await html(msg.chat.id, text, keyboard);
    }
  }

  const todayFor = (s) => todayIn(s?.tzOffset ?? config.defaultTzOffset, now());
  const configured = (s) => !!(s && s.lastPeriodDate && s.cycleLength && s.periodLength);

  async function loadCtx(uid) {
    const settings = await repo.getSettings(uid);
    const today = todayFor(settings);
    if (!configured(settings)) return { settings, today, model: null };
    const [history, lh, bbt, symptoms] = await Promise.all([repo.listHistory(uid), repo.listLH(uid), repo.listBBT(uid), repo.listSymptoms(uid)]);
    const model = createCycleModel({ settings, history, lh, bbt }, today, symptoms[0]?.date ?? null);
    return { settings, today, model, history, lh, bbt, symptoms };
  }
  const needSetup = (chat) => html(chat, 'Data siklusmu belum lengkap. Ketik /start untuk mengisi, atau <code>/atur siklus 28</code>, <code>/atur haid 5</code>, <code>/haid</code>.');

  /** Ekstrak tanggal opsional dari args; kembalikan { date, rest } atau { error }. */
  function takeDate(args, today, { allowFuture = false } = {}) {
    const last = args[args.length - 1];
    let date = today, rest = args;
    if (last !== undefined) {
      const d = parseDate(last, today);
      if (d) { date = d; rest = args.slice(0, -1); }
    }
    if (!allowFuture && date > today) return { error: 'Tanggal tidak boleh di masa depan.' };
    return { date, rest };
  }

  // ───────────── perintah ─────────────
  const commands = {
    async start({ uid, chat }) {
      const s = await repo.getSettings(uid);
      if (s?.onboardedAt) return html(chat, 'Selamat datang kembali! 🌸\n\n' + HELP);
      const ob = startOnboarding();
      await repo.setConv(uid, ob.state);
      return html(chat, ob.reply.text, ob.reply.keyboard);
    },
    bantuan: ({ chat }) => html(chat, HELP),
    help: ({ chat }) => html(chat, HELP),

    async kalender({ uid, chat, args }) {
      const c = await loadCtx(uid);
      const ym = args[0] && /^\d{4}-(0[1-9]|1[0-2])$/.test(args[0]) ? args[0] : c.today.slice(0, 7);
      const r = renderMonth({ ym, model: c.model, today: c.today, recorded: await repo.recordedDates(uid, ym), clickableCells: config.clickableCells });
      return sendRich(chat, r.html, r.keyboard);
    },

    async status({ uid, chat }) {
      const c = await loadCtx(uid);
      if (!c.model) return needSetup(chat);
      const { model, today, settings } = c;
      const phase = model.phaseOn(today) ?? 'safe';
      const info = model.infoOn(today);
      const src = { lh: 'dari tes LH', bbt: 'dari suhu basal', calendar: 'perkiraan kalender' }[model.nextOvulation.source];
      const L = [`📅 <b>${esc(formatLong(today))}</b>`,
        `${PHASE_ICON[phase]} ${PHASE_LABEL[phase]}${info ? ` · hari ke-${info.cycleDay} siklus` : ''}`, '',
        `🩸 Haid berikutnya: ${formatShort(model.nextPeriod)} (${model.daysToPeriod} hari lagi)`,
        `⭐ Ovulasi berikutnya: ${formatShort(model.nextOvulation.date)} (${model.daysToOvulation} hari lagi, ${src})`];
      const pms = predictPMS(c.symptoms, model.phaseOn);
      if (pms && shouldShowPMS(phase, model.daysToPeriod)) {
        L.push('', `🌙 Prediksi PMS: <b>${pms.level}</b> (skor ${pms.skor}/100)${pms.topSymptoms.length ? ` — biasanya: ${esc(pms.topSymptoms.join(', '))}` : ''}`);
      }
      if (settings.mode === 'pregnant') {
        const ps = pregnancyStatus(model, today);
        L.push('', `🤰 <b>${esc(ps.label)}</b>`, esc(ps.advice));
      }
      const ins = monthlyInsights(c.history, c.bbt);
      if (ins.length) L.push('', ...ins.map((x) => `💡 ${esc(x)}`));
      return html(chat, L.join('\n'));
    },

    async haid({ uid, chat, args }) {
      const s = await repo.getSettings(uid);
      const today = todayFor(s);
      const t = takeDate(args, today);
      if (t.error) return html(chat, t.error);
      if (!s?.cycleLength || !s?.periodLength) return needSetup(chat);
      await repo.addCycle(uid, { date: t.date, cycleLength: s.cycleLength, periodLength: s.periodLength });
      // last_period_date hanya maju; mencatat haid lama tak boleh memundurkannya.
      if (!s.lastPeriodDate || t.date > s.lastPeriodDate) await repo.saveSettings(uid, { lastPeriodDate: t.date });
      return html(chat, `🩸 Haid dicatat mulai ${formatShort(t.date)}. Lihat /status atau /kalender.`);
    },

    async gejala({ uid, chat, args }) {
      const s = await repo.getSettings(uid);
      const t = takeDate(args, todayFor(s));
      if (t.error) return html(chat, t.error);
      return beginSymptoms(uid, chat, t.date);
    },

    async suhu({ uid, chat, args }) {
      const s = await repo.getSettings(uid);
      const t = takeDate(args, todayFor(s));
      if (t.error) return html(chat, t.error);
      const temp = parseTemp(t.rest[0]);
      if (temp == null) return html(chat, `Format: <code>/suhu 36.6 [tanggal]</code> (${RANGE.bbt[0]}–${RANGE.bbt[1]} °C).`);
      await repo.upsertBBT(uid, t.date, temp);
      return html(chat, `🌡️ Suhu basal ${temp}°C dicatat untuk ${formatShort(t.date)}.`);
    },

    async lh({ uid, chat, args }) {
      const s = await repo.getSettings(uid);
      const t = takeDate(args, todayFor(s));
      if (t.error) return html(chat, t.error);
      const r = parseLH(t.rest[0]);
      if (!r) return html(chat, 'Format: <code>/lh negatif|tinggi|peak [tanggal]</code>');
      await repo.upsertLH(uid, t.date, r);
      return html(chat, `🧪 Tes LH ${LH_LABEL[r]} dicatat untuk ${formatShort(t.date)}.`);
    },

    async tes({ uid, chat, args }) {
      const s = await repo.getSettings(uid);
      const t = takeDate(args, todayFor(s));
      if (t.error) return html(chat, t.error);
      const r = parsePregTest(t.rest[0]);
      if (!r) return html(chat, 'Format: <code>/tes positif|samar|negatif [tanggal]</code>');
      await repo.addPreg(uid, t.date, r);
      return html(chat, `🧪 Test pack ${PREG_LABEL[r]} dicatat untuk ${formatShort(t.date)}.` + (r === 'positive' ? `\n\n${positiveTestMessage}` : ''));
    },

    async kb({ uid, chat, args }) {
      const s = await repo.getSettings(uid);
      const t = takeDate(args, todayFor(s));
      if (t.error) return html(chat, t.error);
      const type = KB_TYPES.find((k) => k.toLowerCase() === (t.rest[0] ?? '').toLowerCase()) ?? KB_TYPES.find((k) => k.toLowerCase().startsWith((t.rest[0] ?? '#').toLowerCase()));
      const status = parseKbStatus(t.rest[1]);
      if (!type || !status) return html(chat, `Format: <code>/kb ${KB_TYPES.map((k) => k.toLowerCase().split(' ')[0]).join('|')} diminum|lupa [tanggal]</code>`);
      await repo.addKB(uid, t.date, type, status);
      return html(chat, `💊 ${type} — ${status === 'taken' ? 'diminum' : 'lupa'} (${formatShort(t.date)}) dicatat.`);
    },

    async wellbeing({ uid, chat, args }) {
      const s = await repo.getSettings(uid);
      const t = takeDate(args, todayFor(s));
      if (t.error) return html(chat, t.error);
      const v = t.rest.map((x) => parseIntInRange(x, [1, 5]));
      if (v.length !== 4 || v.includes(null)) return html(chat, 'Format: <code>/wellbeing energi tidur nafsu mood [tanggal]</code> — masing-masing 1–5.');
      await repo.upsertWellbeing(uid, t.date, { energy: v[0], sleep: v[1], appetite: v[2], mood: v[3] });
      return html(chat, `🌟 Wellbeing ${formatShort(t.date)}: Energi ${v[0]} · Tidur ${v[1]} · Nafsu makan ${v[2]} · Mood ${v[3]} (skala 5).`);
    },

    async analisis({ uid, chat }) {
      const c = await loadCtx(uid);
      if (!c.model) return needSetup(chat);
      const L = ['📊 <b>Analisis</b>'];
      const a = computeAnalysis(c.history);
      if (a) {
        L.push('', `<b>Siklus</b> (${a.lengths.length} tercatat)`,
          `Rata-rata ${a.avg.toFixed(1)} h · terpendek ${a.min} · terpanjang ${a.max} · ±${a.std.toFixed(1)}`, `Keteraturan: <b>${a.regularity}</b>`);
        const cmp = compareCycles(c.history);
        L.push('', '<b>6 siklus terakhir</b>', ...cmp.cycles.map((x) => `• ${formatShort(x.tanggalMulai)}: ${x.panjangSiklus}h (haid ${x.durasiHaid}h)`));
      } else L.push('', 'Catat minimal 2 awal haid (/haid) untuk melihat statistik siklus.');
      const an = detectAnomalies(c.history);
      if (an.length) L.push('', '<b>Anomali</b>', ...an.map((x) => `⚠️ ${esc(typeof x.siklus === 'string' && x.siklus.length === 10 ? formatShort(x.siklus) : x.siklus)}: ${esc(x.alasan)}`));
      const lu = getLutealStats(c.history, c.bbt);
      if (lu) L.push('', `<b>Fase luteal</b> (dari BBT): rata-rata ${lu.avg.toFixed(1)} hari — ${lu.status}`);
      const pms = predictPMS(c.symptoms, c.model.phaseOn);
      if (pms) L.push('', `<b>PMS</b>: ${pms.level} (skor ${pms.skor}/100)${pms.topSymptoms.length ? ` — ${esc(pms.topSymptoms.join(', '))}` : ''}`);
      const cor = computeCorrelation(c.symptoms, c.model.phaseOn);
      if (!cor.insufficient && cor.rows.length) {
        L.push('', '<b>Gejala × fase</b> (% hari tercatat)');
        for (const r of cor.rows) L.push(`${esc(r.tag)}: ` + PHASES.map((p) => `${PHASE_EMOJI[p]}${r.perPhase[p]}%`).join(' '));
      }
      return html(chat, L.join('\n') + DISCLAIMER);
    },

    async laporan({ uid, chat }) {
      const c = await loadCtx(uid);
      if (!c.model) return needSetup(chat);
      const txt = buildDoctorReport({ today: c.today, settings: c.settings, model: c.model, history: c.history, bbt: c.bbt, lh: c.lh, symptomCount: c.symptoms.length });
      return html(chat, `<pre>${esc(txt)}</pre>`);
    },

    async bagikan({ uid, chat }) {
      const c = await loadCtx(uid);
      if (!c.model) return needSetup(chat);
      const text = formatSharePayload(buildSharePayload(c.model, c.today));
      return html(chat, `Teruskan (forward) pesan di bawah ini ke orang yang kamu percaya. Isinya hanya fase & prediksi — tanpa gejala atau catatan pribadi.\n\n${esc(text)}`);
    },

    async atur({ uid, chat, args }) {
      const s = await repo.getSettings(uid);
      const [key, val] = args;
      if (!key) {
        return html(chat, [`⚙️ <b>Pengaturan</b>`,
          `HPHT terakhir: ${s?.lastPeriodDate ? formatShort(s.lastPeriodDate) : '—'}`,
          `Panjang siklus: ${s?.cycleLength ?? '—'} hari`, `Durasi haid: ${s?.periodLength ?? '—'} hari`,
          `Mode: ${s?.mode === 'pregnant' ? 'program hamil' : 'normal'}`, `Zona waktu: UTC${(s?.tzOffset ?? config.defaultTzOffset) >= 0 ? '+' : ''}${(s?.tzOffset ?? config.defaultTzOffset) / 60}`, '',
          'Ubah: <code>/atur siklus 28</code> · <code>/atur haid 5</code> · <code>/atur mode normal|hamil</code> · <code>/atur zona 7</code>'].join('\n'));
      }
      if (key === 'siklus') {
        const n = parseCycleLength(val);
        if (n == null) return html(chat, `Panjang siklus harus ${RANGE.cycleLength[0]}–${RANGE.cycleLength[1]} hari.`);
        await repo.saveSettings(uid, { cycleLength: n });
        return html(chat, `Panjang siklus diatur ke ${n} hari.`);
      }
      if (key === 'haid') {
        const n = parsePeriodLength(val);
        if (n == null) return html(chat, `Durasi haid harus ${RANGE.periodLength[0]}–${RANGE.periodLength[1]} hari.`);
        await repo.saveSettings(uid, { periodLength: n });
        return html(chat, `Durasi haid diatur ke ${n} hari.`);
      }
      if (key === 'mode') {
        const m = { normal: 'normal', hamil: 'pregnant', pregnant: 'pregnant' }[(val ?? '').toLowerCase()];
        if (!m) return html(chat, 'Pilih: <code>/atur mode normal</code> atau <code>/atur mode hamil</code>.');
        await repo.saveSettings(uid, { mode: m });
        return html(chat, `Mode: ${m === 'pregnant' ? 'program hamil' : 'normal'}.`);
      }
      if (key === 'zona') {
        const h = Number(val);
        if (!Number.isInteger(h) || h < -12 || h > 14) return html(chat, 'Zona waktu = selisih jam dari UTC, mis. <code>/atur zona 7</code> untuk WIB.');
        await repo.saveSettings(uid, { tzOffset: h * 60 });
        return html(chat, `Zona waktu diatur ke UTC${h >= 0 ? '+' : ''}${h}.`);
      }
      return html(chat, 'Pengaturan tidak dikenal. Ketik /atur untuk bantuan.');
    },

    reset: ({ chat }) => html(chat, '⚠️ Ini akan menghapus <b>semua</b> datamu (siklus, gejala, BBT, LH, dll). Tidak bisa dibatalkan.',
      [[{ text: 'Ya, hapus semua', callback_data: 'reset:confirm' }, { text: 'Batal', callback_data: 'reset:cancel' }]]),

    async lewati({ uid, chat }) {
      const st = await repo.getConv(uid);
      if (st?.flow === 'sym') return advanceSymptoms(uid, chat, st, { type: 'text', value: '/lewati' });
      return html(chat, 'Tidak ada yang bisa dilewati.');
    },

    async _cron({ from, chat }) {
      if (!config.adminIds.includes(from.id)) return;
      const r = await runReminders({ api, repo, nowMs: now(), defaultTz: config.defaultTzOffset });
      return html(chat, `Reminder: ${r.sent} terkirim, ${r.failed} gagal, ${r.users} pengguna.`);
    },
  };

  // ───────────── alur gejala ─────────────
  async function beginSymptoms(uid, chat, date) {
    const st = startSymptomFlow(date);
    await repo.setConv(uid, st);
    const p = initialPrompt(st);
    return html(chat, p.text, p.keyboard);
  }
  async function saveSymptoms(uid, done) {
    const v = done.values;
    const patch = { other: v.other ?? [] };
    for (const k of ['flow', 'pain', 'mood', 'discharge', 'notes']) if (v[k]) patch[k] = v[k];
    await repo.upsertSymptom(uid, done.date, patch);
  }
  async function advanceSymptoms(uid, chat, st, event, msg = null) {
    const r = symptomStep(st, event);
    if (r.done) {
      await saveSymptoms(uid, r.done);
      await repo.clearConv(uid);
      const text = `✅ Gejala ${formatShort(r.done.date)} tersimpan.`;
      return msg ? showText(msg, text) : html(chat, text);
    }
    await repo.setConv(uid, r.state);
    if (!r.reply) return;
    return msg ? showText(msg, r.reply.text, r.reply.keyboard) : html(chat, r.reply.text, r.reply.keyboard);
  }

  async function advanceOnboarding(uid, chat, st, event, msg = null) {
    const s = await repo.getSettings(uid);
    const r = onboardingStep(st, event, todayFor(s));
    const reply = (rep) => (!rep ? null : msg ? showText(msg, rep.text, rep.keyboard) : html(chat, rep.text, rep.keyboard));
    if (r.done) {
      await repo.clearConv(uid);
      if (r.done.settings) {
        const d = r.done.settings;
        await repo.saveSettings(uid, { ...d, onboardedAt: new Date() });
        await repo.addCycle(uid, { date: d.lastPeriodDate, cycleLength: d.cycleLength, periodLength: d.periodLength });
      } else {
        await repo.saveSettings(uid, { onboardedAt: new Date() }); // dilewati: tanpa data siklus (§20)
      }
      return reply(r.reply);
    }
    await repo.setConv(uid, r.state);
    return reply(r.reply);
  }

  // ───────────── entry points ─────────────
  async function handleMessage(message) {
    if (!message?.text || !message.from) return;
    const chat = message.chat.id;
    if (message.chat.type !== 'private') return html(chat, 'Luna hanya bekerja di chat pribadi demi privasi datamu. Buka chat langsung dengan bot ini.');
    const uid = message.from.id;
    const cmd = parseCommand(message.text);
    if (cmd) {
      const fn = commands[cmd.cmd];
      if (!fn) return html(chat, 'Perintah tidak dikenal. Ketik /bantuan.');
      if (cmd.cmd !== 'lewati' && cmd.cmd !== '_cron') await repo.clearConv(uid);
      return fn({ uid, chat, args: cmd.args, from: message.from });
    }
    const st = await repo.getConv(uid);
    if (st?.flow === 'ob') return advanceOnboarding(uid, chat, st, { type: 'text', value: message.text });
    if (st?.flow === 'sym') return advanceSymptoms(uid, chat, st, { type: 'text', value: message.text });
    return html(chat, 'Ketik /bantuan untuk daftar perintah.');
  }

  async function handleCallback(cb) {
    const data = cb.data ?? '';
    const msg = cb.message;
    const uid = cb.from.id;
    try {
      if (!msg || data === 'noop') return;
      if (data.startsWith('cal:')) {
        const date = data.slice(4);
        if (!isValidDate(date)) return;
        const c = await loadCtx(uid);
        const day = await repo.dayRows(uid, date);
        const r = renderDayDetail({ date, phase: c.model?.phaseOn(date) ?? null, isHPHT: day.isHPHT, rows: day.rows, today: c.today });
        return showRich(msg, r.html, r.keyboard);
      }
      if (data.startsWith('cal-month:')) {
        const ym = data.slice(10);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return;
        const c = await loadCtx(uid);
        const r = renderMonth({ ym, model: c.model, today: c.today, recorded: await repo.recordedDates(uid, ym), clickableCells: config.clickableCells });
        return showRich(msg, r.html, r.keyboard);
      }
      if (data.startsWith('ob:')) {
        const st = await repo.getConv(uid);
        const s = await repo.getSettings(uid);
        if (st?.flow !== 'ob') {
          if (data === 'ob:start' && !s?.onboardedAt) { const ob = startOnboarding(); await repo.setConv(uid, ob.state); return advanceOnboarding(uid, msg.chat.id, ob.state, { type: 'cb', value: 'start' }, msg); }
          return;
        }
        return advanceOnboarding(uid, msg.chat.id, st, { type: 'cb', value: data.slice(3) }, msg);
      }
      if (data.startsWith('log:')) {
        const date = data.slice(4);
        const s = await repo.getSettings(uid);
        if (!isValidDate(date) || date > todayFor(s)) return;
        return beginSymptoms(uid, msg.chat.id, date);
      }
      if (data.startsWith('sym:')) {
        const st = await repo.getConv(uid);
        if (st?.flow !== 'sym') return;
        return advanceSymptoms(uid, msg.chat.id, st, { type: 'cb', value: data }, msg);
      }
      if (data === 'reset:confirm') { await repo.resetAll(uid); return showText(msg, '🗑 Semua datamu sudah dihapus. Ketik /start untuk memulai lagi.'); }
      if (data === 'reset:cancel') return showText(msg, 'Dibatalkan. Datamu aman.');
    } finally {
      await api.answerCallbackQuery({ callback_query_id: cb.id }).catch(() => {});
    }
  }

  return { handleMessage, handleCallback, runReminders: () => runReminders({ api, repo, nowMs: now(), defaultTz: config.defaultTzOffset }) };
}
