import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCosts, parseCost } from '../src/utils/budget.js';

test('numeric and unlabeled legacy entries remain USD', () => {
  assert.deepEqual(parseCost(120), { state: 'valid', amount: 120, currency: 'USD' });
  assert.deepEqual(parseCost('$1,250.50'), { state: 'valid', amount: 1250.5, currency: 'USD' });
  assert.deepEqual(parseCost('2,500'), { state: 'valid', amount: 2500, currency: 'USD' });
});

test('explicit USD, ARS and ILS entries identify their currency', () => {
  assert.deepEqual(parseCost('ARS 1,400'), { state: 'valid', amount: 1400, currency: 'ARS' });
  assert.deepEqual(parseCost('₪ 250'), { state: 'valid', amount: 250, currency: 'ILS' });
  assert.deepEqual(parseCost('100 USD'), { state: 'valid', amount: 100, currency: 'USD' });
  assert.deepEqual(parseCost('AR$ 1000'), { state: 'valid', amount: 1000, currency: 'ARS' });
});

test('ambiguous, missing, negative and multiple currency values are excluded', () => {
  assert.equal(parseCost('TBD').state, 'pending');
  assert.equal(parseCost('').state, 'pending');
  for (const raw of ['USD 100-200', '100 200', '-15', '15,5', 'ARS 100 USD', 'fare 30 USD']) {
    assert.equal(parseCost(raw).state, 'invalid', raw);
  }
});

test('destination cost totals use explicit USD-base rates before summing', () => {
  const data = [{ name: 'Ushuaia', costs: {
    groundTransport: [{ item: 'Transfer', estimatedCost: 'ARS 2800' }],
    meals: [{ item: 'Dinner', estimatedCost: '₪ 360' }],
    activities: [{ item: 'Tickets', estimatedCost: '$25' }],
    other: [{ item: 'Misc', estimatedCost: 'TBD' }]
  }}];
  const x = aggregateCosts(data, { ARS: 1400, ILS: 3.6 });
  assert.equal(x.totals.groundTransport, 2);
  assert.equal(x.totals.meals, 100);
  assert.equal(x.totals.activities, 25);
  assert.equal(x.grandTotal, 127);
  assert.equal(x.issues.length, 1);
  assert.equal(x.included, 3);
});

test('missing exchange rates exclude non-USD items instead of miscounting', () => {
  const input = [{ name: 'Mendoza', costs: {
    meals: [{ item: 'Lunch', estimatedCost: 'ARS 5000' }, { item: 'Water', estimatedCost: '12' }]
  }}];
  const x = aggregateCosts(input, null);
  assert.equal(x.grandTotal, 12);
  assert.equal(x.issues[0].state, 'rate_missing');
  assert.equal(x.issues[0].currency, 'ARS');
});
