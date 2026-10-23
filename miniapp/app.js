// Luna Mini App. UI murni: semua perhitungan siklus (fase, prediksi, analisis) datang dari
// server lewat getState()/act(). Di sini hanya render, animasi, dan form.
import { getState, act } from './api.js';
import { MONTHS, DOW_SHORT, addDays, diffDays, esc, fmtDM, fmtLong, fmtShort, haptic, monthGrid, nextMonth, prevMonth, reduceMotion } from './util.js';

const tg = window.Telegram?.WebApp;
const $ = (s) => document.querySelector(s);
const app = $('#app'), nav = $('#nav'), sheet = $('#sheet'), backdrop = $('#backdrop'), toastEl = $('#toast');

const PH = {
  m: { short: 'Haid', name: 'Haid', icon: '🩸', color: 'var(--m)', desc: 'Haid sedang berlangsung. Istirahat cukup, minum air hangat, dan dengarkan tubuhmu.' },
  f: { short: 'Subur', name: 'Masa Subur', icon: '🌿', color: 'var(--f)', desc: 'Peluang hamil meningkat. Ovulasi sudah dekat.' },
  p: { short: 'Ovulasi', name: 'Ovulasi', icon: '⭐', color: 'var(--p)', desc: 'Puncak kesuburan — hari ovulasi.' },
  l: { short: 'Luteal', name: 'Fase Luteal', icon: '🌙', color: 'var(--l)', desc: 'Energi mulai turun dan gejala PMS bisa muncul. Jaga istirahat.' },
  s: { name: 'Fase Folikular', icon: '✨', color: 'var(--s)', desc: 'Energi cenderung naik. Masa relatif aman.' },
};
const CODE = { menstruation: 'm', fertile: 'f', peak: 'p', luteal: 'l', safe: 's' };
const OV_SRC = { lh: 'dari tes LH', bbt: 'dari suhu basal', calendar: 'perkiraan kalender' };
const TABS = [['today', '✨', 'Hari Ini'], ['siklus', '📅', 'Siklus'], ['data', '📊', 'Data'], ['more', '⚙️', 'Lainnya']];
const SUBS = [['analisis', '📊 Analisis'], ['gejala', '📋 Gejala'], ['wellbeing', '🌿 Wellbeing'], ['tracker', '🌡️ Tracker']];
const TZ = [[420, 'WIB (UTC+7)'], [480, 'WITA (UTC+8)'], [540, 'WIT (UTC+9)'], [0, 'UTC']];

const S = { state: null, tab: 'today', sub: 'analisis', month: null, tabIdx: 0, dir: 1, dark: false, ob: { step: 0, date: '', cycle: 28, period: 5, mode: 'normal' }, set: null, error: null, sel: null };
let F = {};          // state form pada sheet aktif
let idx = null;      // indeks tanggal untuk state aktif

// ───────────── util UI ─────────────
function toast(msg, err = false) {
  toastEl.textContent = msg; toastEl.className = `toast on${err ? ' err' : ''}`;
  clearTimeout(toast.t); toast.t = setTimeout(() => (toastEl.className = 'toast'), 2600);
}
const dateInput = (id, val, max) => `<input class="input" type="date" id="${id}" value="${val}" ${max ? `max="${max}"` : ''}>`;
const dateTag = (d, today) => (d === today ? 'Hari ini' : d === addDays(today, -1) ? 'Kemarin' : fmtShort(d));
const phaseOn = (d) => S.state?.cycle?.phases?.[d] ?? null;

function applyTheme() {
  document.documentElement.dataset.theme = S.dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', S.dark ? '#17101a' : '#fefbf8');
  try { tg?.setHeaderColor?.(S.dark ? '#17101a' : '#fefbf8'); tg?.setBackgroundColor?.(S.dark ? '#17101a' : '#fefbf8'); } catch {}
}
function initTheme() {
  let saved = null; try { saved = localStorage.getItem('luna_theme'); } catch {}
  S.dark = saved ? saved === 'dark' : (tg?.colorScheme ? tg.colorScheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  applyTheme();
}

// indeks tanggal → data (hanya penyajian, bukan logika siklus)
function buildIndex(st) {
  const by = (rows) => new Map(rows.map((r) => [r.date, r]));
  const group = (rows) => rows.reduce((m, r) => (m.get(r.date)?.push(r) ?? m.set(r.date, [r]), m), new Map());
  const d = st.data;
  idx = { sym: by(d.symptoms), bbt: by(d.bbt), wb: by(d.wellbeing), lh: by(d.lh), kb: group(d.kb), preg: group(d.preg), cyc: by(d.history) };
  idx.dates = new Set([...idx.sym.keys(), ...idx.bbt.keys(), ...idx.wb.keys(), ...idx.lh.keys(), ...idx.kb.keys(), ...idx.preg.keys()]);
}

// ───────────── sheet ─────────────
function openSheet(html, mount) {
  sheet.innerHTML = `<div class="grab"></div>${html}`;
  sheet.scrollTop = 0;
  requestAnimationFrame(() => { sheet.classList.add('on'); backdrop.classList.add('on'); });
  try { tg?.BackButton?.show(); } catch {}
  mount?.(sheet);
}
function closeSheet() {
  sheet.classList.remove('on'); backdrop.classList.remove('on');
  try { tg?.BackButton?.hide(); } catch {}
}
backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet());
try { tg?.BackButton?.onClick(closeSheet); } catch {}
// Geser ke bawah untuk menutup. Layar sentuh: pakai touch events (pointer events dibatalkan browser
// begitu sheet mulai di-scroll). Gestur diambil alih hanya bila dimulai dari handle, atau sheet
// sedang di paling atas dan ditarik ke bawah; selain itu scroll biasa tetap jalan.
(() => {
  let y0 = null, t0 = 0, dy = 0, dragging = false, fromGrab = false;
  const begin = (y, target) => { y0 = y; t0 = performance.now(); dy = 0; dragging = false; fromGrab = !!target.closest('.grab'); };
  const move = (y, ev) => {
    if (y0 == null) return;
    const d = y - y0;
    if (!dragging) {
      if (d > 6 && (fromGrab || sheet.scrollTop <= 0)) { dragging = true; sheet.style.transition = 'none'; } else return;
    }
    dy = Math.max(0, d);
    sheet.style.transform = `translateY(${dy}px)`;
    backdrop.style.opacity = String(1 - Math.min(1, dy / 420));
    ev?.preventDefault();
  };
  const end = () => {
    if (y0 == null) return;
    const wasDragging = dragging, quick = performance.now() - t0 < 260;
    y0 = null; dragging = false;
    if (!wasDragging) return;
    sheet.style.transition = ''; backdrop.style.opacity = '';
    const close = dy > 110 || (quick && dy > 40);
    if (close) { haptic.light(); closeSheet(); }   // lanjut meluncur ke bawah dari posisi sekarang
    sheet.style.transform = '';
  };
  const open = () => sheet.classList.contains('on');
  sheet.addEventListener('touchstart', (e) => { if (open() && e.touches.length === 1) begin(e.touches[0].clientY, e.target); }, { passive: true });
  sheet.addEventListener('touchmove', (e) => open() && move(e.touches[0].clientY, e), { passive: false });
  sheet.addEventListener('touchend', end); sheet.addEventListener('touchcancel', end);
  // mouse (Telegram Desktop/Web): seret handle
  sheet.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.target.closest('.grab')) { begin(e.clientY, e.target); sheet.setPointerCapture(e.pointerId); } });
  sheet.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && move(e.clientY));
  sheet.addEventListener('pointerup', (e) => e.pointerType === 'mouse' && end());
})();

