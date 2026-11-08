import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const T = '2026-11-08';
const p = (s) => L.parseReceipt(s, T);
const hm = (h, m) => h * 60 + m;

test('REP Portaria 671 com data e hora juntas', () => {
  const r = p(`COMPROVANTE DE REGISTRO DE PONTO DO TRABALHADOR
EMPREGADOR: EMPRESA FICTICIA LTDA
CNPJ: 11.222.333/0001-81
TRABALHADOR: MARIA DA SILVA
CPF: 123.456.789-09
NSR: 000004521
DATA E HORA: 06/11/2026 13:02`);
  assert.equal(r.date, '2026-11-06'); assert.equal(r.time, hm(13, 2)); assert.equal(r.nsr, '000004521');
});
test('segundos', () => { const r = p('NSR 000123 07/11/2026 07:59:41'); assert.equal(r.date, '2026-11-07'); assert.equal(r.time, hm(7, 59)); });
test('app: registrado às, com jornada e relógio da barra', () => {
  const r = p(`09:41
Ponto registrado com sucesso!
Olá, Joao
Sexta-feira, 06 de novembro de 2026
Registrado às 17:48
Jornada: 08:00 às 17:00`);
  assert.equal(r.date, '2026-11-06'); assert.equal(r.time, hm(17, 48));
});
test('escala antes da batida', () => { const r = p('Escala 08:00 - 18:00\nMarcação realizada\n05/11/2026 - 12:01'); assert.equal(r.time, hm(12, 1)); });
test('ISO', () => { const r = p('registro 2026-11-04T08:12:00-03:00'); assert.equal(r.date, '2026-11-04'); assert.equal(r.time, hm(8, 12)); });
test('8h05', () => { const r = p('Batida registrada em 03/11/26 às 8h05'); assert.equal(r.date, '2026-11-03'); assert.equal(r.time, hm(8, 5)); });
test('PM', () => { const r = p('Punch recorded Nov 02, 2026 05:31 PM'); assert.equal(r.date, '2026-11-02'); assert.equal(r.time, hm(17, 31)); });
test('mês abreviado', () => { const r = p('DATA: 01/NOV/2026 HORA: 18:20'); assert.equal(r.date, '2026-11-01'); assert.equal(r.time, hm(18, 20)); });
test('sem ano', () => { const r = p('Sex, 06/11\nEntrada 07:57'); assert.equal(r.date, '2026-11-06'); assert.equal(r.time, hm(7, 57)); });
test('ignora impressão', () => { const r = p('Impresso em 08/11/2026 10:00\nDATA: 07/11/2026 HORA: 17:03'); assert.equal(r.date, '2026-11-07'); assert.equal(r.time, hm(17, 3)); });
test('horas trabalhadas não é batida', () => { const r = p('Horas trabalhadas: 08:48\nSaída registrada 18:02 em 05/11/2026'); assert.equal(r.time, hm(18, 2)); });
test('CNPJ e CPF não viram data', () => { assert.equal(p('CNPJ 12.345.678/0001-90 CPF 123.456.789-09 PONTO 04/11/2026 08:00').date, '2026-11-04'); });
test('linhas pessoais', () => {
  const w = L.personalWords({ employeeName: 'JOAO CARLOS', company: 'ACME LTDA' });
  assert.ok(L.isSensitiveLine('CPF: 123.456.789-09', w));
  assert.ok(L.isSensitiveLine('Olá, Joao', w));
  assert.ok(!L.isSensitiveLine('HORA: 08:00', w));
  assert.ok(L.isBareLabel('NOME:'));
});
test('primeiro nome', () => {
  assert.equal(L.firstName('JOAO CARLOS PEREIRA'), 'Joao');
  assert.ok(L.sameName('Joao', 'JOAO CARLOS PEREIRA'));
  assert.ok(!L.sameName('Joao', 'MARIA SOUZA'));
});
