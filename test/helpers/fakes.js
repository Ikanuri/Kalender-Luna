// Repo & API palsu in-memory untuk menguji alur bot end-to-end.
export function fakeRepo() {
  const db = { settings: new Map(), history: [], symptoms: [], bbt: [], wellbeing: [], lh: [], kb: [], preg: [], conv: new Map() };
  const sortD = (a) => [...a].sort((x, y) => (x.date < y.date ? -1 : 1));
  const mine = (arr, uid) => sortD(arr.filter((r) => r.userId === uid));
  const upsert = (arr, uid, date, v) => {
    const row = arr.find((r) => r.userId === uid && r.date === date);
    if (row) Object.assign(row, v); else arr.push({ userId: uid, date, ...v });
  };
  return {
    db,
    getSettings: async (uid) => db.settings.get(uid) ?? null,
    saveSettings: async (uid, p) => db.settings.set(uid, { mode: 'normal', tzOffset: 420, ...(db.settings.get(uid) ?? {}), userId: uid, ...p }),
    listConfiguredSettings: async () => [...db.settings.values()].filter((r) => r.lastPeriodDate && r.cycleLength && r.periodLength),
    addCycle: async (uid, v) => upsert(db.history, uid, v.date, v),
    listHistory: async (uid) => mine(db.history, uid),
    listLH: async (uid) => mine(db.lh, uid),
    listBBT: async (uid) => mine(db.bbt, uid),
    listSymptoms: async (uid) => mine(db.symptoms, uid),
    upsertSymptom: async (uid, d, v) => upsert(db.symptoms, uid, d, v),
    upsertBBT: async (uid, d, t) => upsert(db.bbt, uid, d, { tempCelsius: t }),
    upsertWellbeing: async (uid, d, v) => upsert(db.wellbeing, uid, d, v),
    upsertLH: async (uid, d, r) => upsert(db.lh, uid, d, { result: r }),
    addKB: async (uid, date, type, status) => db.kb.push({ userId: uid, date, type, status }),
    addPreg: async (uid, date, result) => db.preg.push({ userId: uid, date, result }),
    dayRows: async (uid, date) => {
      const at = (a) => a.filter((r) => r.userId === uid && r.date === date);
      return {
        rows: { symptoms: at(db.symptoms)[0] ?? null, bbt: at(db.bbt)[0] ?? null, wellbeing: at(db.wellbeing)[0] ?? null, lh: at(db.lh)[0] ?? null, kb: at(db.kb), preg: at(db.preg) },
        isHPHT: at(db.history).length > 0 || db.settings.get(uid)?.lastPeriodDate === date,
      };
    },
    recordedDates: async (uid, ym) => {
      const s = new Set();
      for (const a of [db.symptoms, db.bbt, db.wellbeing, db.lh, db.kb, db.preg]) a.filter((r) => r.userId === uid && r.date.startsWith(ym)).forEach((r) => s.add(r.date));
      return s;
    },
    getConv: async (uid) => db.conv.get(uid) ?? null,
    setConv: async (uid, s) => db.conv.set(uid, s),
    clearConv: async (uid) => db.conv.delete(uid),
    resetAll: async (uid) => {
      db.settings.delete(uid); db.conv.delete(uid);
      for (const k of ['history', 'symptoms', 'bbt', 'wellbeing', 'lh', 'kb', 'preg']) db[k] = db[k].filter((r) => r.userId !== uid);
    },
  };
}

export function fakeApi() {
  const calls = [];
  const rec = (m) => async (p) => { calls.push({ m, p }); return { message_id: calls.length }; };
  return {
    calls,
    sendMessage: rec('sendMessage'), sendRichMessage: rec('sendRichMessage'),
    editMessageText: rec('editMessageText'), answerCallbackQuery: rec('answerCallbackQuery'),
    last: (m) => [...calls].reverse().find((c) => !m || c.m === m)?.p,
  };
}

export const msg = (uid, text, type = 'private') => ({ from: { id: uid }, chat: { id: uid, type }, text, message_id: 1 });
export const cb = (uid, data) => ({ id: 'cb1', from: { id: uid }, data, message: { message_id: 7, chat: { id: uid, type: 'private' } } });
