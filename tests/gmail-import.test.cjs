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
vm.runInContext(script + '\n globalThis.testApi = { extract_, onlyTripMessage_, category_, buildFlightDonors_, linkedFlightDetails_, missingFields_, recoverAirbnbReviewFields_, aerolineasPdfSegments_ };', sandbox, {
  filename: 'gmail-to-firebase.gs'
});
const { extract_, onlyTripMessage_, buildFlightDonors_, linkedFlightDetails_, missingFields_, recoverAirbnbReviewFields_, aerolineasPdfSegments_ } = sandbox.testApi;

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


test('EL AL booking key is recovered from HTML when forwarded plain text omits the code', () => {
  const route = [
    'TEL AVIV YAFO BEN GURION INTL', 'Terminal: 3',
    'BUENOS AIRES MINISTRO PISTARINI', 'Terminal: IA',
    'LY41', '18:15', '07Mar2027', '05:40', '08Mar2027',
    'BUENOS AIRES MINISTRO PISTARINI', 'Terminal: P',
    'TEL AVIV YAFO BEN GURION INTL', 'Terminal: 3',
    'LY42', '09:00', '24Mar2027', '05:15', '25Mar2027'
  ].join('\n');
  const html = '<div>Booking code</div><span>ABC123</span>';
  const receipt = email('SMITH/MARINA: Your EL AL Booking Confirmation', route, 'full-html', html);
  const ancillary = email('SMITH/MARINA: Your EL AL Booking Confirmation',
    'Electronic Miscellaneous Document, Argentina March 2027. Booking code ABC123', 'emd');
  const donor = buildFlightDonors_([receipt, ancillary]);
  assert.equal(donor.ambiguous.size, 0);
  const linked = linkedFlightDetails_(ancillary, extract_(ancillary), donor);
  assert.equal(linked.segments.length, 2);
  assert.ok(!JSON.stringify(linked).includes('ABC123'));
});


test('EL AL forward reconstructs flight legs from HTML block text when Apps Script plain body omits route', () => {
  const legLines = [
    'TEL AVIV YAFO BEN GURION INTL', 'Terminal: 3',
    'BUENOS AIRES MINISTRO PISTARINI', 'Terminal: IA',
    'LY41', '18:15', '07Mar2027', '05:40', '08Mar2027',
    'BUENOS AIRES MINISTRO PISTARINI', 'Terminal: P',
    'TEL AVIV YAFO BEN GURION INTL', 'Terminal: 3',
    'LY42', '09:00', '24Mar2027', '05:15', '25Mar2027'
  ];
  const html = '<html><body>' +
    legLines.map(line => '<div>' + line + '</div>').join('') +
    '</body></html>';
  const msg = email('SMITH/MARINA: Your EL AL Booking Confirmation',
    'EL AL ticket confirmation for Buenos Aires, March 2027. Booking code ABC123.',
    'html-only-itinerary', html);
  const parsed = extract_(msg);
  assert.equal(parsed.segments.length, 2);
  assert.deepEqual(Array.from(parsed.segments, leg => [leg.number, leg.date, leg.from, leg.to]),
    [['LY41','2027-03-07','TLV','EZE'],['LY42','2027-03-24','EZE','TLV']]);
  const donor = buildFlightDonors_([msg]);
  assert.equal(Object.keys(donor.donorMap).length, 1);
});



test('Forwarded Airbnb confirmation stages a hotel review', () => {
  const body = [
    'Forwarded message',
    'From: Airbnb <automated@airbnb.com>',
    'Subject: Confirmed: Your reservation for 12–16 Mar',
    "You're all set for El Chalten",
    `["Mutisia's Home" - Cómoda y amplia casa patagónica-]`,
    'Check-in', 'Fri, 12 Mar 2027',
    'Check-out', 'Tue, 16 Mar 2027',
    'Address', 'Cabo Garcia 85, El Chalten, Santa Cruz, Argentina'
  ].join(String.fromCharCode(10));
  const result = extract_(email('Fwd: Confirmed: Your reservation for 12–16 Mar',
    body, 'forwarded-airbnb'));
  assert.equal(result.category, 'hotel');
  assert.equal(result.place, 'El Chaltén');
  assert.equal(result.checkIn, '2027-03-12');
  assert.equal(result.checkOut, '2027-03-16');
  assert.equal(result.status, 'pending');
  assert.ok(!('body' in result));
});

test('Forwarded Airbnb HTML itinerary survives missing plain-text destination', () => {
  const html = '<div>From: Airbnb</div><div>Confirmed: Your reservation</div>' +
    '<div>El Chalten Argentina</div><div>Check-in</div><div>12 Mar 2027</div>' +
    '<div>Check-out</div><div>16 Mar 2027</div>';
  const result = extract_(email('Fwd: Confirmed: Your reservation for 12–16 Mar',
    'From: Airbnb. See reservation details in HTML.', 'airbnb-html', html));
  assert.equal(result.category, 'hotel');
  assert.equal(result.checkIn, '2027-03-12');
  assert.equal(result.checkOut, '2027-03-16');
});


