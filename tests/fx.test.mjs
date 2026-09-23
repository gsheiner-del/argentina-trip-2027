import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchUsdQuote, snapshotExpense, currentDisplay } from '../src/utils/fx.js';

const NOW = Date.parse('2026-09-23T10:00:00.000Z');
const mockQuote = { result: 'success', base_code: 'USD',
  time_last_update_unix: Math.floor((NOW - 3600_000) / 1000),
  rates: { USD: 1, ARS: 1500, ILS: 3.75 } };
const provider = async (url, options) => {
  assert.equal(url, 'https://open.er-api.com/v6/latest/USD');
  assert.equal(options.cache, 'no-store');
  return { ok: true, json: async () => mockQuote };
};

test('Fetch FX quote when saving and preserve provider timestamp', async () => {
  const quote = await fetchUsdQuote(provider, NOW);
  assert.equal(quote.rates.ARS, 1500);
  assert.equal(quote.rateTimestamp, new Date(NOW - 3600_000).toISOString());
  const saved = snapshotExpense(3000, 'ARS', quote, NOW);
  assert.equal(saved.usdValue, 2);
  assert.equal(saved.fxSnapshot.rate, 1500);
  assert.equal(saved.fxSnapshot.rateTimestamp, quote.rateTimestamp);
  assert.equal(currentDisplay(saved.usdValue, 'ILS', quote), 7.5);
});

test('Stale FX provider response is rejected without overwriting saved values', async () => {
  const stale = { ...mockQuote, time_last_update_unix: Math.floor((NOW - 49 * 3600_000) / 1000) };
  await assert.rejects(
    () => fetchUsdQuote(async () => ({ ok: true, json: async () => stale }), NOW),
    /outdated/
  );
});

test('Cannot create a foreign-currency snapshot without current quote', () => {
  assert.throws(() => snapshotExpense(1000, 'ARS', null, NOW), /Fresh exchange rates/);
  assert.equal(snapshotExpense(100, 'USD', null, NOW).usdValue, 100);
});