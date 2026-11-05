// Ponto Foto (web/iPhone): telas e fluxos. Mesmas regras do app Android (logic.js).
import * as L from './logic.js';
import * as S from './store.js';
import { readReceipt, readEspelho, fileToCanvas, canvasToBlob } from './ocr.js';

const $app = document.getElementById('app');
const $ov = document.getElementById('overlay');
let data = S.emptyData();
const ui = { tab: 'hoje', overlay: null, month: null };

// ---------------- utilidades ----------------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cfg = () => ({ weekly: data.settings.weekly, tolerance: data.settings.tolerance, lunch: data.settings.lunch });
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
const isDoubleEligible = (date, type) => L.weekdayIndex(date) === 6 || type === 'FERIADO';
const bankUntilYesterday = () => L.bank(byDate(), data.marks, cfg(), data.adjustments, data.settings.checkpoint, today());

function save() { S.saveData(data); }

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
  const body = plan.reached ? '<div class="big pos">Meta atingida!</div>'
    : plan.expired ? `<div class="h3 neg">Prazo vencido · faltaram ${dur(plan.missingMinutes)}</div>`
    : `<div class="big" style="color:var(--primary)">Faça +${dur(plan.extraPerDay)} por dia</div>
       <div class="small muted">Faltam ${dur(plan.missingMinutes)} em ${plan.workDaysLeft} dia(s) de trabalho, contando hoje</div>`;
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
  const extraGoal = plan && !plan.reached && !plan.expired && s.expectedMinutes > 0 ? plan.extraPerDay : 0;
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
    <div class="row"><div class="grow"><div class="muted">${greeting(now)}${name ? `, ${esc(name)}` : ''}</div>
      <div class="h2">${longLabel(t)}</div></div>
      <button class="avatar" data-act="tab" data-tab="ajustes">${esc(initials(data.settings.name || 'Ponto Foto'))}</button></div>

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

    ${isDoubleEligible(t, s.dayType) || s.doubled ? doubledToggle(t, s.doubled) : ''}

    <div class="card"><div class="row"><div class="h3 grow">Marcações de hoje</div><button class="link" data-act="markSheet" data-date="${t}">Marcar dia</button></div>
      ${s.punches.length ? timeline(s.punches) + (s.incomplete ? '<div class="small neg" style="margin-top:6px">Há uma marcação sem par. Confira entradas e saídas.</div>' : '')
        : '<div class="center muted" style="padding:20px 0">Nenhum ponto hoje.<br>Bata o ponto no relógio e fotografe o comprovante.</div>'}</div>
  </div>`;
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
    <div class="card">${goal && plan ? goalBlock(goal, plan) + `<div class="row" style="margin-top:8px"><button class="link" data-act="goal">Alterar meta</button><button class="link neg" data-act="removeGoal">Remover</button></div>`
      : `<div class="h3">Meta de banco de horas</div><div class="small muted" style="margin-top:4px">Defina o saldo que quer ter e até quando. O app calcula quanto de extra fazer por dia e mostra o horário de saída para chegar lá.</div>
         <button class="btn" style="margin-top:12px" data-act="goal">${icon('flag')} Criar meta</button>`}</div>
    ${cp ? `<div class="card tight row"><div class="grow"><div class="label">Saldo inicial</div>
      <div><span class="h3 ${signClass(cp.minutes)}">${fmt(cp.minutes)}</span> <span class="muted">em ${dmy(cp.date)}</span></div>
      <div class="xs muted">Os dias até essa data não entram mais na conta.</div></div><button class="icon-btn" data-act="removeCheckpoint">${icon('trash')}</button></div>` : ''}
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

function settingsView() {
  const st = data.settings;
  const presets = [['8h seg–sex', [480, 480, 480, 480, 480, 0, 0]], ['8h48 seg–sex', [528, 528, 528, 528, 528, 0, 0]], ['8h + sáb 4h', [480, 480, 480, 480, 480, 240, 0]], ['7h20 seg–sáb', [440, 440, 440, 440, 440, 440, 0]]];
  const stepper = (act, val, label) => `<div class="stepper"><button class="icon-btn" data-act="${act}" data-d="-1">${icon('minus')}</button><div class="val grow">${label}</div><button class="icon-btn" data-act="${act}" data-d="1">${icon('plus')}</button></div>`;
  return `<div class="stack">
    <div class="h1">Ajustes</div>
    <div class="card"><div class="row"><div class="avatar" style="width:52px;height:52px">${esc(initials(st.name || '?'))}</div>
      <div><div class="h3">Perfil</div><div class="small muted">Preenchido pelo primeiro comprovante</div></div></div>
      <label class="field" style="margin-top:12px"><span>Nome</span><input id="pf-name" value="${esc(st.name)}" style="font-size:16px"></label>
      <label class="field" style="margin-top:8px"><span>Empresa</span><input id="pf-company" value="${esc(st.company)}" style="font-size:16px"></label>
      <div style="text-align:right"><button class="link" data-act="saveProfile">Salvar perfil</button></div></div>
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
    <div class="card"><div class="h3">Backup</div><div class="small muted">Mesmo formato do app Android: dá para levar os dados de um para o outro.</div>
      <div class="grid2" style="margin-top:12px"><button class="btn outline" data-act="exportBackup">Exportar</button><button class="btn outline" data-act="importBackup">Importar</button></div></div>
    <div class="card"><div class="h3">Instalar no iPhone</div><div class="small muted" style="margin-top:4px">No Safari, toque em <b>Compartilhar</b> (quadrado com seta) → <b>Adicionar à Tela de Início</b>. O app abre em tela cheia e funciona sem internet. Na primeira leitura de foto ele baixa o leitor de texto (alguns MB).</div></div>
    <div class="center xs muted">Ponto Foto web 1.0 · seus dados ficam só neste aparelho.<br>App de controle pessoal, sem valor legal de registro.</div>
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
        ${row('gallery', 'image', 'var(--entrada)', 'Escolher da galeria', 'Foto do comprovante que você já tirou')}
        ${row('manual', 'edit', 'var(--saida)', 'Digitar horário', 'Sem comprovante')}</div>`);
    }
    case 'edit': {
      const e = o.entry, isNew = !data.punches.some((p) => p.id === e.id);
      return sheet(`<div class="row"><div class="h2 grow">${isNew ? 'Novo ponto' : 'Editar ponto'}</div>${isNew ? '' : `<button class="icon-btn" data-act="deletePunch" style="color:var(--negative)">${icon('trash')}</button>`}</div>
        ${o.message ? `<div class="notice" style="background:color-mix(in srgb, var(--negative) 12%, transparent);color:var(--negative);margin-top:10px">${esc(o.message)}</div>` : ''}
        <div class="toggle2" style="margin-top:14px"><button data-act="editType" data-type="ENTRADA" class="${o.type === 'ENTRADA' ? 'on-e' : ''}">Entrada</button>
          <button data-act="editType" data-type="SAIDA" class="${o.type === 'SAIDA' ? 'on-s' : ''}">Saída</button></div>
        <div class="grid2" style="margin-top:10px"><label class="field"><span>Data</span><input type="date" id="ed-date" value="${L.dateOf(e.dateTime)}"></label>
          <label class="field"><span>Hora</span><input type="time" id="ed-time" value="${hmOf(e.dateTime)}"></label></div>
        ${e.photoId && e.ocrBox ? `<div class="label" style="margin-top:12px">Horário no comprovante</div><canvas class="crop" data-crop="${e.photoId}" data-box="${esc(e.ocrBox)}" data-act="photo" data-photo="${e.photoId}" style="margin-top:6px"></canvas>` : ''}
        ${e.photoId ? `<img class="photo" data-photo-src="${e.photoId}" data-act="photo" data-photo="${e.photoId}" style="margin-top:10px" alt="Comprovante">` : ''}
        ${[e.employeeName, e.companyName].filter(Boolean).length ? `<div class="xs muted" style="margin-top:6px">${esc([e.employeeName, e.companyName].filter(Boolean).join(' · '))}</div>` : ''}
        <button class="btn block" style="margin-top:16px;height:54px" data-act="savePunch">Salvar</button>`);
    }
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
        ${isDoubleEligible(d, s.dayType) || s.doubled ? `<div style="margin-top:10px">${doubledToggle(d, s.doubled)}</div>` : ''}
        <button class="btn tonal block" style="margin-top:12px" data-act="newOn" data-date="${d}">${icon('plus')} Adicionar marcação</button>
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
  const tabs = [['hoje', 'Hoje', 'home'], ['historico', 'Histórico', 'calendar'], ['banco', 'Banco', 'wallet'], ['ajustes', 'Ajustes', 'sliders']];
  return `<nav class="tabbar"><div class="in">${tabs.map(([k, l, ic]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}"><span class="ic">${icon(ic)}</span>${l}</button>`).join('')}</div></nav>`;
}

function renderApp() {
  const views = { hoje: homeView, historico: historyView, banco: bankView, ajustes: settingsView };
  $app.innerHTML = views[ui.tab]() + tabbar();
  hydrateImages($app);
}
function renderOverlay() {
  $ov.innerHTML = overlayView();
  hydrateImages($ov);
  if (ui.overlay?.kind === 'goal') goalPreview();
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
  if (!next.type && !next.doubled && !next.note) delete data.marks[date]; else data.marks[date] = next;
  save();
}
function checkProfile(entry) {
  const st = data.settings;
  if (entry.employeeName && !st.name) st.name = entry.employeeName;
  if (entry.companyName && !st.company) st.company = entry.companyName;
  return L.sameName(st.name, entry.employeeName) ? null : 'Nome no comprovante diferente do seu cadastro';
}

async function handlePhoto(file) {
  loading('Lendo o comprovante...');
  let res = null;
  try { res = await readReceipt(file, loading); } catch (e) { console.error(e); }
  let photoBlob = res?.photoBlob;
  if (!photoBlob) { try { photoBlob = await canvasToBlob(await fileToCanvas(file)); } catch (e) { /* sem foto */ } }
  const photoId = photoBlob ? await S.putPhoto(photoBlob) : null;
  loading(null);
  const r = res?.receipt || {};
  if (r.date && r.time !== null && r.time !== undefined) {
    const dt = L.makeDT(r.date, r.time);
    if (r.nsr && data.punches.some((p) => p.nsr === r.nsr && p.dateTime === dt)) {
      await S.deletePhoto(photoId);
      toast('Esse comprovante já estava registrado');
      return;
    }
    const entry = { id: S.newId(), dateTime: dt, type: L.suggestType(byDate()[r.date]), source: 'PHOTO', note: null,
      employeeName: r.employeeName || null, companyName: r.company || null, nsr: r.nsr || null, ocrBox: res.box, photoId };
    data.punches.push(entry);
    const warn = checkProfile(entry);
    data.lastReadId = entry.id;
    save(); ui.tab = 'hoje'; render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`${typeLabel(entry.type)} ${dm(r.date)} às ${L.hm(r.time)} registrada${warn ? `\n${warn}` : ''}`, {
      label: 'Desfazer', run: () => { data.punches = data.punches.filter((p) => p.id !== entry.id); data.lastReadId = null; S.deletePhoto(photoId); save(); render(); },
    });
  } else {
    const d = newDraft(r.date || today(), 'PHOTO');
    d.photoId = photoId; d.employeeName = r.employeeName || null; d.companyName = r.company || null; d.nsr = r.nsr || null;
    openOverlay({ kind: 'edit', entry: d, type: d.type, message: res ? 'Não consegui ler a data e a hora da foto. Confira e salve.'
      : 'Não consegui usar o leitor de texto (na primeira vez é preciso internet). Digite o horário.' });
  }
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
    const entry = { ...o.entry, dateTime: `${date}T${time.slice(0, 5)}`, type: o.type };
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
  confirmRead: () => { data.lastReadId = null; save(); renderApp(); },
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
  saveProfile: () => { data.settings.name = document.getElementById('pf-name').value.trim(); data.settings.company = document.getElementById('pf-company').value.trim(); save(); renderApp(); toast('Perfil salvo'); },
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
  if (kind === 'doubled') { setMark(el.dataset.date, { doubled: el.checked }); renderApp(); if (ui.overlay?.kind === 'day') renderOverlay(); }
  else if (kind === 'weekly') { const [h, m] = (el.value || '00:00').split(':').map(Number); const w = [...data.settings.weekly]; w[Number(el.dataset.i)] = h * 60 + m; data.settings.weekly = w; save(); renderApp(); }
  else if (kind === 'espToggle') { const i = ui.overlay.index[el.dataset.i]; if (i) i.selected = el.checked; updateEspButton(); }
  else if (kind === 'espBank') { ui.overlay.matchBank = el.checked; updateEspButton(); }
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
bindFile('in-esp-camera', handleEspelho);
bindFile('in-esp-files', handleEspelho);
bindFile('in-backup', async (f) => {
  try {
    const added = S.mergeBackup(data, JSON.parse(await f[0].text()));
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
  render();
  S.requestPersistence();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();

window.__pontofoto = { get data() { return data; }, render, actions, handlePhoto, handleEspelho };
