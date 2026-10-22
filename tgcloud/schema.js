// PRD §4 — semua tabel di-scope per user_id (= telegram_user_id).
// Tanpa foreign key (runtime tgcloud mematikannya); integritas dijaga di aplikasi.
import { table, integer, text, real, json, uniqueIndex, index, sql } from 'sdk/db';

const ts = () => integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`);

/** Snapshot keadaan siklus SEKARANG (§4.1). Kolom siklus null bila onboarding dilewati. */
export const settings = table('settings', {
  userId: integer('user_id').primaryKey(),
  lastPeriodDate: text('last_period_date'),
  cycleLength: integer('cycle_length'),
  periodLength: integer('period_length'),
  mode: text('mode').notNull().default('normal'), // 'normal' | 'pregnant'
  onboardedAt: integer('onboarded_at', { mode: 'timestamp' }),
  tzOffset: integer('tz_offset').notNull().default(420), // menit dari UTC (WIB)
  lastReminderDate: text('last_reminder_date'),
});

export const cycleHistory = table('cycle_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  date: text('date').notNull(),
  cycleLength: integer('cycle_length').notNull(),
  periodLength: integer('period_length').notNull(),
}, (t) => ({ uq: uniqueIndex('uq_cycle_history').on(t.userId, t.date) }));

export const symptoms = table('symptoms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  date: text('date').notNull(),
  flow: text('flow'),
  pain: text('pain'),
  mood: text('mood'),
  discharge: text('discharge'),
  other: json('other'),
  notes: text('notes'),
  updatedAt: ts(),
}, (t) => ({ uq: uniqueIndex('uq_symptoms').on(t.userId, t.date) }));

export const bbt = table('bbt', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  date: text('date').notNull(),
  tempCelsius: real('temp_celsius').notNull(),
}, (t) => ({ uq: uniqueIndex('uq_bbt').on(t.userId, t.date) }));

export const wellbeing = table('wellbeing', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  date: text('date').notNull(),
  energy: integer('energy').notNull(),
  sleep: integer('sleep').notNull(),
  appetite: integer('appetite').notNull(),
  mood: integer('mood').notNull(),
}, (t) => ({ uq: uniqueIndex('uq_wellbeing').on(t.userId, t.date) }));

/** Ledger append-only (§4.6). */
export const kb = table('kb', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  date: text('date').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(), // 'taken' | 'missed'
}, (t) => ({ idx: index('idx_kb_user_date').on(t.userId, t.date) }));

export const lh = table('lh', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  date: text('date').notNull(),
  result: text('result').notNull(), // 'negative' | 'high' | 'peak'
}, (t) => ({ uq: uniqueIndex('uq_lh').on(t.userId, t.date) }));

/** Ledger append-only (§4.8). */
export const pregtest = table('pregtest', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  date: text('date').notNull(),
  result: text('result').notNull(), // 'positive' | 'faint' | 'negative'
}, (t) => ({ idx: index('idx_pregtest_user_date').on(t.userId, t.date) }));

/** Status percakapan multi-langkah (onboarding, input gejala). Satu baris per user. */
export const conversations = table('conversations', {
  userId: integer('user_id').primaryKey(),
  state: json('state'),
  updatedAt: ts(),
});
