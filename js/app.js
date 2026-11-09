// Ponto Foto (web/iPhone): telas e fluxos. Mesmas regras do app Android (logic.js).
import * as L from './logic.js';
import * as S from './store.js';
import { readReceipt, readEspelho, readMarked, readText, fileToCanvas, canvasToBlob } from './ocr.js';
import * as ESC from './escala.js';
import * as P from './plans.js';

const $app = document.getElementById('app');
const $ov = document.getElementById('overlay');
let data = S.emptyData();
const ui = { tab: 'hoje', overlay: null, month: null };

// ---------------- utilidades ----------------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let hmapCache = { key: '', map: {} };
function hmap() {
  const st = data.settings;
  const key = JSON.stringify([st.uf, st.city, st.customHolidays, st.disabledHolidays, st.includeOptional, st.confirmedHolidays]);
  if (hmapCache.key !== key) {
    const y = new Date().getFullYear();
    hmapCache = { key, map: P.holidayMap([y - 1, y, y + 1], holidaySettings()) };
  }
  return hmapCache.map;
}
const holidaySettings = () => ({ uf: data.settings.uf, city: data.settings.city, customHolidays: data.settings.customHolidays || [],
  disabledHolidays: data.settings.disabledHolidays || [], includeOptional: !!data.settings.includeOptional,
  confirmedHolidays: data.settings.confirmedHolidays || [] });
const cfg = () => L.applyAppointments({ weekly: data.settings.weekly, tolerance: data.settings.tolerance, lunch: data.settings.lunch,
  holidays: new Set(Object.keys(hmap())), autoDouble: data.settings.autoDouble !== false }, data.appointments || []);
const strategy = () => data.settings.strategy || { even: true, sat: 0, sun: 0, alt: 0 };
const nowDT = () => L.localNow();
const today = () => L.dateOf(nowDT());
const byDate = () => L.groupByDate(data.punches);
const typeLabel = (t) => (t === 'ENTRADA' ? 'Entrada' : 'Saída');
const typeColor = (t) => (t === 'ENTRADA' ? 'var(--entrada)' : 'var(--saida)');
const WD_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WD_LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dmy = (d) => `${dm(d)}/${d.slice(0, 4)}`;
const longLabel = (d) => `${WD_LONG[L.weekdayIndex(d)]}, ${Number(d.slice(8, 10))} de ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const shortLabel = (d) => `${WD_SHORT[L.weekdayIndex(d)]}, ${dm(d)}`;
const monthLabel = (ym) => { const m = MONTHS[Number(ym.slice(5, 7)) - 1]; return `${m[0].toUpperCase()}${m.slice(1)} de ${ym.slice(0, 4)}`; };
const hmOf = (dt) => dt.slice(11, 16);
const signClass = (m) => (m > 0 ? 'pos' : m < 0 ? 'neg' : '');
const fmt = L.formatMinutes, dur = L.formatDuration;
const firstName = (n) => { const f = (n || '').trim().split(/\s+/)[0] || ''; return f ? f[0].toUpperCase() + f.slice(1).toLowerCase() : ''; };
const initials = (n) => { const p = (n || '').trim().split(/\s+/).filter(Boolean); return !p.length ? '?' : p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase(); };
const greeting = (dt) => { const h = Number(dt.slice(11, 13)); return h >= 5 && h < 12 ? 'Bom dia' : h < 18 && h >= 12 ? 'Boa tarde' : 'Boa noite'; };
const isDoubleEligible = (date, type) => L.weekdayIndex(date) === 6 || type === 'FERIADO' || !!hmap()[date];
const bankUntilYesterday = () => L.bank(byDate(), data.marks, cfg(), data.adjustments, data.settings.checkpoint, today());

/** Salva; antes, acerta entrada/saída pela ordem dos horários (evita saldo negativo "fantasma"). */
function save() { L.normalizeTypes(data.punches); S.saveData(data); }

const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  wallet: '<rect x="2" y="5" width="20" height="15" rx="3"/><path d="M2 10h20M16 15h2"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2"/>',
  left: '<path d="M15 18l-6-6 6-6"/>', right: '<path d="M9 18l6-6-6-6"/>',
  check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  punch: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
};
const icon = (name, style = '') => `<svg class="ico" viewBox="0 0 24 24" style="${style}">${ICONS[name]}</svg>`;

// ---------------- telas ----------------

function ring(progress, size = 84) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, progress));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex:none">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="rgba(255,255,255,.18)" stroke-width="9" fill="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--accent)" stroke-width="9" fill="none" stroke-linecap="round"
      stroke-dasharray="${c * p} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-weight="800" font-size="16">${Math.min(999, Math.round(p * 100))}%</text></svg>`;
}

function timeline(punches) {
  return punches.map((p, i) => {
    const next = punches[i + 1];
    let gap = '';
    if (next) {
      const m = L.minutesOf(next.dateTime) - L.minutesOf(p.dateTime);
      const t = p.type === 'ENTRADA' && next.type === 'SAIDA' ? `trabalhou ${dur(m)}` : p.type === 'SAIDA' && next.type === 'ENTRADA' ? `intervalo ${dur(m)}` : `${dur(m)} · marcação repetida?`;
      gap = `<div class="tl-gap">${t}</div>`;
    }
    return `<div class="tl-item" data-act="edit" data-id="${p.id}">
      <div class="tl-dot" style="background:${typeColor(p.type)}"></div>
      <div class="tl-time">${hmOf(p.dateTime)}</div>
      <div class="grow"><div style="font-weight:800;color:${typeColor(p.type)}">${typeLabel(p.type)}</div>
        <div class="xs muted">${p.source === 'PHOTO' ? 'Comprovante' : 'Digitado'}</div></div>${icon('right', 'color:var(--muted)')}</div>${gap}`;
  }).join('');
}

function goalBlock(goal, plan) {
  const title = `Meta: ${goal.targetMinutes === 0 ? 'zerar o banco' : fmt(goal.targetMinutes)} até ${dm(goal.deadline)}`;
  const t = today(), c = cfg(), st = strategy();
  const sp = P.strategyPlan(goal, st, bankUntilYesterday(), t, c, data.marks);
  const tt = P.targetFor(t, goal, st, sp, c, data.marks);
  const weekend = L.expectedFor(t, c) === 0 || P.isOff(t, c, data.marks);
  const body = plan.reached ? '<div class="big pos">Meta atingida!</div>'
    : plan.expired ? `<div class="h3 neg">Prazo vencido · faltaram ${dur(plan.missingMinutes)}</div>`
    : `<div class="big" style="color:var(--primary)">${tt === 0 ? 'Hoje: sem extra pela estratégia' : weekend ? `Hoje: trabalhar ${dur(tt)}` : `Hoje: +${dur(tt)}`}</div>
       <div class="small muted">Estratégia: ${P.describeStrategy(st)}${sp.perDay ? ` (+${dur(sp.perDay)}/dia útil)` : ''}${sp.shortfall ? ` · faltariam ${dur(sp.shortfall)}` : ''} · faltam ${dur(plan.missingMinutes)}</div>`;
  return `<div class="row">${icon('flag', `color:${plan.reached ? 'var(--positive)' : 'var(--primary)'}`)}<div class="h3 grow">${title}</div></div>
    <div style="margin-top:8px">${body}</div>
    <div class="progress" style="margin-top:10px"><div style="width:${Math.round(plan.progress * 100)}%;${plan.reached ? 'background:var(--positive)' : ''}"></div></div>`;
}

function homeView() {
  const now = nowDT(), t = today(), c = cfg(), by = byDate();
  const s = L.summarize(t, by[t], data.marks[t], c, now);
  const bank = bankUntilYesterday();
  const monday = L.addDays(t, -L.weekdayIndex(t));
  const week = Array.from({ length: 7 }, (_, i) => L.summarize(L.addDays(monday, i), by[L.addDays(monday, i)], data.marks[L.addDays(monday, i)], c, now));
  const goal = data.settings.goal;
  const plan = goal ? L.plan(goal, bank, t, c, data.marks) : null;
  const sp = goal ? P.strategyPlan(goal, strategy(), bank, t, c, data.marks) : null;
  const extraGoal = plan && !plan.expired ? P.targetFor(t, goal, strategy(), sp, c, data.marks) : 0;
  const nextHol = P.upcomingHolidays(t, 60, hmap(), c, data.marks)[0];
  const missing = missingPunch(t, c, by);
  const pendingMun = pendingMunicipal(45)[0];
  const f = L.forecast(s, c, extraGoal, now);
  const suggested = L.suggestType(s.punches);
  const name = firstName(data.settings.name);
  const status = s.dayType ? L.DAY_TYPES[s.dayType].label : s.openSince ? `Trabalhando desde ${hmOf(s.openSince)}`
    : s.punches.length ? `Fora · última marcação ${hmOf(s.punches[s.punches.length - 1].dateTime)}` : 'Nenhuma marcação hoje';
  const progress = s.expectedMinutes > 0 ? s.workedMinutes / s.expectedMinutes : 0;
  const lastRead = data.punches.find((p) => p.id === data.lastReadId);
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  let fc = '';
  if (f) {
    const hint = f.returnAt !== null ? `Voltando do intervalo às ${L.hm(f.returnAt)}` : f.includesLunch ? `Já conta ${dur(c.lunch)} de almoço` : `Para fechar ${dur(s.expectedMinutes)} hoje`;
    fc = `<div class="forecast row" style="margin-top:14px">${icon('clock')}<div class="grow">
      ${f.journeyDone ? `<div class="h3">Jornada cumprida</div><div class="small muted">Extra hoje: ${fmt(s.workedMinutes - s.expectedMinutes)}</div>`
        : `${f.forJourney !== null ? `<div class="h3">Saída prevista ${L.hm(f.forJourney % 1440)}</div>` : ''}<div class="small muted">${hint}</div>`}
      ${f.forGoal !== null ? `<div style="font-weight:800" class="accent">Para a meta: ${L.hm(f.forGoal % 1440)} (+${dur(extraGoal)})</div>` : ''}</div></div>`;
  }

  return `<div class="stack">
    ${isIOS && !standalone ? `<div class="card tight row" style="background:var(--primary-soft)">${icon('share', 'color:var(--primary)')}
      <div class="small grow">Para instalar: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</div></div>` : ''}
    <div class="row"><div class="grow tap" data-act="editName"><div class="muted">${greeting(now)}${name ? `, ${esc(name)}` : ''}</div>
      <div class="h2">${longLabel(t)}</div></div>
      <button class="avatar" data-act="editName" aria-label="Editar nome">${esc(initials(data.settings.name || 'Ponto Foto'))}</button></div>
    ${(() => { const a = L.upcomingAppointments(data.appointments, now, 1)[0]; return a ? `<div class="card tight row tap" data-act="appt" data-id="${a.id}">${icon('calendar', 'color:var(--primary);flex:none')}<div class="grow"><b>${a.date === t ? 'Hoje' : 'Amanhã'}: ${esc(a.title || L.APPT_KINDS[a.kind])}</b><div class="small muted">${esc(L.describeAppointment(a))}</div></div></div>` : ''; })()}

    ${missing ? `<div class="card tight row tap" data-act="day" data-date="${missing.date}" style="background:color-mix(in srgb, var(--negative) 14%, var(--surface))">${icon('info', 'color:var(--negative);flex:none')}
      <div class="small grow"><b>Esqueceu algum ponto?</b> ${esc(missing.text)}</div>${icon('right', 'color:var(--muted)')}</div>` : ''}

    ${pendingMun ? `<div class="card"><div class="label" style="color:var(--primary)">Feriado municipal em ${dm(pendingMun.date)}</div>
      <div class="h3">${esc(pendingMun.name)}</div>
      <div class="small muted">Nem toda empresa adere aos feriados da cidade. Sua empresa vai folgar nesse dia?</div>
      <div class="grid2" style="margin-top:10px"><button class="btn outline" data-act="confirmHoliday" data-key="${esc(pendingMun.key)}" data-yes="">Trabalho normal</button>
      <button class="btn" data-act="confirmHoliday" data-key="${esc(pendingMun.key)}" data-yes="1">É folga</button></div></div>` : ''}

    <div class="card tight tap" data-act="tab" data-tab="agenda"><div>${esc(P.dailyMessage(t))}</div>
      ${nextHol ? `<div class="small" style="color:var(--primary);font-weight:700;margin-top:8px">Próximo feriado: ${esc(nextHol.name)}, ${dm(nextHol.date)} (${nextHol.weekday})${nextHol.kind === 'prolongado' ? ' · feriadão!' : nextHol.kind === 'ponte' ? ` · dá ponte em ${dm(nextHol.bridge)}` : ''}${nextHol.inDays === 0 ? ' · hoje' : ` · em ${nextHol.inDays} dias`}</div>` : ''}</div>

    ${lastRead ? `<div class="card"><div class="h3">Confira o horário lido</div>
      <div class="big" style="color:${typeColor(lastRead.type)}">${typeLabel(lastRead.type)} de ${dm(L.dateOf(lastRead.dateTime))} às ${hmOf(lastRead.dateTime)}</div>
      ${lastRead.photoId ? `<canvas class="crop" data-crop="${lastRead.photoId}" data-box="${esc(lastRead.ocrBox || '')}" style="margin-top:8px" data-act="photo" data-photo="${lastRead.photoId}"></canvas>` : ''}
      <div class="grid2" style="margin-top:10px"><button class="btn outline" data-act="edit" data-id="${lastRead.id}">Corrigir</button>
      <button class="btn" data-act="confirmRead">Está certo</button></div></div>` : ''}

    <div class="brand">
      <span class="pill" style="background:rgba(255,255,255,.16);color:${s.openSince ? 'var(--accent)' : '#fff'}"><span class="dot"></span>${esc(status)}</span>
      <div class="clock" style="margin-top:10px" data-clock>${now.slice(11, 16)}<small>:${String(new Date().getSeconds()).padStart(2, '0')}</small></div>
      <div class="row" style="margin-top:12px">${ring(progress)}<div>
        <div class="label" style="color:rgba(255,255,255,.7)">Trabalhado hoje</div>
        <div class="h1">${dur(s.workedMinutes)}</div>
        <div class="small muted">${s.expectedMinutes > 0 ? `de ${dur(s.expectedMinutes)} · saldo ${fmt(s.workedMinutes - s.expectedMinutes)}` : 'dia sem jornada'}</div></div></div>
      ${fc}
      <button class="btn white block" style="margin-top:18px" data-act="punch">${icon('punch')} Bater ponto · ${typeLabel(suggested)}</button>
    </div>

    <div class="grid2">
      <div class="tile" data-act="tab" data-tab="banco"><div class="label">Banco de horas</div><div class="v ${signClass(bank)}">${fmt(bank)}</div><div class="xs muted">até ontem</div></div>
      <div class="tile" data-act="tab" data-tab="banco"><div class="label">Esta semana</div><div class="v">${dur(week.reduce((a, d) => a + d.workedMinutes, 0))}</div><div class="xs muted">de ${dur(week.reduce((a, d) => a + d.expectedMinutes, 0))}</div></div>
    </div>

    <div class="card tap" data-act="tab" data-tab="banco">${goal && plan ? goalBlock(goal, plan)
      : `<div class="row">${icon('flag', 'color:var(--primary)')}<div class="grow"><div class="h3">Criar meta de banco</div>
         <div class="small muted">Ex.: zerar o banco até o fim do mês. O app diz quanto de extra fazer por dia.</div></div></div>`}</div>

    ${s.dayType ? `<div class="card row"><div class="grow"><div class="h3">Hoje: ${L.DAY_TYPES[s.dayType].label}</div>
      <div class="small muted">${L.DAY_TYPES[s.dayType].countsExpected ? 'A jornada do dia é descontada do banco.' : 'Sem jornada hoje; horas trabalhadas viram crédito.'}</div></div>
      <button class="link" data-act="setMark" data-date="${t}" data-type="">Remover</button></div>` : ''}

    ${isDoubleEligible(t, s.dayType) || s.holiday || s.doubled ? doubledToggle(t, s.doubled) : ''}

    <div class="card"><div class="row"><div class="h3 grow">Marcações de hoje</div><button class="link" data-act="markSheet" data-date="${t}">Marcar dia</button></div>
      ${s.punches.length ? timeline(s.punches) + (s.incomplete ? '<div class="small neg" style="margin-top:6px">Há uma marcação sem par. Confira entradas e saídas.</div>' : '')
        : '<div class="center muted" style="padding:20px 0">Nenhum ponto hoje.<br>Bata o ponto no relógio e fotografe o comprovante.</div>'}</div>
  </div>`;
}

