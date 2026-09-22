// Pure budget calculations shared by the Budget screen and its tests.
// Legacy numeric entries are denominated in USD. Explicit ARS/ILS amounts
// are converted to USD using the same quoted USD-base rates as the display.
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
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0
      ? { state: 'valid', amount: value, currency: 'USD' }
      : { state: 'invalid' };
  }

  let raw = String(value).trim().toUpperCase();
  const detected = [
    { code: 'ARS', pattern: /\bARS\b|AR\$/g },
    { code: 'ILS', pattern: /\bILS\b|₪/g },
    { code: 'USD', pattern: /\bUSD\b|US\$|\$/g }
  ];
  // A plain "$" in AR$ or US$ is part of that same currency, not another.
  raw = raw.replace(/AR\$/g, 'ARS ').replace(/US\$/g, 'USD ');
  const explicit = detected
    .filter(({ code }) => new RegExp('\\b' + code + '\\b').test(raw))
    .map(({ code }) => code);
  const symbolShekel = /₪/.test(raw);
  if (symbolShekel && !explicit.includes('ILS')) explicit.push('ILS');
  const plainDollar = /\$/.test(raw);
  if (plainDollar && !explicit.includes('USD')) explicit.push('USD');
  if (new Set(explicit).size > 1) return { state: 'invalid' };
  const currency = explicit[0] || 'USD';

  const numberText = raw.replace(/\b(?:USD|ARS|ILS)\b|[₪$]/g, '').trim();
  // Reject ranges, free-form comments and ambiguous local decimal separators.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(numberText)) {
    return { state: 'invalid' };
  }
  const amount = Number(numberText.replace(/,/g, ''));
  return Number.isFinite(amount) && amount >= 0
    ? { state: 'valid', amount, currency }
    : { state: 'invalid' };
}

export function aggregateCosts(destinations = [], rates = null) {
  const totals = Object.fromEntries(COST_CATEGORIES.map(({ key }) => [key, 0]));
  const issues = [];
  let grandTotal = 0;
  let trackedItems = 0;
  for (const destination of Array.isArray(destinations) ? destinations : []) {
    for (const category of COST_CATEGORIES) {
      const rows = destination?.costs?.[category.key];
      for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
        trackedItems++;
        const parsed = parseCost(row?.estimatedCost);
        const context = {
          destination: destination?.name || 'Unknown stop',
          category: category.key,
          item: row?.item || `Item ${index + 1}`
        };
        if (parsed.state !== 'valid') {
          issues.push({ ...context, state: parsed.state });
          continue;
        }
        const rate = parsed.currency === 'USD' ? 1 : rates?.[parsed.currency];
        if (!Number.isFinite(rate) || rate <= 0) {
          issues.push({ ...context, state: 'rate_missing', currency: parsed.currency });
          continue;
        }
        const usd = parsed.amount / rate;
        totals[category.key] += usd;
        grandTotal += usd;
      }
    }
  }
  return { totals, grandTotal, issues, trackedItems, included: trackedItems - issues.length };
}
