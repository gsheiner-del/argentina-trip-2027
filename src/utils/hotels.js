import { snapshotExpense } from './fx.js';

export function hotelCity(city) {
  return String(city || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
export function hotelStayKey(record) {
  const city = hotelCity(record.city) || 'unknown-city';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(record.checkIn || '')
    ? record.checkIn : 'undated';
  return city + '_' + date;
}
export function hotelFingerprint(record) {
  return [hotelCity(record.city), hotelCity(record.name),
    record.checkIn || '', record.checkOut || ''].join('|');
}
const STRING_FIELDS = ['name', 'city', 'checkIn', 'checkOut', 'status', 'cancellationPolicy',
  'bookingLink', 'rooms', 'source'];
const ALLOWED_STATUS = new Set(['confirmed', 'cancelled', 'pending', 'option']);
function dateIsValid(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Accept only publicly useful information from screenshot transcription.
 * Never import codes, PINs, traveller names or raw emails, even if present in JSON.
 */
export function sanitizeHotel(record, id) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid hotel row.');
  const data = Object.fromEntries(STRING_FIELDS.map(k => [k, String(record[k] ?? '').trim()]));
  if (!data.name || !data.city || data.name.length > 160 || data.city.length > 90) {
    throw new Error('Each booking needs a hotel name and city.');
  }
  if (!dateIsValid(data.checkIn) || !dateIsValid(data.checkOut) ||
      (data.checkIn && data.checkOut && data.checkOut <= data.checkIn)) {
    throw new Error('Booking dates must be valid YYYY-MM-DD, with checkout after check-in.');
  }
  const status = data.status.toLowerCase();
  if (!ALLOWED_STATUS.has(status)) throw new Error('Choose confirmed, cancelled, pending or option.');
  if (data.bookingLink && !/^https:\/\/[a-z0-9.-]+(?:\/|$)/i.test(data.bookingLink)) {
    throw new Error('Booking links must be valid HTTPS URLs.');
  }
  const price = record.price === '' || record.price === null || record.price === undefined
    ? null : Number(record.price);
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1e9)) {
    throw new Error('Hotel price must be a non-negative number.');
  }
  const currency = String(record.currency || 'USD').toUpperCase();
  if (!['USD', 'ARS', 'ILS'].includes(currency)) throw new Error('Hotel currency must be USD, ARS or ILS.');
  const clean = {
    id: String(id || record.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100),
    name: data.name,
    city: data.city,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    price,
    currency,
    status,
    rooms: /^\d{1,2}$/.test(data.rooms) ? Number(data.rooms) : null,
    cancellationPolicy: data.cancellationPolicy.slice(0, 200),
    bookingLink: data.bookingLink,
    source: data.source.slice(0, 80) || 'Manual entry'
  };
  if (!clean.id) throw new Error('Booking record must have a stable ID.');
  // An explicit USD price needs no network; other currencies are handled when
  // the editor saves with a fresh published rate.
  if (currency === 'USD' && price !== null) {
    const snap = snapshotExpense(price, 'USD', null);
    clean.priceUsd = snap.usdValue;
    clean.fxSnapshot = snap.fxSnapshot;
  }
  return clean;
}

export function importHotelRows(rows, existingRecords = []) {
  if (!Array.isArray(rows) || rows.length > 100) throw new Error('Import a JSON array of at most 100 bookings.');
  const existing = new Set(existingRecords.map(hotelFingerprint));
  const accepted = [], skipped = [];
  for (const row of rows) {
    const normalized = sanitizeHotel(row);
    const key = hotelFingerprint(normalized);
    if (existing.has(key)) {
      skipped.push(normalized);
    } else {
      existing.add(key);
      accepted.push(normalized);
    }
  }
  return { accepted, skipped };
}
