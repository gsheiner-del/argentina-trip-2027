/**
 * Michelle & Gilad's planning estimate is not a fixed legacy daughterShare.
 * Allocation is saved per category and recomputed from the CURRENT budget.
 * The initial ratios are visible EDITABLE assumptions, not booking evidence:
 * two travelers of five for per-person items and one room of two for hotels.
 * Shared transport and miscellaneous family costs start excluded.
 */
export const COUPLE_CATEGORIES = [
  { key: 'domesticFlights', label: 'Domestic flights', source: 'domesticFlights',
    defaultMode: 'ratio', defaultUnits: 2, defaultTotal: 5,
    description: '2 travelers of 5; change if booked fares or traveler groups differ.' },
  { key: 'hotels', label: 'Their room', source: 'hotels',
    defaultMode: 'ratio', defaultUnits: 1, defaultTotal: 2,
    description: '1 room of 2; change to match the booked room allocation.' },
  { key: 'activities', label: 'Activities & tours', source: 'activities',
    defaultMode: 'ratio', defaultUnits: 2, defaultTotal: 5,
    description: '2 participants of 5; adjust for tours with different participants.' },
  { key: 'meals', label: 'Meals & dining', source: 'meals',
    defaultMode: 'ratio', defaultUnits: 2, defaultTotal: 5,
    description: '2 diners of 5; adjust when the couple eats separately.' },
  { key: 'transport', label: 'Shared ground transport', source: 'transport',
    defaultMode: 'exclude', defaultUnits: 0, defaultTotal: 1,
    description: 'Excluded until a portion is explicitly allocated.' },
  { key: 'other', label: 'Other / shared items', source: 'other',
    defaultMode: 'exclude', defaultUnits: 0, defaultTotal: 1,
    description: 'Excluded until a portion is explicitly allocated.' }
];

export const defaultCoupleAllocations = () =>
  Object.fromEntries(COUPLE_CATEGORIES.map(cat => [cat.key, {
    mode: cat.defaultMode, units: cat.defaultUnits, totalUnits: cat.defaultTotal,
    fixedUsd: ''
  }]));

export function normalizedCoupleAllocations(saved = {}) {
  const defaults = defaultCoupleAllocations();
  return Object.fromEntries(COUPLE_CATEGORIES.map(cat => {
    const value = saved && typeof saved[cat.key] === 'object' && saved[cat.key] !== null
      ? saved[cat.key] : {};
    return [cat.key, { ...defaults[cat.key], ...value }];
  }));
}

export function validateCoupleAllocations(settings) {
  const allocation = normalizedCoupleAllocations(settings);
  for (const cat of COUPLE_CATEGORIES) {
    const row = allocation[cat.key];
    if (!['exclude', 'ratio', 'fixed'].includes(row.mode))
      throw new Error('Select a valid allocation method for ' + cat.label + '.');
    if (row.mode === 'ratio') {
      const numerator = Number(row.units), denominator = Number(row.totalUnits);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) ||
          numerator < 0 || denominator <= 0 || numerator > denominator ||
          numerator > 1000 || denominator > 1000 ||
          String(row.units).trim() === '' || String(row.totalUnits).trim() === '')
        throw new Error('Check the allocated and total units for ' + cat.label + '.');
    }
    if (row.mode === 'fixed') {
      const amount = Number(row.fixedUsd);
      if (row.fixedUsd === '' || row.fixedUsd == null ||
          !Number.isFinite(amount) || amount < 0 || amount > 100000000)
        throw new Error('Enter an explicit USD allocation for ' + cat.label + '.');
    }
  }
  return allocation;
}

/** Parse one current reference category in USD. Preserve the low-end of ranges
 * and '+' estimates instead of pretending to have an exact total.
 */
export function parsePlanningUsd(raw) {
  if (raw == null || String(raw).trim() === '' || /^(tbd|pending)$/i.test(String(raw).trim()))
    return null;
  const match = String(raw).trim().match(
    /^(?:estimated\s*)?(?:(?:USD|US\$)\s*|\$\s*)?(\d[\d,]*(?:\.\d{1,2})?)(?:\s*[-–]\s*(\d[\d,]*(?:\.\d{1,2})?))?(\+)?$/i
  );
  if (!match) return null;
  const minimum = Number(match[1].replace(/,/g, ''));
  const maximum = match[2] ? Number(match[2].replace(/,/g, '')) : null;
  if (!Number.isFinite(minimum) || minimum < 0 ||
      (maximum !== null && (!Number.isFinite(maximum) || maximum < minimum)))
    return null;
  return { minimum, maximum, openEnded: Boolean(match[3]) };
}

/**
 * Returns a breakdown and safe estimated range in USD. Missing categories
 * remain visible and prevent a misleading grand total; excluded categories
 * contribute zero even if the original category is TBD.
 */
export function calculateCoupleEstimate(budget = {}, settings = {}) {
  const allocations = validateCoupleAllocations(settings);
  let minimum = 0, maximum = 0, incomplete = false, openEnded = false;
  const rows = COUPLE_CATEGORIES.map(cat => {
    const allocation = allocations[cat.key];
    const source = parsePlanningUsd(budget[cat.source]);
    if (allocation.mode === 'exclude') {
      return { key: cat.key, label: cat.label, mode: 'exclude',
        original: budget[cat.source], minimum: 0, maximum: 0, excluded: true };
    }
    if (allocation.mode === 'fixed') {
      const amount = Number(allocation.fixedUsd);
      minimum += amount;
      maximum += amount;
      return { key: cat.key, label: cat.label, mode: 'fixed',
        original: budget[cat.source], minimum: amount, maximum: amount,
        note: 'Explicit amount, not a percentage of the source estimate' };
    }
    const fraction = Number(allocation.units) / Number(allocation.totalUnits);
    if (!source) {
      incomplete = true;
      return { key: cat.key, label: cat.label, mode: 'ratio',
        original: budget[cat.source], minimum: null, maximum: null,
        missing: true, fraction };
    }
    const low = source.minimum * fraction;
    const high = source.maximum === null ? low : source.maximum * fraction;
    minimum += low;
    maximum += high;
    if (source.openEnded && fraction > 0) openEnded = true;
    return { key: cat.key, label: cat.label, mode: 'ratio',
      original: budget[cat.source], minimum: low, maximum: high,
      openEnded: source.openEnded && fraction > 0, fraction };
  });
  return { rows, minimum: incomplete ? null : minimum,
    maximum: incomplete || openEnded ? null : maximum, incomplete, openEnded,
    allocations };
}
