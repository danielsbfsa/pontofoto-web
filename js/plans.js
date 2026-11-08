// Feriados, estratégias para a meta, emendas, ideias de férias, plano anual e mensagens do dia.
// Mesmas regras do app Android (Plans.kt).
import { addDays, weekdayIndex, expectedFor, owedFor as L_owedFor, bank, DAY_TYPES, pad2, formatDuration as dur } from './logic.js';

// ---------------- feriados ----------------

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad2(month)}-${pad2(day)}`;
}

const NATIONAL = [
  ['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'], ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'], ['11-20', 'Consciência Negra'], ['12-25', 'Natal'],
];

/** Feriados estaduais (fonte: lista publicada de 2026; confira e desligue o que não valer). E±n = dias após a Páscoa. */
export const STATE_HOLIDAYS = {
  AC: [['01-23', 'Dia do Evangélico'], ['06-15', 'Aniversário do Acre'], ['09-05', 'Dia da Amazônia'], ['11-17', 'Tratado de Petrópolis']],
  AL: [['06-24', 'São João'], ['06-29', 'São Pedro'], ['09-16', 'Emancipação de Alagoas'], ['11-30', 'Dia do Evangélico']],
  AP: [['03-19', 'Dia de São José'], ['09-13', 'Criação do Território do Amapá']],
  AM: [['09-05', 'Elevação do Amazonas a Província']],
  BA: [['07-02', 'Independência da Bahia']],
  CE: [['03-25', 'Data Magna do Ceará']],
  DF: [['11-30', 'Dia do Evangélico']],
  ES: [], GO: [], MT: [],
  MA: [['07-28', 'Adesão do Maranhão à Independência']],
  MS: [['10-11', 'Criação do Mato Grosso do Sul']],
  MG: [],
  PA: [['08-15', 'Adesão do Pará à Independência']],
  PB: [['08-05', 'Fundação da Paraíba']],
  PR: [['12-19', 'Emancipação do Paraná']],
  PE: [['03-06', 'Revolução Pernambucana']],
  PI: [['10-19', 'Dia do Piauí']],
  RJ: [['04-23', 'Dia de São Jorge'], ['E-47', 'Carnaval (terça)']],
  RN: [['10-03', 'Mártires de Cunhaú e Uruaçu']],
  RS: [['09-20', 'Revolução Farroupilha']],
  RO: [['01-04', 'Criação de Rondônia']],
  RR: [['10-05', 'Criação de Roraima']],
  SC: [['08-11', 'Data Magna de Santa Catarina']],
  SP: [['07-09', 'Revolução Constitucionalista']],
  SE: [['07-08', 'Emancipação de Sergipe']],
  TO: [['09-08', 'Nossa Senhora da Natividade'], ['10-05', 'Criação do Tocantins']],
};
export const UFS = Object.keys(STATE_HOLIDAYS).sort();

/** Feriados municipais conhecidos. Outras cidades: o usuário adiciona os seus. */
export const CITY_HOLIDAYS = {
  'BA|feira de santana': [['07-26', 'Senhora Sant\'Ana (padroeira)'], ['09-18', 'Aniversário de Feira de Santana']],
};
const normCity = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}+/gu, '').trim();
export function cityKnown(uf, city) { return !!CITY_HOLIDAYS[`${uf}|${normCity(city)}`]; }

function resolve(year, spec) {
  if (spec.startsWith('E')) return addDays(easter(year), Number(spec.slice(1)));
  return `${year}-${spec}`;
}

/**
 * Feriados do ano. s = {uf, city, customHolidays:[{spec:'MM-DD'|'AAAA-MM-DD', name}], disabledHolidays:[key], includeOptional}
 * Cada item: {date, name, scope: 'Nacional'|'Estadual'|'Municipal'|'Pessoal'|'Facultativo', key, enabled}
 */
export function holidaysForYear(year, s = {}) {
  const out = [];
  const add = (spec, name, scope) => {
    const date = resolve(year, spec);
    const key = `${scope}:${name}`;
    out.push({ date, name, scope, key, enabled: !(s.disabledHolidays || []).includes(key) });
  };
  NATIONAL.forEach(([d, n]) => add(d, n, 'Nacional'));
  add('E-2', 'Sexta-feira Santa', 'Nacional');
  (STATE_HOLIDAYS[s.uf] || []).forEach(([d, n]) => add(d, n, 'Estadual'));
  // Municipais: só valem depois que o usuário confirma que a empresa folga (nem toda empresa adere).
  (CITY_HOLIDAYS[`${s.uf}|${normCity(s.city)}`] || []).forEach(([d, n]) => {
    const key = `Municipal:${n}:${year}`;
    const yes = (s.confirmedHolidays || []).includes(key), no = (s.disabledHolidays || []).includes(key);
    out.push({ date: resolve(year, d), name: n, scope: 'Municipal', key, enabled: yes, pending: !yes && !no });
  });
  for (const c of s.customHolidays || []) {
    if (/^\d{4}-/.test(c.spec)) { if (c.spec.startsWith(String(year))) out.push({ date: c.spec, name: c.name, scope: 'Pessoal', key: `Pessoal:${c.name}:${c.spec}`, enabled: true }); }
    else add(c.spec, c.name, 'Pessoal');
  }
  if (s.includeOptional) {
    add('E-48', 'Carnaval (segunda)', 'Facultativo');
    if (!(STATE_HOLIDAYS[s.uf] || []).some(([d]) => d === 'E-47')) add('E-47', 'Carnaval (terça)', 'Facultativo');
    add('E60', 'Corpus Christi', 'Facultativo');
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Mapa data -> feriado (só os ativos) para os anos dados. */
export function holidayMap(years, s) {
  const m = {};
  for (const y of years) for (const h of holidaysForYear(y, s)) if (h.enabled && !m[h.date]) m[h.date] = h;
  return m;
}

// ---------------- dias de folga ----------------

/** Dia sem jornada (fim de semana pela escala, feriado, folga/férias/atestado marcados). */
export function isOff(date, config, marks) {
  const type = marks[date]?.type;
  if (type && !DAY_TYPES[type].countsExpected) return true;
  if (config.holidays && config.holidays.has(date)) return true;
  return L_owedFor(date, config) === 0;
}

// ---------------- histórico semanal ----------------

/** Últimas [weeks] semanas (seg-dom): quanto o banco subiu/desceu e onde terminou. */
export function weeklyHistory(byDate, marks, config, adjustments, checkpoint, today, weeks = 12) {
  const monday = addDays(today, -weekdayIndex(today));
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(monday, -7 * i);
    const end = addDays(start, 6);
    const until = end < today ? addDays(end, 1) : today;
    const bStart = bank(byDate, marks, config, adjustments, checkpoint, start, addDays(start, -1));
    const bEnd = bank(byDate, marks, config, adjustments, checkpoint, until, addDays(until, -1));
    out.push({ start, end, delta: bEnd - bStart, bankEnd: bEnd, current: end >= today });
  }
  return out;
}

/** Média das últimas semanas completas e projeção. */
export function trend(history, bankNow, target = 0) {
  const done = history.filter((w) => !w.current).slice(-4);
  if (!done.length) return null;
  const avg = Math.round(done.reduce((s, w) => s + w.delta, 0) / done.length);
  const missing = target - bankNow;
  let weeksToTarget = null;
  if (missing > 0 && avg > 0) weeksToTarget = Math.ceil(missing / avg);
  if (missing < 0 && avg < 0) weeksToTarget = Math.ceil(missing / avg);
  return { avg, weeksToTarget, missing };
}

// ---------------- estratégias para a meta ----------------

const ALT_DAYS = [0, 2, 4]; // dias alternados = seg, qua, sex

/**
 * strat = {even: bool, sat: min, sun: min, alt: min}
 *  - sat/sun: horas de trabalho no sábado/domingo (domingo conta em dobro se o 100% automático estiver ligado)
 *  - alt: hora extra em seg/qua/sex
 *  - even: o que faltar é dividido igualmente entre os dias úteis
 */
export function strategyPlan(goal, strat, bankNow, today, config, marks) {
  const missing = goal.targetMinutes - bankNow;
  let fixed = 0, workdays = 0, sats = 0, suns = 0, alts = 0;
  for (let d = today; d <= goal.deadline; d = addDays(d, 1)) {
    const wi = weekdayIndex(d);
    const off = isOff(d, config, marks);
    if (!off) {
      workdays++;
      if (strat.alt && ALT_DAYS.includes(wi)) { fixed += strat.alt; alts++; }
    } else if (wi === 5 && strat.sat) { fixed += strat.sat; sats++; }
    else if (wi === 6 && strat.sun) { fixed += strat.sun * (config.autoDouble !== false ? 2 : 1); suns++; }
  }
  const remaining = missing - fixed;
  const perDay = strat.even && remaining > 0 && workdays > 0 ? Math.ceil(remaining / workdays) : 0;
  return {
    missing, fixed, workdays, sats, suns, alts, perDay,
    shortfall: !strat.even && remaining > 0 ? remaining : 0,
    surplus: remaining < 0 ? -remaining : 0,
    reached: missing <= 0,
  };
}

/** Extra (ou horas no fim de semana) que a estratégia pede para uma data. */
export function targetFor(date, goal, strat, plan, config, marks) {
  if (!goal || plan.reached || date > goal.deadline) return 0;
  const wi = weekdayIndex(date);
  if (!isOff(date, config, marks)) return plan.perDay + (strat.alt && ALT_DAYS.includes(wi) ? strat.alt : 0);
  if (wi === 5) return strat.sat || 0;
  if (wi === 6) return strat.sun || 0;
  return 0;
}

export function describeStrategy(strat) {
  const parts = [];
  if (strat.sat) parts.push(`sábados ${dur(strat.sat)}`);
  if (strat.sun) parts.push(`domingos ${dur(strat.sun)}`);
  if (strat.alt) parts.push(`+${dur(strat.alt)} seg/qua/sex`);
  if (strat.even) parts.push(parts.length ? 'resto dividido nos dias úteis' : 'extra igual em todos os dias úteis');
  return parts.join(' + ') || 'sem extra';
}

/** Sugestões prontas, inclusive combinadas. */
export function suggestStrategies(goal, bankNow, today, config, marks) {
  const base = strategyPlan(goal, { even: false, sat: 1 }, bankNow, today, config, marks);
  const perSat = base.sats ? Math.min(600, Math.ceil(Math.max(0, base.missing) / base.sats / 30) * 30) : 0;
  const presets = [
    { id: 'uteis', label: 'Só dias úteis', strat: { even: true } },
    { id: 'sab4', label: 'Sábados 4h', strat: { even: true, sat: 240 } },
    { id: 'dom4', label: 'Domingos 4h (100%)', strat: { even: true, sun: 240 } },
    { id: 'alt1', label: '+1h em dias alternados', strat: { even: true, alt: 60 } },
    { id: 'sab4alt1', label: 'Sábados 4h + 1h alternada', strat: { even: true, sat: 240, alt: 60 } },
    { id: 'fds', label: 'Sábado e domingo 4h', strat: { even: true, sat: 240, sun: 240 } },
  ];
  if (perSat > 0) presets.push({ id: 'sosab', label: `Só sábados (${dur(perSat)} cada)`, strat: { even: false, sat: perSat } });
  return presets.map((p) => {
    const plan = strategyPlan(goal, p.strat, bankNow, today, config, marks);
    let text;
    if (plan.reached) text = 'Meta já atingida.';
    else if (plan.surplus) text = `Passa da meta em ${dur(plan.surplus)}.`;
    else if (plan.shortfall) text = `Faltariam ${dur(plan.shortfall)}.`;
    else if (plan.perDay) text = `+${dur(plan.perDay)} por dia útil${plan.fixed ? ` (fins de semana/alternados cobrem ${dur(plan.fixed)})` : ''}.`;
    else text = `Os ${dur(plan.fixed)} já cobrem a meta.`;
    return { ...p, plan, text };
  });
}

// ---------------- emendas, férias e plano anual ----------------

const WD_NAME = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** Feriados dos próximos dias com a situação: fim de semana prolongado, ponte possível, etc. */
export function upcomingHolidays(today, days, hmap, config, marks) {
  const out = [];
  const end = addDays(today, days);
  for (const date of Object.keys(hmap).sort()) {
    if (date < today || date > end) continue;
    const h = hmap[date];
    const wi = weekdayIndex(date);
    let kind = 'meio', bridge = null;
    if (wi === 5 || wi === 6) kind = 'fimdesemana';
    else if (wi === 0 || wi === 4) kind = 'prolongado';
    else if (wi === 1) { kind = 'ponte'; bridge = addDays(date, -1); }
    else if (wi === 3) { kind = 'ponte'; bridge = addDays(date, 1); }
    if (bridge && isOff(bridge, config, marks)) { kind = 'prolongado'; bridge = null; }
    out.push({ ...h, weekday: WD_NAME[wi], kind, bridge, bridgeMinutes: bridge ? expectedFor(bridge, config) : 0, inDays: dayDiff(today, date) });
  }
  return out;
}

function dayDiff(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/**
 * Ideias de folga: entre dois blocos de folga (fins de semana/feriados) com poucos dias de trabalho no meio,
 * tirar esses dias (férias ou banco) rende uma sequência longa. Só considera blocos com feriado.
 */
export function vacationIdeas(today, days, config, marks, hmap, maxGap = 4) {
  const end = addDays(today, days);
  const blocks = [];
  let cur = null;
  for (let d = today; d <= end; d = addDays(d, 1)) {
    if (isOff(d, config, marks)) {
      if (!cur) cur = { start: d, end: d, holiday: false };
      cur.end = d;
      if (hmap[d]) cur.holiday = true;
    } else if (cur) { blocks.push(cur); cur = null; }
  }
  if (cur) blocks.push(cur);
  const ideas = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    const a = blocks[i], b = blocks[i + 1];
    if (!a.holiday && !b.holiday) continue;
    const gapStart = addDays(a.end, 1), gapEnd = addDays(b.start, -1);
    const gap = dayDiff(gapStart, gapEnd) + 1;
    if (gap < 1 || gap > maxGap) continue;
    let minutes = 0;
    for (let d = gapStart; d <= gapEnd; d = addDays(d, 1)) minutes += expectedFor(d, config);
    const total = dayDiff(a.start, b.end) + 1;
    const hol = [a, b].flatMap((x) => { const r = []; for (let d = x.start; d <= x.end; d = addDays(d, 1)) if (hmap[d]) r.push(hmap[d].name); return r; });
    ideas.push({ from: gapStart, to: gapEnd, workdays: gap, minutes, totalOff: total, offStart: a.start, offEnd: b.end, holidays: hol });
  }
  return ideas.sort((x, y) => y.totalOff / y.workdays - x.totalOff / x.workdays || x.from.localeCompare(y.from)).slice(0, 8)
    .sort((x, y) => x.from.localeCompare(y.from));
}

/**
 * Plano anual: para emendar cada ponte do ano usando o banco, quantas horas acumular até cada data
 * e quanto de extra por dia útil, começando hoje (se o banco estiver negativo, primeiro zera).
 */
export function annualPlan(today, untilDate, bankNow, config, marks, hmap) {
  const items = upcomingHolidays(today, dayDiff(today, untilDate), hmap, config, marks).filter((h) => h.kind === 'ponte');
  let cum = Math.max(0, -bankNow);
  let perDay = 0;
  const out = items.map((h) => {
    cum += h.bridgeMinutes;
    let wd = 0;
    for (let d = today; d < h.bridge; d = addDays(d, 1)) if (!isOff(d, config, marks)) wd++;
    const need = cum - Math.max(0, bankNow);
    const rate = wd > 0 ? Math.ceil(Math.max(0, need) / wd) : Math.max(0, need);
    perDay = Math.max(perDay, rate);
    return { ...h, cumulative: cum, workdaysUntil: wd };
  });
  return { items: out, totalMinutes: cum, perDay, deficit: Math.max(0, -bankNow) };
}

/** Resumo do mês: feriados, emendas e ideias que começam no mês. */
export function monthDigest(ym, today, config, marks, hmap) {
  const first = `${ym}-01`;
  const start = first > today ? first : today;
  const [y, m] = ym.split('-').map(Number);
  const last = `${ym}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  const span = dayDiff(start, last);
  const holidays = span >= 0 ? upcomingHolidays(start, span, hmap, config, marks) : [];
  const ideas = span >= 0 ? vacationIdeas(start, span + 10, config, marks, hmap).filter((i) => i.from <= last) : [];
  return { holidays, ideas };
}

