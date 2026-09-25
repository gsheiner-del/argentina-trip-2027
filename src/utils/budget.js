import { currencyToUsd, currentDisplay, formatMoney } from './fx.js';

export const COST_CATEGORIES = [
  { key: 'groundTransport', label: '🚗 Ground Transportation' },
  { key: 'meals', label: '🍽️ Meals & Dining' },
  { key: 'activities', label: '🎭 Activities' },
  { key: 'other', label: '📋 Other' }
];

export function parseCost(value) {
  if (value === null || value === undefined || String(value).trim() === '' ||
      /^(tbd|pending|unknown|not booked|n\/a|—|-)$/i.test(String(value).trim())) {
    return { state: 'pending' };
  }
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0
    ? { state: 'valid', amount: value, currency: 'USD' } : { state: 'invalid' };

  let raw = String(value).trim().toUpperCase().replace(/AR\$/g, 'ARS ').replace(/US\$/g, 'USD ');
  const currencies = ['USD', 'ARS', 'ILS'].filter((code) =>
    new RegExp('\\b' + code + '\\b').test(raw));
  if (/₪/.test(raw)) currencies.push('ILS');
  if (/\$/.test(raw)) currencies.push('USD');
  if (new Set(currencies).size > 1) return { state: 'invalid' };
  const currency = currencies[0] || 'USD';
  const digits = raw.replace(/\b(?:USD|ARS|ILS)\b|[₪$]/g, '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(digits)) return { state: 'invalid' };
  const amount = Number(digits.replace(/,/g, ''));
  return Number.isFinite(amount) && amount >= 0
    ? { state: 'valid', amount, currency } : { state: 'invalid' };
}

/** For rows saved by the new editor, always use their saved USD basis.
 * Currency conversion later must not silently rewrite the historical expense.
 * Old rows with no fxSnapshot remain indicative, based on today's quote.
 */
export function aggregateCosts(destinations = [], quote = null) {
  const totals = Object.fromEntries(COST_CATEGORIES.map(({ key }) => [key, 0]));
  const issues = [];
  let grandTotal = 0, trackedItems = 0, provisionalCount = 0;
  for (const destination of Array.isArray(destinations) ? destinations : []) {
    for (const category of COST_CATEGORIES) {
      const rows = destination?.costs?.[category.key];
      for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
        trackedItems++;
        const context = { destination: destination?.name || 'Unknown stop',
          category: category.key, item: row?.item || 'Item ' + (index + 1) };
        const parsed = parseCost(row?.estimatedCost);
        if (parsed.state !== 'valid') {
          issues.push({ ...context, state: parsed.state });
          continue;
        }
        let usd;
        if (row?.fxSnapshot && Number.isFinite(row.usdValue) && row.usdValue >= 0) {
          usd = row.usdValue;
        } else {
          if (parsed.currency !== 'USD') provisionalCount++;
          try {
            usd = currencyToUsd(parsed.amount, parsed.currency, quote);
          } catch {
            issues.push({ ...context, state: 'rate_missing', currency: parsed.currency });
            continue;
          }
        }
        totals[category.key] += usd;
        grandTotal += usd;
      }
    }
  }
  return { totals, grandTotal, issues, trackedItems,
    included: trackedItems - issues.length, provisionalCount };
}

/** Old budget values are reference estimates, NOT additions to tracked costs.
 * Preserve ranges and '+' when converting all breakdown rows for display.
 */
export function convertPlanningEstimate(raw, selectedCurrency, quote) {
  if (raw === undefined || raw === null || String(raw).trim() === '' ||
      /^(tbd|pending)$/i.test(String(raw).trim())) return 'TBD';
  const value = String(raw).trim();
  const match = value.match(/^(estimated\s*)?(?:(USD|ARS|ILS)\s*|(\$)\s*)?(\d[\d,]*(?:\.\d{1,2})?)(?:\s*[-–]\s*(\d[\d,]*(?:\.\d{1,2})?))?(\+)?$/i);
  if (!match) return value + (selectedCurrency !== 'USD' ? ' · original (cannot convert)' : '');
  const sourceCurrency = (match[2] || 'USD').toUpperCase();
  const amounts = [match[4], match[5]].filter(Boolean).map(x => Number(x.replace(/,/g, '')));
  try {
    const converted = amounts.map(a => {
      const usd = currencyToUsd(a, sourceCurrency, quote);
      const result = currentDisplay(usd, selectedCurrency, quote);
      if (result === null) throw new Error('No display FX');
      return formatMoney(result, selectedCurrency);
    });
    return (match[1] ? 'Estimated ' : '') + converted.join(' – ') + (match[6] || '');
  } catch {
    return value + ' · waiting for current exchange rates';
  }
}

/** Sum only explicit Preferred confirmed stays; never count alternatives twice. */
export function selectedHotelCosts(trip, quote) {
  const selections = trip?.hotelSelections || {};
  const all = [...(trip?.destinations || []).flatMap(d => (d.hotels || []).map(h => ({...h, city:h.city || d.name}))),
    ...Object.values(trip?.hotelBookings || {})];
  const byId = new Map(all.filter(Boolean).map(h => [String(h.id), h]));
  const ids = new Set(Object.values(selections).filter(id => id && id !== 'none').map(String));
  let total = 0, count = 0, unpriced = 0;
  for (const id of ids) {
    const h = byId.get(id);
    if (!h || !/confirm|booked/i.test(h.status || '') || /cancel/i.test(h.status || '')) continue;
    let usd = Number.isFinite(h.priceUsd) ? h.priceUsd : null;
    if (usd === null && h.price !== '' && h.price != null && Number.isFinite(Number(h.price))) {
      try { usd = currencyToUsd(Number(h.price), h.currency || 'USD', quote); }
      catch { /* Do not silently assume USD. */ }
    }
    if (usd === null) { unpriced++; continue; }
    total += usd; count++;
  }
  return {total,count,unpriced};
}

export function bookedDomesticFlights(trip, quote) {
  let total=0,count=0,unpriced=0;
  const seen=new Set();
  for (const dest of trip?.destinations || []) for (const f of dest.flights || []) {
    if (!f || !/confirm|booked/i.test(f.status || '') || /cancel/i.test(f.status || '')) continue;
    if (/^(TLV|BEN GURION)$/i.test(f.from || '') || /^(TLV|BEN GURION)$/i.test(f.to || '')) continue;
    const key=[f.number,f.date,f.from,f.to].join('|');
    if (seen.has(key)) continue; seen.add(key);
    let usd=Number.isFinite(f.priceUsd)?f.priceUsd:null;
    if (usd===null && f.price!=null && f.price!=='' && Number.isFinite(Number(f.price))) {
      try { usd=currencyToUsd(Number(f.price),f.currency || 'USD',quote); } catch {}
    }
    if (usd===null) {unpriced++;continue;}
    total+=usd;count++;
  }
  return {total,count,unpriced};
}
