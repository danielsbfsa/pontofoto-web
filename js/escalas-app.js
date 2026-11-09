// Página "Ponto Foto Escalas": o patrão monta a escala da equipe e manda um link para cada pessoa.
// Sem cadastro e sem servidor: os dados ficam neste navegador e a escala vai dentro do link.
import * as E from './escala.js';

const KEY = 'pontofoto-escalas';
const WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const nextMonday = () => { let d = today(); while (E.weekdayOf(d) !== 0) d = E.addDays(d, 1); return d; };
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const PATTERNS = { '5x2': '5x2 (seg a sex)', '6x1': '6x1', '12x36': '12x36', semana: 'Dias escolhidos' };

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.people)) return s; } catch (e) { /* sem dados */ }
  return { place: '', from: nextMonday(), weeks: 4, commerce: true, people: [] };
}
let st = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* navegador sem espaço */ } }

function daysOf(p) {
  const base = E.generate({ pattern: p.pattern, shift: p.shift, offDay: p.offDay, days: p.days, from: st.from, weeks: st.weeks, startOn: p.startOn || 0 });
  // trocas feitas à mão na grade
  return base.map((d) => (d.date in (p.overrides || {}) ? { date: d.date, shift: p.overrides[d.date] ? { ...p.shift } : null } : d));
}
function linkOf(p) {
  const code = E.encodeSchedule({ name: p.name, place: st.place, days: daysOf(p) });
  return new URL(`index.html#escala=${code}`, location.href).href;
}

