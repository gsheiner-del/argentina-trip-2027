const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');

const script = fs.readFileSync(path.join(__dirname, '../scripts/gmail-to-firebase.gs'), 'utf8');
const sandbox = {
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (_, value) => Array.from(crypto.createHash('sha256').update(value).digest()),
    base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64url')
  }
};
vm.createContext(sandbox);
vm.runInContext(script + '\n globalThis.testApi = { extract_, onlyTripMessage_, category_, buildFlightDonors_, linkedFlightDetails_, missingFields_ };', sandbox, {
  filename: 'gmail-to-firebase.gs'
});
const { extract_, onlyTripMessage_, buildFlightDonors_, linkedFlightDetails_, missingFields_ } = sandbox.testApi;

function email(subject, body, id = 'testid', html = '') {
  return {
    getSubject: () => subject,
    getPlainBody: () => body,
    getBody: () => html,
    getDate: () => new Date('2026-09-17T10:00:00Z'),
    getId: () => id
  };
}

test('2027 Argentina hotel emails are staged without bodies or booking PINs', () => {
  const record = extract_(email(
    '🛄 Thanks! Your booking is confirmed at Mirador del Kaiken',
    'Your apartment in Ushuaia is confirmed. Stay March 9, 2027 to March 12, 2027. Confirmation: 1234567890. PIN: 6482.'
  ));
  assert.equal(record.category, 'hotel');
  assert.equal(record.place, 'Ushuaia');
  assert.equal(record.title, 'Mirador del Kaiken');
  assert.equal(record.status, 'pending');
  assert.ok(record.bookingGroup);
  assert.equal(record.cancellationFlag, false);
  assert.ok(!('body' in record));
  assert.ok(!JSON.stringify(record).includes('6482'));
  assert.equal(record.confirmationNumber, ''); // unlabeled generic confirmation stays private until reviewed
});

test('One-time codes are excluded even if year and destination occur', () => {
  const record = extract_(email(
    'Booking.com – verification code 2027 Argentina',
    'Sign in with one-time code 123456 for your Argentina trip in March 2027.'
  ));
  assert.equal(record, null);
});

test('Unrelated labelled 2026 travel is excluded', () => {
  assert.equal(onlyTripMessage_(
    'Your booking is confirmed at Vytautas Mineral SPA',
    'Lithuania, July 29, 2026'
  ), false);
});

test('Yearless EL AL BUE seat documents are staged for manual review', () => {
  const record = extract_(email(
    'Your EL AL booking confirmation',
    'Electronic Miscellaneous Document: chargeable seat; BUE LY TLV; Booking code ABC123.'
  ));
  assert.equal(record.category, 'flight_extra');
  assert.equal(record.title, 'Airline seat / supplementary document');
  assert.equal(record.status, 'pending');
});

test('Cancellation emails require manual handling', () => {
  const record = extract_(email(
    'Booking canceled for Hotel Boutique 3 Pasos',
    'Your March 2027 reservation in Patagonia, Argentina has been canceled.'
  ));
  assert.equal(record.category, 'hotel');
  assert.equal(record.cancellationFlag, true);
  assert.match(record.title, /Cancellation/);
});

test('Duplicate messages from same booking produce same group ID', () => {
  const one = extract_(email('EL AL flight', 'Flight from BUE March 2027. Booking code ABC123.'));
  const two = extract_(email('EL AL flight copy', 'Flight from BUE March 2027. Booking code ABC123.'));
  assert.equal(one.bookingGroup, two.bookingGroup);
});


test('EL AL HTML ticket receipt extracts both legs without leaking passenger identifiers', () => {
  const html = '<table><tr><td>Tel Aviv Ben Gurion TLV</td><td>Buenos Aires EZE</td><td>LY 41</td><td>18:15 07MAR2027</td><td>05:40 08MAR2027</td></tr>' +
    '<tr><td>Buenos Aires EZE</td><td>Tel Aviv TLV</td><td>LY 42</td><td>09:00 24MAR2027</td><td>05:15 25MAR2027</td></tr></table>';
  const record = extract_(email('EL AL e-ticket confirmation',
    'Buenos Aires EZE TLV March 2027. Frequent flyer 123456789. Ticket 0987654321.', 'ticket1', html));
  assert.equal(record.category, 'flight');
  assert.equal(record.segments.length, 2);
  assert.equal(record.segments[0].number, 'LY41');
  assert.equal(record.segments[0].date, '2027-03-07');
  assert.equal(record.segments[0].departure, '18:15');
  assert.equal(record.segments[1].number, 'LY42');
  assert.equal(record.segments[1].date, '2027-03-24');
  assert.equal(record.segments[1].arrivalDate, '2027-03-25');
  assert.ok(!JSON.stringify(record).includes('123456789'));
  assert.ok(!JSON.stringify(record).includes('0987654321'));
});

