import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRIP_PAYERS, payerName, validateReceiptFile, receiptStoragePath } from '../src/utils/receipts.js';

test('trip payer selector contains all five travelers', () => {
  assert.deepEqual(TRIP_PAYERS.map(x => x.name),
    ['Gennady', 'Marina', 'Michelle', 'Gilad', 'Ori']);
  assert.equal(payerName('michelle'), 'Michelle');
  assert.equal(payerName('unknown'), '');
});

test('receipt validation accepts images up to 8 MB and rejects other files', () => {
  assert.equal(validateReceiptFile({ type: 'image/jpeg', size: 1024 }).ok, true);
  assert.equal(validateReceiptFile({ type: 'application/pdf', size: 1024 }).ok, false);
  assert.equal(validateReceiptFile({ type: 'image/png', size: 9 * 1024 * 1024 }).ok, false);
});

test('receipt storage path is scoped by destination/category and does not expose filename', () => {
  const path = receiptStoragePath('El Chaltén', 'Meals & Dining',
    { type: 'image/jpeg', name: 'personal-card-last4-1234.jpg' }, 12345, 'abc123');
  assert.equal(path, 'receipts/el-chalten/meals-dining/12345-abc123.jpg');
  assert.doesNotMatch(path, /personal-card|last4/);
});

test('cost editor exposes payer and camera/upload receipt controls', () => {
  const source = readFileSync(new URL('../src/components/CostTracker.jsx', import.meta.url), 'utf8');
  assert.match(source, /<label>Paid by<select/);
  assert.match(source, /TRIP_PAYERS\.map/);
  assert.match(source, /Take photo \/ Upload receipt/);
  assert.match(source, /accept="image\/\*"/);
  assert.match(source, /capture="environment"/);
  assert.match(source, /uploadBytes/);
  assert.match(source, /receipt\.storagePath/);
  assert.match(source, /Paid by: \{payerName\(row\.paidBy\) \|\| 'Not specified'\}/);
});