function render() {
  const dates = Array.from({ length: st.weeks * 7 }, (_, i) => E.addDays(st.from, i));
  document.getElementById('app').innerHTML = `<div class="stack">
    <div><div class="h1">Ponto Foto Escalas</div><div class="muted">Monte a escala da equipe e mande para cada pessoa importar no app.</div></div>
    <div class="card small" style="background:var(--primary-soft)"><b>Ferramenta de planejamento.</b> Não registra ponto e não substitui o controle oficial de jornada:
      empresas com mais de 20 empregados precisam de registro de ponto (CLT art. 74 §2º), feito por sistema próprio para isso (Portaria MTE 671/2021).
      Os avisos abaixo ajudam a evitar erros comuns, mas não são consultoria jurídica. Tudo fica neste navegador; nada é enviado a servidor.</div>
    <div class="card"><div class="h3">Período</div>
      <div class="grid2" style="margin-top:10px">
        <label class="field"><span>Começa em</span><input type="date" id="from" value="${st.from}"></label>
        <label class="field"><span>Semanas</span><select id="weeks">${[2, 4, 6, 8].map((w) => `<option ${w === st.weeks ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
      </div>
      <label class="field" style="margin-top:10px"><span>Local (opcional, aparece para o funcionário)</span><input id="place" maxlength="40" value="${esc(st.place)}" placeholder="Ex.: Loja Centro"></label>
      <label class="check"><input type="checkbox" id="commerce" ${st.commerce ? 'checked' : ''}><div>Comércio (folga num domingo a cada 3 semanas)</div></label>
    </div>
    <div class="card"><div class="row"><div class="h3 grow">Equipe</div><button class="btn tonal" data-act="add">+ Pessoa</button></div>
      <div class="xs muted" style="margin-top:4px">Use só o primeiro nome ou um apelido.</div>
      ${st.people.map((p, i) => personCard(p, i)).join('') || '<div class="muted" style="margin-top:10px">Ninguém ainda.</div>'}
    </div>
    ${st.people.length ? `<div class="card"><div class="h3">Escala (toque num dia para trocar turno/folga)</div>
      <div class="grid-wrap" style="margin-top:10px"><table class="esc"><thead><tr><th></th>${dates.map((d) => `<th class="${E.weekdayOf(d) === 6 ? 'sun' : ''}">${WD[E.weekdayOf(d)]}<br>${dm(d)}</th>`).join('')}</tr></thead>
      <tbody>${st.people.map((p, i) => `<tr><td class="name">${esc(p.name)}</td>${daysOf(p).map((d) => `<td><button class="cell ${d.shift ? '' : 'off'}" data-act="toggle" data-i="${i}" data-date="${d.date}" aria-label="${esc(p.name)} ${dm(d.date)} ${d.shift ? 'turno' : 'folga'}">${d.shift ? d.shift.start.slice(0, 2) + 'h' : 'folga'}</button></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="center xs muted">Ponto Foto Escalas · <a class="link" href="index.html">abrir o app</a> · <a class="link" href="privacidade.html">privacidade</a></div>
  </div>`;
}

function personCard(p, i) {
  const days = daysOf(p);
  const warns = E.checks(days, { pattern: p.pattern, commerce: st.commerce });
  const total = days.filter((d) => d.shift).length;
  return `<div class="card tight" style="background:var(--surface-2);margin-top:12px">
    <div class="row"><input aria-label="Nome" data-p="${i}" data-k="name" value="${esc(p.name)}" maxlength="30" style="font-weight:800;font-size:17px;border:0;background:transparent;flex:1;min-width:0">
      <button class="link" style="color:var(--negative)" data-act="remove" data-i="${i}">Remover</button></div>
    <div class="chips" style="margin-top:8px">${Object.entries(PATTERNS).map(([k, l]) => `<button class="chip ${p.pattern === k ? 'on' : ''}" data-act="pattern" data-i="${i}" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="grid2" style="margin-top:10px">
      <label class="field"><span>Entrada</span><input type="time" data-p="${i}" data-k="start" value="${p.shift.start}"></label>
      <label class="field"><span>Saída</span><input type="time" data-p="${i}" data-k="end" value="${p.shift.end}"></label>
      <label class="field"><span>Intervalo (min)</span><input type="number" min="0" max="240" step="5" data-p="${i}" data-k="break" value="${p.shift.break}"></label>
      ${p.pattern === '6x1' ? `<label class="field"><span>Folga fixa</span><select data-p="${i}" data-k="offDay">${WD.map((w, j) => `<option value="${j}" ${j === p.offDay ? 'selected' : ''}>${w}</option>`).join('')}</select></label>` : ''}
      ${p.pattern === '12x36' ? `<label class="field"><span>Primeiro dia</span><select data-p="${i}" data-k="startOn"><option value="0" ${!p.startOn ? 'selected' : ''}>Trabalha</option><option value="1" ${p.startOn ? 'selected' : ''}>Folga</option></select></label>` : ''}
    </div>
    ${p.pattern === 'semana' ? `<div class="chips" style="margin-top:8px">${WD.map((w, j) => `<button class="chip ${p.days[j] ? 'on' : ''}" data-act="day" data-i="${i}" data-v="${j}">${w}</button>`).join('')}</div>` : ''}
    <div class="small muted" style="margin-top:8px">${total} dias de trabalho · ${E.shiftMinutes(p.shift) / 60 % 1 ? (E.shiftMinutes(p.shift) / 60).toFixed(1).replace('.', ',') : E.shiftMinutes(p.shift) / 60} h por turno</div>
    ${warns.map((w) => `<div class="warn">${esc(w)}</div>`).join('')}
    <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px"><button class="btn tonal" data-act="copy" data-i="${i}">Copiar link</button>
      <button class="btn outline" data-act="whats" data-i="${i}">Enviar no WhatsApp</button></div>
  </div>`;
}

const actions = {
  add: () => { st.people.push({ name: `Pessoa ${st.people.length + 1}`, pattern: '5x2', shift: { start: '08:00', end: '17:48', break: 60 }, offDay: 6, days: [true, true, true, true, true, false, false], startOn: 0, overrides: {} }); save(); render(); },
  remove: (d) => { if (confirm('Remover esta pessoa da escala?')) { st.people.splice(+d.i, 1); save(); render(); } },
  pattern: (d) => { const p = st.people[+d.i]; p.pattern = d.v; p.overrides = {}; if (d.v === '12x36') p.shift = { start: '07:00', end: '19:00', break: 60 }; save(); render(); },
  day: (d) => { const p = st.people[+d.i]; p.days[+d.v] = !p.days[+d.v]; save(); render(); },
  toggle: (d) => {
    const p = st.people[+d.i]; p.overrides = p.overrides || {};
    const cur = daysOf(p).find((x) => x.date === d.date);
    p.overrides[d.date] = !cur.shift; save(); render();
  },
  copy: async (d) => {
    const url = linkOf(st.people[+d.i]);
    try { await navigator.clipboard.writeText(url); alert('Link copiado. Mande para a pessoa abrir no celular.'); }
    catch (e) { prompt('Copie o link:', url); }
  },
  whats: (d) => {
    const p = st.people[+d.i];
    const text = `Oi, ${p.name}! Sua escala${st.place ? ` (${st.place})` : ''} de ${dm(st.from)} em diante. Abra no celular para importar no Ponto Foto: ${linkOf(p)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  actions[el.dataset.act]?.(el.dataset, el);
});
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.id === 'from') { if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) st.from = el.value; st.people.forEach((p) => { p.overrides = {}; }); }
  else if (el.id === 'weeks') st.weeks = Number(el.value);
  else if (el.id === 'place') st.place = el.value.slice(0, 40);
  else if (el.id === 'commerce') st.commerce = el.checked;
  else if (el.dataset.p !== undefined) {
    const p = st.people[+el.dataset.p], k = el.dataset.k;
    if (k === 'name') p.name = el.value.trim().slice(0, 30) || p.name;
    else if (k === 'start' || k === 'end') { if (/^\d{2}:\d{2}$/.test(el.value)) p.shift[k] = el.value; }
    else if (k === 'break') p.shift.break = Math.max(0, Math.min(240, Number(el.value) || 0));
    else if (k === 'offDay' || k === 'startOn') p[k] = Number(el.value);
  } else return;
  save(); render();
});
render();
