import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importHotelRows, sanitizeHotel, hotelStayKey, groupHotelOptions } from '../src/utils/hotels.js';

const confirmed = { id: 'screenshot-1', name: 'Mirador del Kaiken', city: 'Ushuaia',
  checkIn: '2027-03-09', checkOut: '2027-03-12', price: 464.4, currency: 'USD',
  status: 'confirmed', rooms: 2, cancellationPolicy: 'Free cancellation',
  source: 'Screenshot' };
test('Hotel import only keeps allowlisted booking information', () => {
  const clean = sanitizeHotel({ ...confirmed, pin: 'do-not-store',
    confirmationCode: 'do-not-store', passengerName: 'do-not-store' });
  assert.equal(clean.priceUsd, 464.4);
  assert.equal(clean.rooms, 2);
  assert.equal(clean.status, 'confirmed');
  assert.ok(!('pin' in clean) && !('confirmationCode' in clean) &&
    !('passengerName' in clean));
});
test('Duplicate hotel alternatives are detected by city, name and exact stay dates', () => {
  const second = { ...confirmed, id: 'screenshot-2', name: 'Austral Departamentos',
    price: 487, status: 'cancelled' };
  const duplicate = { ...confirmed, id: 'screenshot-3' };
  const result = importHotelRows([confirmed, second, duplicate]);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.skipped.length, 1);
  assert.equal(hotelStayKey(confirmed), hotelStayKey(second));
  assert.notEqual(hotelStayKey(confirmed), hotelStayKey({ ...confirmed, checkIn: '2027-03-13' }));
});
test('Invalid or unsafe screenshot booking fields are rejected', () => {
  assert.throws(() => sanitizeHotel({ ...confirmed, bookingLink: 'javascript:alert(1)' }), /HTTPS/);
  assert.throws(() => sanitizeHotel({ ...confirmed, checkOut: '2027-03-08' }), /after check-in/);
  assert.throws(() => sanitizeHotel({ ...confirmed, checkIn: '2027-02-30' }), /valid YYYY/);
  assert.throws(() => sanitizeHotel({ ...confirmed, price: -1 }), /non-negative/);
});


test('Overlapping alternative hotel dates share one selection group', () => {
  const options = [
    { id: 'ruta40', name: 'Apart Ruta 40', city: 'El Chaltén',
      checkIn: '2027-03-12', checkOut: '2027-03-16', status: 'confirmed' },
    { id: 'piramide', name: 'APART PIRAMIDe', city: 'El Chaltén',
      checkIn: '2027-03-13', checkOut: '2027-03-17', status: 'cancelled' }
  ];
  const groups = groupHotelOptions(options);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].hotels.map(h => h.id), ['ruta40', 'piramide']);
  assert.equal(groups[0].key, 'el-chalten_2027-03-12');
  assert.ok(groups[0].aliases.includes('el-chalten_2027-03-13'));
});

test('Separate stays in Buenos Aires remain distinct groups', () => {
  const base = { city: 'Buenos Aires', status: 'confirmed' };
  const groups = groupHotelOptions([
    { ...base, id: 'first', checkIn: '2027-03-08', checkOut: '2027-03-09' },
    { ...base, id: 'second', checkIn: '2027-03-21', checkOut: '2027-03-24' }
  ]);
  assert.equal(groups.length, 2);
  assert.notEqual(groups[0].key, groups[1].key);
});