test('old generic Airbnb review row is safely reclassified before approval', () => {
  const old = {
    status: 'pending',
    category: 'other',
    subject: 'Fwd: Confirmed: Your reservation for 12–16 Mar',
    title: 'Fwd: Confirmed: Your reservation for 12–16 Mar',
    place: ''
  };
  const parsed = {
    category: 'hotel',
    subject: old.subject,
    title: "Mutisia's Home",
    place: 'El Chaltén',
    sourceProvider: 'airbnb'
  };
  const recovered = recoverAirbnbReviewFields_(old, parsed);
  assert.equal(recovered.category, 'hotel');
  assert.equal(recovered.title, "Mutisia's Home");
  assert.equal(recovered.place, 'El Chaltén');
});

test('Airbnb recovery never rewrites approved or dismissed decisions', () => {
  const parsed = {
    category: 'hotel',
    subject: 'Fwd: Confirmed: Your reservation for 12–16 Mar',
    title: "Mutisia's Home",
    place: 'El Chaltén'
  };
  assert.equal(Object.keys(recoverAirbnbReviewFields_({
    status: 'approved', category: 'other', subject: parsed.subject
  }, parsed)).length, 0);
  assert.equal(Object.keys(recoverAirbnbReviewFields_({
    status: 'rejected', category: 'other', subject: parsed.subject
  }, parsed)).length, 0);
});


test('Mutisia one-time recovery is constrained to exact Airbnb stay and never auto-approves', () => {
  assert.match(script, /function restoreMutisiaAirbnbReview\(\)/);
  assert.match(script, /sourceProvider !== 'airbnb'/);
  assert.match(script, /parsed\.checkIn !== '2027-03-12'/);
  assert.match(script, /parsed\.checkOut !== '2027-03-16'/);
  assert.match(script, /mutisia/i);
  assert.match(script, /status: 'pending'/);
  assert.doesNotMatch(script.slice(script.indexOf('function restoreMutisiaAirbnbReview'),
    script.indexOf('function sendCancellationReminders')), /prepareApproval|trip\/destinations/);
});


test('Aerolíneas Argentinas PDF itinerary text extracts all five confirmed domestic legs', () => {
  const pdfText = [
    '09 MAR 2027 21 MAR 2027 DESTINO EL CALAFATE, ARGENTINA',
    'PARTIDA: MARTES 09 MAR',
    'AEROLINEAS ARGENTINAS', 'AR 1874', 'AEP', 'BUENOS AIRES AEP, ARGENTINA',
    'USH', 'USHUAIA, ARGENTINA', 'Sale a la(s):', '05:50', 'Llega a la(s):', '09:30',
    'PARTIDA: VIERNES 12 MAR',
    'AEROLINEAS ARGENTINAS', 'AR 1897', 'USH', 'USHUAIA, ARGENTINA',
    'FTE', 'EL CALAFATE, ARGENTINA', 'Sale a la(s):', '09:20', 'Llega a la(s):', '10:40',
    'PARTIDA: JUEVES 18 MAR',
    'AEROLINEAS ARGENTINAS', 'AR 1695', 'FTE', 'EL CALAFATE, ARGENTINA',
    'BRC', 'BARILOCHE SAN CAR, ARGENTINA', 'Sale a la(s):', '09:20', 'Llega a la(s):', '11:05',
    'PARTIDA: JUEVES 18 MAR',
    'AEROLINEAS ARGENTINAS', 'AR 1706', 'BRC', 'BARILOCHE SAN CAR, ARGENTINA',
    'MDZ', 'MENDOZA, ARGENTINA', 'Sale a la(s):', '13:15', 'Llega a la(s):', '14:55',
    'PARTIDA: DOMINGO 21 MAR',
    'AEROLINEAS ARGENTINAS', 'AR 1419', 'MDZ', 'MENDOZA, ARGENTINA',
    'AEP', 'BUENOS AIRES AEP, ARGENTINA', 'Sale a la(s):', '15:00', 'Llega a la(s):', '16:40'
  ].join('\n');
  const segments = aerolineasPdfSegments_(pdfText);
  assert.equal(segments.length, 5);
  assert.deepEqual(Array.from(segments, leg =>
    [leg.number, leg.from, leg.to, leg.date, leg.departure, leg.arrival]), [
      ['AR1874','AEP','USH','2027-03-09','05:50','09:30'],
      ['AR1897','USH','FTE','2027-03-12','09:20','10:40'],
      ['AR1695','FTE','BRC','2027-03-18','09:20','11:05'],
      ['AR1706','BRC','MDZ','2027-03-18','13:15','14:55'],
      ['AR1419','MDZ','AEP','2027-03-21','15:00','16:40']
    ]);
});
