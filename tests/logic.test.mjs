// Rode com: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const cfg = { weekly: [480, 480, 480, 480, 480, 0, 0], tolerance: 10, lunch: 60 };
const P = (dt, type) => ({ dateTime: dt, type, source: 'PHOTO' });

test('comprovante limpo (layout REP real)', () => {
  const r = L.parseReceipt(`COMPROVANTE DE REGISTRO DE PONTO
DO TRABALHADOR
RSOCIAL:XPERT PACK INDUSTRIA DE EM
BALAGENS - BA LTDA LOCAL:AV SUDEN
E 2369-CIS, FEIRA DE SANTANA-BA, 4
4010-025 NREP:00014003750283028 MO
DELO:IDCLASS BIO PROX CNPJ:3267761
8000187 CEI:00000000000000 NOME:DA
NIEL SANTOS BARBOSA CPF:0502146052
8 NSR:000049650 DATA:03/11/2026 HO
RA:12:07 AD:S2M6YLFMLCHNECKAYZY6G6`);
  assert.equal(r.company, 'XPERT PACK INDUSTRIA DE EMBALAGENS - BA LTDA');
  assert.equal(r.employeeName, 'DANIEL SANTOS BARBOSA');
  assert.equal(r.date, '2026-11-03');
  assert.equal(r.time, 12 * 60 + 7);
  assert.equal(r.nsr, '000049650');
  assert.ok(r.timeLabeled);
});

test('comprovante com erros de OCR', () => {
  const r = L.parseReceipt(`RSOCIAL :ACME INDUSTRIA DE EMBALAGENS LTDA
LOCAL: AV CENTRAL 10 NOME MARIA SOUZA
CPF: 12345678909 NSR:O00049650 DATA:O3/
11/2026 HORA: 12:O7 AD: XYZ`);
  assert.equal(r.company, 'ACME INDUSTRIA DE EMBALAGENS LTDA');
  assert.equal(r.employeeName, 'MARIA SOUZA');
  assert.equal(r.date, '2026-11-03');
  assert.equal(r.time, 12 * 60 + 7);
});

test('nomes parecidos', () => {
  assert.ok(L.sameName('João da Silva', 'JOAO DASILVA'));
  assert.ok(!L.sameName('JOAO DA SILVA', 'MARIA SOUZA'));
});

test('banco com saldo inicial', () => {
  const punches = [
    P('2026-10-30T08:00', 'ENTRADA'), P('2026-10-30T12:00', 'SAIDA'),
    P('2026-11-02T07:00', 'ENTRADA'), P('2026-11-02T12:00', 'SAIDA'), P('2026-11-02T13:00', 'ENTRADA'), P('2026-11-02T17:30', 'SAIDA'),
    P('2026-11-03T07:30', 'ENTRADA'), P('2026-11-03T12:00', 'SAIDA'), P('2026-11-03T13:00', 'ENTRADA'), P('2026-11-03T17:10', 'SAIDA'),
  ];
  const by = L.groupByDate(punches);
  const adj = [{ referenceDate: '2026-10-15', minutesDelta: 600 }, { referenceDate: '2026-11-03', minutesDelta: 30 }];
  const cp = { date: '2026-10-31', minutes: -(43 * 60 + 37) };
  assert.equal(L.bank(by, {}, cfg, adj, cp, '2026-11-04'), -(40 * 60 + 57));
  assert.equal(L.bank(by, {}, cfg, adj, null, '2026-11-04'), -240 + 90 + 40 + 600 + 30);
});

test('domingo com horário dobrado', () => {
  const s = L.summarize('2026-08-09', [P('2026-08-09T06:27', 'ENTRADA'), P('2026-08-09T09:55', 'SAIDA')], { date: '2026-08-09', doubled: true }, cfg);
  assert.equal(s.workedMinutes, 208);
  assert.equal(s.balanceMinutes, 416);
});

test('previsão de saída e meta', () => {
  const now = '2026-11-04T10:00';
  const s = L.summarize('2026-11-04', [P('2026-11-04T07:30', 'ENTRADA')], null, cfg, now);
  const f = L.forecast(s, cfg, 30, now);
  assert.equal(f.forJourney, 16 * 60 + 30);
  assert.equal(f.forGoal, 17 * 60);
  const p = L.plan({ targetMinutes: 0, deadline: '2026-11-30', startMinutes: -2617 }, -2457, '2026-11-04', cfg, {});
  assert.equal(p.workDaysLeft, 19);
  assert.equal(p.extraPerDay, 130);
});