function pendingMunicipal(days) {
  const t = today(), end = L.addDays(t, days), y = Number(t.slice(0, 4));
  return [y, y + 1].flatMap((yy) => P.holidaysForYear(yy, holidaySettings())).filter((h) => h.pending && h.date >= t && h.date <= end);
}
function confirmHoliday(key, yes) {
  const conf = new Set(data.settings.confirmedHolidays || []), dis = new Set(data.settings.disabledHolidays || []);
  if (yes) { conf.add(key); dis.delete(key); } else { conf.delete(key); dis.add(key); }
  data.settings.confirmedHolidays = [...conf]; data.settings.disabledHolidays = [...dis];
}

/** Último dia de trabalho antes de hoje sem pontos ou com marcação sem par. */
function missingPunch(t, c, by) {
  let d = L.addDays(t, -1);
  for (let i = 0; i < 7; i++, d = L.addDays(d, -1)) {
    if (P.isOff(d, c, data.marks)) continue;
    const s = L.summarize(d, by[d], data.marks[d], c);
    if (!s.punches.length) return { date: d, text: `Nenhum ponto em ${dm(d)}. Foi folga? Marque o dia ou registre os horários.` };
    if (s.incomplete || s.punches.length % 2) return { date: d, text: `Em ${dm(d)} ficou uma marcação sem par (${s.punches.length} batidas).` };
    return null;
  }
  return null;
}

function doubledToggle(date, on) {
  return `<label class="card tight check" style="${on ? 'background:color-mix(in srgb, var(--accent) 18%, var(--surface))' : ''}">
    <input type="checkbox" data-change="doubled" data-date="${date}" ${on ? 'checked' : ''}>
    <div><div style="font-weight:800">Horário dobrado (100%)</div><div class="small muted">As horas trabalhadas neste dia contam em dobro no banco.</div></div></label>`;
}

function historyView() {
  const t = today(), now = nowDT(), c = cfg(), by = byDate();
  const ym = ui.month || t.slice(0, 7);
  const days = L.monthDays(ym, by, data.marks, c, now);
  const st = L.stats(days, t);
  const first = L.weekdayIndex(`${ym}-01`);
  const cells = Array(first).fill(null).concat(days);
  const withRec = days.filter((d) => d.hasRecords).reverse();
  const canNext = ym < t.slice(0, 7);
  return `<div class="stack">
    <div class="row"><div class="h1 grow">Histórico</div><button class="icon-btn" data-act="exportCsv" data-ym="${ym}" title="Exportar planilha">${icon('share')}</button></div>
    <div class="row"><button class="icon-btn" data-act="month" data-d="-1">${icon('left')}</button>
      <div class="h3 grow center">${monthLabel(ym)}</div>
      <button class="icon-btn" data-act="month" data-d="1" ${canNext ? '' : 'disabled style="opacity:.3"'}>${icon('right')}</button></div>
    <div class="grid3">
      <div class="tile"><div class="label">Trabalhado</div><div class="v">${dur(st.workedMinutes)}</div></div>
      <div class="tile"><div class="label">Saldo</div><div class="v ${signClass(st.balanceMinutes)}">${fmt(st.balanceMinutes)}</div></div>
      <div class="tile"><div class="label">Dias</div><div class="v">${st.daysWorked}</div></div></div>
    <div class="card tap row" data-act="espSource"><div class="badge" style="background:var(--primary-soft);color:var(--primary)">${icon('check')}</div>
      <div class="grow"><div class="h3">Conferir espelho de ponto</div><div class="small muted">Envie PDF ou foto do espelho da empresa e veja o que falta ou está diferente.</div></div>${icon('right', 'color:var(--muted)')}</div>
    <div class="card" style="padding:14px"><div class="cal">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x) => `<div class="wd">${x}</div>`).join('')}
      ${cells.map((d) => {
        if (!d) return '<div></div>';
        const future = d.date > t;
        const cls = ['c', d.dayType ? 'spec' : d.punches.length ? 'rec' : '', d.date === t ? 'today' : '', future ? 'future' : ''].join(' ');
        const dot = !d.punches.length && !d.dayType || d.date === t ? 'transparent' : d.balanceMinutes > 0 ? 'var(--positive)' : d.balanceMinutes < 0 ? 'var(--negative)' : 'var(--muted)';
        return `<div class="${cls}" ${future ? '' : `data-act="day" data-date="${d.date}"`}>${Number(d.date.slice(8))}<i style="background:${dot}"></i></div>`;
      }).join('')}</div>
      <div class="row xs muted" style="margin-top:8px;gap:14px"><span>● <span class="pos">positivo</span></span><span>● <span class="neg">negativo</span></span><span style="color:var(--primary)">■ dia especial</span></div></div>
    ${withRec.length ? withRec.map((d) => `<div class="card tight tap row" data-act="day" data-date="${d.date}">
      <div class="grow"><div class="row" style="gap:8px"><b>${shortLabel(d.date)}</b>${[d.dayType && L.DAY_TYPES[d.dayType].label, d.doubled && '100%'].filter(Boolean).map((x) => `<span class="pill" style="background:var(--primary-soft);color:var(--primary)">${x}</span>`).join('')}</div>
        <div class="small muted" style="margin-top:4px">${d.punches.length ? d.punches.map((p) => hmOf(p.dateTime)).join('  ·  ') : 'Sem marcações'}</div></div>
      <div style="text-align:right"><b>${dur(d.workedMinutes)}</b><div class="small ${signClass(d.balanceMinutes)}" style="font-weight:700">${fmt(d.balanceMinutes)}</div></div></div>`).join('')
      : '<div class="center muted" style="padding:20px">Nada neste mês ainda.</div>'}
  </div>`;
}

