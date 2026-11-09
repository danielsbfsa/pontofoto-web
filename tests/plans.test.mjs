import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import * as P from '../js/plans.js';

const settings = { uf: 'BA', city: 'Feira de Santana' };
const hmap = P.holidayMap([2026, 2027], settings);
const cfg = { weekly: [480, 480, 480, 480, 480, 0, 0], tolerance: 10, lunch: 60, holidays: new Set(Object.keys(hmap)), autoDouble: true };
const Pn = (dt, type) => ({ dateTime: dt, type, source: 'PHOTO' });

test('páscoa e feriados móveis', () => {
  assert.equal(P.easter(2026), '2026-04-05');
  assert.equal(P.easter(2027), '2027-03-28');
  assert.equal(hmap['2026-04-03'].name, 'Sexta-feira Santa');
  assert.equal(hmap['2026-07-02'].scope, 'Estadual');
  assert.ok(!hmap['2026-07-26']); // municipal só vale confirmado
  const pend = P.holidaysForYear(2026, settings).find((h) => h.date === '2026-07-26');
  assert.ok(pend.pending);
  assert.equal(P.holidayMap([2026], { ...settings, confirmedHolidays: [pend.key] })['2026-07-26'].scope, 'Municipal');
  assert.ok(P.cityKnown('BA', 'feira de santana'));
  assert.ok(!P.cityKnown('SP', 'Campinas'));
  const off = P.holidayMap([2026], { ...settings, disabledHolidays: ['Estadual:Independência da Bahia'] });
  assert.ok(!off['2026-07-02']);
});

test('feriado zera a jornada e domingo/feriado contam em dobro automaticamente', () => {
  const fer = L.summarize('2026-11-20', [Pn('2026-11-20T08:00', 'ENTRADA'), Pn('2026-11-20T12:00', 'SAIDA')], null, cfg);
  assert.equal(fer.expectedMinutes, 0);
  assert.equal(fer.balanceMinutes, 480); // 4h em dobro
  const dom = L.summarize('2026-11-08', [Pn('2026-11-08T08:00', 'ENTRADA'), Pn('2026-11-08T12:00', 'SAIDA')], null, cfg);
  assert.equal(dom.balanceMinutes, 480);
  const off = L.summarize('2026-11-08', [Pn('2026-11-08T08:00', 'ENTRADA'), Pn('2026-11-08T12:00', 'SAIDA')], { date: '2026-11-08', doubleMode: 'OFF' }, cfg);
  assert.equal(off.balanceMinutes, 240);
});

test('estratégias para a meta', () => {
  const goal = { targetMinutes: 0, deadline: '2026-11-30', startMinutes: -2617 };
  const today = '2026-11-05';
  const uteis = P.strategyPlan(goal, { even: true }, -2617, today, cfg, {});
  // 05/11..30/11 sem 20/11 (feriado): 17 dias úteis
  assert.equal(uteis.workdays, 17);
  assert.equal(uteis.perDay, Math.ceil(2617 / 17));
  const sab = P.strategyPlan(goal, { even: true, sat: 240 }, -2617, today, cfg, {});
  assert.equal(sab.sats, 4);
  assert.equal(sab.perDay, Math.ceil((2617 - 960) / 17));
  const dom = P.strategyPlan(goal, { even: true, sun: 240 }, -2617, today, cfg, {});
  assert.equal(dom.fixed, 4 * 480); // 4 domingos valendo dobro
  assert.equal(P.targetFor('2026-11-07', goal, { even: true, sat: 240 }, sab, cfg, {}), 240);
  const sugg = P.suggestStrategies(goal, -2617, today, cfg, {});
  assert.ok(sugg.length >= 6);
  assert.ok(sugg.every((s) => s.text));
});

test('emendas, ideias e plano anual', () => {
  const up = P.upcomingHolidays('2026-11-05', 60, hmap, cfg, {});
  const consc = up.find((h) => h.date === '2026-11-20'); // sexta
  assert.equal(consc.kind, 'prolongado');
  const y27 = P.upcomingHolidays('2027-01-01', 365, hmap, cfg, {});
  const tira = y27.find((h) => h.date === '2027-04-21'); // quarta em 2027
  assert.equal(tira.kind, 'meio');
  const ideas = P.vacationIdeas('2026-11-05', 365, cfg, {}, hmap);
  assert.ok(ideas.length > 0);
  assert.ok(ideas.every((i) => i.totalOff > i.workdays));
  const plan = P.annualPlan('2026-11-05', '2027-12-31', -600, cfg, {}, hmap);
  assert.ok(plan.items.every((i) => i.kind === 'ponte'));
  assert.ok(plan.perDay >= 0);
});

test('histórico semanal do banco', () => {
  const punches = [Pn('2026-11-03T07:00', 'ENTRADA'), Pn('2026-11-03T17:00', 'SAIDA'), Pn('2026-10-26T08:00', 'ENTRADA'), Pn('2026-10-26T15:00', 'SAIDA')];
  const by = L.groupByDate(punches);
  const h = P.weeklyHistory(by, {}, cfg, [], null, '2026-11-05', 3);
  assert.equal(h.length, 3);
  assert.equal(h[1].delta, -60); // semana de 26/10: 7h de 8h
  assert.equal(h[2].delta, 120); // semana atual até ontem: 10h de 8h
});

test('mensagem do dia muda e repete', () => {
  assert.notEqual(P.dailyMessage('2026-11-05'), P.dailyMessage('2026-11-06'));
  assert.equal(P.dailyMessage('2026-11-05'), P.dailyMessage('2026-11-05'));
});

test('saldo fantasma: fotos fora de ordem e dia incompleto', () => {
  const d = '2026-11-04';
  const gravado = [Pn(`${d}T13:00`, 'ENTRADA'), Pn(`${d}T07:30`, 'SAIDA'), Pn(`${d}T12:00`, 'SAIDA'), Pn(`${d}T17:30`, 'SAIDA')];
  const s = L.summarize(d, gravado, null, cfg);
  assert.equal(s.workedMinutes, 540);
  assert.equal(s.balanceMinutes, 60);
  assert.equal(L.normalizeTypes(gravado), 1); // só 07:30 estava como saída
  assert.deepEqual(gravado.sort((a, b) => a.dateTime.localeCompare(b.dateTime)).map((p) => p.type), ['ENTRADA', 'SAIDA', 'ENTRADA', 'SAIDA']);
  const um = L.summarize(d, [Pn(`${d}T07:30`, 'ENTRADA')], null, cfg);
  assert.ok(um.incomplete);
  assert.equal(um.balanceMinutes, 0);
});

import { moodMessage, SITUATION } from '../js/plans.js';
test('frase da situação igual ao Android', () => {
  assert.ok(SITUATION.sexta.includes(moodMessage('2026-11-13T15:00', 0, 300, 480, 2, true)));
  assert.ok(SITUATION.cumprida.includes(moodMessage('2026-11-11T18:00', 0, 480, 480, 4, false)));
  assert.ok(SITUATION.vermelho.includes(moodMessage('2026-11-10T14:00', -120, 200, 480, 2, true)));
});
