// Escalas de trabalho (para quem organiza a equipe). Lógica pura, sem tela: testável no Node.
// É uma ferramenta de PLANEJAMENTO: não registra ponto e não substitui o controle oficial (CLT art. 74).

const pad2 = (n) => String(n).padStart(2, '0');
export const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
export const hm = (min) => `${pad2(Math.floor(((min % 1440) + 1440) % 1440 / 60))}:${pad2(((min % 60) + 60) % 60)}`;
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export const weekdayOf = (iso) => (new Date(iso + 'T12:00:00').getDay() + 6) % 7; // 0 = segunda

/** Duração trabalhada de um turno (fim pode passar da meia-noite), sem o intervalo. */
export function shiftMinutes(s) {
  if (!s) return 0;
  let len = toMin(s.end) - toMin(s.start);
  if (len <= 0) len += 1440;
  return Math.max(0, len - (s.break || 0));
}

/**
 * Gera os dias de um funcionário. pattern:
 *  '5x2'  segunda a sexta;  '6x1' seis dias e folga no dia `offDay` (0=seg..6=dom);
 *  '12x36' dia sim, dia não a partir de `from`;  'semana' dias marcados em `days` (array de 7 booleans).
 */
export function generate({ pattern, shift, offDay = 6, days = [], from, weeks = 4, startOn = 0 }) {
  const out = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(from, i), wd = weekdayOf(date);
    let work;
    if (pattern === '5x2') work = wd < 5;
    else if (pattern === '6x1') work = wd !== offDay;
    else if (pattern === '12x36') work = (i + startOn) % 2 === 0;
    else work = !!days[wd];
    out.push({ date, shift: work ? { ...shift } : null });
  }
  return out;
}

/** Avisos da escala (não bloqueiam nada): limites da CLT mais comuns. */
export function checks(days, { pattern, commerce = true } = {}) {
  const w = [];
  // jornada semanal (44 h), exceto 12x36, que compensa em média
  if (pattern !== '12x36') {
    for (let i = 0; i < days.length; i += 7) {
      const total = days.slice(i, i + 7).reduce((a, d) => a + shiftMinutes(d.shift), 0);
      if (total > 44 * 60) w.push(`Semana de ${days[i].date.slice(8, 10)}/${days[i].date.slice(5, 7)}: ${Math.floor(total / 60)}h${pad2(total % 60)}, acima de 44 h (o excedente é hora extra).`);
    }
  } else {
    w.push('12x36 precisa de acordo individual escrito ou convenção coletiva (CLT art. 59-A).');
  }
  // intervalo dentro da jornada (art. 71)
  const s0 = days.find((d) => d.shift)?.shift;
  if (s0) {
    const len = shiftMinutes(s0);
    if (len > 360 && (s0.break || 0) < 60) w.push('Turno de mais de 6 h precisa de intervalo de 1 h a 2 h (CLT art. 71).');
    else if (len > 240 && len <= 360 && (s0.break || 0) < 15) w.push('Turno de 4 h a 6 h precisa de 15 min de intervalo (CLT art. 71).');
  }
  // descanso entre jornadas (art. 66) e dias seguidos sem folga (art. 67)
  let streak = 0, maxStreak = 0;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (d.shift) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0;
    const next = days[i + 1];
    if (d.shift && next?.shift) {
      let endAbs = toMin(d.shift.end); if (endAbs <= toMin(d.shift.start)) endAbs += 1440;
      const rest = 1440 + toMin(next.shift.start) - endAbs;
      if (rest < 11 * 60) { w.push(`Entre ${d.date.slice(8, 10)}/${d.date.slice(5, 7)} e o dia seguinte o descanso é de ${Math.floor(rest / 60)} h; o mínimo é 11 h (CLT art. 66).`); break; }
    }
  }
  if (maxStreak >= 7) w.push(`${maxStreak} dias seguidos sem folga: o descanso semanal de 24 h é obrigatório (CLT art. 67).`);
  // comércio: um domingo de folga a cada 3 semanas (Lei 10.101/2000)
  if (commerce) {
    const sundays = days.filter((d) => weekdayOf(d.date) === 6);
    for (let i = 0; i + 2 < sundays.length; i++) {
      if (sundays.slice(i, i + 3).every((d) => d.shift)) { w.push('No comércio, a folga deve cair num domingo pelo menos a cada 3 semanas (Lei 10.101/2000).'); break; }
    }
  }
  return w;
}

// ---------- compartilhar com o funcionário (sem servidor: tudo vai no próprio link) ----------

const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** Código da escala de UM funcionário: apelido, local (opcional) e os dias com horário. */
export function encodeSchedule({ name, place = '', days }) {
  const d = days.map((x) => (x.shift ? `${x.shift.start.replace(':', '')}${x.shift.end.replace(':', '')}${pad2(Math.min(99, Math.round((x.shift.break || 0) / 5)))}` : '-')).join('.');
  return b64url(JSON.stringify({ v: 1, n: String(name).slice(0, 30), p: String(place).slice(0, 40), f: days[0]?.date, d }));
}

export function decodeSchedule(code) {
  const o = JSON.parse(unb64url(String(code).trim()));
  if (o.v !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(o.f || '') || typeof o.d !== 'string') throw new Error('Código de escala inválido');
  const parts = o.d.split('.');
  if (parts.length > 400) throw new Error('Escala longa demais');
  const days = parts.map((p, i) => {
    const date = addDays(o.f, i);
    if (p === '-') return { date, shift: null };
    if (!/^\d{10}$/.test(p)) throw new Error('Código de escala inválido');
    return { date, shift: { start: `${p.slice(0, 2)}:${p.slice(2, 4)}`, end: `${p.slice(4, 6)}:${p.slice(6, 8)}`, break: Number(p.slice(8, 10)) * 5 } };
  });
  return { name: String(o.n || '').slice(0, 30), place: String(o.p || '').slice(0, 40), days };
}

/**
 * O que o app do funcionário faz com a escala: jornada por dia da semana (a mais comum),
 * folgas nos dias de trabalho em que a escala dá folga, e horários dos lembretes de ponto.
 */
export function toEmployeeSettings(days) {
  const byWd = Array.from({ length: 7 }, () => []);
  days.forEach((d) => byWd[weekdayOf(d.date)].push(shiftMinutes(d.shift)));
  const mode = (arr) => { const c = new Map(); arr.forEach((v) => c.set(v, (c.get(v) || 0) + 1)); let b = 0, n = -1; for (const [v, k] of c) if (k > n || (k === n && v > b)) { b = v; n = k; } return b; };
  // usa o maior turno do dia da semana quando há trabalho nele (12x36 alterna: as folgas viram marcação)
  const weekly = byWd.map((arr) => { const work = arr.filter((m) => m > 0); return work.length ? mode(work) : 0; });
  const folgas = days.filter((d) => !d.shift && weekly[weekdayOf(d.date)] > 0).map((d) => d.date);
  const s = days.find((d) => d.shift)?.shift;
  let punchTimes = null;
  if (s) {
    const st = toMin(s.start), len = shiftMinutes(s), br = s.break || 0;
    const lunch = br > 0 ? st + Math.round(len / 2 / 30) * 30 : null;
    punchTimes = lunch ? [hm(st), hm(lunch), hm(lunch + br), hm(st + len + br)] : [hm(st), hm(st + len)];
  }
  return { weekly, folgas, punchTimes, lunch: s?.break || 60 };
}