test('Booking.com receipt extracts location, confirmation and local cancellation deadline', () => {
  const record = extract_(email('Your booking is confirmed at Mirador del Kaiken',
    'Ushuaia Argentina March 2027\nCheck-in: March 9, 2027\nCheck-out: March 11, 2027\n' +
    'Location: Calle Laguna de los Témpanos 1117, Ushuaia\n' +
    'Confirmation: 1234567890\nFree cancellation until March 7, 2027 11:59 PM',
    'booking1', '<a href="https://www.booking.com/booking.html?token=secret">Manage booking</a>'));
  assert.equal(record.address, 'Calle Laguna de los Témpanos 1117, Ushuaia');
  assert.equal(record.confirmationNumber, '1234567890');
  assert.equal(record.cancellationDeadline, '2027-03-07T23:59');
  assert.match(record.bookingLink, /^https:\/\/www.booking.com\/booking.html/);
});


test('Forwarded EL AL plain-text booking extracts both legs without booking identifiers', () => {
  const body = [
    'Flight', 'Departure', 'Arrival', 'Last check-in',
    'TEL AVIV YAFO BEN GURION INTL', 'Terminal: 3',
    'BUENOS AIRES MINISTRO PISTARINI', 'Terminal: IA',
    'LY41', '18:15', '07Mar2027', '05:40', '08Mar2027',
    'Class: Economy Classic', 'Operated by: EL AL',
    'BUENOS AIRES MINISTRO PISTARINI', 'Terminal: P',
    'TEL AVIV YAFO BEN GURION INTL', 'Terminal: 3',
    'LY42', '09:00', '24Mar2027', '05:15', '25Mar2027',
    'Frequent flyer number: private'
  ].join('\n');
  const rec = extract_(email('Your EL AL Booking Confirmation', body));
  assert.equal(rec.segments.length, 2);
  assert.deepEqual(Array.from(rec.segments, x => [x.number, x.from, x.to, x.date, x.departure]),
    [['LY41', 'TLV', 'EZE', '2027-03-07', '18:15'],
     ['LY42', 'EZE', 'TLV', '2027-03-24', '09:00']]);
  assert.equal(rec.segments[1].arrivalDate, '2027-03-25');
});

test('Booking.com cancellation cost table supplies local free-cancellation deadline', () => {
  const body = [
    'Ushuaia Argentina March 2027', 'Check-in', 'Tuesday, March 9, 2027 (2:00 PM)',
    'Check-out', 'Thursday, March 11, 2027',
    'Cancellation policy', 'You can cancel for free until 1 day before arrival.',
    'Cancellation cost', '-', 'until March 7, 2027 11:59 PM:',
    'US$0', '-', 'from March 8, 2027 12:00 AM:', 'US$156.40',
    'Cancellation deadlines are in the property local time.'
  ].join('\n');
  const rec = extract_(email('Your booking is confirmed at Mirador del Kaiken', body));
  assert.equal(rec.cancellationDeadline, '2027-03-07T23:59');
  assert.equal(rec.checkIn, '2027-03-09');
  assert.equal(rec.checkOut, '2027-03-11');
});


test('Booking.com cancellation table in condensed HTML or wrapped text extracts the zero-fee deadline', () => {
  const compactHtml = [
    '<div>Ushuaia Argentina March 2027</div>',
    '<div>Check-in</div><div>March 9, 2027</div>',
    '<div>Check-out</div><div>March 11, 2027</div>',
    '<div>Cancellation cost</div><p>- until March 7, 2027 11:59 PM:</p>',
    '<span>US$0</span><p>from March 8, 2027 12:00 AM: US$156.40</p>'
  ].join('');
  const msg = email(
    'Your booking is confirmed at Mirador del Kaiken',
    'Argentina Ushuaia March 2027; Check-in March 9, 2027; Check-out March 11, 2027',
    'booking-with-html', compactHtml
  );
  assert.equal(extract_(msg).cancellationDeadline, '2027-03-07T23:59');

  const wrapped = [
    'Ushuaia Argentina March 2027',
    'Cancellation cost:',
    'until March 7, 2027 11:59 PM:',
    '-',
    'US$0',
    'from March 8, 2027 12:00 AM:',
    'US$156.40'
  ].join('\n');
  assert.equal(extract_(email(
    'Your booking is confirmed at Mirador del Kaiken', wrapped, 'booking-with-wrap'
  )).cancellationDeadline, '2027-03-07T23:59');
});

test('A relative cancellation policy without an explicit date is not guessed', () => {
  const body = 'Ushuaia Argentina March 2027\nCancellation policy\n' +
    'You can cancel for free until 1 day before arrival.';
  const result = extract_(email('Your booking is confirmed at Mirador del Kaiken', body));
  assert.equal(result.cancellationDeadline, '');
});


