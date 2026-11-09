import test from 'node:test';
import assert from 'node:assert/strict';
import { isProtectedWord, prepareRedaction } from '../js/logic.js';

test('data, hora e rótulos ficam protegidos; CPF não', () => {
  for (const w of ['12/11/2026', '08:30', 'HORA:', 'DATA', 'HO', 'RA:08:30']) assert.ok(isProtectedWord(w), w);
  for (const w of ['123.456.789-00', 'FULANO', '12345678901']) assert.ok(!isProtectedWord(w), w);
});

test('tarja nunca cobre a hora', () => {
  const hora = { x0: 0.40, y0: 0.50, x1: 0.60, y1: 0.54 };
  const nome = { x0: 0.10, y0: 0.50, x1: 0.90, y1: 0.54 };
  const vizinha = { x0: 0.30, y0: 0.535, x1: 0.70, y1: 0.575 };
  const out = prepareRedaction([nome, vizinha], [hora], 0.6);
  for (const b of out) {
    const ox = Math.min(b.x1, hora.x1) - Math.max(b.x0, hora.x0), oy = Math.min(b.y1, hora.y1) - Math.max(b.y0, hora.y0);
    assert.ok(ox <= 0 || oy <= 0, JSON.stringify(b));
  }
});
