import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cityMatches, supersededReviewIds, samePropertyOptions,
  prepareApproval } from '../src/utils/tripReview.js';

const trip = { destinations: [
  { id: 'arrival', name: 'Buenos Aires', hotels: [] },
  { id: 'return', name: 'Buenos Aires (Return)', hotels: [
    { id: 'old', name: 'Gran departamento en pleno corazon de buenos aires',
      city: 'Buenos Aires', checkIn: '2027-03-21', checkOut: '2027-03-23',
      status: 'confirmed', price: 370.5, currency: 'USD' }
  ] }
] };

test('Return city is the same place as Buenos Aires, but not Mendoza', () => {
  assert.equal(cityMatches('Buenos Aires', 'Buenos Aires (Return)'), true);
  assert.equal(cityMatches('Buenos Aires', 'Mendoza'), false);
});

test('Same-property choices find earlier date versions in return destination', () => {
  const choices = samePropertyOptions(trip, 'return', {
    title: 'Your updated booking at Gran departamento en pleno corazon de buenos aires',
    place: 'Buenos Aires', checkIn: '2027-03-21', checkOut: '2027-03-24'
  });
  assert.equal(choices.length, 1);
  assert.equal(choices[0].checkOut, '2027-03-23');
});

test('Hide older emails only when exact reservation number has newer copy', () => {
  const queue = {
    old: { category: 'hotel', status: 'pending', confirmationNumber: '6697980829',
      receivedAt: '2026-09-21T12:00:00Z' },
    updated: { category: 'hotel', status: 'pending', confirmationNumber: '6697980829',
      receivedAt: '2026-09-25T12:00:00Z' },
    different: { category: 'hotel', status: 'pending', confirmationNumber: '22222222',
      receivedAt: '2026-09-19T12:00:00Z' },
    noCode: { category: 'hotel', status: 'pending', confirmationNumber: '',
      receivedAt: '2026-09-20T12:00:00Z' }
  };
  assert.deepEqual([...supersededReviewIds(queue)], ['old']);
});

test('Amended dates require explicit consent and do not change saved price', () => {
  const queue = { email: { category: 'hotel', status: 'pending' } };
  const draft = { title: 'Gran departamento en pleno corazon de buenos aires',
    place: 'Buenos Aires', checkIn: '2027-03-21', checkOut: '2027-03-24',
    currency: 'USD', price: 395 };
  const base = { destinationId: 'return', category: 'hotel',
    existingPath: 'trip/destinations/1/hotels/0', draft };
  const noConsent = prepareApproval(trip, queue, 'email', base);
  assert.equal(noConsent.updates['trip/destinations/1/hotels/0/checkOut'], undefined);
  const consent = prepareApproval(trip, queue, 'email', { ...base, replaceDates: true });
  assert.equal(consent.updates['trip/destinations/1/hotels/0/checkOut'], '2027-03-24');
  assert.equal(consent.updates['trip/destinations/1/hotels/0/price'], undefined);
});
