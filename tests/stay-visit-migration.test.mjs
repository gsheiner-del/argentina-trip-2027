import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStayVisit, isMisplacedStay, existingRecords, prepareApproval } from '../src/utils/tripReview.js';

const trip = { destinations: [
  { id: 'arrival', name: 'Buenos Aires (Arrival)', dates: '8–9 March 2027', hotels: [
    { id: 'old', name: 'Gran departamento', city: 'Buenos Aires', status: 'confirmed',
      checkIn: '2027-03-08', checkOut: '2027-03-09' },
    { id: 'misplaced', name: 'Gran departamento', city: 'Buenos Aires', status: 'confirmed',
      checkIn: '2027-03-21', checkOut: '2027-03-24', reviewedEmails: { original: true } },
    null
  ] },
  { id: 'return', name: 'Buenos Aires (Return)', dates: '21–24 March 2027', hotels: [] }
] };
test('Return hotel dates belong to Departure and not Arrival', () => {
  assert.equal(resolveStayVisit(trip, 'Buenos Aires', '2027-03-21', '2027-03-24').id, 'return');
  assert.equal(resolveStayVisit(trip, 'Buenos Aires', '2027-03-08', '2027-03-09').id, 'arrival');
  assert.equal(isMisplacedStay(trip, trip.destinations[0], trip.destinations[0].hotels[1]).id, 'return');
  assert.equal(resolveStayVisit(trip, 'Buenos Aires', '2027-03-12', '2027-03-16'), null);
});

test('Original Firebase indices survive archived/null hotel slots', () => {
  const rows = existingRecords(trip, 'hotel', 'arrival');
  assert.equal(rows[1].sourcePath, 'trip/destinations/0/hotels/1');
});

test('Gmail hotel approval cannot publish return visit into arrival', () => {
  const q = { msg: { status: 'pending', category: 'hotel' } };
  const base = { category: 'hotel', draft: {
    title: 'Gran departamento', place: 'Buenos Aires',
    checkIn: '2027-03-21', checkOut: '2027-03-24', currency: 'USD' } };
  assert.throws(() => prepareApproval(trip, q, 'msg',
    { ...base, destinationId: 'arrival' }), /Return/);
  const result = prepareApproval(trip, q, 'msg',
    { ...base, destinationId: 'return' });
  assert.equal(result.updates['trip/destinations/1/hotels/0'].checkOut, '2027-03-24');
});
