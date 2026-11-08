import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const cfg = { weekly: [528, 528, 528, 528, 528, 0, 0], tolerance: 10, lunch: 60, holidays: new Set(), autoDouble: true };
const P = (date, t) => ({ dateTime: `${date}T${t}`, type: 'ENTRADA' });
const day = '2026-11-10';

test('consulta abonada tira as horas da jornada', () => {
  const c = L.applyAppointments(cfg, [{ date: day, start: '14:00', end: '16:00', treatment: 'ABONADA' }]);
  const s = L.summarize(day, [P(day, '08:00'), P(day, '12:00'), P(day, '13:00'), P(day, '15:48')], null, c);
  assert.equal(s.expectedMinutes, 408);
  assert.equal(s.balanceMinutes, 0);
});

test('falta agendada que desconta conta sem batidas', () => {
  const c = L.applyAppointments(cfg, [{ date: day, treatment: 'BANCO' }]);
  assert.equal(L.summarize(day, [], null, c).balanceMinutes, -528);
  assert.equal(L.bank({}, {}, c, [], null, '2026-11-11'), -528);
});

test('extras em reais e noturno', () => {
  const c = { ...cfg, weekly: [480, 480, 480, 480, 480, 0, 0], tolerance: 0 };
  const sun = '2026-11-15';
  const days = [L.summarize(day, [P(day, '08:00'), P(day, '12:00'), P(day, '13:00'), P(day, '19:00')], null, c), L.summarize(sun, [P(sun, '08:00'), P(sun, '12:00')], null, c)];
  const m = L.monthPay(days, { salary: 2200, hours: 220 }, sun);
  assert.equal(L.money(m.extraValue), 'R$ 30,00');
  assert.equal(L.money(m.holidayValue), 'R$ 80,00');
  assert.equal(L.nightMinutes('2026-11-10T21:00', '2026-11-11T03:00'), 300);
  assert.equal(L.money(1234.567), 'R$ 1.234,57');
});

test('corridas: resumo e leitura do print', () => {
  const s = L.gigSummary([{ date: day, platform: 'Uber', online: 300, earnings: 250, trips: 14, km: 120 }, { date: '2026-11-11', platform: '99', online: 180, earnings: 150, tips: 10, km: 80, expenses: 40 }],
    day, '2026-11-16', { kmPerLiter: 12, fuelPrice: 6 });
  assert.equal(s.earnings, 410); assert.equal(s.expenses, 100); assert.equal(s.perHour, 38.75);
  const g = L.parseEarnings('Uber\nGanhos da semana\nR$ 1.234,56\n42 viagens\nOnline 31 h 20 min\nGorjetas R$ 35,00\n612,4 km');
  assert.deepEqual(g, { platform: 'Uber', earnings: 1234.56, tips: 35, trips: 42, online: 1880, km: 612.4 });
});
