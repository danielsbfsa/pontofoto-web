// Regras do Ponto Foto (mesmas do app Android), sem dependências de navegador.
// Datas: "AAAA-MM-DD". Data e hora: "AAAA-MM-DDTHH:mm". Horas do dia: minutos desde 00:00.

// ---------------- datas ----------------

export const pad2 = (n) => String(n).padStart(2, '0');

export function dateOf(dt) { return dt.slice(0, 10); }
export function minutesOf(dt) { return Number(dt.slice(11, 13)) * 60 + Number(dt.slice(14, 16)); }
export function makeDT(date, minutes) { return `${date}T${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`; }
export function hm(minutes) { return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`; }

function toUTC(date) { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d); }
export function addDays(date, n) {
  const t = new Date(toUTC(date) + n * 86400000);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}
/** 0 = segunda ... 6 = domingo */
export function weekdayIndex(date) { return (new Date(toUTC(date)).getUTCDay() + 6) % 7; }
export function daysInMonth(ym) { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function isValidDate(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return false;
  return d <= daysInMonth(`${y}-${pad2(m)}`);
}
export function localNow() {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}T${pad2(n.getHours())}:${pad2(n.getMinutes())}`;
}

// ---------------- formatação ----------------

/** "+1:05", "-0:30", "0:00" */
export function formatMinutes(total) {
  const sign = total > 0 ? '+' : total < 0 ? '-' : '';
  const a = Math.abs(total);
  return `${sign}${Math.floor(a / 60)}:${pad2(a % 60)}`;
}
/** "7h32", "8h", "45min" */
export function formatDuration(total) {
  const a = Math.abs(total);
  const h = Math.floor(a / 60), m = a % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${pad2(m)}`;
}
/** Aceita "1:30", "-2:00", "+0:45", "2h30", "2" */
export function parseSignedHHmm(text) {
  const t = String(text || '').trim().replace(/\s/g, '');
  if (!t) return null;
  const negative = t.startsWith('-');
  const body = t.replace(/^[-+]/, '');
  const parts = body.split(/[:hH]/).filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  const h = Number(parts[0]);
  const m = parts.length > 1 ? Number(parts[1]) : 0;
  if (m > 59) return null;
  const total = h * 60 + m;
  return negative ? -total : total;
}

// ---------------- dia e banco ----------------

export const DAY_TYPES = {
  FOLGA: { label: 'Folga', countsExpected: false },
  FERIAS: { label: 'Férias', countsExpected: false },
  ATESTADO: { label: 'Atestado', countsExpected: false },
  FERIADO: { label: 'Feriado', countsExpected: false },
  FALTA: { label: 'Falta', countsExpected: true },
};

export const DEFAULT_CONFIG = { weekly: [480, 480, 480, 480, 480, 0, 0], tolerance: 10, lunch: 60 };

export function expectedFor(date, config) { return config.weekly[weekdayIndex(date)] || 0; }

/**
 * Regras: saldo = trabalhado - esperado; folga/férias/atestado/feriado zeram o esperado;
 * falta cobra a jornada; dia sem registro não conta; dobro (100%) conta as horas em dobro;
 * diferença até a tolerância vira zero.
 */
export function summarize(date, dayPunches, mark, config, now = null) {
  // Entrada/saída pela ORDEM dos horários (1ª = entrada, 2ª = saída...): fotos registradas fora de ordem
  // não podem inverter as batidas e criar saldo negativo.
  const sorted = [...(dayPunches || [])].sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  let worked = 0, incomplete = false, openSince = null;
  for (let i = 0; i + 1 < sorted.length; i += 2) worked += Math.max(0, minutesOf(sorted[i + 1].dateTime) - minutesOf(sorted[i].dateTime));
  if (sorted.length % 2 === 1) {
    const last = sorted[sorted.length - 1];
    if (now && dateOf(now) === date && minutesOf(now) > minutesOf(last.dateTime)) {
      worked += minutesOf(now) - minutesOf(last.dateTime);
      openSince = last.dateTime;
    } else incomplete = true;
  }
  const type = mark?.type || null;
  const holiday = !!(config.holidays && config.holidays.has(date));
  const expected = (type && !DAY_TYPES[type].countsExpected) || (holiday && !type) ? 0 : expectedFor(date, config);
  const doubled = isDoubled(date, mark, config);
  const credited = doubled ? worked * 2 : worked;
  // dia com batida faltando não entra no banco até ser corrigido
  const raw = (sorted.length === 0 && !type) || incomplete ? 0 : credited - expected;
  const balance = sorted.length > 0 && Math.abs(raw) <= config.tolerance ? 0 : raw;
  return {
    date, punches: sorted, mark: mark || null, dayType: type, doubled, holiday,
    workedMinutes: worked, expectedMinutes: expected, balanceMinutes: balance, incomplete, openSince,
    hasRecords: sorted.length > 0 || !!type,
  };
}

/**
 * Horário dobrado (100%): escolha manual do dia (doubleMode 'ON'/'OFF') ou automático
 * em domingos e feriados (config.autoDouble, ligado por padrão).
 */
export function isDoubled(date, mark, config) {
  if (mark?.doubleMode === 'ON') return true;
  if (mark?.doubleMode === 'OFF') return false;
  if (mark?.doubled) return true;
  if (config.autoDouble === false) return false;
  return weekdayIndex(date) === 6 || !!(config.holidays && config.holidays.has(date)) || mark?.type === 'FERIADO';
}

export function groupByDate(punches) {
  const m = {};
  for (const p of punches) (m[dateOf(p.dateTime)] ||= []).push(p);
  return m;
}

/** Banco = saldo inicial + dias depois dele e antes de [before] + ajustes depois dele (até [adjustmentsUntil]). */
export function bank(byDate, marks, config, adjustments, checkpoint, before, adjustmentsUntil = null) {
  const cp = checkpoint && checkpoint.date < before ? checkpoint : null;
  const dates = new Set([...Object.keys(byDate), ...Object.keys(marks)]);
  let days = 0;
  for (const d of dates) {
    if (d < before && (!cp || d > cp.date)) days += summarize(d, byDate[d], marks[d], config).balanceMinutes;
  }
  let adj = 0;
  for (const a of adjustments) {
    if ((!cp || a.referenceDate > cp.date) && (!adjustmentsUntil || a.referenceDate <= adjustmentsUntil)) adj += a.minutesDelta;
  }
  return (cp ? cp.minutes : 0) + days + adj;
}

export function monthDays(ym, byDate, marks, config, now) {
  const out = [];
  for (let d = 1; d <= daysInMonth(ym); d++) {
    const date = `${ym}-${pad2(d)}`;
    out.push(summarize(date, byDate[date], marks[date], config, now));
  }
  return out;
}

export function stats(days, today) {
  const closed = days.filter((d) => d.date < today);
  const daysWorked = days.filter((d) => d.workedMinutes > 0).length;
  const worked = days.reduce((s, d) => s + d.workedMinutes, 0);
  return {
    workedMinutes: worked,
    balanceMinutes: closed.reduce((s, d) => s + d.balanceMinutes, 0),
    extraMinutes: closed.reduce((s, d) => s + Math.max(0, d.balanceMinutes), 0),
    owedMinutes: closed.reduce((s, d) => s + Math.max(0, -d.balanceMinutes), 0),
    daysWorked,
    averagePerDay: daysWorked ? Math.floor(worked / daysWorked) : 0,
  };
}

/** Tipo de uma batida nova: pela posição no dia (quantidade par = entrada). */
export function suggestType(dayPunches) {
  return (dayPunches || []).length % 2 === 0 ? 'ENTRADA' : 'SAIDA';
}

/** Regrava entrada/saída de todas as batidas pela ordem dos horários de cada dia. Devolve quantas mudaram. */
export function normalizeTypes(punches) {
  let changed = 0;
  const by = groupByDate(punches);
  for (const day of Object.values(by)) {
    day.sort((a, b) => a.dateTime.localeCompare(b.dateTime)).forEach((p, i) => {
      const t = i % 2 === 0 ? 'ENTRADA' : 'SAIDA';
      if (p.type !== t) { p.type = t; changed++; }
    });
  }
  return changed;
}

// ---------------- metas e previsão ----------------

export function workDays(from, to, config, marks) {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const type = marks[d]?.type;
    const off = (type && !DAY_TYPES[type].countsExpected) || (config.holidays && config.holidays.has(d));
    if (expectedFor(d, config) > 0 && !off) n++;
  }
  return n;
}

export function plan(goal, bankUntilYesterday, today, config, marks) {
  const missing = goal.targetMinutes - bankUntilYesterday;
  const days = workDays(today, goal.deadline, config, marks);
  const expired = today > goal.deadline;
  const perDay = missing <= 0 ? 0 : days === 0 ? missing : Math.ceil(missing / days);
  const span = goal.targetMinutes - goal.startMinutes;
  const progress = span === 0 ? 1 : Math.min(1, Math.max(0, (bankUntilYesterday - goal.startMinutes) / span));
  return { missingMinutes: missing, workDaysLeft: days, extraPerDay: perDay, progress, reached: missing <= 0, expired: expired && missing > 0 };
}

export function forecast(s, config, extraGoal, now) {
  const expected = s.expectedMinutes;
  const p = s.punches;
  if (!p.length) return null;
  if (expected === 0 && extraGoal === 0) return null;
  const remJ = expected - s.workedMinutes;
  const remG = expected + extraGoal - s.workedMinutes;
  const nowM = minutesOf(now);
  if (s.openSince) {
    const lunchPending = p.length === 1 && expected > 360 && config.lunch > 0;
    const add = lunchPending ? config.lunch : 0;
    return {
      forJourney: remJ > 0 ? nowM + remJ + add : null,
      forGoal: extraGoal > 0 && remG > 0 ? nowM + remG + add : null,
      journeyDone: remJ <= 0, includesLunch: lunchPending, returnAt: null,
    };
  }
  const lastOut = minutesOf(p[p.length - 1].dateTime);
  const back = Math.max(lastOut + config.lunch, nowM);
  return {
    forJourney: remJ > 0 ? back + remJ : null,
    forGoal: extraGoal > 0 && remG > 0 ? back + remG : null,
    journeyDone: remJ <= 0, includesLunch: false,
    returnAt: remJ > 0 || (extraGoal > 0 && remG > 0) ? back : null,
  };
}

// ---------------- leitor do comprovante (REP e apps) ----------------
// Sem lookbehind nas regex: iPhones com iOS antigo não aceitam e o app inteiro pararia.

const NUM = '[0-9OILSB]';
const STOPS_COMPANY = 'L[O0]CAL|NREP|M[O0]DEL[O0]|CNPJ|CEI|CAEPF|CN[O0]|N[O0]ME|CPF|ENDERE';
const STOPS_NAME = 'CPF|PIS|NIS|NSR|DATA|H[O0]RA|MATR|CTPS';
const companyRx = new RegExp(`(?:R\\s*S\\s*[O0]\\s*C\\s*[I1L]\\s*A\\s*L|RAZ[AÃ]O\\s*S[O0]CIAL|EMPREGAD[O0]R)\\s*[:;]?\\s*(.*?)\\s*(?:${STOPS_COMPANY})\\s*[:;]`);
const nameRx = new RegExp(`(?:^|[^A-Z])(?:N[O0]ME\\s*[:;]?|(?:TRABALHAD[O0]R|C[O0]LAB[O0]RAD[O0]R|FUNCI[O0]N[AÁ]RI[O0])\\s*[:;])\\s*(.*?)\\s*(?:${STOPS_NAME})\\s*[:;]`);
const nsrRx = new RegExp(`NSR\\s*[:;]?\\s*(${NUM}{3,12})`);
const labeledDateRx = new RegExp(`(?:DATA|DIA|\\bDT)\\s*(?:D[OA]\\s*REGISTR[O0]|D[AE]\\s*MARCA[CÇ][AÃ][O0])?\\s*[:;]?\\s*(${NUM}{1,2})\\s*[/\\-.]\\s*(${NUM}{1,2})\\s*[/\\-.]\\s*(${NUM}{2,4})`);
const labeledTimeRx = new RegExp(`(?:H\\s*[O0]\\s*R\\s*A(?!\\s*S\\b)|\\bHR\\b|H[O0]R[AÁ]RI[O0]\\s*(?=D[OA]\\s*REGISTR|D[AE]\\s*MARCA))\\s*(?:D[OA]\\s*REGISTR[O0]|D[AE]\\s*MARCA[CÇ][AÃ][O0])?\\s*[:;]?\\s*(${NUM}{1,2})\\s*[:.;H]\\s*(${NUM}{2})`);

const dmyRx = /(\d{1,2})\s?[/\-.]\s?(\d{1,2})\s?[/\-.]\s?(\d{4}|\d{2})(?!\d)/g;
const ymdRx = /(20\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})(?!\d)/g;
const dmRx = /(\d{1,2})\/(\d{1,2})(?![\d/])/g;
const timeRx = /([01]?\d|2[0-3])\s?(?::|\s?H\s?)\s?([0-5]\d)(?:\s?:\s?[0-5]\d)?(?:\s?(AM|PM|A\.M\.|P\.M\.))?(?:\s?MIN)?(?![\d,])/g;
const MONTH = '(JAN(?:EIRO|UARY)?|FEV(?:EREIRO)?|FEB(?:RUARY)?|MAR(?:[CÇ]O|CH)?|ABR(?:IL)?|APR(?:IL)?|MAI[O0]?|MAY|JUN(?:H[O0]|E)?|JUL(?:H[O0]|Y)?|AG[O0](?:ST[O0])?|AUG(?:UST)?|SET(?:EMBR[O0])?|SEP(?:TEMBER)?|[O0]UT(?:UBR[O0])?|[O0]CT(?:[O0]BER)?|N[O0]V(?:EMBR[O0]|EMBER)?|DEZ(?:EMBR[O0])?|DEC(?:EMBER)?)(?![A-Z])';
const monthWordRx = new RegExp(`(\\d{1,2})\\s*(?:DE\\s+)?[/\\-.]?\\s*${MONTH}\\.?\\s*(?:DE\\s+)?[/\\-.,]?\\s*(\\d{4}|\\d{2})?(?![\\d:H])`, 'g');
const monthFirstRx = new RegExp(`${MONTH}\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})(?!\\d)`, 'g');
const MONTHS = { JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAI: 5, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8, SET: 9, SEP: 9, OUT: 10, OCT: 10, NOV: 11, DEZ: 12, DEC: 12 };
const monthOf = (w) => MONTHS[w.replace(/0/g, 'O').slice(0, 3)] || null;

const TIME_GOOD = /(H[O0]RA(?!S)|\bHR\b|H[O0]R[AÁ]RI[O0]\s*(?:D[OA]\s*(?:REGISTR|MARCA|PONT))|\b[AÀ]S\b|(?:^|\s)ÀS\s|REGISTRAD|MARCAD|BATID|MARCA[CÇ][AÃ][O0]|REGISTR[O0]|ENTRADA|SA[IÍ]DA|PONT[O0]\s*(?:REGISTRAD|BATID))/;
const TIME_BAD = /(JORNADA|ESCALA|TURN[O0]|EXPEDIENTE|INTERVAL|CARGA|PREVIST|IMPRESS|EMISS|EMITID|GERAD[O0]|VALIDADE|ATUALIZAD|SINCRONIZ|H[O0]RAS\b|SALD[O0]|BANC[O0]|TOTAL|EXTRA|ATRAS)/;
const DATE_GOOD = /(DATA|\bDIA\b|\bDT\b|REGISTRAD|MARCAD|\bEM\b)/;
const DATE_BAD = /(NASC|ADMISS|EMISS|IMPRESS|VALIDADE|VENC|PER[IÍ]OD|COMPET|GERAD[O0]|ATUALIZAD|DESDE)/;
const RANGE_AFTER = /^\s*(-|[AÀ]S|ATÉ|ATE|A)\s*\d{1,2}\s?[:H]\s?\d{2}/;
const RANGE_BEFORE = /\d{1,2}\s?[:H]\s?\d{2}\s*(-|[AÀ]S|ATÉ|ATE|A)\s*$/;

const fixDigits = (s) => s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
const isDigit = (c) => c >= '0' && c <= '9';

/** Junta as linhas: em papel de largura fixa, linha "cheia" foi quebrada pelo papel (pode cortar palavra) -> cola sem espaço. */
export function joinLines(raw) {
  const lines = String(raw || '').toUpperCase().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  const max = Math.max(...lines.map((l) => l.length));
  const fixed = max >= 24 && lines.filter((l) => l.length >= max * 0.9).length >= 3;
  let out = '';
  lines.forEach((l, i) => { out += l; if (i < lines.length - 1 && (!fixed || l.length < max * 0.9)) out += ' '; });
  return out;
}

function clean(s) {
  const c = s.replace(/\s+/g, ' ').replace(/^[\s:;.,-]+|[\s:;.,-]+$/g, '');
  return c || null;
}

function buildDate(d, m, y) {
  const year = String(y).length === 2 ? 2000 + Number(y) : Number(y);
  if (year < 2000 || year > 2100) return null;
  return isValidDate(year, Number(m), Number(d)) ? `${year}-${pad2(Number(m))}-${pad2(Number(d))}` : null;
}
function buildTime(h, m) {
  const H = Number(h), M = Number(m);
  return H >= 0 && H < 24 && M >= 0 && M < 60 ? H * 60 + M : null;
}
function yearless(d, m, today) {
  const y = Number(today.slice(0, 4));
  let iso = buildDate(String(d), String(m), String(y));
  if (!iso) return null;
  if (iso > addDaysIso(today, 2)) iso = buildDate(String(d), String(m), String(y - 1));
  return iso;
}
function addDaysIso(iso, n) {
  const dt = new Date(iso + 'T12:00:00'); dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function* matches(rx, text, prevForbidden) {
  rx.lastIndex = 0; let m;
  while ((m = rx.exec(text))) {
    const prev = text[m.index - 1] || '', prev2 = text[m.index - 2] || '';
    if (prevForbidden(prev, prev2)) { rx.lastIndex = m.index + 1; continue; }
    yield m;
  }
}

/** Interpreta o texto do comprovante: data, hora (minutos), NSR — e nome/empresa só para conferência (não são salvos). */
export function parseReceipt(rawText, today = null) {
  const text = joinLines(rawText);
  if (!text) return {};
  const now = today || (() => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; })();
  const lines = String(rawText).toUpperCase().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sb = lines[0] && lines[0].length <= 18 && !/\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(lines[0]) ? lines[0] : null;

  let m, labeledDate = null, labeledTime = null;
  if ((m = labeledDateRx.exec(text))) labeledDate = buildDate(fixDigits(m[1]), fixDigits(m[2]), fixDigits(m[3]));
  if ((m = labeledTimeRx.exec(text))) labeledTime = buildTime(fixDigits(m[1]), fixDigits(m[2]));

  const dates = [];
  const addDate = (date, start, end, hasYear) => {
    if (!date) return;
    const before = text.slice(Math.max(0, start - 28), start);
    let score = hasYear ? 1 : 0.4;
    const good = DATE_GOOD.test(before);
    if (good) score += 2;
    if (DATE_BAD.test(before)) score -= 3;
    if (date > addDaysIso(now, 2)) score -= 2;
    dates.push({ date, start, end, score, labeled: good, hasYear });
  };
  for (const x of matches(dmyRx, text, (p) => isDigit(p))) addDate(buildDate(x[1], x[2], x[3]), x.index, x.index + x[0].length, true);
  for (const x of matches(ymdRx, text, (p) => isDigit(p))) addDate(buildDate(x[3], x[2], x[1]), x.index, x.index + x[0].length, true);
  for (const x of matches(monthFirstRx, text, () => false)) { const mo = monthOf(x[1]); if (mo) addDate(buildDate(x[2], String(mo), x[3]), x.index, x.index + x[0].length, true); }
  for (const x of matches(monthWordRx, text, (p) => isDigit(p))) {
    const mo = monthOf(x[2]); if (!mo) continue;
    if (x[3]) addDate(buildDate(x[1], String(mo), x[3]), x.index, x.index + x[0].length, true);
    else addDate(yearless(Number(x[1]), mo, now), x.index, x.index + x[0].length, false);
  }
  if (!dates.some((d) => d.hasYear)) {
    for (const x of matches(dmRx, text, (p) => isDigit(p) || p === '/' || p === '.' || p === '-')) addDate(yearless(Number(x[1]), Number(x[2]), now), x.index, x.index + x[0].length, false);
  }

  const times = [];
  for (const x of matches(timeRx, text, (p, p2) => isDigit(p) || ((p === ':' || p === '.' || p === ',') && isDigit(p2)))) {
    let h = Number(x[1]); const mi = Number(x[2]); const ap = x[3] || '';
    if (ap.startsWith('P') && h < 12) h += 12;
    if (ap.startsWith('A') && h === 12) h = 0;
    const t = buildTime(h, mi); if (t === null) continue;
    const start = x.index, end = x.index + x[0].length;
    const before = text.slice(Math.max(0, start - 24), start), after = text.slice(end, end + 14);
    let score = 1; const good = TIME_GOOD.test(before);
    if (good) score += 3;
    if (TIME_BAD.test(before)) score -= 3;
    if (RANGE_AFTER.test(after)) score -= 2;
    if (RANGE_BEFORE.test(before)) score -= 2;
    if (sb && start < sb.length + 1) score -= 2;
    times.push({ time: t, start, end, score, labeled: good });
  }
  for (const t of times) {
    if (dates.some((d) => (t.start - d.end >= 0 && t.start - d.end <= 16) || (d.start - t.end >= 0 && d.start - t.end <= 16))) { t.score += 2.5; t.labeled = true; }
  }
  const best = (arr) => arr.reduce((a, b) => (!a || b.score > a.score || (b.score === a.score && b.start < a.start) ? b : a), null);
  const bt = best(times), bd = best(dates);
  const time = labeledTime ?? (bt ? bt.time : null);
  const date = labeledDate ?? (bd ? bd.date : null);
  return {
    company: (m = companyRx.exec(text)) ? clean(m[1]) : null,
    employeeName: (m = nameRx.exec(text)) ? clean(m[1]) : null,
    date, time,
    dateLabeled: labeledDate !== null || !!(bd && bd.labeled),
    timeLabeled: labeledTime !== null || times.some((t) => t.time === time && t.labeled),
    nsr: (m = nsrRx.exec(text)) ? fixDigits(m[1]) : null,
  };
}

// ---------------- dados pessoais (para tarjar a foto) ----------------

const SENSITIVE_LABEL = /(CPF|\bPIS|PASEP|\bNIS\b|CTPS|MATR[IÍ]C|N[O0]ME|RS[O0]CIAL|RAZ[AÃ][O0]|EMPREGAD[O0]R|EMPRESA|CNPJ|\bCEI\b|CAEPF|\bCN[O0]\b|L[O0]CAL\b|ENDERE[CÇ]|\bRUA\b|\bAV\b|AVENIDA|BAIRR[O0]|\bCEP\b|TRABALHAD[O0]R\s*:|C[O0]LAB[O0]RAD[O0]R|FUNCI[O0]N[AÁ]RI[O0]|\bRG\b|E-?MAIL|TELEF|CELULAR|@)/;
const SENSITIVE_NUMBER = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{5}\.?\d{2}-?\d/;
const COMMON_WORDS = new Set(['LTDA', 'EIRELI', 'COMERCIO', 'INDUSTRIA', 'SERVICOS', 'DOS', 'DAS', 'COM', 'EPP']);
const plainWords = (s) => String(s).toUpperCase().normalize('NFD').replace(/\p{Mn}+/gu, '').split(/[^A-Z0-9]+/);

export function personalWords(r) {
  return new Set([r.employeeName, r.company].filter(Boolean).flatMap(plainWords).filter((w) => w.length >= 3 && !COMMON_WORDS.has(w)));
}
export function isSensitiveLine(line, words) {
  const up = String(line).toUpperCase();
  if (SENSITIVE_LABEL.test(up) || SENSITIVE_NUMBER.test(up)) return true;
  if (!words || !words.size) return false;
  return plainWords(up).some((w) => w.length >= 3 && words.has(w));
}
export function isBareLabel(line) {
  const up = String(line).toUpperCase().trim();
  return up.length <= 22 && up.endsWith(':') && SENSITIVE_LABEL.test(up);
}
/** Só o primeiro nome é guardado. */
export function firstName(full) {
  const t = String(full || '').trim().split(/\s+/)[0] || '';
  return t.length >= 2 ? t[0].toUpperCase() + t.slice(1).toLowerCase() : '';
}

function normName(s) {
  return s.toUpperCase().normalize('NFD').replace(/\p{Mn}+/gu, '').replace(/0/g, 'O').replace(/[^A-Z]/g, '');
}
export function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
export function sameName(a, b) {
  if (!a || !b) return true;
  const x = normName(a), y = normName(b);
  if (x === y || x.includes(y) || y.includes(x) || editDistance(x, y) <= 2) return true;
  const fa = plainWords(a).find(Boolean)?.replace(/0/g, 'O'), fb = plainWords(b).find(Boolean)?.replace(/0/g, 'O');
  if (!fa || !fb) return true;
  return fa === fb || (fa.length >= 4 && editDistance(fa, fb) <= 1);
}

/** Escolhe o valor mais votado. items: [{value, weight}] */
export function vote(items) {
  const acc = new Map();
  for (const { value, weight } of items) if (value !== null && value !== undefined) acc.set(value, (acc.get(value) || 0) + weight);
  let best = null, bw = -1;
  for (const [v, w] of acc) if (w > bw) { best = v; bw = w; }
  return best;
}

// ---------------- espelho de ponto ----------------

const WEEKDAYS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/\p{Mn}+/gu, '');
const fuzzyEq = (a, b) => a === b || (Math.abs(a.length - b.length) <= 2 && editDistance(a, b) <= (b.length >= 6 ? 2 : 1));
const digitsLoose = (s) => s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
const dateTokRx = /^([0-9OIlS]{1,2})[/.\-]([0-9OIlS]{1,2})[/.\-]([0-9OIlS]{4})(.*)$/;
const timeTokRx = /^([0-9OIlSB]{1,2})[:.;,]([0-9OIlSB]{2})([OIP0Q]?)$/;
const suffixRx = /^[OIP0Q]$/;
const bankValRx = /^[-–—~]?\d{1,4}[,.]\d{2}$/;
const cx = (w) => (w.left + w.right) / 2;
const cy = (w) => (w.top + w.bottom) / 2;
const hgt = (w) => w.bottom - w.top;

function isWeekday(text) {
  const t = norm(text).replace(/^[.,\s]+|[.,\s]+$/g, '');
  if (t.length < 4) return false;
  return WEEKDAYS.some((wd) => fuzzyEq(t.slice(0, wd.length), wd));
}
function parseDateTok(text) {
  const m = dateTokRx.exec(text.trim());
  if (!m) return null;
  const y = Number(digitsLoose(m[3])), mo = Number(digitsLoose(m[2])), d = Number(digitsLoose(m[1]));
  if (!isValidDate(y, mo, d)) return null;
  return { date: `${y}-${pad2(mo)}-${pad2(d)}`, rest: m[4] };
}

function parseEspelhoPage(words) {
  if (!words.length) return [];
  const dated = [];
  for (const w of words) { const p = parseDateTok(w.text); if (p) dated.push({ w, date: p.date, rest: p.rest }); }
  if (!dated.length) return [];
  const hasWeekday = (a) => {
    if (isWeekday(a.rest)) return true;
    const next = words.filter((o) => o !== a.w && o.left >= a.w.right - hgt(a.w) && Math.abs(cy(o) - cy(a.w)) < hgt(a.w) * 0.8)
      .sort((x, y) => x.left - y.left)[0];
    return !!next && isWeekday(next.text);
  };
  const withWd = dated.filter(hasWeekday);
  if (!withWd.length) return [];
  const xs = withWd.map((a) => cx(a.w)).sort((a, b) => a - b);
  const colX = xs[Math.floor(xs.length / 2)];
  const tol = (withWd.reduce((s, a) => s + (a.w.right - a.w.left), 0) / withWd.length) * 0.6;
  const seen = new Set();
  const anchors = dated.filter((a) => Math.abs(cx(a.w) - colX) < tol)
    .filter((a) => (seen.has(a.date) ? false : (seen.add(a.date), true)))
    .sort((a, b) => cy(a.w) - cy(b.w));

  const gaps = anchors.slice(1).map((a, i) => cy(a.w) - cy(anchors[i].w)).filter((g) => g > 0).sort((a, b) => a - b);
  const hs = words.map(hgt).sort((a, b) => a - b);
  const medH = hs[Math.floor(hs.length / 2)];
  const rowH = Math.max(gaps.length ? gaps[Math.floor(gaps.length / 2)] : medH * 2, medH * 1.1);

  const anchorWords = new Set(anchors.map((a) => a.w));
  const minLeft = Math.min(...anchors.map((a) => a.w.left)) - rowH;
  const cands = words.filter((w) => !anchorWords.has(w) && cx(w) > minLeft);

  // inclinação da foto
  const samples = [];
  for (const a of anchors) {
    let predY = cy(a.w), lastX = cx(a.w);
    for (const w of cands.filter((w) => cx(w) > a.w.right).sort((x, y) => cx(x) - cx(y))) {
      if (Math.abs(cy(w) - predY) < rowH * 0.35 && cx(w) - lastX < rowH * 12) {
        predY = predY * 0.5 + cy(w) * 0.5; lastX = cx(w);
        const dx = cx(w) - cx(a.w);
        if (dx > rowH * 6) samples.push((cy(w) - cy(a.w)) / dx);
      }
    }
  }
  samples.sort((a, b) => a - b);
  const slope = samples.length ? Math.max(-0.15, Math.min(0.15, samples[Math.floor(samples.length / 2)])) : 0;

  const rows = new Map(anchors.map((a) => [a, []]));
  for (const w of cands) {
    let best = null, bd = Infinity;
    for (const a of anchors) {
      if (cx(w) < a.w.left) continue;
      const d = Math.abs(cy(w) - (cy(a.w) + slope * (cx(w) - cx(a.w))));
      if (d < bd) { bd = d; best = a; }
    }
    if (best && bd < rowH * 0.48) rows.get(best).push(w);
  }

  const abono = words.find((w) => fuzzyEq(norm(w.text).replace(/\.+$/, ''), 'abono'));
  const boundaryX = abono ? abono.left : null;
  const tableLeft = Math.min(...anchors.map((a) => a.w.left));
  const allRow = [...rows.values()].flat();
  const tableRight = allRow.length ? Math.max(...allRow.map((w) => w.right)) : tableLeft;

  return anchors.map((a) => {
    const row = rows.get(a).sort((x, y) => cx(x) - cx(y));
    const marks = [];
    for (let i = 0; i < row.length; i++) {
      const w = row[i];
      const m = timeTokRx.exec(w.text.trim().toUpperCase());
      if (!m) continue;
      const t = buildTime(digitsLoose(m[1]), digitsLoose(m[2]));
      let suffix = !!m[3];
      if (!suffix) {
        const nx = row[i + 1];
        if (nx && suffixRx.test(nx.text.trim().toUpperCase()) && nx.left - w.right < hgt(w) * 2) { suffix = true; i++; }
      }
      const beforeAbono = boundaryX !== null ? cx(w) < boundaryX - hgt(w) * 0.5
        : (cx(w) - tableLeft) / Math.max(1, tableRight - tableLeft) < 0.565;
      if (t !== null && (suffix || beforeAbono)) marks.push(t);
    }
    const text = row.map((w) => norm(w.text)).join(' ');
    const absent = /aus[eo]nte/.test(text);
    const atestado = text.includes('atestado');
    const note = atestado ? 'Atestado médico' : text.includes('compensado') ? 'Compensado'
      : (text.includes('d.s.r') || text.includes('dsr')) ? 'D.S.R.' : absent ? 'Ausente' : null;
    return { date: a.date, marks: [...new Set(marks)].sort((x, y) => x - y), absent, atestado, note };
  });
}

function findCompanyBank(words) {
  const atual = words.filter((w) => fuzzyEq(norm(w.text), 'atual')).find((at) => {
    const next = words.filter((o) => o.left > at.right - 2 && Math.abs(cy(o) - cy(at)) < hgt(at) * 0.8).sort((a, b) => a.left - b.left)[0];
    return !next || !norm(next.text).startsWith('valor');
  });
  if (!atual) return null;
  const saldo = words.filter((w) => fuzzyEq(norm(w.text), 'saldo') && w.right <= atual.left + 4 && Math.abs(cy(w) - cy(atual)) < hgt(atual))
    .sort((a, b) => b.right - a.right)[0];
  const centerX = ((saldo ? saldo.left : atual.left) + atual.right) / 2;
  const value = words.filter((w) => bankValRx.test(w.text.trim()) && cy(w) > atual.bottom - 2 && cy(w) < atual.bottom + hgt(atual) * 5)
    .sort((a, b) => Math.abs(cx(a) - centerX) - Math.abs(cx(b) - centerX))[0];
  if (!value) return null;
  const t = value.text.trim();
  const negative = /^[-–—~]/.test(t);
  const [h, m] = t.replace(/^[-–—~]/, '').split(/[,.]/).map(Number);
  if (m > 59) return null;
  return (negative ? -1 : 1) * (h * 60 + m);
}

/** pages: lista de páginas, cada uma lista de {text,left,top,right,bottom}. */
export function parseEspelho(pages) {
  const byDate = new Map();
  for (const page of pages) for (const d of parseEspelhoPage(page)) {
    const prev = byDate.get(d.date);
    if (!prev || d.marks.length > prev.marks.length) byDate.set(d.date, d);
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  let companyBank = null;
  for (const p of pages) { companyBank = findCompanyBank(p); if (companyBank !== null) break; }
  return { days, companyBank, start: days[0]?.date || null, end: days[days.length - 1]?.date || null };
}

/** Compara um dia do espelho com as marcações do app. */
export function compareDay(day, app, mark) {
  const issues = [];
  const expType = (i) => (i % 2 === 0 ? 'ENTRADA' : 'SAIDA');
  const unmatched = [...app];
  const pending = [];
  const diff = (p, t) => Math.abs(minutesOf(p.dateTime) - t);
  const closest = (t) => unmatched.reduce((b, p) => (!b || diff(p, t) < diff(b, t) ? p : b), null);
  day.marks.forEach((t, i) => {
    const c = closest(t);
    if (c && diff(c, t) <= 1) {
      unmatched.splice(unmatched.indexOf(c), 1);
      if (day.marks.length % 2 === 0 && c.type !== expType(i)) issues.push({ kind: 'different', date: day.date, punch: c, time: t, type: expType(i), selected: true });
    } else pending.push([i, t]);
  });
  for (const [i, t] of pending) {
    const c = closest(t);
    if (c && diff(c, t) <= 90) {
      unmatched.splice(unmatched.indexOf(c), 1);
      issues.push({ kind: 'different', date: day.date, punch: c, time: t, type: expType(i), selected: true });
    } else issues.push({ kind: 'missing', date: day.date, time: t, type: expType(i), selected: true });
  }
  for (const p of unmatched) issues.push({ kind: 'onlyInApp', date: day.date, punch: p, selected: false });
  if (day.marks.length % 2 === 1) issues.push({ kind: 'odd', date: day.date, count: day.marks.length, selected: false, info: true });
  if (day.atestado && mark?.type !== 'ATESTADO') issues.push({ kind: 'mark', date: day.date, type: 'ATESTADO', selected: true });
  else if (day.absent && !day.atestado && !day.marks.length && !app.length && !mark?.type) issues.push({ kind: 'mark', date: day.date, type: 'FALTA', selected: false });
  const key = (x) => (x.kind === 'missing' || x.kind === 'different' ? x.time : x.kind === 'onlyInApp' ? minutesOf(x.punch.dateTime) : 9999);
  return issues.sort((a, b) => key(a) - key(b));
}

export function compareEspelho(esp, byDate, marks) {
  return esp.days.map((d) => {
    const app = [...(byDate[d.date] || [])].sort((a, b) => a.dateTime.localeCompare(b.dateTime));
    return { date: d.date, espelho: d, app, issues: compareDay(d, app, marks[d.date]) };
  });
}

// ---------------- assistente de leitura (aprende o modelo de comprovante do usuário) ----------------
// Guarda só posições (relativas à área do texto) e rótulos genéricos ("HORA", "ÀS"). Nunca texto do comprovante.

/** Horários de um trecho (uma linha da foto). */
export function timesIn(line) {
  const text = String(line).toUpperCase();
  const out = [];
  const m = labeledTimeRx.exec(text);
  if (m) { const t = buildTime(fixDigits(m[1]), fixDigits(m[2])); if (t !== null) out.push(t); }
  for (const x of matches(timeRx, text, (p, p2) => isDigit(p) || ((p === ':' || p === '.' || p === ',') && isDigit(p2)))) {
    let h = Number(x[1]); const ap = x[3] || '';
    if (ap.startsWith('P') && h < 12) h += 12;
    if (ap.startsWith('A') && h === 12) h = 0;
    const t = buildTime(h, Number(x[2])); if (t !== null && !out.includes(t)) out.push(t);
  }
  return out;
}
/** Datas de um trecho (uma linha da foto). */
export function datesIn(line, today = null) {
  const r = parseReceipt(line, today);
  return r.date ? [r.date] : [];
}

const box = (l, t, r, b) => ({ l, t, r, b });
const cxOf = (b) => (b.l + b.r) / 2, cyOf = (b) => (b.t + b.b) / 2;
export function textArea(lines) {
  if (!lines.length) return null;
  const a = lines.reduce((u, x) => box(Math.min(u.l, x.box.l), Math.min(u.t, x.box.t), Math.max(u.r, x.box.r), Math.max(u.b, x.box.b)), lines[0].box);
  return a.r - a.l > 0.02 && a.b - a.t > 0.02 ? a : null;
}
export const toRelative = (b, a) => box((b.l - a.l) / (a.r - a.l), (b.t - a.t) / (a.b - a.t), (b.r - a.l) / (a.r - a.l), (b.b - a.t) / (a.b - a.t));
export const toAbsolute = (b, a) => box(a.l + b.l * (a.r - a.l), a.t + b.t * (a.b - a.t), a.l + b.r * (a.r - a.l), a.t + b.b * (a.b - a.t));

const GENERIC_LABELS = new Set(['HORA', 'HR', 'HORARIO', 'ÀS', 'AS', 'DATA', 'DIA', 'DT', 'EM', 'REGISTRADO', 'REGISTRADA', 'MARCACAO', 'MARCAÇÃO', 'BATIDA', 'ENTRADA', 'SAIDA', 'SAÍDA', 'PONTO', 'REGISTRO']);
const cleanT = (s) => s.toUpperCase().replace(/O/g, '0').replace(/ /g, '');
function timePatterns(t) {
  const h = Math.floor(t / 60), m = pad2(t % 60);
  return [`${pad2(h)}:${m}`, `${h}:${m}`, `${pad2(h)}H${m}`, `${h}H${m}`, `${pad2(h)}.${m}`];
}
function datePatterns(d) {
  const [y, mo, da] = d.split('-');
  return [`${da}/${mo}/${y}`, `${da}/${mo}/${y.slice(2)}`, `${Number(da)}/${Number(mo)}/${y}`, d, `${da}-${mo}-${y}`, `${da}.${mo}.${y}`, `${da}/${mo}`];
}
export function locate(lines, patterns) {
  for (const p of patterns) {
    const hit = lines.find((l) => cleanT(l.text).includes(p));
    if (!hit) continue;
    const up = hit.text.toUpperCase();
    const idx = up.replace(/O/g, '0').indexOf(p.slice(0, 2));
    const before = idx > 0 ? up.slice(0, idx) : '';
    const m = /([A-ZÀ-Ú]{2,14})\s*[:;.\-]?\s*$/.exec(before);
    return { line: hit, label: m && GENERIC_LABELS.has(m[1]) ? m[1] : null };
  }
  return null;
}
function mergeHint(old, b, label, manual) {
  if (!old || manual) return { box: b, label: label || old?.label || null, samples: (old?.samples || 0) + 1, manual: manual || !!old?.manual };
  const w = Math.min(0.7, old.samples / (old.samples + 1));
  const mix = (a, c) => a * w + c * (1 - w);
  return { box: box(mix(old.box.l, b.l), mix(old.box.t, b.t), mix(old.box.r, b.r), mix(old.box.b, b.b)), label: label || old.label, samples: old.samples + 1, manual: old.manual };
}
export const isTrained = (p) => !!p && ((p.time?.samples || 0) >= 2 || !!p.time?.manual);

/** Aprende com uma leitura confirmada/corrigida. manualTime/manualDate: área marcada pelo usuário (frações da imagem). */
export function learnLayout(profile, lines, time, date, corrected, manualTime = null, manualDate = null) {
  const p = { time: null, date: null, confirmed: 0, corrected: 0, ...(profile || {}) };
  const area = textArea(lines) || box(0, 0, 1, 1);
  const th = time !== null && time !== undefined ? locate(lines, timePatterns(time)) : null;
  const tb = manualTime || th?.line.box;
  if (tb) p.time = mergeHint(p.time, toRelative(tb, area), th?.label, !!manualTime);
  const dh = date ? locate(lines, datePatterns(date)) : null;
  const db = manualDate || dh?.line.box;
  if (db) p.date = mergeHint(p.date, toRelative(db, area), dh?.label, !!manualDate);
  if (corrected) p.corrected++; else p.confirmed++;
  return p;
}

/** Lê hora e data procurando primeiro onde o padrão do usuário diz que elas ficam. */
export function guidedRead(profile, lines, today = null) {
  const area = textArea(lines);
  if (!area || !profile) return { time: null, date: null, timeScore: 0, dateScore: 0 };
  const best = (hint, read) => {
    if (!hint) return [null, 0];
    const target = toAbsolute(hint.box, area);
    let bv = null, bs = 0;
    for (const line of lines) {
      const dist = Math.hypot((cxOf(line.box) - cxOf(target)) / Math.max(area.r - area.l, 0.01), (cyOf(line.box) - cyOf(target)) / Math.max(area.b - area.t, 0.01));
      if (dist > 0.3) continue;
      const vals = read(line.text);
      if (!vals.length) continue;
      let s = 1 / (1 + dist * 10);
      if (hint.label && line.text.toUpperCase().includes(hint.label)) s += 0.5;
      s *= Math.max(0.4, Math.min(hint.samples, 4) / 4) + (hint.manual ? 0.5 : 0);
      if (s > bs) { bs = s; bv = vals[0]; }
    }
    return [bv, bs];
  };
  const [time, timeScore] = best(profile.time, (t) => timesIn(t));
  const [date, dateScore] = best(profile.date, (t) => datesIn(t, today));
  return { time, date, timeScore, dateScore };
}

/** Valida um backup vindo de fora antes de importar (formato, tipos e limites). Lança erro se inválido. */
export function validateBackup(b) {
  if (!b || typeof b !== 'object') throw new Error('Arquivo inválido');
  const isDT = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  const isD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10));
  const num = (n) => Number.isInteger(n) && Math.abs(n) <= 100000;
  const punches = b.punches || [], adj = b.adjustments || [], marks = b.dayMarks || [];
  if (!Array.isArray(punches) || punches.length > 50000) throw new Error('Pontos inválidos');
  for (const p of punches) if (!isDT(p.dateTime) || !['ENTRADA', 'SAIDA'].includes(p.type)) throw new Error('Ponto inválido');
  if (!Array.isArray(adj) || adj.length > 10000) throw new Error('Ajustes inválidos');
  for (const a of adj) if (!isD(a.referenceDate) || !num(a.minutesDelta)) throw new Error('Ajuste inválido');
  if (!Array.isArray(marks) || marks.length > 20000) throw new Error('Dias inválidos');
  for (const m of marks) if (!isD(m.date) || (m.type && !DAY_TYPES[m.type])) throw new Error('Dia inválido');
  if (b.checkpoint && (!isD(b.checkpoint.date) || !num(b.checkpoint.minutes))) throw new Error('Saldo inválido');
  return true;
}
