import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFlightDestination, prepareMultiFlightApproval } from '../src/utils/tripReview.js';

const trip = {
  destinations: [
    { id: 'ba-arrival', name: 'Buenos Aires (Arrival)', flights: [] },
    { id: 'ush', name: 'Ushuaia', flights: [] },
    { id: 'calafate', name: 'El Calafate', flights: [] },
    { id: 'bariloche', name: 'Bariloche', flights: [] },
    { id: 'mendoza', name: 'Mendoza', flights: [] },
    { id: 'ba-return', name: 'Buenos Aires (Return)', flights: [] }
  ],
  emailImports: {}
};

test('flight destinations resolve by airport and Buenos Aires visit date', () => {
  assert.equal(resolveFlightDestination(trip, { from: 'TLV', to: 'EZE', date: '2027-03-07' })?.id, 'ba-arrival');
  assert.equal(resolveFlightDestination(trip, { from: 'EZE', to: 'TLV', date: '2027-03-24' })?.id, 'ba-return');
  assert.equal(resolveFlightDestination(trip, { from: 'AEP', to: 'USH', date: '2027-03-09' })?.id, 'ush');
  assert.equal(resolveFlightDestination(trip, { from: 'USH', to: 'FTE', date: '2027-03-12' })?.id, 'calafate');
  assert.equal(resolveFlightDestination(trip, { from: 'FTE', to: 'BRC', date: '2027-03-18' })?.id, 'bariloche');
  assert.equal(resolveFlightDestination(trip, { from: 'BRC', to: 'MDZ', date: '2027-03-18' })?.id, 'mendoza');
  assert.equal(resolveFlightDestination(trip, { from: 'MDZ', to: 'AEP', date: '2027-03-21' })?.id, 'ba-return');
});

test('multi-flight approval writes each itinerary leg to its resolved destination', () => {
  const queue = {
    mail1: {
      status: 'pending',
      category: 'flight',
      airline: 'Aerolíneas Argentinas',
      segments: [
        { number: 'AR1874', from: 'AEP', to: 'USH', date: '2027-03-09', departure: '05:50', arrival: '09:30', arrivalDate: '2027-03-09' },
        { number: 'AR1897', from: 'USH', to: 'FTE', date: '2027-03-12', departure: '09:20', arrival: '10:40', arrivalDate: '2027-03-12' },
        { number: 'AR1695', from: 'FTE', to: 'BRC', date: '2027-03-18', departure: '09:20', arrival: '11:05', arrivalDate: '2027-03-18' },
        { number: 'AR1706', from: 'BRC', to: 'MDZ', date: '2027-03-18', departure: '13:15', arrival: '14:55', arrivalDate: '2027-03-18' },
        { number: 'AR1419', from: 'MDZ', to: 'AEP', date: '2027-03-21', departure: '15:00', arrival: '16:40', arrivalDate: '2027-03-21' }
      ]
    }
  };
  const result = prepareMultiFlightApproval(trip, queue, 'mail1', '');
  const paths = result.updates['trip/emailImports/mail1'].targetPaths;
  assert.deepEqual(paths, [
    'trip/destinations/1/flights/0',
    'trip/destinations/2/flights/0',
    'trip/destinations/3/flights/0',
    'trip/destinations/4/flights/0',
    'trip/destinations/5/flights/0'
  ]);
  assert.equal(result.updates['trip/destinations/1/flights/0'].number, 'AR1874');
  assert.equal(result.updates['trip/destinations/5/flights/0'].number, 'AR1419');
  assert.equal(result.updates['gmailImport/reviewQueue/mail1/status'], 'approved');
});

test('EL AL round trip routes outbound and return to separate Buenos Aires visits', () => {
  const queue = {
    elal: {
      status: 'pending',
      category: 'flight',
      airline: 'EL AL',
      segments: [
        { number: 'LY41', from: 'TLV', to: 'EZE', date: '2027-03-07', departure: '18:15', arrival: '05:40', arrivalDate: '2027-03-08' },
        { number: 'LY42', from: 'EZE', to: 'TLV', date: '2027-03-24', departure: '09:00', arrival: '05:15', arrivalDate: '2027-03-25' }
      ]
    }
  };
  const result = prepareMultiFlightApproval(trip, queue, 'elal', '');
  assert.deepEqual(result.updates['trip/emailImports/elal'].targetPaths, [
    'trip/destinations/0/flights/0',
    'trip/destinations/5/flights/0'
  ]);
});
