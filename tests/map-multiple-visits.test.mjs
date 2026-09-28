import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ArgentinaMap.jsx', import.meta.url), 'utf8');

test('map groups repeated coordinates and exposes both visits', () => {
  assert.match(source, /groupStopsByPoint/);
  assert.match(source, /group\.visits\.length > 1/);
  assert.match(source, /View \{\/\(arrival\)\/i\.test\(destination\.name\)/);
  assert.match(source, /\? 'Arrival'/);
  assert.match(source, /\? 'Return'/);
  assert.match(source, /map locations · \{stops\.length\} trip visits/);
});