function chart(days) {
  const max = Math.max(60, ...days.map((d) => Math.max(d.workedMinutes, d.expectedMinutes)));
  const W = 320, H = 140, slot = W / days.length, bw = slot * 0.46;
  const bars = days.map((d, i) => {
    const x = slot * i + (slot - bw) / 2, h = (H * d.workedMinutes) / max;
    const over = d.expectedMinutes > 0 && d.workedMinutes > d.expectedMinutes;
    const y = H - (H * d.expectedMinutes) / max;
    return `<rect x="${x}" y="0" width="${bw}" height="${H}" rx="${bw / 2}" fill="var(--surface-3)"/>
      ${h > 0 ? `<rect x="${x}" y="${H - h}" width="${bw}" height="${h}" rx="${bw / 2}" fill="${over ? 'var(--accent)' : 'var(--primary)'}"/>` : ''}
      ${d.expectedMinutes > 0 ? `<line x1="${x - 3}" x2="${x + bw + 3}" y1="${y}" y2="${y}" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4"/>` : ''}`;
  }).join('');
  const labels = days.map((d) => `<div class="center xs" style="flex:1"><div class="muted" style="font-weight:700">${WD_SHORT[L.weekdayIndex(d.date)]}</div>${d.workedMinutes ? dur(d.workedMinutes) : '–'}</div>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:140px" preserveAspectRatio="none">${bars}</svg><div class="row" style="gap:0;margin-top:8px">${labels}</div>`;
}

function weeklyChart(weeks) {
  const W = 320, H = 160, slot = W / weeks.length, bw = slot * 0.5, mid = H / 2;
  const maxD = Math.max(60, ...weeks.map((w) => Math.abs(w.delta)));
  const minB = Math.min(...weeks.map((w) => w.bankEnd)), maxB = Math.max(...weeks.map((w) => w.bankEnd));
  const span = Math.max(60, maxB - minB);
  const bars = weeks.map((w, i) => {
    const x = slot * i + (slot - bw) / 2, h = ((H / 2 - 8) * Math.abs(w.delta)) / maxD;
    if (!h) return '';
    return `<rect x="${x}" y="${w.delta >= 0 ? mid - h : mid}" width="${bw}" height="${h}" rx="4" fill="${w.delta >= 0 ? 'var(--positive)' : 'var(--negative)'}" opacity="${w.current ? 0.45 : 1}"/>`;
  }).join('');
  const pts = weeks.map((w, i) => [slot * i + slot / 2, H - 8 - ((H - 16) * (w.bankEnd - minB)) / span]);
  const line = `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="var(--primary)" stroke-width="3"/>` +
    pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--primary)"/>`).join('');
  const labels = weeks.map((w, i) => `<div class="center" style="flex:1;font-size:10px">${i % 3 === 0 || i === weeks.length - 1 ? `${w.start.slice(8, 10)}/${w.start.slice(5, 7)}` : ''}</div>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:160px;margin-top:10px" preserveAspectRatio="none">
    <line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="var(--outline)" stroke-width="2"/>${bars}${line}</svg>
    <div class="row muted" style="gap:0;margin-top:4px">${labels}</div>`;
}

function bankView() {
  const t = today(), now = nowDT(), c = cfg(), by = byDate();
  const bank = bankUntilYesterday();
  const cp = data.settings.checkpoint && data.settings.checkpoint.date < t ? data.settings.checkpoint : null;
  const ts = L.summarize(t, by[t], data.marks[t], c, now);
  const last7 = Array.from({ length: 7 }, (_, i) => L.addDays(t, i - 6)).map((d) => L.summarize(d, by[d], data.marks[d], c, now));
  const ms = L.stats(L.monthDays(t.slice(0, 7), by, data.marks, c, now), t);
  const goal = data.settings.goal;
  const plan = goal ? L.plan(goal, bank, t, c, data.marks) : null;
  const adjs = data.adjustments.filter((a) => !cp || a.referenceDate > cp.date).sort((a, b) => b.referenceDate.localeCompare(a.referenceDate));
  return `<div class="stack">
    <div class="h1">Banco de horas</div>
    <div class="brand"><div class="label" style="color:rgba(255,255,255,.75)">Saldo atual</div>
      <div style="font-size:46px;font-weight:800;letter-spacing:-1px">${fmt(bank)}</div>
      <div class="small muted">${cp ? `Saldo de ${fmt(cp.minutes)} em ${dm(cp.date)} + dias seguintes até ontem` : 'Soma de todos os dias até ontem, com ajustes'}</div>
      ${ts.punches.length ? `<div class="accent" style="margin-top:6px;font-weight:700">Hoje até agora: ${fmt(ts.workedMinutes - ts.expectedMinutes)}</div>` : ''}
      <button class="btn ghost" style="margin-top:16px" data-act="adjust">${icon('sliders')} Editar saldo</button></div>
    <div class="card">${goal && plan ? goalBlock(goal, plan) + `<div class="row" style="margin-top:8px"><button class="link" data-act="strategies">Estratégias</button><button class="link" data-act="goal">Alterar meta</button><button class="link neg" data-act="removeGoal">Remover</button></div>`
      : `<div class="h3">Meta de banco de horas</div><div class="small muted" style="margin-top:4px">Defina o saldo que quer ter e até quando. O app calcula quanto de extra fazer por dia e mostra o horário de saída para chegar lá.</div>
         <button class="btn" style="margin-top:12px" data-act="goal">${icon('flag')} Criar meta</button>`}</div>
    ${cp ? `<div class="card tight row"><div class="grow"><div class="label">Saldo inicial</div>
      <div><span class="h3 ${signClass(cp.minutes)}">${fmt(cp.minutes)}</span> <span class="muted">em ${dmy(cp.date)}</span></div>
      <div class="xs muted">Os dias até essa data não entram mais na conta.</div></div><button class="icon-btn" data-act="removeCheckpoint">${icon('trash')}</button></div>` : ''}
    ${(() => {
      const weeks = P.weeklyHistory(by, data.marks, c, data.adjustments, data.settings.checkpoint, t, 12);
      const tr = P.trend(weeks, bank, goal ? goal.targetMinutes : 0);
      return `<div class="card"><div class="h3">Banco semana a semana</div>
        <div class="small muted">Barras: quanto o banco subiu ou desceu em cada semana. Linha: saldo no fim da semana.</div>
        ${weeklyChart(weeks)}
        ${tr ? `<div class="small" style="margin-top:8px;font-weight:700;color:${tr.avg >= 0 ? 'var(--positive)' : 'var(--negative)'}">Média das últimas semanas: ${fmt(tr.avg)} por semana${
          tr.weeksToTarget && tr.missing > 0 ? `. Nesse ritmo, ${goal ? 'bate a meta' : 'zera o banco'} em ${tr.weeksToTarget} semana(s).`
          : tr.missing > 0 && tr.avg <= 0 ? '. Nesse ritmo o banco não melhora: veja as estratégias da meta.' : '.'}</div>` : ''}</div>`;
    })()}
    ${(() => {
      const inc = Object.keys(by).filter((d) => d < t && (!data.settings.checkpoint || d > data.settings.checkpoint.date))
        .map((d) => L.summarize(d, by[d], data.marks[d], c)).filter((x) => x.incomplete).sort((a, b) => b.date.localeCompare(a.date));
      return inc.length ? `<div class="card"><div class="h3 neg">${inc.length} dia(s) com batida faltando</div>
        <div class="small muted">Esses dias ficam fora do banco até você corrigir no Histórico (para não gerar saldo negativo falso):</div>
        <div class="chips" style="margin-top:8px">${inc.slice(0, 10).map((x) => `<button class="chip" data-act="day" data-date="${x.date}">${dm(x.date)} · ${x.punches.length} batida${x.punches.length === 1 ? '' : 's'}</button>`).join('')}</div></div>` : '';
    })()}
    ${payCard()}
    <div class="card"><div class="h3" style="margin-bottom:12px">Últimos 7 dias</div>${chart(last7)}</div>
    <div class="h3">Este mês</div>
    <div class="grid2">
      <div class="tile"><div class="label">Horas extras</div><div class="v pos">${dur(ms.extraMinutes)}</div></div>
      <div class="tile"><div class="label">Horas devidas</div><div class="v neg">${dur(ms.owedMinutes)}</div></div>
      <div class="tile"><div class="label">Trabalhado</div><div class="v">${dur(ms.workedMinutes)}</div><div class="xs muted">${ms.daysWorked} dias</div></div>
      <div class="tile"><div class="label">Média por dia</div><div class="v">${dur(ms.averagePerDay)}</div></div></div>
    <div class="h3">Ajustes manuais</div>
    ${adjs.length ? adjs.map((a) => `<div class="card tight row"><div class="grow"><b>${dmy(a.referenceDate)}</b>${a.reason ? `<div class="small muted">${esc(a.reason)}</div>` : ''}</div>
      <b class="${signClass(a.minutesDelta)}">${fmt(a.minutesDelta)}</b><button class="icon-btn" data-act="delAdj" data-id="${a.id}">${icon('trash')}</button></div>`).join('')
      : '<div class="small muted">Nenhum ajuste. Use "Editar saldo" para lançar o saldo numa data, somar ou tirar horas.</div>'}
  </div>`;
}

function agendaView() {
  const t = today(), c = cfg(), hm = hmap(), st = data.settings;
  const bank = bankUntilYesterday();
  const up = P.upcomingHolidays(t, 120, hm, c, data.marks);
  const monthH = up.filter((h) => h.date.slice(0, 7) === t.slice(0, 7));
  const next = up.filter((h) => !monthH.includes(h)).slice(0, 8);
  const ideas = P.vacationIdeas(t, 365, c, data.marks, hm);
  const yEnd = `${Number(t.slice(0, 4)) + (Number(t.slice(5, 7)) >= 10 ? 1 : 0)}-12-31`;
  const ann = P.annualPlan(t, yEnd, bank, c, data.marks, hm);
  const year = P.holidaysForYear(Number(t.slice(0, 4)), holidaySettings());
  const list = ui.showAllHolidays ? year : year.filter((h) => h.date >= t).slice(0, 10);
  const kindPill = (k) => { const [l, col] = { prolongado: ['Feriadão', 'var(--positive)'], ponte: ['Dá ponte', 'var(--primary)'], fimdesemana: ['No fim de semana', 'var(--muted)'], meio: ['Meio da semana', 'var(--saida)'] }[k];
    return `<span class="pill" style="background:color-mix(in srgb, ${col} 14%, transparent);color:${col}">${l}</span>`; };
  const hRow = (h) => `<div class="row" style="padding:6px 0"><div class="grow"><b>${esc(h.name)}</b>
    <div class="small muted">${dm(h.date)} (${h.weekday}) · ${h.inDays === 0 ? 'hoje' : h.inDays === 1 ? 'amanhã' : `em ${h.inDays} dias`}${h.bridge ? ` · emende ${dm(h.bridge)} (${dur(h.bridgeMinutes)} do banco)` : ''}</div></div>${kindPill(h.kind)}</div>`;
  const m = MONTHS[Number(t.slice(5, 7)) - 1];
  return `<div class="stack">
    <div><div class="muted">Consultas, faltas, feriados e emendas</div><div class="h1">Agenda</div></div>
    ${apptCard()}
    ${!st.uf ? `<div class="card tap row" data-act="tab" data-tab="ajustes">${icon('info', 'color:var(--primary);flex:none')}<div class="grow"><div class="h3">Informe seu estado e cidade</div><div class="small muted">Para incluir os feriados estaduais e municipais. Toque para abrir os Ajustes.</div></div></div>`
      : !P.cityKnown(st.uf, st.city) ? `<div class="notice" style="background:color-mix(in srgb, var(--saida) 14%, transparent)">Ainda não tenho os feriados municipais de ${esc(st.city || 'sua cidade')}. Se a sua empresa folga neles, adicione em "Feriados do ano" (botão +).</div>` : ''}
    <div class="card"><div class="label">Este mês</div><div class="h2">${m[0].toUpperCase() + m.slice(1)}</div>
      ${monthH.length ? monthH.map(hRow).join('') : '<div style="margin-top:6px">Sem feriados no resto do mês. Bom momento para acumular horas no banco!</div>'}</div>
    <div class="h3">Próximos feriados</div>
    ${next.length ? next.map((h) => `<div class="card tight">${hRow(h)}</div>`).join('') : (monthH.length ? '' : '<div class="muted">Nenhum feriado nos próximos 4 meses.</div>')}
    <div class="h3">Ideias de folga</div>
    ${ideas.length ? ideas.map((i) => `<div class="card tight"><b>Tire ${i.workdays} dia(s) e folgue ${i.totalOff}</b>
      <div class="small muted">Folga de ${dm(i.from)} a ${dm(i.to)} (${dur(i.minutes)} do banco ou férias) → de ${dm(i.offStart)} a ${dm(i.offEnd)} sem trabalhar. ${esc([...new Set(i.holidays)].join(', '))}</div></div>`).join('')
      : '<div class="muted">Sem emendas boas nos próximos 12 meses.</div>'}
    <div class="xs muted">Férias pela CLT não podem começar nos 2 dias antes de feriado ou do descanso semanal.</div>
    <div class="card"><div class="h3">Plano de horas até ${yEnd.slice(0, 4)}</div>
      ${ann.items.length ? `<div style="margin-top:6px">Para emendar ${ann.items.length} ponte(s) com o banco${ann.deficit ? ` e zerar o saldo negativo (${dur(ann.deficit)})` : ''}, acumule ${dur(ann.totalMinutes)}.</div>
        <div class="h3" style="color:var(--primary);margin-top:4px">Faça +${dur(ann.perDay)} por dia útil a partir de hoje.</div>
        ${ann.items.map((a) => `<div class="small muted">• ${dm(a.bridge)} (ponte do ${esc(a.name)}): ter ${dur(a.cumulative)} acumuladas</div>`).join('')}`
        : `<div class="muted" style="margin-top:6px">Nenhuma ponte (feriado na terça ou quinta) até o fim de ${yEnd.slice(0, 4)}.</div>`}</div>
    <div class="row"><div class="h3 grow">Feriados de ${t.slice(0, 4)}</div><button class="icon-btn" data-act="addHoliday">${icon('plus')}</button></div>
    ${list.map((h) => `<div class="card tight row"><div class="grow"><b>${dm(h.date)} · ${esc(h.name)}</b><div class="xs ${h.pending ? '' : 'muted'}" style="${h.pending ? 'color:var(--primary)' : ''}">${h.pending ? 'Municipal · a confirmar se a empresa folga' : h.scope}</div></div>
      ${h.scope === 'Pessoal' ? `<button class="icon-btn" data-act="delHoliday" data-name="${esc(h.name)}">${icon('trash')}</button>`
        : `<input type="checkbox" style="width:24px;height:24px;accent-color:var(--primary)" data-change="holiday" data-key="${esc(h.key)}" ${h.enabled ? 'checked' : ''}>`}</div>`).join('')}
    <button class="link" data-act="toggleAllHolidays">${ui.showAllHolidays ? 'Mostrar só os próximos' : 'Ver o ano inteiro'}</button>
  </div>`;
}

function settingsView() {
  const st = data.settings;
  const rem = st.reminders || { punchTimes: ['07:30', '12:00', '13:00', '17:30'], punchLead: 10, holidayDaysBefore: 30, punch: true, holidays: true, monthly: true };
  const presets = [['8h seg–sex', [480, 480, 480, 480, 480, 0, 0]], ['8h48 seg–sex', [528, 528, 528, 528, 528, 0, 0]], ['8h + sáb 4h', [480, 480, 480, 480, 480, 240, 0]], ['7h20 seg–sáb', [440, 440, 440, 440, 440, 440, 0]]];
  const stepper = (act, val, label) => `<div class="stepper"><button class="icon-btn" data-act="${act}" data-d="-1">${icon('minus')}</button><div class="val grow">${label}</div><button class="icon-btn" data-act="${act}" data-d="1">${icon('plus')}</button></div>`;
  return `<div class="stack">
    <div class="h1">Ajustes</div>
    <div class="card"><div class="row"><div class="avatar" style="width:52px;height:52px">${esc(initials(st.name || '?'))}</div>
      <div><div class="h3">Perfil</div><div class="small muted">Só o primeiro nome, opcional.</div></div></div>
      <label class="field" style="margin-top:12px"><span>Primeiro nome</span><input id="pf-name" maxlength="30" autocapitalize="words" enterkeyhint="done" value="${esc(st.name)}" style="font-size:16px"></label>
      <div style="text-align:right"><button class="link" data-act="saveProfile">Salvar nome</button></div></div>
    <div class="card"><div class="h3">Como você trabalha</div><div class="small muted">Escolha o que aparece no app.</div>
      <div class="chips" style="margin-top:8px">${[['CLT', 'Carteira assinada (ponto)'], ['APPS', 'Apps de corrida/entrega'], ['AMBOS', 'Os dois']].map(([k, l]) => `<button class="chip ${(st.workMode || 'CLT') === k ? 'on' : ''}" data-act="workMode" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="card"><div class="h3">Escala do trabalho</div><div class="small muted">Recebeu um link de escala do patrão? Abra o link no celular e o app ajusta jornada, folgas e lembretes. Organiza uma equipe? <a class="link" href="escalas.html">Monte a escala aqui</a>.</div></div>
    <div class="card"><div class="h3">Assistente de leitura</div>
      <div class="small" style="margin-top:4px">${st.layout?.time?.manual ? 'Aprendeu onde ficam a hora no seu comprovante (você marcou na foto).'
        : L.isTrained(st.layout) ? 'Já conhece o seu modelo de comprovante: procura a hora no mesmo lugar de sempre.'
        : st.layout?.time ? 'Aprendendo o seu modelo de comprovante. Confirme ou corrija as próximas leituras.'
        : 'Ainda não aprendeu. A cada leitura que você confirmar ou corrigir, ele descobre onde ficam a hora e a data no seu comprovante.'}</div>
      ${st.layout ? `<div class="xs muted">${st.layout.confirmed || 0} confirmada(s) · ${st.layout.corrected || 0} correção(ões)</div>` : ''}
      <div class="xs muted" style="margin-top:4px">Se errar, abra o ponto e toque em "Marcar na foto". Só posições ficam guardadas, nunca o texto do comprovante.</div>
      ${st.layout?.time ? '<button class="link" data-act="resetLayout">Esquecer o padrão (troquei de relógio de ponto)</button>' : ''}</div>
    <div class="card"><div class="h3">Privacidade e segurança</div>
      <div class="small muted">Tudo fica só neste aparelho, sem conta e sem servidor. CPF, nome completo e empresa nunca são salvos; nas fotos guardadas, esses dados ficam cobertos por uma tarja.</div>
      <label class="check"><input type="checkbox" data-change="keepPhotos" ${st.keepPhotos === false ? '' : 'checked'}><div><b>Guardar foto do comprovante</b> (com tarja). Desligado: só o horário fica salvo.</div></label>
      <div class="row" style="gap:12px;flex-wrap:wrap;margin-top:6px"><button class="link" data-act="clearPhotos">Apagar fotos</button><button class="link" style="color:var(--neg,#d33)" data-act="wipeAll">Apagar todos os dados</button>
      <a class="link" href="privacidade.html" target="_blank">Política de privacidade</a></div></div>
    <div class="card"><div class="h3">Jornada por dia</div><div class="small muted">Total: ${dur(st.weekly.reduce((a, b) => a + b, 0))} por semana</div>
      <div class="chips" style="margin:10px 0">${presets.map(([l, v], i) => `<button class="chip ${JSON.stringify(v) === JSON.stringify(st.weekly) ? 'on' : ''}" data-act="preset" data-i="${i}">${l}</button>`).join('')}</div>
      ${st.weekly.map((m, i) => `<div class="row" style="padding:4px 0"><div class="grow">${WD_LONG[i]}</div>
        <div class="stepper"><button class="icon-btn" data-act="weekly" data-i="${i}" data-d="-30">${icon('minus')}</button>
        <input type="time" value="${L.hm(Math.min(m, 1439))}" data-change="weekly" data-i="${i}">
        <button class="icon-btn" data-act="weekly" data-i="${i}" data-d="30">${icon('plus')}</button></div></div>`).join('')}
      <div class="xs muted">00:00 = folga. Toque no horário para digitar um valor exato.</div></div>
    <div class="card"><div class="h3">Tolerância diária</div><div class="small muted" style="margin-bottom:8px">Diferenças de até ${st.tolerance} min no dia não entram no banco (CLT: até 10 min).</div>
      ${stepper('tolerance', st.tolerance, `${st.tolerance} min`)}</div>
    <div class="card"><div class="h3">Intervalo de almoço</div><div class="small muted" style="margin-bottom:8px">Usado na previsão de saída enquanto você ainda não saiu para o almoço.</div>
      ${stepper('lunch', st.lunch, st.lunch ? dur(st.lunch) : 'sem intervalo')}</div>
    <div class="card"><div class="h3">Cidade e feriados</div>
      <div class="small muted">Feriados nacionais, do estado e da cidade zeram a jornada do dia e entram nos planos da Agenda.</div>
      <div class="row" style="margin-top:10px"><label class="field" style="width:96px"><span>Estado</span><select id="loc-uf" style="font-size:16px">
        <option value="">UF</option>${P.UFS.map((u) => `<option ${u === st.uf ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
        <label class="field grow"><span>Cidade</span><input id="loc-city" list="loc-cities" autocomplete="off" placeholder="Digite e escolha" value="${esc(st.city || '')}" style="font-size:16px"><datalist id="loc-cities"></datalist></label></div>
      <div style="text-align:right"><button class="link" data-act="saveLocation">Salvar local</button></div>
      ${st.uf ? `<div class="xs muted">${P.cityKnown(st.uf, st.city) ? `Feriados municipais de ${esc(st.city)}: o app pergunta antes de cada um se a sua empresa vai folgar.` : 'Feriados municipais desta cidade ainda não estão no app: se a empresa folga, adicione-os na Agenda (botão +).'}</div>` : ''}
      <label class="check"><input type="checkbox" data-change="autoDouble" ${st.autoDouble !== false ? 'checked' : ''}><div><b>Domingos e feriados em dobro (100%)</b><div class="small muted">Já vem marcado; dá para desmarcar em cada dia.</div></div></label>
      <label class="check"><input type="checkbox" data-change="optional" ${st.includeOptional ? 'checked' : ''}><div><b>Contar pontos facultativos</b><div class="small muted">Carnaval e Corpus Christi como folga.</div></div></label></div>
    <div class="card"><div class="h3">Lembretes no iPhone</div>
      <div class="small muted" style="margin-top:4px">O iPhone não deixa apps instalados pelo navegador agendarem notificações. Por isso os lembretes vão para o <b>Calendário</b>, com alarme: gere o arquivo, toque nele e escolha <b>Adicionar todos</b>. Esquecimentos de ponto aparecem aqui no app.</div>
      <label class="check"><input type="checkbox" data-change="rem" data-k="punch" ${rem.punch ? 'checked' : ''}><div><b>Antes de bater o ponto</b> (dias de trabalho)</div></label>
      ${rem.punch ? `<div class="row" style="flex-wrap:wrap;gap:8px">${rem.punchTimes.map((tm, i) => `<label class="field" style="width:96px;padding:6px 10px"><span>${(rem.punchTimes.length === 2 ? ['Entrada', 'Saída'] : ['Entrada', 'Almoço', 'Volta', 'Saída'])[i] || 'Ponto'}</span><input type="time" value="${tm}" data-change="remTime" data-i="${i}" style="font-size:16px"></label>`).join('')}</div>
        <div class="chips" style="margin-top:8px">${[5, 10, 15, 30].map((v) => `<button class="chip ${rem.punchLead === v ? 'on' : ''}" data-act="remLead" data-v="${v}">${v} min antes</button>`).join('')}</div>` : ''}
      <label class="check"><input type="checkbox" data-change="rem" data-k="holidays" ${rem.holidays ? 'checked' : ''}><div><b>Feriados</b> (aviso antecipado e na véspera)</div></label>
      ${rem.holidays ? `<div class="chips">${[1, 7, 15, 30].map((v) => `<button class="chip ${rem.holidayDaysBefore === v ? 'on' : ''}" data-act="remHolDays" data-v="${v}">${v} dia(s) antes</button>`).join('')}</div>` : ''}
      <label class="check"><input type="checkbox" data-change="rem" data-k="monthly" ${rem.monthly ? 'checked' : ''}><div><b>Resumo do mês</b> (dia 1º: feriados e emendas)</div></label>
      <button class="btn block" style="margin-top:10px" data-act="exportIcs">${icon('calendar')} Gerar lembretes para o Calendário</button>
      <div class="xs muted" style="margin-top:6px">Mudou a jornada ou os feriados? Gere de novo; os eventos repetidos são atualizados.</div></div>
    <div class="card"><div class="h3">Backup</div><div class="small muted">Mesmo formato do app Android: dá para levar os dados de um para o outro.</div>
      <div class="grid2" style="margin-top:12px"><button class="btn outline" data-act="exportBackup">Exportar</button><button class="btn outline" data-act="importBackup">Importar</button></div></div>
    <div class="card"><div class="h3">Instalar no iPhone</div><div class="small muted" style="margin-top:4px">No Safari, toque em <b>Compartilhar</b> (quadrado com seta) → <b>Adicionar à Tela de Início</b>. O app abre em tela cheia e funciona sem internet. Na primeira leitura de foto ele baixa o leitor de texto (alguns MB).</div></div>
    <div class="center xs muted">Ponto Foto web 1.5 · seus dados ficam só neste aparelho.<br>Controle pessoal: não substitui o registro oficial de ponto (Portaria MTE 671/2021).</div>
  </div>`;
}

// ---------------- folhas ----------------

function sheet(inner, cls = 'sheet') {
  return `<div class="scrim" data-act="close"></div><div class="${cls}"><div class="grab"></div>${inner}</div>`;
}

function overlayView() {
  const o = ui.overlay;
  if (!o) return '';
  const t = today();
  switch (o.kind) {
    case 'actions': {
      const sug = L.suggestType(byDate()[t]);
      const row = (act, ic, color, title, sub) => `<div class="action" data-act="${act}"><div class="badge" style="background:color-mix(in srgb, ${color} 16%, transparent);color:${color}">${icon(ic)}</div>
        <div class="grow"><div class="h3">${title}</div><div class="small muted">${sub}</div></div>${icon('right', 'color:var(--muted)')}</div>`;
      return sheet(`<div class="h2">Bater ponto</div><div style="color:${typeColor(sug)};font-weight:700">Próxima marcação: ${typeLabel(sug).toLowerCase()}</div>
        <div style="margin-top:12px">${row('camera', 'camera', 'var(--primary)', 'Fotografar comprovante', 'Lê data e hora e salva sozinho')}
        ${row('gallery', 'image', 'var(--entrada)', 'Galeria ou PDF', 'Foto ou PDF do comprovante (apps de ponto mandam PDF)')}
        ${row('manual', 'edit', 'var(--saida)', 'Digitar horário', 'Sem comprovante')}</div>`);
    }
    case 'edit': {
      const e = o.entry, isNew = !data.punches.some((p) => p.id === e.id);
      return sheet(`<div class="row"><div class="h2 grow">${isNew ? 'Novo ponto' : 'Editar ponto'}</div>${isNew ? '' : `<button class="icon-btn" data-act="deletePunch" style="color:var(--negative)">${icon('trash')}</button>`}</div>
        ${o.message ? `<div class="notice" style="background:color-mix(in srgb, var(--negative) 12%, transparent);color:var(--negative);margin-top:10px">${esc(o.message)}</div>` : ''}
        <div class="small muted" style="margin-top:12px">Entrada ou saída é definida pela ordem dos horários do dia.</div>
        <div class="grid2" style="margin-top:10px"><label class="field"><span>Data</span><input type="date" id="ed-date" value="${L.dateOf(e.dateTime)}"></label>
          <label class="field"><span>Hora</span><input type="time" id="ed-time" value="${hmOf(e.dateTime)}"></label></div>
        ${e.photoId && e.ocrBox ? `<div class="label" style="margin-top:12px">Horário no comprovante</div><canvas class="crop" data-crop="${e.photoId}" data-box="${esc(e.ocrBox)}" data-act="photo" data-photo="${e.photoId}" style="margin-top:6px"></canvas>` : ''}
        ${e.photoId ? `<button class="btn outline block" style="margin-top:12px" data-act="markPhoto">Marcar na foto onde estão a hora e a data</button>
        <img class="photo" data-photo-src="${e.photoId}" data-act="photo" data-photo="${e.photoId}" style="margin-top:10px" alt="Comprovante">` : ''}
        <button class="btn block" style="margin-top:16px;height:54px" data-act="savePunch">Salvar</button>`);
    }
    case 'appt': {
      const a = o.a, allDay = !a.start;
      const chips = (obj, key, act) => Object.entries(obj).map(([k, l]) => `<button class="chip ${a[key] === k ? 'on' : ''}" data-act="${act}" data-v="${k}">${l}</button>`).join('');
      return sheet(`<div class="row"><div class="h2 grow">${o.isNew ? 'Agendar' : 'Editar compromisso'}</div>${o.isNew ? '' : `<button class="icon-btn" data-act="apptDel" style="color:var(--negative)">${icon('trash')}</button>`}</div>
        <div class="chips" style="margin-top:10px">${chips(L.APPT_KINDS, 'kind', 'apptKind')}</div>
        <label class="field" style="margin-top:10px"><span>Descrição (opcional)</span><input id="ap-title" maxlength="60" value="${esc(a.title || '')}" placeholder="Ex.: Dentista" style="font-size:16px"></label>
        <div class="grid2" style="margin-top:10px"><label class="field"><span>Data</span><input type="date" id="ap-date" value="${a.date}"></label>
          <label class="check" style="align-self:center"><input type="checkbox" id="ap-allday" ${allDay ? 'checked' : ''} data-change="apAllDay"><div>Dia inteiro</div></label></div>
        ${allDay ? '' : `<div class="grid2" style="margin-top:10px"><label class="field"><span>Início</span><input type="time" id="ap-start" value="${a.start}"></label><label class="field"><span>Fim</span><input type="time" id="ap-end" value="${a.end}"></label></div>
        <div class="label" style="margin-top:10px">Deslocamento</div><div class="chips">${[0, 15, 30, 45, 60, 90].map((m) => `<button class="chip ${(a.travel || 0) === m ? 'on' : ''}" data-act="apTravel" data-v="${m}">${m ? m + ' min' : 'Nenhum'}</button>`).join('')}</div>`}
        <div class="label" style="margin-top:10px">No banco de horas</div><div class="chips">${chips(L.APPT_TREATMENTS, 'treatment', 'apTreat')}</div>
        <div class="xs muted" style="margin-top:4px">${a.treatment === 'ABONADA' ? 'Com atestado ou declaração: o horário não é cobrado.' : a.treatment === 'BANCO' ? 'As horas fora saem do banco (ou viram falta, se for o dia todo).' : 'Não mexe no banco de horas.'}</div>
        <div class="label" style="margin-top:10px">Lembrete (entra no arquivo do Calendário)</div><div class="chips">${(allDay ? [[-1, 'Não avisar'], [0, 'Na véspera']] : [[-1, 'Não avisar'], [15, '15 min'], [30, '30 min'], [60, '1 h'], [120, '2 h'], [1440, '1 dia']]).map(([v, l]) => `<button class="chip ${(allDay ? (a.remind >= 0) === (v >= 0) : a.remind === v) ? 'on' : ''}" data-act="apRemind" data-v="${v}">${l}</button>`).join('')}</div>
        ${!allDay && a.treatment === 'ABONADA' ? `<label class="check"><input type="checkbox" id="ap-doc" ${a.doc !== false ? 'checked' : ''}><div>Lembrar de pedir a declaração de comparecimento</div></label>` : ''}
        <button class="btn block" style="margin-top:14px;height:54px" data-act="apSave">Salvar</button>`);
    }
    case 'pay': {
      const p = data.settings.pay || {};
      const chip = (k, v, l) => `<button class="chip ${(p[k] ?? ui.payDefaults[k]) === v ? 'on' : ''}" data-act="payChip" data-k="${k}" data-v="${v}">${l}</button>`;
      return sheet(`<div class="h2">Valor das horas</div><div class="small muted">Fica só neste aparelho.</div>
        <div class="grid2" style="margin-top:10px"><label class="field"><span>Salário (R$)</span><input id="pay-salary" inputmode="decimal" value="${p.salary ? String(p.salary).replace('.', ',') : ''}" style="font-size:16px"></label>
          <label class="field"><span>Ou valor da hora (R$)</span><input id="pay-hourly" inputmode="decimal" value="${p.hourly ? String(p.hourly).replace('.', ',') : ''}" style="font-size:16px"></label></div>
        <div class="label" style="margin-top:10px">Horas por mês</div><div class="chips">${[[220, '220 h'], [200, '200 h'], [180, '180 h'], [150, '150 h']].map(([v, l]) => chip('hours', v, l)).join('')}</div>
        <div class="label" style="margin-top:10px">Hora extra</div><div class="chips">${[50, 60, 70, 75, 100].map((v) => chip('extraPct', v, v + '%')).join('')}</div>
        <div class="label" style="margin-top:10px">Domingos e feriados</div><div class="chips">${[100, 150].map((v) => chip('holidayPct', v, v + '%')).join('')}</div>
        <div class="label" style="margin-top:10px">Adicional noturno (22h às 5h)</div><div class="chips">${[0, 20, 25, 30, 50].map((v) => chip('nightPct', v, v ? v + '%' : 'Não tenho')).join('')}</div>
        <label class="check"><input type="checkbox" id="pay-reduced" ${p.nightReduced !== false ? 'checked' : ''}><div>Hora noturna reduzida (52min30s)</div></label>
        <label class="check"><input type="checkbox" id="pay-bank" ${p.toBank !== false ? 'checked' : ''}><div>Minhas extras vão para o banco</div></label>
        <button class="btn block" style="margin-top:12px;height:54px" data-act="paySave">Salvar</button>`);
    }
    case 'gig': {
      const s = o.s;
      const f = (id, l, v, mode = 'decimal') => `<label class="field"><span>${l}</span><input id="${id}" inputmode="${mode}" value="${v}" style="font-size:16px"></label>`;
      const n = (v) => (v ? String(v).replace('.', ',') : '');
      return sheet(`<div class="row"><div class="h2 grow">${o.isNew ? 'Lançar turno' : 'Editar turno'}</div>${o.isNew ? '' : `<button class="icon-btn" data-act="gigDel" style="color:var(--negative)">${icon('trash')}</button>`}</div>
        <div class="chips" style="margin-top:10px">${L.GIG_PLATFORMS.map((p) => `<button class="chip ${s.platform === p ? 'on' : ''}" data-act="gigSetPlat" data-v="${p}">${p}</button>`).join('')}</div>
        <label class="field" style="margin-top:10px"><span>Data</span><input type="date" id="g-date" value="${s.date}"></label>
        <div class="grid2" style="margin-top:10px">${f('g-earn', 'Ganhos R$', n(s.earnings))}${f('g-tips', 'Gorjetas R$', n(s.tips))}${f('g-online', 'Online (h:mm)', s.online ? `${Math.floor(s.online / 60)}:${String(s.online % 60).padStart(2, '0')}` : '', 'text')}${f('g-trips', 'Corridas', s.trips || '', 'numeric')}${f('g-km', 'Km rodados', n(s.km))}${f('g-exp', 'Gastos R$', n(s.expenses))}</div>
        <div class="xs muted" style="margin-top:6px">Gastos em branco: o app estima o combustível pelos km.</div>
        <button class="btn block" style="margin-top:12px;height:54px" data-act="gigSave">Salvar</button>`);
    }
    case 'gigCosts': {
      const c = data.settings.gigCosts || {};
      const v = (x) => (x ? String(x).replace('.', ',') : '');
      return sheet(`<div class="h2">Custos e meta</div>
        <label class="field" style="margin-top:10px"><span>Consumo (km por litro)</span><input id="gc-kml" inputmode="decimal" value="${v(c.kmPerLiter)}" style="font-size:16px"></label>
        <label class="field" style="margin-top:10px"><span>Combustível (R$/litro)</span><input id="gc-price" inputmode="decimal" value="${v(c.fuelPrice)}" style="font-size:16px"></label>
        <label class="field" style="margin-top:10px"><span>Meta líquida na semana (R$)</span><input id="gc-goal" inputmode="decimal" value="${v(c.goal)}" style="font-size:16px"></label>
        <button class="btn block" style="margin-top:12px;height:54px" data-act="gigCostsSave">Salvar</button>`);
    }
    case 'escala': {
      const sc = o.schedule, set = ESC.toEmployeeSettings(sc.days);
      const work = sc.days.filter((d) => d.shift);
      const first = work[0]?.shift;
      return sheet(`<div class="h2">Escala recebida</div>
        <div class="muted" style="margin-top:4px">${esc(sc.name)}${sc.place ? ` · ${esc(sc.place)}` : ''} · de ${dm(sc.days[0].date)} a ${dm(sc.days[sc.days.length - 1].date)}</div>
        <div class="card tight" style="margin-top:12px;background:var(--surface-2)">
          <div>${work.length} dias de trabalho${first ? `, das ${esc(first.start)} às ${esc(first.end)} (${first.break} min de intervalo)` : ''}.</div>
          <div class="small muted" style="margin-top:6px">Folgas em dias que normalmente são de trabalho: ${set.folgas.length ? set.folgas.map(dm).join(', ') : 'nenhuma'}.</div>
        </div>
        <div class="small" style="margin-top:12px">Ao importar, o app ajusta a jornada de cada dia da semana, marca as folgas da escala e os horários dos lembretes de ponto. Os seus pontos não mudam.</div>
        <div class="xs muted" style="margin-top:6px">A escala é só planejamento do seu empregador; não é registro de ponto.</div>
        ${/Android/i.test(navigator.userAgent) ? `<a class="btn tonal block" style="margin-top:16px;text-decoration:none" href="intent://escala/${o.code}#Intent;scheme=pontofoto;package=com.pontofoto.app;end">Tenho o app Android: abrir nele</a>` : ''}
        <button class="btn block" style="margin-top:12px;height:54px" data-act="importSchedule">Importar escala aqui</button>
        <button class="btn outline block" style="margin-top:8px" data-act="close">Agora não</button>`);
    }
    case 'name':
      return sheet(`<div class="h2">Seu nome</div><div class="small muted">Só o primeiro nome, para a saudação. Deixe vazio para não usar nome.</div>
        <label class="field" style="margin-top:12px"><span>Primeiro nome</span><input id="nm-name" maxlength="30" autocapitalize="words" enterkeyhint="done" value="${esc(data.settings.name || '')}" style="font-size:16px"></label>
        <div class="grid2" style="margin-top:12px"><button class="btn outline" data-act="close">Cancelar</button><button class="btn" data-act="saveName">Salvar</button></div>`);
    case 'mark': {
      const cur = data.marks[o.date]?.type || '';
      const opts = [['', 'Dia normal', 'Jornada normal do dia'], ['FOLGA', 'Folga', 'Sem jornada; trabalho vira crédito'], ['FERIAS', 'Férias', 'Sem jornada'],
        ['ATESTADO', 'Atestado', 'Sem jornada, não desconta'], ['FERIADO', 'Feriado', 'Sem jornada; trabalho vira crédito'], ['FALTA', 'Falta', 'Desconta a jornada do banco']];
      return sheet(`<div class="h2">Tipo do dia</div><div class="muted">${longLabel(o.date)}</div>
        ${opts.map(([v, l, d]) => `<div class="action" data-act="setMark" data-date="${o.date}" data-type="${v}"><div class="grow"><div class="h3">${l}</div><div class="small muted">${d}</div></div>${v === cur ? '<b style="color:var(--primary)">atual</b>' : ''}</div>`).join('')}`);
    }
    case 'day': {
      const d = o.date;
      const s = L.summarize(d, byDate()[d], data.marks[d], cfg(), nowDT());
      return sheet(`<div class="h2">${longLabel(d)}</div>
        <div class="row" style="gap:22px;margin-top:10px"><div><div class="label">Trabalhado</div><div class="h3">${dur(s.workedMinutes)}</div></div>
          <div><div class="label">Esperado</div><div class="h3">${dur(s.expectedMinutes)}</div></div>
          <div><div class="label">Saldo</div><div class="h3 ${signClass(s.balanceMinutes)}">${fmt(s.balanceMinutes)}</div></div></div>
        <div style="margin-top:10px">${s.punches.length ? timeline(s.punches) : '<div class="muted">Nenhuma marcação neste dia.</div>'}</div>
        ${s.incomplete ? '<div class="small neg">Há uma marcação sem par neste dia.</div>' : ''}
        ${isDoubleEligible(d, s.dayType) || s.holiday || s.doubled ? `<div style="margin-top:10px">${doubledToggle(d, s.doubled)}</div>` : ''}
        <div class="h3" style="margin-top:14px">Adicionar marcação neste dia</div>
        <div class="grid3" style="margin-top:8px"><button class="btn tonal" data-act="photoFor" data-date="${d}" data-cam="1">${icon('camera')} Foto</button>
          <button class="btn tonal" data-act="photoFor" data-date="${d}" data-cam="">${icon('image')} Galeria</button>
          <button class="btn tonal" data-act="newOn" data-date="${d}">${icon('edit')} Digitar</button></div>
        <div class="h3" style="margin-top:14px">Tipo do dia</div>
        <div class="chips" style="margin-top:8px">${[['', 'Normal'], ...Object.entries(L.DAY_TYPES).map(([k, v]) => [k, v.label])].map(([k, l]) =>
          `<button class="chip ${(s.dayType || '') === k ? 'on' : ''}" data-act="setMark" data-date="${d}" data-type="${k}" data-keep="1">${l}</button>`).join('')}</div>`);
    }
    case 'adjust': {
      const mode = o.mode || 'cp';
      return sheet(`<div class="h2">Editar saldo</div>
        <div class="chips" style="margin-top:12px">${[['cp', 'Saldo em data'], ['add', 'Somar'], ['sub', 'Tirar']].map(([k, l]) => `<button class="chip ${mode === k ? 'on' : ''}" data-act="adjMode" data-mode="${k}">${l}</button>`).join('')}</div>
        ${mode === 'cp' ? `<div class="small muted" style="margin-top:10px">Informe quanto era o banco num dia. A partir daí o app soma só os dias seguintes.</div>
          <label class="field" style="margin-top:10px"><span>Saldo até o dia</span><input type="date" id="adj-date" value="${L.addDays(t, -1)}" max="${L.addDays(t, -1)}"></label>` : ''}
        <label class="field" style="margin-top:10px"><span>${mode === 'cp' ? 'Saldo (ex: -43:37 ou 5:10)' : 'Horas (ex: 1:30)'}</span><input id="adj-value" inputmode="text" placeholder="${mode === 'cp' ? '-43:37' : '1:30'}"></label>
        ${mode !== 'cp' ? '<label class="field" style="margin-top:10px"><span>Observação (opcional)</span><input id="adj-reason" style="font-size:16px"></label>' : ''}
        <div id="adj-error" class="small neg" style="margin-top:6px"></div>
        <button class="btn block" style="margin-top:14px" data-act="saveAdjust" data-mode="${mode}">Salvar</button>`);
    }
    case 'goal': {
      const g = data.settings.goal;
      const end = `${t.slice(0, 7)}-${String(L.daysInMonth(t.slice(0, 7))).padStart(2, '0')}`;
      return sheet(`<div class="h2">${g ? 'Alterar meta' : 'Nova meta'}</div><div class="muted">Saldo atual: ${fmt(bankUntilYesterday())}</div>
        <label class="field" style="margin-top:12px"><span>Saldo que quero ter</span><input id="goal-target" value="${g ? fmt(g.targetMinutes).replace('+', '') : '0:00'}" data-input="goalPreview"></label>
        <div class="chips" style="margin-top:8px">${[['0:00', 'Zerar'], ['10:00', '+10h'], ['20:00', '+20h']].map(([v, l]) => `<button class="chip" data-act="goalPreset" data-v="${v}">${l}</button>`).join('')}</div>
        <label class="field" style="margin-top:10px"><span>Até o dia</span><input type="date" id="goal-deadline" value="${g ? g.deadline : end}" min="${t}" data-input="goalPreview"></label>
        <div id="goal-preview" class="h3" style="color:var(--primary);margin-top:12px"></div>
        <button class="btn block" style="margin-top:14px" data-act="saveGoal">Salvar</button>`);
    }
    case 'espSource':
      return sheet(`<div class="h2">Conferir espelho de ponto</div><div class="muted">O app lê o espelho da empresa e compara com o seu histórico.</div>
        <div style="margin-top:12px">
        <div class="action" data-act="espFiles"><div class="badge" style="background:color-mix(in srgb, var(--negative) 16%, transparent);color:var(--negative)">${icon('file')}</div><div class="grow"><div class="h3">PDF ou fotos</div><div class="small muted">PDF é o mais preciso. Pode escolher várias fotos.</div></div></div>
        <div class="action" data-act="espCamera"><div class="badge" style="background:var(--primary-soft);color:var(--primary)">${icon('camera')}</div><div class="grow"><div class="h3">Fotografar agora</div><div class="small muted">Foto reta, nítida e sem reflexo</div></div></div></div>`);
    case 'espReview': return espReviewView(o);
    case 'strategy': {
      const goal = data.settings.goal;
      if (!goal) return '';
      const bank = bankUntilYesterday(), c = cfg(), cur = strategy(), cs = o.custom;
      const sugg = P.suggestStrategies(goal, bank, t, c, data.marks);
      const pv = P.strategyPlan(goal, cs, bank, t, c, data.marks);
      const pvText = pv.reached ? 'Meta já atingida.' : pv.surplus ? `Passa da meta em ${dur(pv.surplus)}.` : pv.shortfall ? `Faltariam ${dur(pv.shortfall)}: aumente as horas ou ligue "dividir o resto".`
        : pv.perDay ? `+${dur(pv.perDay)} por dia útil, além do que escolheu acima.` : 'Isso já cobre a meta.';
      const step = (k, label, stepV) => `<div class="row" style="padding:4px 0"><div class="grow">${label}</div><div class="stepper">
        <button class="icon-btn" data-act="custStep" data-k="${k}" data-d="${-stepV}">${icon('minus')}</button><div class="val">${cs[k] ? dur(cs[k]) : 'não'}</div>
        <button class="icon-btn" data-act="custStep" data-k="${k}" data-d="${stepV}">${icon('plus')}</button></div></div>`;
      return sheet(`<div class="h2">Como chegar à meta</div><div class="muted">Escolha uma sugestão ou monte a sua combinação.</div>
        ${sugg.map((g, i) => `<div class="card tight tap" style="margin-top:10px" data-act="pickStrategy" data-i="${i}"><b style="${JSON.stringify(g.strat) === JSON.stringify(cur) ? 'color:var(--primary)' : ''}">${g.label}</b>
          <div class="small muted">${g.text}</div></div>`).join('')}
        <div class="h3" style="margin-top:16px">Montar a minha</div>
        ${step('sat', 'Sábados', 60)}${step('sun', 'Domingos (valem 100%)', 60)}${step('alt', 'Extra seg/qua/sex', 30)}
        <label class="check"><input type="checkbox" data-change="custEven" ${cs.even ? 'checked' : ''}><div>Dividir o resto nos dias úteis</div></label>
        <div class="h3" style="color:var(--primary)">${pvText}</div>
        <button class="btn block" style="margin-top:10px" data-act="useCustom">Usar esta combinação</button>`);
    }
    case 'addHoliday':
      return sheet(`<div class="h2">Novo feriado</div>
        <label class="field" style="margin-top:12px"><span>Nome</span><input id="hol-name" placeholder="Aniversário da cidade" style="font-size:16px"></label>
        <label class="field" style="margin-top:10px"><span>Data</span><input type="date" id="hol-date" value="${t}"></label>
        <label class="check"><input type="checkbox" id="hol-yearly" checked><div>Repete todo ano</div></label>
        <button class="btn block" style="margin-top:10px" data-act="saveHoliday">Salvar</button>`);
    case 'markPhoto': {
      const step = o.step;
      return `<div class="viewer mark"><div class="mark-top"><b>${step === 0 ? 'Arraste o dedo sobre a HORA do ponto' : 'Agora sobre a DATA (ou pule)'}</b>
        <div class="xs" style="opacity:.75">Só esse pedaço é lido. O app guarda a posição para achar sozinho nos próximos comprovantes.</div></div>
        <div class="mark-area"><img id="mark-img" data-photo-src="${o.back.entry.photoId}" alt="Comprovante"><canvas id="mark-cv"></canvas></div>
        <div class="row mark-bar"><button class="link" style="color:#fff" data-act="markCancel">Cancelar</button><div class="grow"></div>
        ${step === 0 ? `<button class="btn outline" data-act="markRedo" ${o.time ? '' : 'disabled'}>Refazer</button><button class="btn" data-act="markNext" ${o.time ? '' : 'disabled'}>Próximo</button>`
          : `<button class="btn outline" data-act="markRead" data-skip="1">Pular data</button><button class="btn" data-act="markRead" ${o.date ? '' : 'disabled'}>Ler</button>`}</div></div>`;
    }
    case 'photo': return `<div class="viewer"><img data-photo-src="${o.photoId}" data-act="zoom" alt="Comprovante"><button class="icon-btn close" data-act="close">${icon('x')}</button></div>`;
    default: return '';
  }
}

function espReviewView(o) {
  const { esp, days, appBank } = o;
  const issues = days.flatMap((d) => d.issues);
  const count = (k) => issues.filter((i) => i.kind === k).length;
  const readSet = new Set(esp.days.map((d) => d.date));
  const unread = [];
  if (esp.start) for (let d = esp.start; d <= esp.end; d = L.addDays(d, 1)) if (!readSet.has(d)) unread.push(d);
  const problems = days.filter((d) => d.issues.length);
  const ok = days.length - problems.length;
  const selected = issues.filter((i) => !i.info && i.selected).length + (o.matchBank ? 1 : 0);
  let n = 0;
  const check = (i, title, sub, color) => { const id = n++; o.index[id] = i;
    return `<label class="check"><input type="checkbox" data-change="espToggle" data-i="${id}" ${i.selected ? 'checked' : ''}><div><div style="font-weight:800;color:${color}">${title}</div><div class="small muted">${sub}</div></div></label>`; };
  o.index = {};
  const pill = (txt, color) => `<span class="pill" style="background:color-mix(in srgb, ${color} 16%, transparent);color:${color}"><span class="dot"></span>${txt}</span>`;
  return `<div class="full"><div class="row"><button class="icon-btn" data-act="close">${icon('x')}</button><div class="grow"><div class="h3">Conferência do espelho</div>
      ${esp.start ? `<div class="small muted">${dm(esp.start)} a ${dmy(esp.end)} · ${esp.days.length} dias lidos</div>` : ''}</div></div>
    <div class="stack" style="margin-top:14px">
      <div class="chips">${pill(`${ok} dias conferem`, 'var(--positive)')}${count('missing') ? pill(`${count('missing')} faltando no app`, 'var(--primary)') : ''}
        ${count('different') ? pill(`${count('different')} diferentes`, 'var(--saida)') : ''}${count('onlyInApp') ? pill(`${count('onlyInApp')} só no app`, 'var(--negative)') : ''}
        ${count('odd') ? pill(`${count('odd')} dias incompletos no espelho`, 'var(--negative)') : ''}</div>
      ${unread.length ? `<div class="notice" style="background:color-mix(in srgb, var(--saida) 14%, transparent)">${icon('info', 'color:var(--saida);flex:none')}<div>Não consegui ler ${unread.length} dia(s): ${unread.slice(0, 8).map(dm).join(', ')}${unread.length > 8 ? '…' : ''}. Esses dias não foram conferidos. O PDF ou uma foto mais nítida resolve.</div></div>` : ''}
      ${esp.companyBank !== null ? `<div class="card"><div class="h3">Banco de horas</div><div class="grid2" style="margin-top:8px">
        <div><div class="label">Na empresa</div><div class="big ${signClass(esp.companyBank)}">${fmt(esp.companyBank)}</div></div>
        <div><div class="label">No app (até ${dm(esp.end)})</div><div class="big ${signClass(appBank)}">${fmt(appBank)}</div></div></div>
        ${esp.companyBank !== appBank ? `<label class="check" style="margin-top:6px"><input type="checkbox" data-change="espBank" ${o.matchBank ? 'checked' : ''}><div><div style="font-weight:800;color:var(--primary)">Igualar meu banco ao da empresa</div><div class="small muted">O saldo da empresa vira o saldo inicial em ${dm(esp.end)}.</div></div></label>` : ''}</div>` : ''}
      ${problems.length ? problems.map((d) => `<div class="card"><div class="h3">${shortLabel(d.date)}</div>
        <div class="small muted">Espelho: ${d.espelho.marks.map(L.hm).join(' · ') || esc(d.espelho.note || 'sem marcações')}</div>
        <div class="small muted">App: ${d.app.map((p) => hmOf(p.dateTime)).join(' · ') || 'sem marcações'}</div>
        <div style="margin-top:6px">${d.issues.map((i) => {
          if (i.kind === 'missing') return check(i, `Inserir ${typeLabel(i.type).toLowerCase()} ${L.hm(i.time)}`, 'Está no espelho e falta no app', typeColor(i.type));
          if (i.kind === 'different') return check(i, `Corrigir ${hmOf(i.punch.dateTime)} → ${L.hm(i.time)}${i.punch.type !== i.type ? ` (${typeLabel(i.type).toLowerCase()})` : ''}`,
            i.punch.source === 'PHOTO' ? 'Atenção: no app veio de um comprovante; confira antes de mudar' : 'Horário diferente do espelho', typeColor(i.type));
          if (i.kind === 'onlyInApp') return check(i, `Excluir ${hmOf(i.punch.dateTime)} do app`, i.punch.source === 'PHOTO' ? 'Não está no espelho, mas você tem o comprovante: leve ao RH' : 'Não está no espelho da empresa', 'var(--negative)');
          if (i.kind === 'mark') return check(i, `Marcar o dia como ${L.DAY_TYPES[i.type].label}`, i.type === 'FALTA' ? 'Espelho: ausente. Desconta a jornada do banco.' : `Espelho: ${esc(d.espelho.note || '')}`, 'var(--primary)');
          return `<div class="notice" style="background:color-mix(in srgb, var(--negative) 12%, transparent)">${icon('info', 'color:var(--negative);flex:none')}<div>O espelho tem ${i.count} marcação(ões) neste dia: falta uma batida no registro da empresa.</div></div>`;
        }).join('')}</div></div>`).join('')
        : '<div class="notice" style="background:color-mix(in srgb, var(--positive) 14%, transparent)">Tudo confere! Os dias lidos batem com o seu histórico.</div>'}
    </div>
    <div class="bar"><button class="btn block" style="height:54px" data-act="espApply" ${selected ? '' : 'disabled'}>${selected ? `Aplicar ${selected} correç${selected === 1 ? 'ão' : 'ões'}` : 'Nada selecionado'}</button></div></div>`;
}

// ---------------- render ----------------

function tabbar() {
  const mode = data.settings.workMode || 'CLT';
  const tabs = mode === 'APPS' ? [['corridas', 'Corridas', 'wallet'], ['agenda', 'Agenda', 'flag'], ['ajustes', 'Ajustes', 'sliders']]
    : mode === 'AMBOS' ? [['hoje', 'Hoje', 'home'], ['historico', 'Histórico', 'calendar'], ['banco', 'Banco', 'wallet'], ['corridas', 'Corridas', 'flag'], ['ajustes', 'Ajustes', 'sliders']]
    : [['hoje', 'Hoje', 'home'], ['historico', 'Histórico', 'calendar'], ['banco', 'Banco', 'wallet'], ['agenda', 'Agenda', 'flag'], ['ajustes', 'Ajustes', 'sliders']];
  return `<nav class="tabbar"><div class="in">${tabs.map(([k, l, ic]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}"><span class="ic">${icon(ic)}</span>${l}</button>`).join('')}</div></nav>`;
}

function renderApp() {
  const views = { hoje: homeView, historico: historyView, banco: bankView, agenda: agendaView, ajustes: settingsView, corridas: gigView };
  $app.innerHTML = views[ui.tab]() + tabbar();
  hydrateImages($app);
}
function renderOverlay() {
  $ov.innerHTML = overlayView();
  hydrateImages($ov);
  if (ui.overlay?.kind === 'goal') goalPreview();
  if (ui.overlay?.kind === 'markPhoto') setupMark();
}
function render() { renderApp(); renderOverlay(); }

// fotos guardadas no aparelho -> <img>/<canvas>
const photoUrls = new Map();
async function photoUrl(id) {
  if (photoUrls.has(id)) return photoUrls.get(id);
  const blob = await S.getPhoto(id);
  const url = blob ? URL.createObjectURL(blob) : null;
  photoUrls.set(id, url);
  return url;
}
function hydrateImages(root) {
  root.querySelectorAll('img[data-photo-src]').forEach(async (img) => { const u = await photoUrl(img.dataset.photoSrc); if (u) img.src = u; });
  root.querySelectorAll('canvas[data-crop]').forEach(async (cv) => {
    const u = await photoUrl(cv.dataset.crop);
    if (!u) return;
    const img = new Image();
    img.onload = () => {
      const b = (cv.dataset.box || '').split(',').map(Number);
      const [l, t, r, bt] = b.length === 4 && b[2] > b[0] ? b : [0, 0, 1, 1];
      const sx = l * img.naturalWidth, sy = t * img.naturalHeight, sw = (r - l) * img.naturalWidth, sh = (bt - t) * img.naturalHeight;
      cv.width = Math.round(sw); cv.height = Math.round(sh);
      cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    };
    img.src = u;
  });
}

// ---------------- avisos ----------------

let toastTimer = null;
function toast(msg, action = null) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="grow">${esc(msg).replace(/\n/g, '<br>')}</div>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.remove(); action.run(); };
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), action ? 7000 : 3500);
}
function loading(msg) {
  let el = document.querySelector('.loading');
  if (!msg) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.className = 'loading'; document.body.appendChild(el); }
  el.innerHTML = `<div class="box"><div class="spin"></div><div><b>${esc(msg)}</b><div class="small muted">Isso leva alguns segundos</div></div></div>`;
}

// ---------------- ações ----------------

function openOverlay(o) { ui.overlay = o; renderOverlay(); }
function closeOverlay() { ui.overlay = null; renderOverlay(); }
function findPunch(id) { return data.punches.find((p) => p.id === id); }
function newDraft(date, source = 'MANUAL_PUNCH') {
  const isToday = date === today();
  const minutes = isToday ? L.minutesOf(nowDT()) : 8 * 60;
  return { id: S.newId(), dateTime: L.makeDT(date, minutes), type: L.suggestType(byDate()[date]), source, photoId: null };
}
function setMark(date, patch) {
  const cur = data.marks[date] || { date, type: null, note: null, doubled: false };
  const next = { ...cur, ...patch };
  if (!next.type && !next.doubled && !next.doubleMode && !next.note) delete data.marks[date]; else data.marks[date] = next;
  save();
}
/** Só o primeiro nome fica salvo; nome completo, CPF e empresa lidos da foto são descartados. */
function checkProfile(readName) {
  const st = data.settings;
  if (readName && !st.name) st.name = L.firstName(readName);
  return L.sameName(st.name, readName) ? null : 'O nome no comprovante parece ser de outra pessoa';
}

async function handlePhoto(file) {
  const fallbackDate = ui.photoDate || null;
  ui.photoDate = null;
  loading('Lendo o comprovante...');
  let res = null;
  try { res = await readReceipt(file, loading, data.settings.layout || null); } catch (e) { console.error(e); }
  const r = res?.receipt || {};
  if (!r.date && fallbackDate && r.time !== null && r.time !== undefined) r.date = fallbackDate;
  const readOk = !!(r.date && r.time !== null && r.time !== undefined);
  const review = !readOk || res?.uncertain;
  // Sem leitura não há como tarjar: nesse caso a foto não é guardada.
  // Sem "guardar foto", a foto tarjada fica só até conferir (para poder marcar na foto).
  const temp = data.settings.keepPhotos === false;
  const photoBlob = temp && !review ? null : res?.photoBlob;
  const photoId = photoBlob ? await S.putPhoto(photoBlob) : null;
  loading(null);
  if (readOk && !res?.uncertain) {
    const dt = L.makeDT(r.date, r.time);
    const otherDay = fallbackDate && fallbackDate !== r.date ? `O comprovante é de ${dm(r.date)}, não do dia escolhido: salvei na data do comprovante.` : null;
    if (r.nsr && data.punches.some((p) => p.nsr === r.nsr && p.dateTime === dt)) {
      await S.deletePhoto(photoId);
      toast('Esse comprovante já estava registrado');
      return;
    }
    const entry = { id: S.newId(), dateTime: dt, type: L.suggestType(byDate()[r.date]), source: 'PHOTO', note: null,
      nsr: r.nsr || null, ocrBox: res.box, photoId };
    data.punches.push(entry);
    if (res.lines?.length) linesById.set(entry.id, res.lines);
    const warn = checkProfile(r.employeeName);
    data.lastReadId = entry.id;
    save(); ui.tab = 'hoje'; render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`${typeLabel(entry.type)} ${dm(r.date)} às ${L.hm(r.time)} registrada${otherDay ? `\n${otherDay}` : ''}${warn ? `\n${warn}` : ''}`, {
      label: 'Desfazer', run: () => { data.punches = data.punches.filter((p) => p.id !== entry.id); data.lastReadId = null; S.deletePhoto(photoId); save(); render(); },
    });
  } else {
    const d = newDraft(r.date || fallbackDate || today(), 'PHOTO');
    if (readOk) d.dateTime = L.makeDT(r.date, r.time);
    d.photoId = photoId; d.nsr = r.nsr || null; d.tempPhoto = temp && !!photoId; d.ocrBox = res?.box || null;
    ui.draftLines = res?.lines || [];
    openOverlay({ kind: 'edit', entry: d, type: d.type, message: !res ? 'Não consegui usar o leitor de texto (na primeira vez é preciso internet). Digite o horário.'
      : readOk ? 'Confira o horário: ele está num lugar diferente do que costuma estar nos seus comprovantes.'
      : 'Não consegui ler a data e a hora. Confira, ou toque em "Marcar na foto" para mostrar onde elas ficam.' });
  }
}

// ---------- assistente de leitura ----------
const linesById = new Map(); // só em memória
function learn(lines, entry, corrected) {
  const m = ui.marked || {};
  data.settings.layout = L.learnLayout(data.settings.layout, lines || [], L.minutesOf(entry.dateTime), L.dateOf(entry.dateTime), corrected, m.time || null, m.date || null);
  ui.marked = null;
}

/** Desenho do retângulo na tela "Marcar na foto" (frações da imagem). */
function setupMark() {
  const img = document.getElementById('mark-img'), cv = document.getElementById('mark-cv');
  if (!img || !cv) return;
  const o = ui.overlay;
  const rectOf = () => img.getBoundingClientRect();
  const draw = (cur) => {
    const r = rectOf(); cv.width = r.width; cv.height = r.height;
    cv.style.left = `${img.offsetLeft}px`; cv.style.top = `${img.offsetTop}px`; cv.style.width = `${r.width}px`; cv.style.height = `${r.height}px`;
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height); ctx.lineWidth = 3;
    const box = (b, color) => { if (!b) return; ctx.strokeStyle = color; ctx.strokeRect(b.l * r.width, b.t * r.height, (b.r - b.l) * r.width, (b.b - b.t) * r.height); };
    box(o.time, '#C6F36B'); box(o.date, '#9D92FF'); box(cur, '#ffffff');
  };
  img.onload = () => draw(null);
  if (img.complete) draw(null);
  let start = null;
  const pt = (ev) => { const r = rectOf(); return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) }; };
  const toBox = (a, b) => ({ l: Math.min(a.x, b.x), t: Math.min(a.y, b.y), r: Math.max(a.x, b.x), b: Math.max(a.y, b.y) });
  cv.onpointerdown = (ev) => { start = pt(ev); cv.setPointerCapture(ev.pointerId); ev.preventDefault(); };
  cv.onpointermove = (ev) => { if (start) draw(toBox(start, pt(ev))); };
  cv.onpointerup = (ev) => {
    if (!start) return;
    const b = toBox(start, pt(ev)); start = null;
    if (b.r - b.l > 0.01 && b.b - b.t > 0.005) { if (o.step === 0) o.time = b; else o.date = b; }
    renderOverlay();
  };
}

/** Link de escala enviado pelo patrão (Ponto Foto Escalas): tudo vem no próprio link, sem servidor. */
function checkScheduleLink() {
  const m = /^#escala=([A-Za-z0-9_-]{10,6000})$/.exec(location.hash || '');
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try { openOverlay({ kind: 'escala', schedule: ESC.decodeSchedule(m[1]), code: m[1] }); }
  catch (e) { toast('Link de escala inválido'); }
}
window.addEventListener('hashchange', checkScheduleLink);

// leitura dos formulários abertos
function readAppt() {
  const a = ui.overlay.a;
  const g = (id) => document.getElementById(id);
  if (g('ap-title')) a.title = g('ap-title').value.trim().slice(0, 60);
  if (g('ap-date')) a.date = g('ap-date').value;
  if (g('ap-start') && a.start) { a.start = g('ap-start').value || a.start; a.end = g('ap-end').value || a.end; }
  if (g('ap-doc')) a.doc = g('ap-doc').checked;
  return a;
}
function readPay() {
  const p = data.settings.pay = data.settings.pay || {};
  const v = (id) => Number(String(document.getElementById(id)?.value || '').replace(/\./g, '').replace(',', '.')) || 0;
  if (document.getElementById('pay-salary')) { p.salary = v('pay-salary'); p.hourly = v('pay-hourly'); }
  if (document.getElementById('pay-reduced')) { p.nightReduced = document.getElementById('pay-reduced').checked; p.toBank = document.getElementById('pay-bank').checked; }
  for (const k of ['hours', 'extraPct', 'holidayPct', 'nightPct']) if (p[k] === undefined) p[k] = ui.payDefaults[k];
  return p;
}
function readGig() {
  const s = ui.overlay.s;
  const g = (id) => document.getElementById(id);
  const num = (id) => Number(String(g(id)?.value || '').replace(/\./g, '').replace(',', '.')) || 0;
  if (g('g-date')) {
    s.date = g('g-date').value || s.date;
    s.earnings = num('g-earn'); s.tips = num('g-tips'); s.km = num('g-km'); s.expenses = num('g-exp');
    s.trips = Math.round(num('g-trips'));
    const [h, m] = String(g('g-online').value || '').split(/[:hH]/).map((x) => Number(x) || 0); s.online = h * 60 + (m || 0);
  }
  return s;
}

// ---------- consultas e faltas agendadas ----------
function apptCard() {
  const list = L.upcomingAppointments(data.appointments, nowDT(), 90);
  const t = today();
  return `<div class="card"><div class="row"><div class="h3 grow">Consultas e faltas agendadas</div><button class="link" data-act="appt">+ Agendar</button></div>
    ${list.length ? list.slice(0, 8).map((a) => `<div class="row tap" style="padding:8px 0" data-act="appt" data-id="${a.id}"><div class="grow"><b>${a.date === t ? 'Hoje' : a.date === L.addDays(t, 1) ? 'Amanhã' : dm(a.date)} · ${esc(a.title || L.APPT_KINDS[a.kind])}</b>
      <div class="small muted">${esc(L.describeAppointment(a))}</div></div>${icon('right', 'color:var(--muted)')}</div>`).join('')
      : '<div class="small muted" style="margin-top:6px">Marque consultas, exames, faltas ou folgas com antecedência: o app ajusta a jornada do dia e entra nos lembretes do Calendário.</div>'}</div>`;
}

// ---------- extras em R$ ----------
function payCard() {
  const p = data.settings.pay;
  if (!L.payRate(p)) return `<div class="card"><div class="row"><div class="h3 grow">Extras do mês em R$</div><button class="link" data-act="pay">Configurar</button></div>
    <div class="small muted">Informe salário ou valor da hora para ver quanto valem extras, domingos, feriados e o adicional noturno.</div></div>`;
  const t = today(), c = cfg();
  const m = L.monthPay(L.monthDays(t.slice(0, 7), byDate(), data.marks, c, nowDT()), p, t);
  const row = (l, min, v) => `<div class="row small" style="padding:3px 0"><div class="grow">${l}</div><span class="muted">${dur(min)}</span><b>${L.money(v)}</b></div>`;
  return `<div class="card"><div class="row"><div class="h3 grow">Extras do mês em R$</div><button class="link" data-act="pay">Ajustar</button></div>
    <div class="h2" style="margin-top:4px">${L.money(m.total)}</div><div class="xs muted">${p.toBank !== false ? 'equivalente (vai para o banco)' : 'a receber (estimativa)'}</div>
    ${row(`Extras ${p.extraPct ?? 50}%`, m.extra, m.extraValue)}${row(`Domingos e feriados ${p.holidayPct ?? 100}%`, m.holiday, m.holidayValue)}${row(`Adicional noturno ${p.nightPct ?? 20}%`, m.night, m.nightValue)}
    <div class="xs muted" style="margin-top:6px">Valor da hora ${L.money(L.payRate(p))}. Sem descontos (INSS, IR) nem reflexos; confira no holerite.</div></div>`;
}

// ---------- corridas e entregas ----------
function gigView() {
  const t = today(), c = data.settings.gigCosts || {};
  const ws = L.addDays(t, -L.weekdayIndex(t));
  const w = L.gigSummary(data.gigs, ws, L.addDays(ws, 6), c);
  const mo = L.gigSummary(data.gigs, t.slice(0, 8) + '01', t, c);
  const on = data.settings.gigOnline;
  const plat = ui.gigPlatform || data.gigs[0]?.platform || 'Uber';
  const metric = (l, v) => `<div><div class="xs muted">${l}</div><b>${v}</b></div>`;
  return `<div class="stack">
    <div><div class="muted">Quanto rende cada hora nos apps</div><div class="h1">Corridas e entregas</div></div>
    <div class="card">${on ? `<div class="h3">Online no ${esc(on.platform)}</div><div class="h2">desde ${on.since.slice(11, 16)} · ${dur(Math.max(0, L.minutesOf(nowDT()) - L.minutesOf(on.since) + (L.dateOf(nowDT()) > L.dateOf(on.since) ? 1440 : 0)))}</div>
      <button class="btn block" style="margin-top:10px" data-act="gigOff">Encerrar turno e lançar ganhos</button>`
      : `<div class="h3">Começar um turno</div><div class="chips" style="margin-top:8px">${L.GIG_PLATFORMS.slice(0, 6).map((p) => `<button class="chip ${p === plat ? 'on' : ''}" data-act="gigPlat" data-v="${p}">${p}</button>`).join('')}</div>
      <button class="btn block" style="margin-top:10px" data-act="gigOn">Ficar online no ${esc(plat)}</button>`}
      <div class="grid2" style="margin-top:8px"><button class="btn outline" data-act="gig">Lançar</button><button class="btn outline" data-act="gigPrint">Ler print</button></div>
      <div class="xs muted" style="margin-top:6px">Os apps não liberam integração para motoristas e entregadores: mande o print do resumo de ganhos que o Ponto Foto lê.</div></div>
    <div class="card"><div class="row"><div class="h3 grow">Esta semana</div><button class="link" data-act="gigCosts">Custos e meta</button></div>
      <div class="h2">${L.money(w.net)}</div><div class="xs muted">líquido · ganhos ${L.money(w.earnings)} − gastos ${L.money(w.expenses)}</div>
      ${c.goal > 0 ? `<div style="height:8px;border-radius:4px;background:var(--surface-2);margin-top:8px"><div style="height:8px;border-radius:4px;background:var(--primary);width:${Math.min(100, Math.max(0, w.net / c.goal * 100)).toFixed(0)}%"></div></div><div class="xs" style="margin-top:4px">Meta ${L.money(c.goal)} · faltam ${L.money(Math.max(0, c.goal - w.net))}</div>` : ''}
      <div class="grid2" style="margin-top:10px;grid-template-columns:repeat(3,1fr)">${metric('Por hora', L.money(w.perHour))}${metric('Por km', L.money(w.perKm))}${metric('Por corrida', L.money(w.perTrip))}${metric('Online', dur(w.online))}${metric('Corridas', w.trips)}${metric('Km', Math.round(w.km))}</div>
      ${Object.keys(w.byPlatform).length > 1 ? Object.entries(w.byPlatform).sort((a, b) => b[1] - a[1]).map(([p, v]) => `<div class="row small"><div class="grow">${esc(p)}</div><b>${L.money(v)}</b></div>`).join('') : ''}
      ${!(c.kmPerLiter > 0 && c.fuelPrice > 0) ? '<div class="xs muted" style="margin-top:8px">Informe consumo e preço do combustível para estimar os gastos pelos km.</div>' : ''}</div>
    <div class="card tight small">No mês: ${L.money(mo.net)} líquido em ${dur(mo.online)} online (${L.money(mo.perHour)}/h)</div>
    <div class="h3">Turnos lançados</div>
    ${data.gigs.length ? [...data.gigs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40).map((s) => `<div class="card tight row tap" data-act="gig" data-id="${s.id}"><div class="grow"><b>${dm(s.date)} · ${esc(s.platform)}</b><div class="small muted">${dur(s.online || 0)} online · ${s.trips || 0} corridas · ${Math.round(s.km || 0)} km</div></div><b>${L.money((s.earnings || 0) + (s.tips || 0))}</b></div>`).join('') : '<div class="muted">Nenhum turno ainda.</div>'}
  </div>`;
}

function remSettings() {
  if (!data.settings.reminders) data.settings.reminders = { punchTimes: ['07:30', '12:00', '13:00', '17:30'], punchLead: 10, holidayDaysBefore: 30, punch: true, holidays: true, monthly: true };
  return data.settings.reminders;
}

/** Arquivo de calendário (.ics) com alarmes: o iPhone avisa mesmo com o app fechado. */
function buildIcs() {
  const r = remSettings(), c = cfg(), t = today();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const ics = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const d8 = (d) => d.replace(/-/g, '');
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ponto Foto//PT-BR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Ponto Foto'];
  const ev = (uid, lines) => out.push('BEGIN:VEVENT', `UID:${uid}@pontofoto`, `DTSTAMP:${stamp}`, ...lines, 'END:VEVENT');
  const alarm = (trigger, text) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${ics(text)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
  if (r.punch) {
    const days = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].filter((_, i) => c.weekly[i] > 0);
    const names = ['Entrada', 'Saída para o almoço', 'Volta do almoço', 'Saída'];
    const monday = L.addDays(t, -L.weekdayIndex(t));
    r.punchTimes.forEach((tm, i) => {
      if (!days.length || !tm) return;
      const [h, m] = tm.split(':');
      const exdates = [];
      for (const d of Object.keys(hmap())) if (d >= t && c.weekly[L.weekdayIndex(d)] > 0) exdates.push(`${d8(d)}T${h}${m}00`);
      ev(`ponto-${i}`, [`DTSTART;TZID=America/Sao_Paulo:${d8(monday)}T${h}${m}00`, 'DURATION:PT5M', `RRULE:FREQ=WEEKLY;BYDAY=${days.join(',')}`,
        ...(exdates.length ? [`EXDATE;TZID=America/Sao_Paulo:${exdates.join(',')}`] : []),
        `SUMMARY:${ics(`Ponto: ${names[i] || 'ponto'} (${tm})`)}`, `DESCRIPTION:${ics('Bata o ponto e fotografe o comprovante no Ponto Foto.')}`,
        ...alarm(`-PT${r.punchLead}M`, `Daqui a ${r.punchLead} min: ${names[i] || 'ponto'}`)]);
    });
  }
  const up = P.upcomingHolidays(t, 400, hmap(), c, data.marks);
  if (r.holidays) for (const h of up) {
    const tip = h.kind === 'prolongado' ? 'Fim de semana prolongado!' : h.kind === 'ponte' ? `Dá para emendar ${dm(h.bridge)} usando ${dur(h.bridgeMinutes)} do banco.` : '';
    ev(`feriado-${h.date}`, [`DTSTART;VALUE=DATE:${d8(h.date)}`, `DTEND;VALUE=DATE:${d8(L.addDays(h.date, 1))}`, 'TRANSP:TRANSPARENT',
      `SUMMARY:${ics(`Feriado: ${h.name}`)}`, `DESCRIPTION:${ics(tip)}`,
      ...alarm(r.holidayDaysBefore > 1 ? `-P${r.holidayDaysBefore - 1}DT15H` : '-PT15H', `Feriado em ${r.holidayDaysBefore} dia(s): ${h.name}. ${tip}`),
      ...alarm('-PT6H', `Amanhã é feriado: ${h.name}. Bom descanso!`)]);
  }
  if (r.monthly) for (let i = 1; i <= 12; i++) {
    const [y, m] = t.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + i, 1));
    const first = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const dig = P.monthDigest(first.slice(0, 7), first, c, data.marks, hmap());
    const txt = dig.holidays.length ? dig.holidays.map((h) => `${dm(h.date)} ${h.name} (${h.weekday}${h.kind === 'ponte' ? ', dá ponte' : h.kind === 'prolongado' ? ', feriadão' : ''})`).join(' · ')
      : 'Sem feriados este mês. Bom mês para acumular horas no banco!';
    ev(`mes-${first}`, [`DTSTART;TZID=America/Sao_Paulo:${d8(first)}T090000`, 'DURATION:PT10M', `SUMMARY:${ics('Seu mês no Ponto Foto')}`, `DESCRIPTION:${ics(txt)}`, ...alarm('PT0M', txt)]);
  }
  out.push('END:VCALENDAR');
  for (const a of L.upcomingAppointments(data.appointments, nowDT(), 120)) {
    const name = a.title || L.APPT_KINDS[a.kind] || 'Compromisso';
    if (a.start && a.end) {
      const lines = [`DTSTART:${d8(a.date)}T${a.start.replace(':', '')}00`, `DTEND:${d8(a.date)}T${a.end.replace(':', '')}00`, `SUMMARY:${ics(name)}`, `DESCRIPTION:${ics(L.describeAppointment(a))}`];
      if (a.remind >= 0) lines.push(...alarm(`-PT${(a.remind || 0) + (a.travel || 0)}M`, `${name} às ${a.start}${a.travel ? `: saia às ${L.leaveAt(a)}` : ''}`));
      ev(`appt-${a.id}`, lines);
      if (a.treatment === 'ABONADA' && a.doc !== false) ev(`appt-doc-${a.id}`, [`DTSTART:${d8(a.date)}T${a.end.replace(':', '')}00`, `DURATION:PT10M`, `SUMMARY:${ics('Pegou a declaração de comparecimento?')}`, ...alarm('PT10M', 'Peça a declaração para abonar as horas.')]);
    } else {
      const lines = [`DTSTART;VALUE=DATE:${d8(a.date)}`, `DTEND;VALUE=DATE:${d8(L.addDays(a.date, 1))}`, `SUMMARY:${ics(name)}`, `DESCRIPTION:${ics(L.describeAppointment(a))}`];
      if (a.remind >= 0) lines.push(...alarm('-PT6H', `Amanhã: ${name}`));
      ev(`appt-${a.id}`, lines);
    }
  }
  return out.join('\r\n');
}

async function shareOrDownload(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function goalPreview() {
  const el = document.getElementById('goal-preview');
  if (!el) return;
  const target = L.parseSignedHHmm(document.getElementById('goal-target').value);
  const deadline = document.getElementById('goal-deadline').value;
  if (target === null || !deadline) { el.textContent = ''; return; }
  const bank = bankUntilYesterday();
  const p = L.plan({ targetMinutes: target, deadline, startMinutes: bank }, bank, today(), cfg(), data.marks);
  el.textContent = p.reached ? 'Você já está nessa meta.' : p.workDaysLeft === 0 ? 'Não há dias de trabalho até essa data.'
    : `Faltam ${dur(p.missingMinutes)} em ${p.workDaysLeft} dias de trabalho: +${dur(p.extraPerDay)} por dia.`;
}

async function handleEspelho(files) {
  if (!files.length) return;
  try {
    loading('Lendo o espelho...');
    const esp = await readEspelho(files, loading);
    loading(null);
    if (!esp.days.length) { toast('Não encontrei a tabela do espelho. Tente o PDF ou uma foto mais reta e nítida.'); return; }
    const days = L.compareEspelho(esp, byDate(), data.marks);
    const appBank = L.bank(byDate(), data.marks, cfg(), data.adjustments, data.settings.checkpoint, L.addDays(esp.end, 1), esp.end);
    openOverlay({ kind: 'espReview', esp, days, appBank, matchBank: false, index: {} });
  } catch (e) {
    console.error(e); loading(null);
    toast('Não consegui ler o arquivo. Verifique a internet na primeira vez e tente de novo.');
  }
}

function applyEspelho(o) {
  let n = 0;
  for (const i of o.days.flatMap((d) => d.issues)) {
    if (i.info || !i.selected) continue;
    if (i.kind === 'missing') data.punches.push({ id: S.newId(), dateTime: L.makeDT(i.date, i.time), type: i.type, source: 'MANUAL_PUNCH', note: 'Inserido pela conferência do espelho', photoId: null });
    else if (i.kind === 'different') { const p = findPunch(i.punch.id); if (p) { p.dateTime = L.makeDT(i.date, i.time); p.type = i.type; } }
    else if (i.kind === 'onlyInApp') data.punches = data.punches.filter((p) => p.id !== i.punch.id);
    else if (i.kind === 'mark') setMark(i.date, { type: i.type });
    n++;
  }
  const company = o.esp.companyBank;
  if (o.matchBank && company !== null) {
    const cp = data.settings.checkpoint;
    if (!cp || cp.date <= o.esp.end) data.settings.checkpoint = { date: o.esp.end, minutes: company };
    else {
      const delta = company - L.bank(byDate(), data.marks, cfg(), data.adjustments, cp, L.addDays(o.esp.end, 1), o.esp.end);
      if (delta) data.adjustments.push({ id: S.newId(), referenceDate: o.esp.end, minutesDelta: delta, reason: 'Igualado ao banco do espelho da empresa' });
    }
    n++;
  }
  save(); ui.overlay = null; render();
  toast(`${n} correç${n === 1 ? 'ão aplicada' : 'ões aplicadas'}`);
}

const actions = {
  tab: (d) => { ui.tab = d.tab; renderApp(); window.scrollTo(0, 0); },
  close: () => closeOverlay(),
  punch: () => openOverlay({ kind: 'actions' }),
  camera: () => { closeOverlay(); document.getElementById('in-camera').click(); },
  gallery: () => { closeOverlay(); document.getElementById('in-gallery').click(); },
  manual: () => { const d = newDraft(today()); openOverlay({ kind: 'edit', entry: d, type: d.type }); },
  newOn: (d) => { const e = newDraft(d.date); openOverlay({ kind: 'edit', entry: e, type: e.type }); },
  edit: (d) => { const p = findPunch(d.id); if (p) openOverlay({ kind: 'edit', entry: { ...p }, type: p.type }); },
  editType: (d) => { ui.overlay.type = d.type; document.querySelectorAll('.toggle2 button').forEach((b) => { b.className = b.dataset.type === d.type ? (d.type === 'ENTRADA' ? 'on-e' : 'on-s') : ''; }); },
  savePunch: () => {
    const o = ui.overlay;
    const date = document.getElementById('ed-date').value, time = document.getElementById('ed-time').value;
    if (!date || !/^\d{2}:\d{2}/.test(time)) { toast('Data ou hora inválida'); return; }
    let entry = { ...o.entry, dateTime: `${date}T${time.slice(0, 5)}`, type: o.type };
    const old = findPunch(entry.id);
    if (entry.source === 'PHOTO') {
      if (!old && (ui.draftLines?.length || ui.marked)) learn(ui.draftLines, entry, true);
      else if (old && (old.dateTime !== entry.dateTime || ui.marked) && (linesById.get(old.id) || ui.marked)) learn(linesById.get(old.id), entry, true);
      ui.draftLines = null;
    }
    if (entry.tempPhoto) { S.deletePhoto(entry.photoId); entry = { ...entry, photoId: null, ocrBox: null, tempPhoto: false }; }
    const i = data.punches.findIndex((p) => p.id === entry.id);
    if (i >= 0) data.punches[i] = entry; else { data.punches.push(entry); checkProfile(entry); }
    if (data.lastReadId === entry.id) data.lastReadId = null;
    save(); ui.overlay = null; render();
  },
  deletePunch: () => {
    const e = ui.overlay.entry;
    data.punches = data.punches.filter((p) => p.id !== e.id);
    if (data.lastReadId === e.id) data.lastReadId = null;
    save(); ui.overlay = null; render();
    toast('Marcação excluída', { label: 'Desfazer', run: () => { data.punches.push(e); save(); render(); } });
  },
  confirmRead: () => {
    const p = findPunch(data.lastReadId);
    if (p && linesById.get(p.id)) learn(linesById.get(p.id), p, false);
    data.lastReadId = null; save(); renderApp();
  },
  markPhoto: () => {
    const o = ui.overlay;
    const date = document.getElementById('ed-date')?.value, time = document.getElementById('ed-time')?.value;
    if (date && /^\d{2}:\d{2}/.test(time || '')) o.entry = { ...o.entry, dateTime: `${date}T${time.slice(0, 5)}` };
    openOverlay({ kind: 'markPhoto', back: o, step: 0, time: null, date: null });
  },
  markNext: () => { ui.overlay.step = 1; renderOverlay(); },
  markRedo: () => { const o = ui.overlay; if (o.step === 0) o.time = null; else o.date = null; renderOverlay(); },
  markCancel: () => openOverlay(ui.overlay.back),
  markRead: async (d) => {
    const o = ui.overlay; const back = o.back;
    const dateBox = d.skip ? null : o.date;
    ui.marked = { time: o.time, date: dateBox };
    loading('Lendo o pedaço marcado...');
    let r = { time: null, date: null };
    try { r = await readMarked(await S.getPhoto(back.entry.photoId), o.time, dateBox, loading); } catch (e) { console.error(e); }
    loading(null);
    const cur = back.entry.dateTime;
    back.entry = { ...back.entry, dateTime: L.makeDT(r.date || L.dateOf(cur), r.time ?? L.minutesOf(cur)) };
    back.message = r.time === null ? 'Não consegui ler a hora marcada. Ajuste no campo Hora; a posição fica guardada mesmo assim.'
      : `Lido: ${L.hm(r.time)}${r.date ? ` · ${dm(r.date)}` : ''}. Confira e salve.`;
    openOverlay(back);
  },
  appt: (d) => {
    const ex = d.id && (data.appointments || []).find((a) => a.id === d.id);
    openOverlay({ kind: 'appt', isNew: !ex, a: ex ? { ...ex } : { id: S.newId(), date: L.addDays(today(), 1), start: '14:00', end: '15:00', kind: 'CONSULTA', title: '', treatment: 'ABONADA', remind: 60, travel: 30, doc: true } });
  },
  apptKind: (d) => { const a = readAppt(); a.kind = d.v; if (d.v === 'FALTA' || d.v === 'FOLGA_BANCO') { a.start = null; a.end = null; a.treatment = 'BANCO'; } else if (!a.start) { a.start = '14:00'; a.end = '15:00'; a.treatment = 'ABONADA'; } renderOverlay(); },
  apTravel: (d) => { readAppt().travel = Number(d.v); renderOverlay(); },
  apTreat: (d) => { readAppt().treatment = d.v; renderOverlay(); },
  apRemind: (d) => { readAppt().remind = Number(d.v); renderOverlay(); },
  apSave: () => {
    const a = readAppt();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) { toast('Data inválida'); return; }
    if (a.start && (!a.end || a.end <= a.start)) { toast('O fim precisa ser depois do início'); return; }
    data.appointments = (data.appointments || []).filter((x) => x.id !== a.id).concat([a]);
    save(); closeOverlay(); renderApp(); toast(`${a.title || L.APPT_KINDS[a.kind]} agendada para ${dm(a.date)}. Gere de novo os lembretes do Calendário em Ajustes.`);
  },
  apptDel: () => { const id = ui.overlay.a.id; data.appointments = (data.appointments || []).filter((x) => x.id !== id); save(); closeOverlay(); renderApp(); toast('Compromisso excluído'); },
  pay: () => { ui.payDefaults = { hours: 220, extraPct: 50, holidayPct: 100, nightPct: 20 }; openOverlay({ kind: 'pay' }); },
  payChip: (d) => { readPay(); data.settings.pay[d.k] = Number(d.v); renderOverlay(); },
  paySave: () => { readPay(); save(); closeOverlay(); renderApp(); toast('Valor das horas salvo'); },
  workMode: (d) => { data.settings.workMode = d.v; ui.tab = d.v === 'APPS' ? 'corridas' : 'ajustes'; save(); renderApp(); },
  gigPlat: (d) => { ui.gigPlatform = d.v; renderApp(); },
  gigOn: () => { data.settings.gigOnline = { platform: ui.gigPlatform || data.gigs[0]?.platform || 'Uber', since: nowDT().slice(0, 16) }; save(); renderApp(); },
  gigOff: () => {
    const on = data.settings.gigOnline; data.settings.gigOnline = null; save();
    const mins = Math.max(0, L.minutesOf(nowDT()) - L.minutesOf(on.since) + (L.dateOf(nowDT()) > L.dateOf(on.since) ? 1440 : 0));
    openOverlay({ kind: 'gig', isNew: true, s: { id: S.newId(), date: L.dateOf(on.since), platform: on.platform, online: mins } });
  },
  gig: (d) => {
    const ex = d.id && data.gigs.find((g) => g.id === d.id);
    openOverlay({ kind: 'gig', isNew: !ex, s: ex ? { ...ex } : { id: S.newId(), date: today(), platform: ui.gigPlatform || 'Uber' } });
  },
  gigSetPlat: (d) => { readGig().platform = d.v; renderOverlay(); },
  gigSave: () => { const s = readGig(); data.gigs = data.gigs.filter((g) => g.id !== s.id).concat([s]); save(); closeOverlay(); renderApp(); toast('Turno salvo'); },
  gigDel: () => { const id = ui.overlay.s.id; data.gigs = data.gigs.filter((g) => g.id !== id); save(); closeOverlay(); renderApp(); toast('Turno excluído'); },
  gigCosts: () => openOverlay({ kind: 'gigCosts' }),
  gigCostsSave: () => {
    const v = (id) => Number(String(document.getElementById(id).value || '').replace(/\./g, '').replace(',', '.')) || 0;
    data.settings.gigCosts = { kmPerLiter: v('gc-kml'), fuelPrice: v('gc-price'), goal: v('gc-goal') };
    save(); closeOverlay(); renderApp();
  },
  gigPrint: () => document.getElementById('in-print').click(),
  importSchedule: () => {
    const sc = ui.overlay.schedule, set = ESC.toEmployeeSettings(sc.days);
    data.settings.weekly = set.weekly;
    data.settings.lunch = set.lunch;
    set.folgas.forEach((d) => setMark(d, { type: 'FOLGA', note: 'Escala' }));
    if (set.punchTimes) remSettings().punchTimes = set.punchTimes;
    save(); closeOverlay(); renderApp(); toast('Escala importada');
  },
  resetLayout: () => { data.settings.layout = null; save(); renderApp(); toast('Padrão esquecido'); },
  photo: (d) => openOverlay({ kind: 'photo', photoId: d.photo }),
  zoom: (_, el) => el.classList.toggle('z'),
  markSheet: (d) => openOverlay({ kind: 'mark', date: d.date }),
  setMark: (d) => { setMark(d.date, { type: d.type || null }); if (d.keep) renderOverlay(); else ui.overlay = null; render(); },
  day: (d) => openOverlay({ kind: 'day', date: d.date }),
  month: (d) => { const ym = ui.month || today().slice(0, 7); const [y, m] = ym.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + Number(d.d), 1)); ui.month = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`; renderApp(); },
  exportCsv: (d) => {
    const days = L.monthDays(d.ym, byDate(), data.marks, cfg(), nowDT()).filter((x) => x.hasRecords);
    let csv = '﻿Data;Dia;Marcações;Trabalhado;Esperado;Saldo;Observação\n';
    for (const s of days) {
      csv += [dmy(s.date), WD_SHORT[L.weekdayIndex(s.date)], s.punches.map((p) => `${p.type === 'ENTRADA' ? 'E' : 'S'} ${hmOf(p.dateTime)}`).join(' '),
        fmt(s.workedMinutes).replace('+', ''), fmt(s.expectedMinutes).replace('+', ''), fmt(s.balanceMinutes),
        [s.dayType && L.DAY_TYPES[s.dayType].label, s.doubled && '100%', s.incomplete && 'Incompleto'].filter(Boolean).join(' · ')].join(';') + '\n';
    }
    shareOrDownload(new Blob([csv], { type: 'text/csv' }), `ponto_${d.ym}.csv`, `Ponto ${monthLabel(d.ym)}`);
  },
  adjust: () => openOverlay({ kind: 'adjust', mode: 'cp' }),
  adjMode: (d) => { ui.overlay.mode = d.mode; renderOverlay(); },
  saveAdjust: (d) => {
    const v = L.parseSignedHHmm(document.getElementById('adj-value').value);
    const err = document.getElementById('adj-error');
    if (v === null) { err.textContent = 'Digite as horas no formato 1:30 (ou -43:37).'; return; }
    if (d.mode === 'cp') {
      const date = document.getElementById('adj-date').value;
      if (!date || date >= today()) { err.textContent = 'Escolha uma data até ontem.'; return; }
      data.settings.checkpoint = { date, minutes: v };
      toast(`Saldo de ${fmt(v)} em ${dm(date)} definido`);
    } else {
      if (v === 0) { err.textContent = 'Digite um valor diferente de zero.'; return; }
      data.adjustments.push({ id: S.newId(), referenceDate: today(), minutesDelta: d.mode === 'add' ? Math.abs(v) : -Math.abs(v), reason: document.getElementById('adj-reason').value.trim() });
    }
    save(); ui.overlay = null; render();
  },
  delAdj: (d) => { data.adjustments = data.adjustments.filter((a) => a.id !== d.id); save(); renderApp(); },
  removeCheckpoint: () => { data.settings.checkpoint = null; save(); renderApp(); toast('Saldo inicial removido'); },
  goal: () => openOverlay({ kind: 'goal' }),
  goalPreset: (d) => { document.getElementById('goal-target').value = d.v; goalPreview(); },
  saveGoal: () => {
    const target = L.parseSignedHHmm(document.getElementById('goal-target').value);
    const deadline = document.getElementById('goal-deadline').value;
    if (target === null || !deadline || deadline < today()) { toast('Confira o saldo e a data da meta'); return; }
    const old = data.settings.goal, bank = bankUntilYesterday();
    data.settings.goal = { targetMinutes: target, deadline, startMinutes: old ? old.startMinutes : bank, createdOn: old ? old.createdOn : today() };
    save(); ui.overlay = null; render(); toast('Meta salva');
  },
  removeGoal: () => { data.settings.goal = null; save(); renderApp(); toast('Meta removida'); },
  espSource: () => openOverlay({ kind: 'espSource' }),
  espFiles: () => { closeOverlay(); document.getElementById('in-esp-files').click(); },
  espCamera: () => { closeOverlay(); document.getElementById('in-esp-camera').click(); },
  espApply: () => applyEspelho(ui.overlay),
  confirmHoliday: (d) => { confirmHoliday(d.key, !!d.yes); save(); renderApp(); toast(d.yes ? 'Marcado como feriado' : 'Dia de trabalho normal'); },
  photoFor: (d) => { ui.photoDate = d.date; closeOverlay(); document.getElementById(d.cam ? 'in-camera' : 'in-gallery').click(); },
  strategies: () => openOverlay({ kind: 'strategy', custom: { ...strategy() } }),
  pickStrategy: (d) => {
    const g = P.suggestStrategies(data.settings.goal, bankUntilYesterday(), today(), cfg(), data.marks)[Number(d.i)];
    data.settings.strategy = g.strat; save(); ui.overlay = null; render(); toast('Estratégia escolhida');
  },
  custStep: (d) => { const cs = ui.overlay.custom; cs[d.k] = Math.max(0, Math.min(600, (cs[d.k] || 0) + Number(d.d))); renderOverlay(); },
  useCustom: () => { data.settings.strategy = { ...ui.overlay.custom }; save(); ui.overlay = null; render(); toast('Estratégia escolhida'); },
  addHoliday: () => openOverlay({ kind: 'addHoliday' }),
  saveHoliday: () => {
    const name = document.getElementById('hol-name').value.trim(), date = document.getElementById('hol-date').value;
    if (!name || !date) { toast('Preencha o nome e a data'); return; }
    const spec = document.getElementById('hol-yearly').checked ? date.slice(5) : date;
    data.settings.customHolidays = [...(data.settings.customHolidays || []), { spec, name }];
    save(); ui.overlay = null; render(); toast('Feriado adicionado');
  },
  delHoliday: (d) => { data.settings.customHolidays = (data.settings.customHolidays || []).filter((h) => h.name !== d.name); save(); renderApp(); },
  toggleAllHolidays: () => { ui.showAllHolidays = !ui.showAllHolidays; renderApp(); },
  saveLocation: () => { data.settings.uf = document.getElementById('loc-uf').value; data.settings.city = document.getElementById('loc-city').value.trim(); save(); renderApp(); toast('Local salvo'); },
  remLead: (d) => { remSettings().punchLead = Number(d.v); save(); renderApp(); },
  remHolDays: (d) => { remSettings().holidayDaysBefore = Number(d.v); save(); renderApp(); },
  exportIcs: () => shareOrDownload(new Blob([buildIcs()], { type: 'text/calendar' }), 'pontofoto-lembretes.ics', 'Lembretes Ponto Foto'),
  editName: () => { openOverlay({ kind: 'name' }); const i = document.getElementById('nm-name'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } },
  saveName: () => { const n = L.firstName(document.getElementById('nm-name').value); data.settings.name = n; save(); closeOverlay(); renderApp(); toast(n ? 'Nome salvo' : 'Nome removido'); },
  saveProfile: () => { data.settings.name = L.firstName(document.getElementById('pf-name').value); save(); renderApp(); toast('Salvo'); },
  clearPhotos: async () => {
    if (!window.confirm('Apagar as fotos dos comprovantes? Os horários continuam.')) return;
    await S.clearPhotos(); data.punches.forEach((p) => { p.photoId = null; p.ocrBox = null; }); save(); renderApp(); toast('Fotos apagadas');
  },
  wipeAll: async () => {
    if (!window.confirm('Apagar todos os dados deste aparelho? Faça um backup antes, se quiser guardar.')) return;
    await S.wipeAll(); location.reload();
  },
  preset: (d) => { const presets = [[480, 480, 480, 480, 480, 0, 0], [528, 528, 528, 528, 528, 0, 0], [480, 480, 480, 480, 480, 240, 0], [440, 440, 440, 440, 440, 440, 0]]; data.settings.weekly = presets[Number(d.i)]; save(); renderApp(); },
  weekly: (d) => { const w = [...data.settings.weekly]; w[Number(d.i)] = Math.max(0, Math.min(16 * 60, w[Number(d.i)] + Number(d.d))); data.settings.weekly = w; save(); renderApp(); },
  tolerance: (d) => { data.settings.tolerance = Math.max(0, Math.min(60, data.settings.tolerance + 5 * Number(d.d))); save(); renderApp(); },
  lunch: (d) => { data.settings.lunch = Math.max(0, Math.min(180, data.settings.lunch + 15 * Number(d.d))); save(); renderApp(); },
  exportBackup: () => shareOrDownload(new Blob([JSON.stringify(S.toBackup(data), null, 2)], { type: 'application/json' }), `pontofoto_backup_${today()}.json`, 'Backup Ponto Foto'),
  importBackup: () => document.getElementById('in-backup').click(),
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.tagName === 'LABEL' || ev.target.tagName === 'INPUT') return;
  const fn = actions[el.dataset.act];
  if (fn) { ev.preventDefault(); fn(el.dataset, el); }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  const kind = el.dataset?.change;
  if (kind === 'doubled') { setMark(el.dataset.date, { doubled: false, doubleMode: el.checked ? 'ON' : 'OFF' }); renderApp(); if (ui.overlay?.kind === 'day') renderOverlay(); }
  else if (kind === 'weekly') { const [h, m] = (el.value || '00:00').split(':').map(Number); const w = [...data.settings.weekly]; w[Number(el.dataset.i)] = h * 60 + m; data.settings.weekly = w; save(); renderApp(); }
  else if (kind === 'espToggle') { const i = ui.overlay.index[el.dataset.i]; if (i) i.selected = el.checked; updateEspButton(); }
  else if (kind === 'espBank') { ui.overlay.matchBank = el.checked; updateEspButton(); }
  else if (kind === 'holiday' && el.dataset.key.startsWith('Municipal:')) { confirmHoliday(el.dataset.key, el.checked); save(); renderApp(); }
  else if (kind === 'holiday') {
    const set = new Set(data.settings.disabledHolidays || []);
    if (el.checked) set.delete(el.dataset.key); else set.add(el.dataset.key);
    data.settings.disabledHolidays = [...set]; save(); renderApp();
  }
  else if (kind === 'apAllDay') { const a = readAppt(); if (el.checked) { a.start = null; a.end = null; } else { a.start = '14:00'; a.end = '15:00'; } renderOverlay(); }
  else if (kind === 'keepPhotos') { data.settings.keepPhotos = el.checked; save(); renderApp(); }
  else if (kind === 'autoDouble') { data.settings.autoDouble = el.checked; save(); renderApp(); }
  else if (kind === 'optional') { data.settings.includeOptional = el.checked; save(); renderApp(); }
  else if (kind === 'rem') { remSettings()[el.dataset.k] = el.checked; save(); renderApp(); }
  else if (kind === 'remTime') { remSettings().punchTimes[Number(el.dataset.i)] = el.value || '00:00'; save(); }
  else if (kind === 'custEven') { ui.overlay.custom.even = el.checked; renderOverlay(); }
});
// Lista de municípios (IBGE), carregada só quando o campo de cidade é usado.
let citiesByUf = null;
async function fillCities() {
  const list = document.getElementById('loc-cities'); if (!list) return;
  if (!citiesByUf) {
    try {
      const txt = await (await fetch('data/cidades.txt')).text();
      citiesByUf = Object.fromEntries(txt.split('\n').filter((l) => l.includes('|')).map((l) => { const [uf, names] = l.split('|'); return [uf, names.split(';')]; }));
    } catch (e) { return; }
  }
  const uf = document.getElementById('loc-uf')?.value;
  const names = uf ? citiesByUf[uf] || [] : Object.values(citiesByUf).flat();
  list.innerHTML = names.slice(0, 900).map((n) => `<option value="${esc(n)}">`).join('');
}
document.addEventListener('focusin', (ev) => { if (ev.target.id === 'loc-city') fillCities(); });
document.addEventListener('change', (ev) => { if (ev.target.id === 'loc-uf') fillCities(); });
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  if (ev.target.id === 'nm-name') { ev.preventDefault(); actions.saveName(); }
  if (ev.target.id === 'pf-name') { ev.preventDefault(); actions.saveProfile(); }
});

