import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/Budget.jsx', import.meta.url), 'utf8');
test('Michelle and Gilad share displays dynamic estimate and separately pending actual', () => {
  const section = source.slice(source.indexOf('<h3>Michelle &amp; Gilad share</h3>'));
  assert.match(section, /coupleReport\.rows\.map/);
  assert.match(section, /Save allocation settings/);
  assert.match(section, /<span>Estimated share<\/span>/);
  assert.match(section, /coupleReport\.incomplete/);
  assert.match(section, /<span>Actual share<\/span>\s*<span>TBD<\/span>/);
  assert.doesNotMatch(section, /convertedEstimate\(budget\.daughterShare\)/);
});
