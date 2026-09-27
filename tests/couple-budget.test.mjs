import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultCoupleAllocations, normalizedCoupleAllocations, validateCoupleAllocations,
  calculateCoupleEstimate, parsePlanningUsd
} from '../src/utils/coupleBudget.js';

const currentPlanning = {
  domesticFlights: 'USD 4,170', hotels: 'USD 2,408',
  transport: 'USD 710', activities: 'USD 2,900 +',
  meals: 'USD 1,500', other: 'USD 300',
  total: 'USD 12,000 – USD 15,000'
};

test('initial editable assumptions use 2 of 5 travelers and 1 of 2 rooms', () => {
  const defaults = defaultCoupleAllocations();
  assert.deepEqual([defaults.domesticFlights.units, defaults.domesticFlights.totalUnits], [2, 5]);
  assert.deepEqual([defaults.hotels.units, defaults.hotels.totalUnits], [1, 2]);
  assert.equal(defaults.transport.mode, 'exclude');
  assert.equal(defaults.other.mode, 'exclude');
});

test('the current category estimates yield 4632+ USD, not stale daughterShare', () => {
  const report = calculateCoupleEstimate({ ...currentPlanning, daughterShare: 'TBD' });
  assert.equal(report.rows.find(x => x.key === 'domesticFlights').minimum, 1668);
  assert.equal(report.rows.find(x => x.key === 'hotels').minimum, 1204);
  assert.equal(report.rows.find(x => x.key === 'activities').minimum, 1160);
  assert.equal(report.rows.find(x => x.key === 'meals').minimum, 600);
  assert.equal(report.rows.find(x => x.key === 'transport').minimum, 0);
  assert.equal(report.minimum, 4632);
  assert.equal(report.maximum, null);
  assert.equal(report.openEnded, true);
  assert.equal(report.incomplete, false);
});

test('current category changes dynamically recalculate their share', () => {
  const original = calculateCoupleEstimate(currentPlanning);
  const changed = calculateCoupleEstimate({ ...currentPlanning, hotels: 'USD 3,000' });
  assert.equal(changed.minimum - original.minimum, 296);
});

test('explicit shared transfer allocation is zero by default, editable when assigned', () => {
  const original = calculateCoupleEstimate(currentPlanning);
  const modified = defaultCoupleAllocations();
  modified.transport = { mode: 'ratio', units: 1, totalUnits: 4, fixedUsd: '' };
  const report = calculateCoupleEstimate(currentPlanning, modified);
  assert.equal(report.rows.find(row => row.key === 'transport').minimum, 177.5);
  assert.equal(report.minimum, original.minimum + 177.5);
});

test('a fixed personal ticket or room total overrides only its category', () => {
  const settings = defaultCoupleAllocations();
  settings.domesticFlights = { mode: 'fixed', units: 2, totalUnits: 5, fixedUsd: 650 };
  settings.hotels = { mode: 'fixed', units: 1, totalUnits: 2, fixedUsd: 800 };
  const report = calculateCoupleEstimate(currentPlanning, settings);
  assert.equal(report.minimum, 650 + 800 + 1160 + 600);
});

test('missing planned categories remain visible and prevent misleading grand total', () => {
  const report = calculateCoupleEstimate({ ...currentPlanning, hotels: 'TBD' });
  assert.equal(report.minimum, null);
  assert.equal(report.incomplete, true);
  assert.equal(report.rows.find(row => row.key === 'hotels').missing, true);
  // Explicit assignment is possible even when a shared category is missing.
  const config = defaultCoupleAllocations();
  config.hotels.mode = 'fixed';
  config.hotels.fixedUsd = 800;
  assert.equal(calculateCoupleEstimate({ ...currentPlanning, hotels: 'TBD' }, config).minimum, 4228);
});

test('unknown amounts and invalid allocation inputs cannot silently become zero', () => {
  assert.equal(parsePlanningUsd('ARS 2,900'), null);
  assert.deepEqual(parsePlanningUsd('USD 2,900 +'),
    { minimum: 2900, maximum: null, openEnded: true });
  assert.deepEqual(parsePlanningUsd('USD 12,000 – 15,000'),
    { minimum: 12000, maximum: 15000, openEnded: false });
  const bad = defaultCoupleAllocations();
  bad.activities = { mode: 'ratio', units: 6, totalUnits: 5 };
  assert.throws(() => validateCoupleAllocations(bad), /Activities/);
  bad.activities = { mode: 'fixed', fixedUsd: '' };
  assert.throws(() => validateCoupleAllocations(bad), /USD allocation/);
});

test('saved overrides merge with defaults without losing excluded categories', () => {
  const restored = normalizedCoupleAllocations({ hotels: { mode: 'ratio', units: 1, totalUnits: 3 } });
  assert.equal(restored.hotels.totalUnits, 3);
  assert.equal(restored.domesticFlights.totalUnits, 5);
  assert.equal(restored.transport.mode, 'exclude');
});