// ───────────── aksi tulis ─────────────
async function save(input, okMsg, { close = true, btn } = {}) {
  if (btn) btn.disabled = true;
  try {
    S.state = await act(input);
    buildIndex(S.state);
    haptic.ok();
    if (okMsg) toast(okMsg);
    if (close) closeSheet();
    render({ animate: false });
    return true;
  } catch (e) {
    haptic.err(); toast(e.message || 'Gagal menyimpan', true);
    if (btn) btn.disabled = false;
    return false;
  }
}

// ───────────── tampilan: Hari Ini ─────────────
function ringSVG(c) {
  const R = 88, C = 2 * Math.PI * R, avg = c.avg;
  // Segmen per fase; hari yang sudah lewat berwarna penuh, hari mendatang pudar.
  let segs = '', run = null, n = 0;
  const flush = (end) => {
    if (!run) return;
    const len = ((end - run.start) / avg) * C - 1.5;
    segs += `<circle class="ring-seg${run.done ? ' done' : ''}" style="animation-delay:${n++ * 90}ms" cx="100" cy="100" r="${R}" stroke="${PH[run.p].color}" stroke-dasharray="${Math.max(len, 1)} ${C}" stroke-dashoffset="${-(run.start / avg) * C}"/>`;
  };
  for (let d = 0; d < avg; d++) {
    const p = phaseOn(addDays(c.cycleStart, d)) ?? 's', done = d < c.cycleDay;
    if (!run || run.p !== p || run.done !== done) { flush(d); run = { p, start: d, done }; }
  }
  flush(avg);
  const frac = Math.min(1, (c.cycleDay - 0.5) / avg);
  return `<svg viewBox="0 0 200 200">${segs}
    <g class="ring-dot-g" style="transform-origin:100px 100px;transform:rotate(0deg);transition:transform 1.3s var(--ease)" data-rot="${frac * 360}"><circle class="ring-dot" cx="${100 + R}" cy="100" r="9"/></g></svg>`;
}

function alertsHTML(st) {
  const c = st.cycle, out = [];
  const a = (k, ic, t, b) => out.push(`<div class="alert ${k}"><span class="ic">${ic}</span><div><b>${t}</b>${b}</div></div>`);
  if (c.daysToPeriod === 0) a('m', '🩸', 'Haid diperkirakan hari ini', 'Siapkan perlengkapanmu ya 💕');
  else if (c.daysToPeriod === 1) a('m', '🩸', 'Haid diperkirakan besok', 'Siapkan perlengkapanmu ya 💕');
  if (c.phase === 'fertile' && c.daysToOvulation >= 1) a('f', '🌿', 'Kamu sedang dalam masa subur', `Ovulasi sekitar ${c.daysToOvulation} hari lagi.`);
  if (c.daysToOvulation === 1 && c.phase !== 'fertile') a('p', '⭐', 'Ovulasi besok', st.mode === 'pregnant' ? 'Waktu terbaik bila merencanakan kehamilan.' : 'Masa paling subur — gunakan kontrasepsi jika belum ingin hamil.');
  const lh = [...st.data.lh].reverse().find((r) => r.result !== 'negative' && diffDays(st.today, r.date) <= 3);
  if (lh) a('p', '🧪', lh.result === 'peak' ? 'Lonjakan LH (peak) terdeteksi' : 'LH mulai tinggi', 'Ovulasi biasanya 12–36 jam setelah lonjakan LH.');
  return out.join('');
}

function todayRecord(st) {
  const d = st.today, chips = [];
  const s = idx.sym.get(d);
  if (s) chips.push('📋 Gejala'); if (idx.bbt.get(d)) chips.push(`🌡️ ${idx.bbt.get(d).tempCelsius}°C`);
  if (idx.wb.get(d)) chips.push('🌿 Wellbeing'); if (idx.lh.get(d)) chips.push('🧪 LH');
  if (idx.kb.get(d)) chips.push('💊 Kontrasepsi'); if (idx.preg.get(d)) chips.push('➕ Test pack');
  return chips.length ? `<div class="card"><div class="card-title">Tercatat hari ini</div><div>${chips.map((c) => `<span class="tag">${c}</span>`).join('')}</div></div>` : '';
}