test('EL AL ancillary receipt inherits verified itinerary only from same booking AND passenger', () => {
  const itinerary = email(
    'Fwd: SMITH/MARINA: Your EL AL Booking Confirmation',
    ['Ticket receipt', 'Booking code: ABC123',
     'TEL AVIV YAFO BEN GURION INTL', 'Terminal: 3',
     'BUENOS AIRES MINISTRO PISTARINI', 'Terminal: IA',
     'LY41', '18:15', '07Mar2027', '05:40', '08Mar2027',
     'BUENOS AIRES MINISTRO PISTARINI', 'Terminal: P',
     'TEL AVIV YAFO BEN GURION INTL', 'Terminal: 3',
     'LY42', '09:00', '24Mar2027', '05:15', '25Mar2027'].join('\n'),
    'itinerary-1'
  );
  const seat = email('SMITH/MARINA: Your EL AL Booking Confirmation',
    'Electronic Miscellaneous Document. EZE Argentina, March 2027.\nBooking code: ABC123',
    'ancillary-1');
  const otherPerson = email('SMITH/ORI: Your EL AL Booking Confirmation',
    'Electronic Miscellaneous Document. EZE Argentina, March 2027.\nBooking code: ABC123',
    'ancillary-2');
  const wrongBooking = email('SMITH/MARINA: Your EL AL Booking Confirmation',
    'Electronic Miscellaneous Document. EZE Argentina, March 2027.\nBooking code: XYZ123',
    'ancillary-3');
  const donors = buildFlightDonors_([itinerary, seat, otherPerson, wrongBooking]);
  const filled = linkedFlightDetails_(seat, extract_(seat), donors);
  assert.equal(filled.segments.length, 2);
  assert.equal(filled.number, 'LY41');
  assert.equal(filled.from, 'TLV');
  assert.equal(filled.to, 'EZE');
  assert.equal(filled.arrivalDate, '2027-03-08');
  assert.equal(filled.flightDetailsSource, 'Matching EL AL itinerary email');
  const missing = missingFields_({ number: '', segments: [], departure: '' }, filled);
  assert.equal(missing.number, 'LY41');
  assert.equal(missing.segments.length, 2);
  assert.equal(missing.departure, '18:15');
  assert.equal(linkedFlightDetails_(otherPerson, extract_(otherPerson), donors).segments.length, 0);
  assert.equal(linkedFlightDetails_(wrongBooking, extract_(wrongBooking), donors).segments.length, 0);
  assert.ok(!JSON.stringify(filled).includes('ABC123'));
});

test('Conflicting itineraries with the same booking and passenger never enrich an EMD', () => {
  const leg = (number, id) => email('Fwd: SMITH/MARINA: Your EL AL Booking Confirmation',
    ['Buenos Aires Argentina', 'Booking code: ABC123',
     'TEL AVIV YAFO BEN GURION INTL', 'Terminal: 3',
     'BUENOS AIRES MINISTRO PISTARINI', 'Terminal: IA',
     number, '18:15', '07Mar2027', '05:40', '08Mar2027'].join('\n'), id);
  const ancillary = email('SMITH/MARINA: Your EL AL Booking Confirmation',
    'Electronic Miscellaneous Document. EZE Argentina March 2027. Booking code: ABC123',
    'ancillary');
  const donors = buildFlightDonors_([leg('LY41', 'a'), leg('LY43', 'b')]);
  assert.equal(linkedFlightDetails_(ancillary, extract_(ancillary), donors).segments.length, 0);
});


test('Duplicate real-world receipt formats do not invalidate a complete EL AL itinerary', () => {
  const basic = [
    'Buenos Aires Argentina', 'Booking code: ABC123',
    'TEL AVIV YAFO BEN GURION INTL', 'Terminal: 3',
    'BUENOS AIRES MINISTRO PISTARINI', 'Terminal: IA',
    'LY41', '18:15', '07Mar2027', '05:40', '08Mar2027'
  ];
  const full = basic.concat([
    'BUENOS AIRES MINISTRO PISTARINI', 'Terminal: P',
    'TEL AVIV YAFO BEN GURION INTL', 'Terminal: 3',
    'LY42', '09:00', '24Mar2027', '05:15', '25Mar2027'
  ]);
  const subject = 'SMITH/MARINA: Your EL AL Booking Confirmation';
  const donor = email(subject, full.join('\n'), 'full');
  const duplicate = email('Fwd: ' + subject, full.join('\n'), 'forwarded');
  const ancillary = email(subject,
    'Electronic Miscellaneous Document. EZE Argentina March 2027. Booking code: ABC123',
    'seat');
  const donors = buildFlightDonors_([donor, duplicate]);
  assert.equal(donors.ambiguous.size, 0);
  assert.equal(linkedFlightDetails_(ancillary, extract_(ancillary), donors).segments.length, 2);
});