document.addEventListener('input', (ev) => { if (ev.target.dataset?.input === 'goalPreview') goalPreview(); });

function updateEspButton() {
  const o = ui.overlay;
  const n = o.days.flatMap((d) => d.issues).filter((i) => !i.info && i.selected).length + (o.matchBank ? 1 : 0);
  const b = document.querySelector('[data-act="espApply"]');
  if (b) { b.disabled = !n; b.textContent = n ? `Aplicar ${n} correç${n === 1 ? 'ão' : 'ões'}` : 'Nada selecionado'; }
}

function bindFile(id, fn) {
  const input = document.getElementById(id);
  input.addEventListener('change', () => { const files = [...input.files]; input.value = ''; if (files.length) fn(files); });
}
bindFile('in-camera', (f) => handlePhoto(f[0]));
bindFile('in-gallery', (f) => handlePhoto(f[0]));
// escolheu "Foto/Galeria" num dia anterior e cancelou: volta ao normal
window.addEventListener('focus', () => setTimeout(() => { if (ui.photoDate && !document.querySelector('.loading')) ui.photoDate = null; }, 1500));
bindFile('in-esp-camera', handleEspelho);
bindFile('in-esp-files', handleEspelho);
bindFile('in-print', async (f) => {
  loading('Lendo o print...');
  let txt = '';
  try { txt = await readText(f[0], loading); } catch (e) { console.error(e); }
  loading(null);
  const g = L.parseEarnings(txt);
  openOverlay({ kind: 'gig', isNew: true, s: { id: S.newId(), date: today(), platform: g.platform || 'Uber', earnings: g.earnings || 0, tips: g.tips || 0, trips: g.trips || 0, online: g.online || 0, km: g.km || 0 } });
  if (!g.earnings) toast('Não achei o valor no print. Confira e preencha.');
});
bindFile('in-backup', async (f) => {
  try {
    if (f[0].size > 5 * 1024 * 1024) throw new Error('grande demais');
    const b = JSON.parse(await f[0].text());
    L.validateBackup(b);
    const added = S.mergeBackup(data, b);
    save(); render(); toast(`Backup restaurado (${added} marcações novas)`);
  } catch (e) { toast('Arquivo de backup inválido'); }
});

// ---------------- início ----------------

setInterval(() => {
  const el = document.querySelector('[data-clock]');
  if (el) { const n = new Date(); el.innerHTML = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}<small>:${String(n.getSeconds()).padStart(2, '0')}</small>`; }
}, 1000);
setInterval(() => { if (!document.activeElement || document.activeElement === document.body) renderApp(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderApp(); });

(async () => {
  data = await S.loadData();
  if (L.normalizeTypes(data.punches)) S.saveData(data);
  render();
  checkScheduleLink();
  S.requestPersistence();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();

window.__pontofoto = { get data() { return data; }, render, actions, handlePhoto, handleEspelho };