function viewToday() {
  const st = S.state;
  if (!st.configured) {
    return `<div class="card"><div class="greet" style="margin-top:0">${esc(st.greeting)}</div><div class="empty"><span class="big">🌸</span>Isi data siklusmu untuk melihat beranda, kalender berwarna, dan prediksi.</div><button class="btn btn-primary btn-block" data-a="setup">Isi Data Siklus</button></div>`;
  }
  const c = st.cycle, code = CODE[c.phase], ph = PH[code];
  let i = 0; const r = () => `style="--i:${i++}"`;
  const pms = st.pms?.show ? `<div class="card" ${r()}><div class="card-title">🌙 Prediksi PMS</div><div class="row sp"><b style="font-size:1.1rem">${st.pms.level}</b><span class="muted">skor ${st.pms.skor}/100</span></div>${st.pms.topSymptoms.length ? `<div class="mt">${st.pms.topSymptoms.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}</div>` : '';
  const preg = st.pregnancy ? `<div class="card" ${r()}><div class="card-title">🤰 Mode Program Hamil</div><b>${esc(st.pregnancy.label)}</b><p class="muted mt">${esc(st.pregnancy.advice)}</p></div>` : '';
  const ins = st.insights.length ? `<div class="card" ${r()}><div class="card-title">💡 Insight</div>${st.insights.map((x) => `<p class="muted" style="color:var(--ink-mid);margin-bottom:8px">${esc(x)}</p>`).join('')}</div>` : '';
  return `<div class="rise" style="--phase:${ph.color}">
    <div ${r()}>${alertsHTML(st)}</div>
    <div class="card hero" ${r()}><div class="ring-wrap">${ringSVG(c)}<div class="ring-center"><div class="ring-lbl top">Hari ke</div><div class="ring-day" id="ringDay">0</div><div class="ring-lbl">dari ${c.avg} hari</div></div></div>
      <div class="phase-pill">${ph.icon} ${ph.name}</div>
      <div class="greet">${esc(st.greeting)}</div><p class="phase-desc">${esc(st.narrative)}</p></div>
    <div class="two" ${r()}>
      <div class="stat m"><div class="k">Haid berikutnya</div><div class="v">${c.daysToPeriod}<small style="font-size:.9rem"> hari</small></div><div class="s">${fmtDM(c.nextPeriod)}</div></div>
      <div class="stat p"><div class="k">Ovulasi</div><div class="v">${Math.max(0, c.daysToOvulation)}<small style="font-size:.9rem"> hari</small></div><div class="s">${fmtDM(c.nextOvulation.date)} · ${OV_SRC[c.nextOvulation.source]}</div></div></div>
    <div class="actions" ${r()}>${[['period', '🩸', 'Haid'], ['symptom', '📝', 'Gejala'], ['bbt', '🌡️', 'Suhu'], ['wellbeing', '🌿', 'Wellbeing'], ['lh', '🧪', 'Tes LH'], ['kb', '💊', 'Kontrasepsi'], ['preg', '➕', 'Test pack'], ['report', '📄', 'Laporan']]
      .map(([a, ic, t]) => `<button class="act" data-a="open" data-k="${a}"><span>${ic}</span>${t}</button>`).join('')}</div>
    ${pms}${preg}${ins}${todayRecord(st)}</div>`;
}

// ───────────── tampilan: Siklus ─────────────
function calendarBody(ym, back = false) {
  const st = S.state, today = st.today;
  const cells = monthGrid(ym).flat().map((d) => {
    if (!d) return '<div class="day empty-d"></div>';
    const p = phaseOn(d);
    return `<button class="day${d === today ? ' today' : ''}${d === S.sel ? ' sel' : ''}" ${p ? `data-p="${p}"` : ''} data-a="day" data-d="${d}">${+d.slice(8)}${idx.dates.has(d) || idx.cyc.has(d) ? '<i class="dot"></i>' : ''}</button>`;
  }).join('');
  return `<div class="grid${back ? ' back' : ''}">${cells}</div>`;
}
function viewSiklus() {
  const st = S.state, [y, m] = S.month.split('-').map(Number);
  const hist = [...st.data.history].reverse();
  const histHTML = hist.length ? hist.map((h, i) => {
    const older = hist[i + 1];
    return `<div class="item"><div><b>${fmtShort(h.date)}</b><div class="t">${older ? `${diffDays(h.date, older.date)} hari sejak siklus sebelumnya · ` : ''}haid ${h.periodLength} hari</div></div><button class="x" data-a="del" data-kind="cycle" data-date="${h.date}" aria-label="Hapus">✕</button></div>`;
  }).join('') : '<div class="empty">Belum ada riwayat.</div>';
  const legend = st.configured ? `<div class="legend rise">${['m', 'f', 'p', 'l'].map((k) => `<span><i style="background:${PH[k].color}"></i>${PH[k].short}</span>`).join('')}<span><i style="background:var(--lav)"></i>Ada catatan</span></div>` : '';
  const info = S.sel ? dayInfoHTML(S.sel) : '<h3>Ketuk tanggal</h3><p>Lihat fase dan catatan hari itu.</p>';
  return `<div class="rise">${legend}
    <div class="card" style="--i:1"><div class="cal-nav"><button data-a="month" data-n="-1" aria-label="Bulan sebelumnya">‹</button><h3 id="monthLabel">${MONTHS[m - 1]} ${y}</h3><button data-a="month" data-n="1" aria-label="Bulan berikutnya">›</button></div>
      <div class="weekdays">${DOW_SHORT.map((d) => `<div>${d}</div>`).join('')}</div><div class="cal-body" id="calBody">${calendarBody(S.month)}</div>
      <div class="phase-info" id="phaseInfo">${info}</div></div>
    <div class="card" style="--i:2"><div class="card-title">📖 Riwayat Siklus</div>${histHTML}<button class="btn btn-soft btn-block mt" data-a="open" data-k="period">+ Catat Awal Haid</button></div></div>`;
}
function dayInfoHTML(d) {
  const p = phaseOn(d), ph = p && PH[p];
  return `<h3 style="--phase:${ph?.color ?? 'var(--rose-deep)'}">${ph ? `${ph.icon} ${ph.name}` : 'Tanpa prediksi'}</h3><p>${fmtLong(d)}${idx.dates.has(d) ? ' · ada catatan' : ''}</p>`;
}

// ───────────── tampilan: Data ─────────────
const bar = (v, max, i, label, sub = '') => `<div class="bar" style="--i:${i}"><b>${v}</b><i style="height:${Math.max(6, (v / max) * 100)}%"></i><span>${label}</span>${sub}</div>`;
function subAnalisis(st) {
  if (!st.analysis) return `<div class="card"><div class="empty"><span class="big">📊</span>Catat minimal 2 awal haid untuk melihat analisis siklus.</div></div>`;
  const a = st.analysis, cmp = st.compare, mx = Math.max(...cmp.cycles.map((c) => c.panjangSiklus), a.avg) + 2;
  const avgBottom = (a.avg / mx) * 100;
  const cards = `<div class="two"><div class="stat"><div class="k">Rata-rata</div><div class="v">${a.avg.toFixed(1)}</div><div class="s">hari / siklus</div></div><div class="stat"><div class="k">Keteraturan</div><div class="v" style="font-size:1.25rem;padding-top:6px">${a.regularity}</div><div class="s">±${a.std.toFixed(1)} hari</div></div><div class="stat"><div class="k">Terpendek</div><div class="v">${a.min}</div></div><div class="stat"><div class="k">Terpanjang</div><div class="v">${a.max}</div></div></div>`;
  const chart = `<div class="card"><div class="card-title">Perbandingan ${cmp.cycles.length} siklus terakhir</div><div class="bars"><div class="avgline" style="bottom:calc(${avgBottom}% * .84 + 22px)"><span>rata-rata ${a.avg.toFixed(0)}h</span></div>${cmp.cycles.map((c, i) => bar(c.panjangSiklus, mx, i, fmtDM(c.tanggalMulai))).join('')}</div></div>`;
  const an = st.anomalies.length ? `<div class="card"><div class="card-title">⚠️ Anomali</div>${st.anomalies.map((x) => `<div class="item"><div><b>${/^\d{4}-/.test(x.siklus) ? fmtShort(x.siklus) : esc(x.siklus)} · ${Math.round(x.panjang)} hari</b><div class="t">${esc(x.alasan)}</div></div></div>`).join('')}<p class="muted mt">Bukan diagnosis — gunakan sebagai bahan diskusi dengan dokter.</p></div>` : '';
  const lu = st.luteal ? `<div class="card"><div class="card-title">🌙 Fase Luteal (dari BBT)</div><div class="row sp"><b style="font-size:1.4rem;font-family:Fraunces">${st.luteal.avg.toFixed(1)} hari</b><span class="muted">${esc(st.luteal.status)}</span></div></div>` : '';
  const pms = st.pms ? `<div class="card"><div class="card-title">Prediksi PMS</div><b>${st.pms.level}</b> <span class="muted">· skor ${st.pms.skor}/100 dari ${st.pms.lutealDays} hari luteal</span></div>` : '';
  let cor = '';
  if (!st.correlation.insufficient && st.correlation.rows.length) {
    cor = `<div class="card"><div class="card-title">Gejala × Fase</div><div class="heat"><div></div>${['m', 'f', 'p', 'l', 's'].map((k) => `<div class="h">${PH[k].icon}</div>`).join('')}${st.correlation.rows.map((r) => `<div>${esc(r.tag)}</div>${['menstruation', 'fertile', 'peak', 'luteal', 'safe'].map((p) => `<div class="c" style="--v:${r.perPhase[p]}">${r.perPhase[p]}%</div>`).join('')}`).join('')}</div><p class="muted mt">% hari bergejala di tiap fase.</p></div>`;
  }
  return cards + chart + an + lu + pms + cor;
}
function subGejala(st) {
  const rows = [...st.data.symptoms].reverse();
  const list = rows.length ? rows.map((r) => `<div class="item" data-a="open" data-k="symptom" data-d="${r.date}" style="cursor:pointer"><div><b>${dateTag(r.date, st.today)}</b><div class="t">${[r.flow, r.pain && `Nyeri ${r.pain}`, r.mood, r.discharge].filter((x) => x && x !== 'Tidak ada').map(esc).join(' · ') || '—'}</div><div>${(r.other ?? []).map((o) => `<span class="tag">${esc(o)}</span>`).join('')}</div>${r.notes ? `<div class="t">“${esc(r.notes)}”</div>` : ''}</div><button class="x" data-a="del" data-kind="symptom" data-date="${r.date}" aria-label="Hapus">✕</button></div>`).join('')
    : '<div class="empty"><span class="big">📋</span>Belum ada catatan gejala.</div>';
  return `<div class="card"><div class="card-title">📋 Log Gejala (${rows.length})</div>${list}</div><button class="btn btn-primary btn-block mt" data-a="open" data-k="symptom">+ Catat Gejala</button>`;
}
function subWellbeing(st) {
  const rows = [...st.data.wellbeing].reverse();
  const list = rows.length ? rows.slice(0, 30).map((r) => `<div class="item"><div><b>${dateTag(r.date, st.today)}</b><div class="t">Energi ${r.energy} · Tidur ${r.sleep} · Nafsu makan ${r.appetite} · Mood ${r.mood}</div></div><button class="x" data-a="del" data-kind="wellbeing" data-date="${r.date}" aria-label="Hapus">✕</button></div>`).join('')
    : '<div class="empty"><span class="big">🌿</span>Belum ada catatan wellbeing.</div>';
  const last = rows.slice(0, 7).reverse();
  const chart = last.length > 1 ? `<div class="card"><div class="card-title">Mood 7 catatan terakhir</div><div class="bars" style="height:100px">${last.map((r, i) => bar(r.mood, 5, i, fmtDM(r.date))).join('')}</div></div>` : '';
  return `${chart}<div class="card"><div class="card-title">Riwayat</div>${list}</div><button class="btn btn-primary btn-block mt" data-a="open" data-k="wellbeing">+ Catat Wellbeing</button>`;
}
function bbtChart(rows) {
  const r = rows.slice(-30);
  if (r.length < 2) return '<div class="empty">Catat suhu basal beberapa hari untuk melihat grafik.</div>';
  const W = 320, H = 130, pad = 10, vals = r.map((x) => x.tempCelsius), lo = Math.min(...vals) - 0.1, hi = Math.max(...vals) + 0.1;
  const X = (i) => pad + (i / (r.length - 1)) * (W - 2 * pad), Y = (v) => H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad);
  const pts = r.map((x, i) => `${X(i).toFixed(1)},${Y(x.tempCelsius).toFixed(1)}`).join(' ');
  return `<div class="line-chart"><svg viewBox="0 0 ${W} ${H}"><polyline class="path" pathLength="1" points="${pts}"/>${r.map((x, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(x.tempCelsius).toFixed(1)}" r="3" fill="var(--rose)"/>`).join('')}</svg><div class="row sp muted"><span>${fmtDM(r[0].date)}</span><span>${lo.toFixed(1)}–${hi.toFixed(1)}°C</span><span>${fmtDM(r[r.length - 1].date)}</span></div></div>`;
}
function subTracker(st) {
  const d = st.data, T = st.today;
  const item = (label, sub, kind, extra) => `<div class="item"><div><b>${label}</b><div class="t">${sub}</div></div><button class="x" data-a="del" data-kind="${kind}" ${extra} aria-label="Hapus">✕</button></div>`;
  const sec = (title, k, rows) => `<div class="card"><div class="card-title">${title}<button class="link" style="margin-left:auto" data-a="open" data-k="${k}">+ Tambah</button></div>${rows || '<div class="muted">Belum ada data.</div>'}</div>`;
  return `<div class="card"><div class="card-title">🌡️ Suhu Basal (BBT)<button class="link" style="margin-left:auto" data-a="open" data-k="bbt">+ Tambah</button></div>${bbtChart(d.bbt)}</div>`
    + sec('🧪 Tes LH', 'lh', [...d.lh].reverse().slice(0, 10).map((r) => item(dateTag(r.date, T), st.options.lh[r.result], 'lh', `data-date="${r.date}"`)).join(''))
    + sec('💊 Kontrasepsi', 'kb', [...d.kb].reverse().slice(0, 10).map((r) => item(`${esc(r.type)} — ${st.options.kbStatus[r.status]}`, dateTag(r.date, T), 'kb', `data-id="${r.id}"`)).join(''))
    + sec('➕ Test Pack', 'preg', [...d.preg].reverse().slice(0, 10).map((r) => item(st.options.preg[r.result], dateTag(r.date, T), 'preg', `data-id="${r.id}"`)).join(''));
}
function viewData() {
  const st = S.state;
  const body = { analisis: subAnalisis, gejala: subGejala, wellbeing: subWellbeing, tracker: subTracker }[S.sub](st);
  return `<div class="subtabs">${SUBS.map(([k, t]) => `<button class="subtab${S.sub === k ? ' on' : ''}" data-a="sub" data-k="${k}">${t}</button>`).join('')}</div><div class="rise" id="subBody">${body}</div>`;
}

// ───────────── tampilan: Lainnya ─────────────
function viewMore() {
  const st = S.state, set = S.set ?? (S.set = { cycle: st.settings?.cycleLength ?? 28, period: st.settings?.periodLength ?? 5 });
  const stepper = (k, v, unit) => `<div class="stepper"><button data-a="step" data-k="${k}" data-n="-1" aria-label="Kurangi">−</button><div class="val" id="v-${k}">${v}<small>${unit}</small></div><button data-a="step" data-k="${k}" data-n="1" aria-label="Tambah">+</button></div>`;
  const cfg = st.configured ? `<div class="card" style="--i:0"><div class="card-title">⚙️ Siklus</div>
      <div class="field" style="margin-top:0"><label>Panjang siklus</label>${stepper('cycle', set.cycle, 'hari')}</div>
      <div class="field"><label>Durasi haid</label>${stepper('period', set.period, 'hari')}</div>
      <button class="btn btn-primary btn-block mt" data-a="saveSettings">Simpan</button></div>` : `<div class="card" style="--i:0"><button class="btn btn-primary btn-block" data-a="setup">Isi Data Siklus</button></div>`;
  return `<div class="rise">${cfg}
    <div class="card" style="--i:1"><div class="row sp"><div><b>Mode program hamil</b><div class="muted">Status DPO & saran khusus</div></div><button class="switch${st.mode === 'pregnant' ? ' on' : ''}" data-a="mode" aria-label="Mode program hamil"></button></div>
      <div class="row sp mt"><div><b>Mode gelap</b></div><button class="switch${S.dark ? ' on' : ''}" data-a="theme" aria-label="Mode gelap"></button></div>
      <div class="field"><label>Zona waktu</label><select class="input" id="tz">${TZ.map(([v, n]) => `<option value="${v}"${v === st.tzOffset ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div>
    <div class="card" style="--i:2"><div class="card-title">📄 Berbagi</div>
      <button class="btn btn-soft btn-block" data-a="open" data-k="report">Laporan untuk Dokter</button>
      ${st.configured ? '<button class="btn btn-ghost btn-block mt" data-a="open" data-k="share">Bagikan Ringkasan Fase</button>' : ''}</div>
    <div class="card" style="--i:3"><div class="card-title">🔒 Privasi</div><p class="muted">Datamu tersimpan di server bot ini, terikat ke akun Telegram-mu, sehingga bisa dibuka dari perangkat mana pun dan dipakai untuk pengingat. Mode Berbagi hanya mengirim fase dan prediksi — tidak pernah gejala atau catatan pribadi.</p>
      <button class="btn btn-ghost btn-block mt" data-a="open" data-k="reset" style="color:#c0392b">Hapus Semua Data</button></div>
    <p class="muted" style="text-align:center;margin-top:18px">Luna v${esc(st.version)}</p></div>`;
}

// ───────────── onboarding ─────────────
function viewOnboarding() {
  const o = S.ob, today = S.state.today;
  const dots = `<div class="dots">${[0, 1, 2].map((i) => `<i class="${i === o.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const step = [
    `<div class="moon">🌙</div><h2>Halo, aku Luna</h2><p class="lead">Pelacak siklus, kesuburan, dan kesehatan reproduksi. Catat sedikit tiap hari — aku bantu memprediksi dan memahami polanya.</p>
     <div class="privacy">🔒 Datamu disimpan di server bot ini (terikat ke akun Telegram-mu), bukan hanya di perangkat. Kamu bisa menghapus semuanya kapan saja.</div>
     <button class="btn btn-primary btn-block mt" data-a="ob" data-k="next">Mulai</button><button class="btn btn-block link" data-a="ob" data-k="skip" style="margin-top:8px">Lewati, isi nanti</button>`,
    `<h2>Data siklusmu</h2><p class="lead">Kapan hari pertama haid terakhirmu?</p>
     <div class="field">${dateInput('ob-date', o.date, today)}</div>
     <div class="field"><label>Panjang siklus</label><div class="stepper"><button data-a="obstep" data-k="cycle" data-n="-1">−</button><div class="val" id="ob-cycle">${o.cycle}<small>hari</small></div><button data-a="obstep" data-k="cycle" data-n="1">+</button></div></div>
     <div class="field"><label>Durasi haid</label><div class="stepper"><button data-a="obstep" data-k="period" data-n="-1">−</button><div class="val" id="ob-period">${o.period}<small>hari</small></div><button data-a="obstep" data-k="period" data-n="1">+</button></div></div>
     <div class="row mt"><button class="btn btn-ghost" data-a="ob" data-k="back">Kembali</button><button class="btn btn-primary" style="flex:1" data-a="ob" data-k="next">Lanjut</button></div>`,
    `<h2>Pilih mode</h2><p class="lead">Kamu bisa mengubahnya kapan saja di menu Lainnya.</p>
     <div class="field"><div class="seg"><button class="${o.mode === 'normal' ? 'on' : ''}" data-a="ob" data-k="mode-normal">Pantau siklus</button><button class="${o.mode === 'pregnant' ? 'on' : ''}" data-a="ob" data-k="mode-pregnant">Program hamil</button></div></div>
     <div class="row mt"><button class="btn btn-ghost" data-a="ob" data-k="back">Kembali</button><button class="btn btn-primary" style="flex:1" data-a="ob" data-k="finish">Selesai</button></div>`,
  ][o.step];
  return `<div class="ob panel">${step}${dots}</div>`;
}

// ───────────── form sheet ─────────────
const chipRow = (field, opts, sel, multi) => `<div class="chips" data-f="${field}" data-multi="${multi ? 1 : 0}">${opts.map((o) => `<button class="chip${(multi ? sel.includes(o) : sel === o) ? ' on' : ''}" data-a="chip" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
const dateField = (d, today) => `<div class="field" style="margin-top:6px"><label>Tanggal</label>${dateInput('f-date', d, today)}</div>`;
const saveBtn = (t = 'Simpan') => `<button class="btn btn-primary btn-block mt" id="saveBtn" data-a="submit">${t}</button>`;

function openForm(k, date) {
  const st = S.state, today = st.today, d = date && date <= today ? date : today;
  F = { kind: k, date: d };
  const forms = {
    symptom() {
      const e = idx.sym.get(d) ?? {}; Object.assign(F, { flow: e.flow ?? null, pain: e.pain ?? null, mood: e.mood ?? null, discharge: e.discharge ?? null, other: [...(e.other ?? [])], notes: e.notes ?? '' });
      const C = st.options.chips, L = { flow: 'Aliran haid', pain: 'Nyeri / kram', mood: 'Mood', discharge: 'Keputihan', other: 'Lain-lain (boleh banyak)' };
      return `<h2>📝 Catat Gejala</h2>${dateField(d, today)}${['flow', 'pain', 'mood', 'discharge', 'other'].map((f) => `<div class="field"><label>${L[f]}</label>${chipRow(f, C[f], F[f], f === 'other')}</div>`).join('')}
        <div class="field"><label>Catatan</label><textarea class="input" id="f-notes" maxlength="500" placeholder="Opsional">${esc(F.notes)}</textarea></div>${saveBtn()}`;
    },
    bbt() {
      const last = st.data.bbt.at(-1); F.temp = idx.bbt.get(d)?.tempCelsius ?? last?.tempCelsius ?? 36.5;
      return `<h2>🌡️ Suhu Basal</h2>${dateField(d, today)}<div class="field"><label>Suhu (°C) — ukur saat bangun, sebelum bergerak</label>
        <div class="stepper"><button data-a="temp" data-n="-0.05">−</button><div class="val" id="f-temp">${(+F.temp).toFixed(2)}<small>°C</small></div><button data-a="temp" data-n="0.05">+</button></div></div>${saveBtn()}`;
    },
    wellbeing() {
      const e = idx.wb.get(d) ?? {}; Object.assign(F, { energy: e.energy ?? 3, sleep: e.sleep ?? 3, appetite: e.appetite ?? 3, mood: e.mood ?? 3 });
      const rows = [['energy', 'Energi'], ['sleep', 'Kualitas tidur'], ['appetite', 'Nafsu makan'], ['mood', 'Mood']];
      return `<h2>🌿 Wellbeing</h2>${dateField(d, today)}${rows.map(([f, t]) => `<div class="field"><label>${t}</label><div class="slider" data-f="${f}">${[1, 2, 3, 4, 5].map((n) => `<button class="${F[f] === n ? 'on' : ''}" data-a="score" data-v="${n}">${n}</button>`).join('')}</div></div>`).join('')}${saveBtn()}`;
    },
    lh() {
      F.result = idx.lh.get(d)?.result ?? null; const o = Object.entries(st.options.lh);
      return `<h2>🧪 Tes LH (Ovulasi)</h2>${dateField(d, today)}<div class="field"><label>Hasil</label><div class="chips" data-f="result">${o.map(([v, t]) => `<button class="chip${F.result === v ? ' on' : ''}" data-a="chip1" data-v="${v}">${t}</button>`).join('')}</div></div><p class="muted mt">Peak = garis tes sama/lebih gelap dari kontrol. Ovulasi biasanya 12–36 jam kemudian.</p>${saveBtn()}`;
    },
    kb() {
      Object.assign(F, { kbType: null, status: 'taken' });
      return `<h2>💊 Kontrasepsi</h2>${dateField(d, today)}<div class="field"><label>Jenis</label><div class="chips" data-f="kbType">${st.options.kbTypes.map((t) => `<button class="chip" data-a="chip1" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
        <div class="field"><label>Status</label><div class="seg" data-f="status"><button class="on" data-a="seg" data-v="taken">✅ Diminum</button><button data-a="seg" data-v="missed">❌ Lupa</button></div></div>${saveBtn()}`;
    },
    preg() {
      F.result = null;
      return `<h2>➕ Test Pack</h2>${dateField(d, today)}<div class="field"><label>Hasil</label><div class="chips" data-f="result">${Object.entries(st.options.preg).map(([v, t]) => `<button class="chip" data-a="chip1" data-v="${v}">${t}</button>`).join('')}</div></div>${saveBtn()}`;
    },
    period() {
      return `<h2>🩸 Awal Haid</h2><p class="muted">Catat hari pertama haid. Kalender dan prediksi dihitung ulang otomatis.</p>${dateField(d, today)}${saveBtn('Catat')}`;
    },
  };
  if (!st.configured && k !== 'period') { toast('Isi data siklus dulu'); return openSetup(); }
  openSheet(forms[k](), () => sheet.querySelector('#f-date')?.addEventListener('change', (e) => { F.date = e.target.value; }));
}

function openSetup() {
  F = { kind: 'setup', date: '', cycle: S.state.settings?.cycleLength ?? 28, period: S.state.settings?.periodLength ?? 5, mode: S.state.mode };
  openSheet(`<h2>🌸 Data Siklus</h2><div class="field"><label>Hari pertama haid terakhir</label>${dateInput('f-date', '', S.state.today)}</div>
    <div class="field"><label>Panjang siklus</label><div class="stepper"><button data-a="fstep" data-k="cycle" data-n="-1">−</button><div class="val" id="f-cycle">${F.cycle}<small>hari</small></div><button data-a="fstep" data-k="cycle" data-n="1">+</button></div></div>
    <div class="field"><label>Durasi haid</label><div class="stepper"><button data-a="fstep" data-k="period" data-n="-1">−</button><div class="val" id="f-period">${F.period}<small>hari</small></div><button data-a="fstep" data-k="period" data-n="1">+</button></div></div>${saveBtn()}`,
  () => sheet.querySelector('#f-date').addEventListener('change', (e) => { F.date = e.target.value; }));
}

function openDay(date) {
  const st = S.state, today = st.today, p = phaseOn(date), ph = p && PH[p];
  const rows = [];
  const s = idx.sym.get(date);
  if (s) rows.push(`<div class="item"><div><b>📋 Gejala</b><div class="t">${[s.flow, s.pain && `Nyeri ${s.pain}`, s.mood, s.discharge].filter((x) => x && x !== 'Tidak ada').map(esc).join(' · ') || '—'}</div>${(s.other ?? []).map((o) => `<span class="tag">${esc(o)}</span>`).join('')}${s.notes ? `<div class="t">“${esc(s.notes)}”</div>` : ''}</div><button class="x" data-a="del" data-kind="symptom" data-date="${date}">✕</button></div>`);
  const b = idx.bbt.get(date); if (b) rows.push(`<div class="item"><div><b>🌡️ Suhu basal</b><div class="t">${b.tempCelsius}°C</div></div><button class="x" data-a="del" data-kind="bbt" data-date="${date}">✕</button></div>`);
  const w = idx.wb.get(date); if (w) rows.push(`<div class="item"><div><b>🌿 Wellbeing</b><div class="t">Energi ${w.energy} · Tidur ${w.sleep} · Nafsu makan ${w.appetite} · Mood ${w.mood}</div></div><button class="x" data-a="del" data-kind="wellbeing" data-date="${date}">✕</button></div>`);
  const l = idx.lh.get(date); if (l) rows.push(`<div class="item"><div><b>🧪 Tes LH</b><div class="t">${st.options.lh[l.result]}</div></div><button class="x" data-a="del" data-kind="lh" data-date="${date}">✕</button></div>`);
  for (const k of idx.kb.get(date) ?? []) rows.push(`<div class="item"><div><b>💊 ${esc(k.type)}</b><div class="t">${st.options.kbStatus[k.status]}</div></div><button class="x" data-a="del" data-kind="kb" data-id="${k.id}">✕</button></div>`);
  for (const k of idx.preg.get(date) ?? []) rows.push(`<div class="item"><div><b>➕ Test pack</b><div class="t">${st.options.preg[k.result]}</div></div><button class="x" data-a="del" data-kind="preg" data-id="${k.id}">✕</button></div>`);
  const isHPHT = idx.cyc.has(date);
  const past = date <= today;
  openSheet(`<h2>${fmtLong(date)}</h2>
    <div class="phase-pill" style="--phase:${ph?.color ?? 'var(--ink-light)'};margin-top:8px">${ph ? `${ph.icon} ${ph.name}` : 'Tanpa prediksi'}</div>${isHPHT ? '<p class="muted mt">🩸 Awal haid tercatat di tanggal ini</p>' : ''}
    <div class="mt">${rows.join('') || '<p class="muted">Belum ada catatan untuk tanggal ini.</p>'}</div>
    ${past ? `<div class="actions" style="grid-template-columns:repeat(3,1fr)">${[['symptom', '📝', 'Gejala'], ['bbt', '🌡️', 'Suhu'], ['wellbeing', '🌿', 'Wellbeing'], ['lh', '🧪', 'Tes LH'], ['kb', '💊', 'KB'], ['period', '🩸', 'Awal haid']].map(([k, ic, t]) => `<button class="act" data-a="open" data-k="${k}" data-d="${date}"><span>${ic}</span>${t}</button>`).join('')}</div>` : '<p class="muted mt">Tanggal ini belum bisa dicatat.</p>'}`);
}

function openText(title, text, extra = '') {
  F = { text };
  openSheet(`<h2>${title}</h2><pre>${esc(text)}</pre><div class="row mt"><button class="btn btn-soft" style="flex:1" data-a="copy">Salin</button>${extra}</div>`);
}
function openReset() {
  openSheet(`<h2>Hapus semua data?</h2><p class="muted mt">Semua data siklus, gejala, suhu, tes, dan pengaturanmu akan dihapus permanen dari server. Tidak bisa dibatalkan.</p>
    <div class="field"><label>Ketik HAPUS untuk konfirmasi</label><input class="input" id="f-confirm" autocomplete="off"></div><button class="btn btn-danger btn-block mt" id="saveBtn" data-a="reset" disabled>Hapus Permanen</button>`,
  () => sheet.querySelector('#f-confirm').addEventListener('input', (e) => { sheet.querySelector('#saveBtn').disabled = e.target.value.trim() !== 'HAPUS'; }));
}

// ───────────── event delegasi ─────────────
const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));
/** Dialog konfirmasi bawaan Telegram bila ada; jika tidak, confirm() browser. */
function ask(msg, yes) {
  if (tg?.showConfirm) tg.showConfirm(msg, (ok) => ok && yes());
  else if (confirm(msg)) yes();
}
const handlers = {
  open: (el) => {
    const k = el.dataset.k, d = el.dataset.d;
    if (k === 'report') return openText('📄 Laporan untuk Dokter', S.state.report);
    if (k === 'share') {
      const t = S.state.share;
      return openText('Ringkasan untuk dibagikan', t, `<button class="btn btn-primary" style="flex:1" data-a="shareTg">Kirim</button>`);
    }
    if (k === 'reset') return openReset();
    openForm(k, d);
  },
  setup: openSetup,
  day: (el) => { haptic.tap(); S.sel = el.dataset.d; document.querySelectorAll('.day.sel').forEach((n) => n.classList.remove('sel')); el.classList.add('sel'); $('#phaseInfo').innerHTML = dayInfoHTML(S.sel); openDay(S.sel); },
  month: (el) => {
    S.dir = +el.dataset.n; S.month = S.dir > 0 ? nextMonth(S.month) : prevMonth(S.month); haptic.tap();
    const [y, m] = S.month.split('-').map(Number);
    $('#monthLabel').textContent = `${MONTHS[m - 1]} ${y}`; $('#calBody').innerHTML = calendarBody(S.month, S.dir < 0);
  },
  sub: (el) => { S.sub = el.dataset.k; haptic.tap(); render({ animate: false }); },
  step: (el) => { const k = el.dataset.k; S.set[k] = clamp(S.set[k] + +el.dataset.n, k === 'cycle' ? S.state.ranges.cycleLength : S.state.ranges.periodLength); haptic.tap(); $(`#v-${k}`).firstChild.textContent = S.set[k]; },
  saveSettings: (el) => save({ type: 'settings', cycleLength: S.set.cycle, periodLength: S.set.period }, 'Pengaturan tersimpan', { close: false, btn: el }),
  mode: () => save({ type: 'settings', mode: S.state.mode === 'pregnant' ? 'normal' : 'pregnant' }, 'Mode diperbarui', { close: false }),
  theme: () => { S.dark = !S.dark; try { localStorage.setItem('luna_theme', S.dark ? 'dark' : 'light'); } catch {} applyTheme(); haptic.tap(); render({ animate: false }); },
  del: (el) => {
    const { kind, date, id } = el.dataset;
    ask('Hapus entri ini?', () => save({ type: 'delete', kind, ...(date ? { date } : {}), ...(id ? { id: +id } : {}) }, 'Dihapus', { close: sheet.classList.contains('on') }));
  },
  chip: (el) => {
    const box = el.parentElement, f = box.dataset.f, v = el.dataset.v, multi = box.dataset.multi === '1';
    haptic.tap();
    if (multi) { F[f] = F[f].includes(v) ? F[f].filter((x) => x !== v) : [...F[f], v]; el.classList.toggle('on'); }
    else { const on = F[f] === v; F[f] = on ? null : v; box.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); if (!on) el.classList.add('on'); }
  },
  chip1: (el) => { haptic.tap(); const f = el.parentElement.dataset.f; F[f] = el.dataset.v; el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === el)); },
  seg: (el) => { haptic.tap(); F[el.parentElement.dataset.f] = el.dataset.v; el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); },
  score: (el) => { haptic.tap(); F[el.parentElement.dataset.f] = +el.dataset.v; el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); },
  temp: (el) => { F.temp = clamp(Math.round((+F.temp + +el.dataset.n) * 100) / 100, S.state.ranges.bbt); haptic.tap(); $('#f-temp').firstChild.textContent = F.temp.toFixed(2); },
  fstep: (el) => { const k = el.dataset.k; F[k] = clamp(F[k] + +el.dataset.n, k === 'cycle' ? S.state.ranges.cycleLength : S.state.ranges.periodLength); haptic.tap(); $(`#f-${k}`).firstChild.textContent = F[k]; },
  submit: async (el) => {
    const k = F.kind, d = $('#f-date')?.value || F.date;
    const need = (c, m) => { if (!c) { toast(m, true); haptic.err(); } return c; };
    const msg = { symptom: 'Gejala tersimpan', bbt: 'Suhu tersimpan', wellbeing: 'Wellbeing tersimpan', lh: 'Hasil LH tersimpan', kb: 'Tersimpan', preg: 'Tersimpan', period: 'Awal haid dicatat 🩸' }[k];
    if (k === 'setup') {
      if (!need(F.date, 'Pilih tanggal haid terakhir')) return;
      return save({ type: 'onboard', lastPeriodDate: F.date, cycleLength: F.cycle, periodLength: F.period, mode: F.mode }, 'Data siklus tersimpan 🌸', { btn: el });
    }
    if (k === 'symptom') F.notes = $('#f-notes').value;
    if (k === 'lh' && !need(F.result, 'Pilih hasil tes')) return;
    if (k === 'preg' && !need(F.result, 'Pilih hasil tes')) return;
    if (k === 'kb' && !need(F.kbType, 'Pilih jenis kontrasepsi')) return;
    const input = {
      symptom: { type: 'symptom', date: d, flow: F.flow, pain: F.pain, mood: F.mood, discharge: F.discharge, other: F.other, notes: F.notes },
      bbt: { type: 'bbt', date: d, temp: F.temp },
      wellbeing: { type: 'wellbeing', date: d, energy: F.energy, sleep: F.sleep, appetite: F.appetite, mood: F.mood },
      lh: { type: 'lh', date: d, result: F.result }, kb: { type: 'kb', date: d, kbType: F.kbType, status: F.status },
      preg: { type: 'preg', date: d, result: F.result }, period: { type: 'period', date: d },
    }[k];
    const ok = await save(input, k === 'preg' && F.result === 'positive' ? '🎉 Selamat! Segera konsultasi ke dokter kandungan.' : msg, { btn: el });
    if (ok && k === 'period') { S.sel = d; }
  },
  reset: async (el) => { if (await save({ type: 'reset', confirm: 'HAPUS' }, 'Semua data dihapus', { btn: el })) { S.set = null; S.tab = 'today'; S.tabIdx = 0; render(); } },
  copy: async () => { try { await navigator.clipboard.writeText(F.text); toast('Disalin ✓'); haptic.ok(); } catch { toast('Tidak bisa menyalin', true); } },
  shareTg: () => {
    const url = `https://t.me/share/url?url=%20&text=${encodeURIComponent(F.text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
  },
  // onboarding
  obstep: (el) => { const k = el.dataset.k; S.ob[k] = clamp(S.ob[k] + +el.dataset.n, k === 'cycle' ? S.state.ranges.cycleLength : S.state.ranges.periodLength); haptic.tap(); $(`#ob-${k}`).firstChild.textContent = S.ob[k]; },
  ob: async (el) => {
    const o = S.ob, k = el.dataset.k;
    if (k === 'skip') return save({ type: 'skipOnboarding' }, null, { close: false });
    if (k.startsWith('mode-')) { o.mode = k.slice(5); haptic.tap(); return render({ animate: false }); }
    if (o.step === 1) { const v = $('#ob-date')?.value; if (v) o.date = v; }
    if (k === 'back') { o.step = Math.max(0, o.step - 1); return render({ back: true }); }
    if (k === 'next') {
      if (o.step === 1 && !o.date) { toast('Pilih tanggal haid terakhir', true); haptic.err(); return; }
      o.step++; haptic.light(); return render();
    }
    if (k === 'finish') { if (await save({ type: 'onboard', lastPeriodDate: o.date, cycleLength: o.cycle, periodLength: o.period, mode: o.mode }, 'Selamat datang di Luna 🌸', { close: false })) { S.tab = 'today'; S.tabIdx = 0; render(); } }
  },
  nav: (el) => {
    const k = el.dataset.k, i = TABS.findIndex((t) => t[0] === k);
    if (k === S.tab) return;
    S.dir = i > S.tabIdx ? 1 : -1; S.tabIdx = i; S.tab = k; haptic.tap(); closeSheet(); render({ back: S.dir < 0 });
  },
};
document.addEventListener('click', (e) => { const el = e.target.closest('[data-a]'); if (el) handlers[el.dataset.a]?.(el); });
document.addEventListener('change', (e) => {
  if (e.target.id === 'tz') save({ type: 'settings', tzOffset: +e.target.value }, 'Zona waktu diperbarui', { close: false });
});

// ───────────── render utama ─────────────
function afterRender() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('[data-dash]').forEach((e) => { e.style.strokeDashoffset = e.dataset.dash; });
    document.querySelectorAll('[data-rot]').forEach((e) => { e.style.transform = `rotate(${e.dataset.rot}deg)`; });
  }));
  const n = $('#ringDay');
  if (n && S.state.cycle) {
    const to = S.state.cycle.cycleDay ?? 0;
    if (reduceMotion() || S.counted === S.state.today + to) n.textContent = to;
    else { S.counted = S.state.today + to; const t0 = performance.now(); (function tick(t) { const p = Math.min(1, (t - t0) / 900); n.textContent = Math.round(to * (1 - (1 - p) ** 3)); if (p < 1) requestAnimationFrame(tick); })(t0); }
  }
}
function renderNav() {
  nav.hidden = false;
  nav.innerHTML = `<div class="pill" style="transform:translateX(${S.tabIdx * 100}%)"></div>${TABS.map(([k, ic, t]) => `<button class="${S.tab === k ? 'on' : ''}" data-a="nav" data-k="${k}"><span>${ic}</span>${t}</button>`).join('')}`;
}
function render({ animate = true, back = false } = {}) {
  if (S.error) {
    nav.hidden = true;
    app.innerHTML = `<div class="ob"><div class="card"><div class="empty"><span class="big">😔</span>${esc(S.error)}</div><button class="btn btn-primary btn-block" data-a="retry">Coba Lagi</button></div></div>`;
    return;
  }
  const st = S.state;
  if (!st) { app.innerHTML = `<div class="header"><div class="brand"><h1>Lu<em>na</em></h1></div></div><div class="skel"></div><div class="skel" style="height:240px"></div><div class="skel"></div>`; nav.hidden = true; return; }
  if (!st.onboarded) { nav.hidden = true; app.innerHTML = viewOnboarding(); if (back) app.firstElementChild.classList.add('back'); return; }
  if (!S.month) S.month = st.today.slice(0, 7);
  const view = { today: viewToday, siklus: viewSiklus, data: viewData, more: viewMore }[S.tab];
  const header = `<div class="header"><div class="brand"><h1>Lu<em>na</em></h1><span>${fmtLong(st.today)}</span></div><button class="icon-btn" data-a="theme" aria-label="Ganti tema">${S.dark ? '☀️' : '🌙'}</button></div>`;
  app.innerHTML = `${header}<div class="${animate ? `panel${back ? ' back' : ''}` : ''}" id="view">${view()}</div>`;
  if (!animate) app.querySelectorAll('.rise > *').forEach((n) => { n.style.animation = 'none'; });
  renderNav(); afterRender();
}

async function load() {
  S.error = null; S.state = null; render();
  try { S.state = await getState(); buildIndex(S.state); } catch (e) { S.error = e.message || 'Tidak bisa memuat data.'; }
  render();
}
handlers.retry = load;

try { tg?.ready(); tg?.expand(); tg?.disableVerticalSwipes?.(); } catch {}
initTheme();
load();
