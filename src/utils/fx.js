/** The open ExchangeRate-API endpoint provides the most recently PUBLISHED daily
 * USD-base rate, not a real-time trade quote. See https://www.exchangerate-api.com/docs/free
 * Never pretend its timestamp is the moment the rate was measured.
 */
export const FX_ATTRIBUTION_URL = 'https://www.exchangerate-api.com';
export const FX_SOURCE = 'ExchangeRate-API (daily reference)';
export const FX_CURRENCIES = ['USD', 'ARS', 'ILS'];
export const MAX_RATE_AGE_MS = 48 * 60 * 60 * 1000;

export async function fetchUsdQuote(fetchImpl = fetch, now = Date.now()) {
  const response = await fetchImpl('https://open.er-api.com/v6/latest/USD', {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error('Exchange rate provider is unavailable.');
  const data = await response.json();
  const rateTimestampMs = Number(data.time_last_update_unix) * 1000;
  if (data.result !== 'success' || data.base_code !== 'USD' ||
      !Number.isFinite(rateTimestampMs) || rateTimestampMs <= 0 ||
      !Number.isFinite(data.rates?.ARS) || !Number.isFinite(data.rates?.ILS) ||
      data.rates.ARS <= 0 || data.rates.ILS <= 0) {
    throw new Error('Exchange rate data is incomplete.');
  }
  if (rateTimestampMs > now + 15 * 60 * 1000 || now - rateTimestampMs > MAX_RATE_AGE_MS) {
    throw new Error('Exchange rates are outdated. Retry later; nothing was saved.');
  }
  return {
    base: 'USD',
    rates: { USD: 1, ARS: data.rates.ARS, ILS: data.rates.ILS },
    rateTimestamp: new Date(rateTimestampMs).toISOString(),
    fetchedAt: new Date(now).toISOString(),
    source: FX_SOURCE
  };
}

export function currencyToUsd(amount, currency, quote) {
  if (!Number.isFinite(amount) || amount < 0 || !FX_CURRENCIES.includes(currency)) {
    throw new Error('Enter a valid amount and choose USD, ARS or ILS.');
  }
  if (currency === 'USD') return amount;
  const rate = quote?.rates?.[currency];
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Fresh exchange rates are required.');
  return amount / rate;
}

export function snapshotExpense(amount, currency, quote, now = Date.now()) {
  const usdValue = currencyToUsd(amount, currency, quote);
  const capturedAt = new Date(now).toISOString();
  return {
    estimatedCost: currency + ' ' + amount.toFixed(2),
    amount,
    currency,
    usdValue,
    capturedAt,
    fxSnapshot: currency === 'USD'
      ? { base: 'USD', rate: 1, source: 'USD', rateTimestamp: null, fetchedAt: capturedAt }
      : {
          base: 'USD',
          rate: quote.rates[currency],
          source: quote.source,
          rateTimestamp: quote.rateTimestamp,
          fetchedAt: quote.fetchedAt
        }
  };
}

export function currentDisplay(amountInUsd, currency, quote) {
  if (currency === 'USD') return amountInUsd;
  const rate = quote?.rates?.[currency];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return amountInUsd * rate;
}

export function formatMoney(value, currency) {
  return currency + ' ' + Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 0, maximumFractionDigits: 2
  });
}