// --- espelho: réplica com foto inclinada e erros de OCR ---
function seeded(seed) { let s = seed; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); }
const rows = [
  ['01/08/2026', 'Sabado', [], { obs: '** Compensado **' }],
  ['02/08/2026', 'Domingo', [], { obs: '** D.S.R. **' }],
  ['03/08/2026', 'Segunda', ['07:23', '12:58', '14:18', '17:02'], { abs: '00:41', jor: '08:19' }],
  ['05/08/2026', 'Quarta', ['07:33', '13:40'], { abs: '02:53', jor: '06:07' }],
  ['09/08/2026', 'Domingo', ['06:27', '09:55'], { he: '03:28', obs: '** D.S.R. **' }],
  ['13/08/2026', 'Quinta', ['07:04', '13:26', '17:25'], { abs: '02:38' }],
  ['25/08/2026', 'Terca', [], { abono: '09:00', abs: '09:00', obs: 'ATESTADO MEDICO', ausente: true }],
  ['28/08/2026', 'Sexta', ['07:09'], { abs: '08:00' }],
  ['31/08/2026', 'Segunda', [], { ausente: true }],
];
const colX = { data: 140, dia: 240, abono: 1148, he: 1247, abs: 1441, jor: 1538, obs: 1770 };
const markX = [365, 465, 563, 662, 760, 860];
function build(slope, noise, seed, errors) {
  const rnd = seeded(seed); const words = [];
  const add = (text, x, y) => {
    const w = text.length * 11, jx = (rnd() - 0.5) * noise, jy = (rnd() - 0.5) * noise, yy = y + slope * x + jy;
    words.push({ text, left: x - w / 2 + jx, top: yy - 9, right: x + w / 2 + jx, bottom: yy + 9 });
  };
  add('Data', colX.data, 322); add('Dia', colX.dia, 322); add('Abono', colX.abono, 322); add('H.E.', colX.he, 322);
  add('Emissão:', 740, 140); add('31/08/2026', 850, 140); add('01/08/2026', 1090, 78);
  rows.forEach(([d, dia, marks, o], i) => {
    const y = 345 + 28.6 * i;
    add(d, colX.data, y); add(errors && dia === 'Domingo' ? 'Somingo' : dia, colX.dia, y);
    marks.forEach((m, k) => {
      const x = markX[k];
      if (errors && k === 1) add(m + 'O', x, y);
      else if (errors && k === 2) { add(m.replace(/0/g, 'O'), x - 15, y); add('0', x + 32, y); }
      else { add(m, x - 15, y); add('O', x + 32, y); }
    });
    if (o.abono) add(o.abono, colX.abono, y);
    if (o.he) add(o.he, colX.he, y);
    if (o.abs) add(o.abs, colX.abs, y);
    if (o.jor) add(o.jor, colX.jor, y);
    if (o.ausente) { add('**', 660, y); add('Ausente', 720, y); add('**', 780, y); }
    if (o.obs) o.obs.split(' ').forEach((t, k) => add(t, colX.obs + k * 90, y));
  });
  const by = 1322;
  add('Saldo', 120, by); add('Anterior', 200, by); add('Saldo', 1360, by); add('Atual', 1420, by);
  add('Saldo', 1630, by); add('Atual', 1690, by); add('Valorizado', 1780, by);
  add('-100,50', 145, by + 24); add('-100,50', 1370, by + 24); add('-71,34', 1640, by + 24);
  return words.sort(() => rnd() - 0.5);
}
function checkEspelho(e) {
  assert.equal(e.days.length, rows.length);
  for (const [d, , marks] of rows) {
    const [dd, mm, yy] = d.split('/');
    const day = e.days.find((x) => x.date === `${yy}-${mm}-${dd}`);
    assert.deepEqual(day.marks.map(L.hm), marks, d);
  }
  assert.ok(e.days.find((x) => x.date === '2026-08-25').atestado);
  assert.ok(e.days.find((x) => x.date === '2026-08-31').absent);
  assert.equal(e.companyBank, -(100 * 60 + 50));
}
test('espelho: foto reta', () => checkEspelho(L.parseEspelho([build(0, 2, 1, false)])));
test('espelho: foto inclinada', () => checkEspelho(L.parseEspelho([build(0.011, 6, 2, false)])));
test('espelho: inclinada para cima', () => checkEspelho(L.parseEspelho([build(-0.012, 6, 3, false)])));
test('espelho: inclinada com erros de OCR', () => checkEspelho(L.parseEspelho([build(0.011, 6, 4, true)])));

test('comparação com o histórico', () => {
  const day = { date: '2026-08-03', marks: [443, 778, 858, 1022], absent: false, atestado: false };
  const app = [P('2026-08-03T07:23', 'ENTRADA'), P('2026-08-03T13:05', 'SAIDA'), P('2026-08-03T19:30', 'SAIDA')];
  const issues = L.compareDay(day, app, null);
  assert.equal(issues.filter((i) => i.kind === 'different').length, 1);
  assert.deepEqual(issues.filter((i) => i.kind === 'missing').map((i) => L.hm(i.time)), ['14:18', '17:02']);
  assert.equal(issues.filter((i) => i.kind === 'onlyInApp').length, 1);
});
