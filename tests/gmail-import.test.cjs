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
vm.runInContext(script + '\n globalThis.testApi = { extract_, onlyTripMessage_, category_ };', sandbox, {
  filename: 'gmail-to-firebase.gs'
});
const { extract_, onlyTripMessage_ } = sandbox.testApi;

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