// ---------------- mensagens do dia ----------------

export const MESSAGES = [
  'Bom dia! Hoje o relógio de ponto está do seu lado. Pelo menos até as 18h.',
  'Lembrete: café não conta como hora extra, mas ajuda muito a fazer uma.',
  'Seu banco de horas não aceita Pix. Só suor e pontualidade.',
  'Bateu o ponto? Então já venceu o primeiro chefe do dia.',
  'Hora extra é tipo academia: ninguém quer ir, mas todo mundo gosta do resultado.',
  'O relógio de ponto não julga. Só registra. Em silêncio. Para sempre.',
  'Hoje é dia de chegar no horário e sair com o banco sorrindo.',
  'Dica de economia: cada minuto no banco é um minuto de folga no futuro. Juros compostos da preguiça.',
  'Se o comprovante sair borrado, a culpa é da impressora. Sempre.',
  'Segunda-feira: o dia em que o ponto pesa 3 kg a mais.',
  'Quem bate ponto no horário ganha +10 de carisma no RPG da vida.',
  'Seu eu do futuro, de folga numa sexta, agradece cada hora de hoje.',
  'Ponto batido, consciência tranquila, almoço garantido.',
  'Não esqueça o ponto do almoço. O estômago já lembrou sozinho.',
  'Feriado é igual sobremesa: você sempre arruma espaço para mais um.',
  'Hoje o banco de horas está torcendo por você. Literalmente.',
  'Atrasou 2 minutos? Respira. A tolerância existe por um motivo.',
  'Sexta-feira: o ponto de saída mais bonito da semana.',
  'Trabalhar bem cansa. Trabalhar sem registrar cansa duas vezes.',
  'Um dia você vai olhar o banco positivo e dizer: valeu a pena aquele sábado.',
  'Lembra: foto do comprovante reta e sem dedo na frente. O app agradece.',
  'Quarta-feira: metade da semana, metade do café, metade da paciência.',
  'O ponto é a única reunião que dura um segundo. Aproveite.',
  'Meta do dia: sair no horário previsto. Meta secreta: sair 1 minuto antes do trânsito.',
  'Banco negativo não é vergonha, é plano em andamento.',
  'Se a vida te der hora extra, faça uma folga prolongada com ela.',
  'Seu crachá já acordou motivado. Falta você.',
  'Hoje é um ótimo dia para não esquecer nenhuma batida.',
  'Domingo trabalhado vale em dobro. A preguiça de domingo, infelizmente, também.',
  'Ponte de feriado se constrói com horas, não com cimento.',
  'Comprovante guardado é argumento ganho no RH.',
  'Quinta-feira: a sexta-feira da sexta-feira.',
  'O melhor horário para bater o ponto é sempre o certo.',
  'Seu saldo agradece cada minuto. Seu chefe também, mas fala menos.',
  'Respira fundo: são só mais algumas horas até a hora de ir embora.',
  'Planilha boa é planilha que o app faz por você.',
  'Hoje tem cara de dia produtivo. Ou pelo menos de dia com ponto certinho.',
  'Hora extra feita hoje é feriado emendado amanhã.',
  'Você + pontualidade = combinação melhor que arroz com feijão.',
  'O app não esquece. Mas confere sempre o horário lido, combinado?',
  'Terça-feira: ninguém fala dela, mas ela conta igual no banco.',
  'Já bebeu água? Já bateu o ponto? Então está tudo sob controle.',
  'Folga merecida começa com ponto bem registrado.',
  'Cada batida no relógio é um passo para o próximo fim de semana prolongado.',
  'Seu banco de horas mandou dizer: "acredito em você".',
  'Saiu no horário? Parabéns, você venceu o capitalismo hoje. Um pouco.',
  'Manhã difícil? O almoço está mais perto do que parece.',
  'Ponto batido é igual guarda-chuva: só sente falta quando esquece.',
  'Hoje vale lembrar: tolerância é para imprevisto, não para soneca.',
  'Mais um dia, mais um comprovante, mais um passo para as férias.',
];

export function dailyMessage(date) {
  const [y, m, d] = date.split('-').map(Number);
  const n = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return MESSAGES[((n % MESSAGES.length) + MESSAGES.length) % MESSAGES.length];
}
