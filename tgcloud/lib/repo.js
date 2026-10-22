// Lapisan akses data (hanya glue ke sdk/db). Seluruh logika bot bergantung pada
// antarmuka ini, sehingga bisa diganti repo palsu di tes (test/helpers).
import { db } from 'sdk';
import { and, eq, like, asc } from 'sdk/db';
import * as T from '../schema.js';


const byUser = (t, uid) => eq(t.userId, uid);

export async function getSettings(uid) {
  return (await db.select().from(T.settings).where(byUser(T.settings, uid)).get()) ?? null;
}
export async function saveSettings(uid, patch) {
  await db.insert(T.settings).values({ userId: uid, ...patch })
    .onConflictDoUpdate({ target: T.settings.userId, set: patch }).run();
}
export async function listConfiguredSettings() {
  const rows = await db.select().from(T.settings).all();
  return rows.filter((r) => r.lastPeriodDate && r.cycleLength && r.periodLength);
}

export async function addCycle(uid, { date, cycleLength, periodLength }) {
  await db.insert(T.cycleHistory).values({ userId: uid, date, cycleLength, periodLength })
    .onConflictDoUpdate({ target: [T.cycleHistory.userId, T.cycleHistory.date], set: { cycleLength, periodLength } }).run();
}
const list = (t, uid) => db.select().from(t).where(byUser(t, uid)).orderBy(asc(t.date)).all();
export const listHistory = (uid) => list(T.cycleHistory, uid);
export const listLH = (uid) => list(T.lh, uid);
export const listBBT = (uid) => list(T.bbt, uid);
export const listSymptoms = (uid) => list(T.symptoms, uid);

async function upsertByDate(t, uid, date, values) {
  await db.insert(t).values({ userId: uid, date, ...values })
    .onConflictDoUpdate({ target: [t.userId, t.date], set: values }).run();
}
export const upsertSymptom = (uid, date, v) => upsertByDate(T.symptoms, uid, date, v);
export const upsertBBT = (uid, date, tempCelsius) => upsertByDate(T.bbt, uid, date, { tempCelsius });
export const upsertWellbeing = (uid, date, v) => upsertByDate(T.wellbeing, uid, date, v);
export const upsertLH = (uid, date, result) => upsertByDate(T.lh, uid, date, { result });
export const addKB = (uid, date, type, status) => db.insert(T.kb).values({ userId: uid, date, type, status }).run();
export const addPreg = (uid, date, result) => db.insert(T.pregtest).values({ userId: uid, date, result }).run();

export async function dayRows(uid, date) {
  const at = (t) => and(byUser(t, uid), eq(t.date, date));
  const [symptoms, bbt, wellbeing, lh, kb, preg, hist, st] = await Promise.all([
    db.select().from(T.symptoms).where(at(T.symptoms)).get(),
    db.select().from(T.bbt).where(at(T.bbt)).get(),
    db.select().from(T.wellbeing).where(at(T.wellbeing)).get(),
    db.select().from(T.lh).where(at(T.lh)).get(),
    db.select().from(T.kb).where(at(T.kb)).all(),
    db.select().from(T.pregtest).where(at(T.pregtest)).all(),
    db.select().from(T.cycleHistory).where(at(T.cycleHistory)).get(),
    getSettings(uid),
  ]);
  return {
    rows: { symptoms: symptoms ?? null, bbt: bbt ?? null, wellbeing: wellbeing ?? null, lh: lh ?? null, kb, preg },
    isHPHT: !!hist || st?.lastPeriodDate === date,
  };
}

/** Himpunan tanggal dalam bulan 'YYYY-MM' yang punya catatan apa pun. */
export async function recordedDates(uid, ym) {
  const out = new Set();
  for (const t of [T.symptoms, T.bbt, T.wellbeing, T.lh, T.kb, T.pregtest]) {
    const rows = await db.select({ date: t.date }).from(t).where(and(byUser(t, uid), like(t.date, `${ym}-%`))).all();
    rows.forEach((r) => out.add(r.date));
  }
  return out;
}

export async function getConv(uid) {
  const row = await db.select().from(T.conversations).where(byUser(T.conversations, uid)).get();
  return row?.state ?? null;
}
export async function setConv(uid, state) {
  await db.insert(T.conversations).values({ userId: uid, state })
    .onConflictDoUpdate({ target: T.conversations.userId, set: { state } }).run();
}
export const clearConv = (uid) => db.delete(T.conversations).where(byUser(T.conversations, uid)).run();

/** PRD §21 — hapus SEMUA data pengguna. */
export async function resetAll(uid) {
  for (const t of [T.settings, T.cycleHistory, T.symptoms, T.bbt, T.wellbeing, T.kb, T.lh, T.pregtest, T.conversations]) {
    await db.delete(t).where(byUser(t, uid)).run();
  }
}
