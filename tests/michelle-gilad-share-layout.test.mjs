import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/Budget.jsx', import.meta.url), 'utf8');
test('Michelle and Gilad share displays separate estimated and actual rows', () => {
  const section = source.slice(source.indexOf('<h3>Michelle &amp; Gilad share</h3>'));
  assert.match(section, /<span>Estimated share<\/span>\s*<span>\{convertedEstimate\(budget\.daughterShare\)\}<\/span>/);
  assert.match(section, /<span>Actual share<\/span>\s*<span>TBD<\/span>/);
  assert.match(section, /once expenses are\s*explicitly allocated/);
});
