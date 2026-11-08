import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/escala.js';

const turno = { start: '08:00', end: '17:48', break: 60 }; // 8h48 líquidas

test('5x2 de 8h48 fica em 44 h e passa sem avisos', () => {
  const days = E.generate({ pattern: '5x2', shift: turno, from: '2026-11-09', weeks: 3 }); // começa numa segunda
  assert.equal(days.filter((d) => d.shift).length, 15);
  assert.deepEqual(E.checks(days, { pattern: '5x2' }), []);
});

test('6x1 com turno de 8h48 passa de 44 h e trabalha 3 domingos', () => {
  const days = E.generate({ pattern: '6x1', shift: turno, offDay: 0, from: '2026-11-09', weeks: 3 });
  const w = E.checks(days, { pattern: '6x1' });
  assert.ok(w.some((x) => x.includes('acima de 44 h')));
  assert.ok(w.some((x) => x.includes('domingo')));
});

test('12x36 alterna e lembra do acordo', () => {
  const days = E.generate({ pattern: '12x36', shift: { start: '07:00', end: '19:00', break: 60 }, from: '2026-11-09', weeks: 2 });
  assert.equal(days.filter((d) => d.shift).length, 7);
  assert.ok(E.checks(days, { pattern: '12x36' })[0].includes('59-A'));
});

test('descanso curto entre jornadas', () => {
  const days = [{ date: '2026-11-09', shift: { start: '14:00', end: '23:00', break: 60 } }, { date: '2026-11-10', shift: { start: '06:00', end: '14:00', break: 60 } }];
  assert.ok(E.checks(days, { pattern: 'semana' }).some((x) => x.includes('11 h')));
});

test('código da escala vai e volta e vira jornada do funcionário', () => {
  const days = E.generate({ pattern: '12x36', shift: { start: '07:00', end: '19:00', break: 60 }, from: '2026-11-09', weeks: 4 });
  const back = E.decodeSchedule(E.encodeSchedule({ name: 'Ana', place: 'Loja Centro', days }));
  assert.equal(back.name, 'Ana');
  assert.equal(back.days.length, 28);
  assert.deepEqual(back.days[0].shift, { start: '07:00', end: '19:00', break: 60 });
  const s = E.toEmployeeSettings(back.days);
  assert.deepEqual(s.weekly, [660, 660, 660, 660, 660, 660, 660]); // 11 h líquidas em todo dia da semana
  assert.equal(s.folgas.length, 14); // dias alternados viram folga
  assert.deepEqual(s.punchTimes, ['07:00', '12:30', '13:30', '19:00']);
  assert.throws(() => E.decodeSchedule('lixo'));
});
