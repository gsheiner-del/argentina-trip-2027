import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareMultiFlightApproval } from '../src/utils/tripReview.js';

const id = 'm_synthetic';
const legs = [
  { number: 'LY41', from: 'TLV', to: 'EZE', date: '2027-03-07',
    departure: '18:15', arrival: '05:40', arrivalDate: '2027-03-08' },
  { number: 'LY42', from: 'EZE', to: 'TLV', date: '2027-03-24',
    departure: '09:00', arrival: '05:15', arrivalDate: '2027-03-25' }
];
const queue = { [id]: { status: 'pending', airline: 'EL AL',
  category: 'flight', cancellationFlag: false, segments: legs } };
const destination = { id: 'ba', name: 'Buenos Aires', flights: [] };

test('approve verified round-trip flight with real HH:mm times', () => {
  const result = prepareMultiFlightApproval(
    { destinations: [destination], emailImports: {} }, queue, id, 'ba'
  );
  assert.equal(result.updates['gmailImport/reviewQueue/' + id + '/status'], 'approved');
  assert.equal(result.updates['trip/emailImports/' + id].targetPaths.length, 2);
  const first = result.updates['trip/destinations/0/flights/0'];
  const second = result.updates['trip/destinations/0/flights/1'];
  assert.equal(first.number, 'LY41');
  assert.equal(first.departure, '18:15');
  assert.equal(second.number, 'LY42');
  assert.equal(second.departure, '09:00');
  assert.equal(second.arrivalDate, '2027-03-25');
});

test('matching existing flights are enriched without creating duplicates', () => {
  const existing = { ...destination, flights: [
    { id: 'already', number: 'LY41', date: '2027-03-07', from: 'TLV', to: 'EZE' }
  ] };
  const result = prepareMultiFlightApproval(
    { destinations: [existing], emailImports: {} }, queue, id, 'ba'
  );
  assert.equal(result.updates['trip/destinations/0/flights/0'], undefined);
  assert.equal(result.updates['trip/destinations/0/flights/0/departure'], '18:15');
  assert.equal(result.updates['trip/destinations/0/flights/1'].number, 'LY42');
});

test('reject invalid departure times instead of silently approving', () => {
  const broken = { [id]: { ...queue[id], segments: [
    { ...legs[0], departure: '29:70' }, legs[1]
  ] } };
  assert.throws(() => prepareMultiFlightApproval(
    { destinations: [destination], emailImports: {} }, broken, id, 'ba'
  ), /Verify each leg/);
});
