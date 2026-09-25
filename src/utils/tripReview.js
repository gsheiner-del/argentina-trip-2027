import { hotelCity } from './hotels.js';

export const CATEGORIES = ['hotel', 'flight', 'activity'];
const norm = v => String(v || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const safe = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const date = v => {
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Use YYYY-MM-DD dates.');
  const d = new Date(v + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v)
    throw new Error('Invalid calendar date.');
  return v;
};
const overlap = (a, b) => a.checkIn && a.checkOut && b.checkIn && b.checkOut &&
  a.checkIn < b.checkOut && b.checkIn < a.checkOut;
export const cityMatches = (a, b) => {
  const x = hotelCity(a), y = hotelCity(b);
  const canonical = city => city
    .replace(/-(?:return|arrival|departure|second-visit|second-stay)$/, '')
    .replace(/^el-/, '');
  return !!x && !!y && canonical(x) === canonical(y);
};

/** Staged Booking.com update receipts may replace an older confirmation for
 * the same reservation. Only an exact confirmation number identifies the
 * same booking: matching property names or overlapping dates are insufficient.
 * This is a display-only filter; no queue entries are deleted or approved.
 */
export function supersededReviewIds(queue) {
  const newestByConfirmation = new Map();
  const superseded = new Set();
  const entries = Object.entries(queue || {}).filter(([, item]) =>
    item && item.category === 'hotel' &&
    /^(pending|approved)$/.test(item.status || 'pending') &&
    /^[0-9]{6,14}$/.test(String(item.confirmationNumber || '')));
  for (const [id, item] of entries) {
    const key = String(item.confirmationNumber);
    const stamp = Date.parse(item.receivedAt || '') || 0;
    const existing = newestByConfirmation.get(key);
    if (!existing || stamp > existing.stamp ||
        stamp === existing.stamp && id > existing.id) {
      newestByConfirmation.set(key, { id, stamp });
    }
  }
  for (const [id, item] of entries) {
    if (newestByConfirmation.get(String(item.confirmationNumber))?.id !== id &&
        (item.status || 'pending') === 'pending') superseded.add(id);
  }
  return superseded;
}

/** Show potential date revisions for the same property even when dates no longer
 * overlap; editors must explicitly confirm date replacements before update.
 */
export function samePropertyOptions(trip, destinationId, draft) {
  const proposedName = norm(draft.title)
    .replace(/^(?:your updated booking at|your booking is confirmed at|thanks your booking is confirmed at)\s+/, '');
  if (!proposedName || !draft.place) return [];
  return existingRecords(trip, 'hotel', destinationId).filter(row => {
    const name = norm(row.name)
      .replace(/^(?:your updated booking at|your booking is confirmed at|thanks your booking is confirmed at)\s+/, '');
    return name === proposedName && cityMatches(row.city, draft.place);
  });
}

export const destinationIndex = (destinations, id) =>
  (destinations || []).findIndex(d => String(d.id) === String(id));

export function existingRecords(trip, category, destinationId) {
  const idx = destinationIndex(trip?.destinations, destinationId);
  if (idx < 0) return [];
  const dest = trip.destinations[idx];
  const field = category === 'hotel' ? 'hotels' : category === 'flight' ? 'flights' : 'activities';
  const rows = (Array.isArray(dest[field]) ? dest[field] : []).filter(Boolean)
    .map((row, i) => ({ ...row,
      sourcePath: 'trip/destinations/' + idx + '/' + field + '/' + i,
      sourceType: 'destination', city: row.city || dest.name,
      displayName: row.name || [row.airline, row.number].filter(Boolean).join(' ') || row.title
    }));
  if (category === 'hotel') {
    for (const [id, row] of Object.entries(trip?.hotelBookings || {})) {
      if (!row || !cityMatches(row.city, dest.name)) continue;
      rows.push({ ...row, id, sourcePath: 'trip/hotelBookings/' + id,
        sourceType: 'hotelBookings', city: row.city || dest.name,
        displayName: row.name });
    }
  }
  return rows;
}

export function likelyMatches(trip, category, destinationId, draft) {
  return existingRecords(trip, category, destinationId).filter(r => {
    if (category === 'hotel') {
      if (norm(r.name) !== norm(draft.title) || !cityMatches(r.city, draft.place)) return false;
      const bothDated = r.checkIn && r.checkOut && draft.checkIn && draft.checkOut;
      return !bothDated || overlap(r, draft);
    }
    if (category === 'flight') {
      if (!norm(draft.number) || norm(draft.number) !== norm(r.number)) return false;
      if (draft.date && (r.date || r.departureDate) &&
          draft.date !== (r.date || r.departureDate)) return false;
      if (draft.from && r.from && norm(draft.from) !== norm(r.from)) return false;
      if (draft.to && r.to && norm(draft.to) !== norm(r.to)) return false;
      return true;
    }
    return norm(r.name) === norm(draft.title) &&
      (!r.date || !draft.date || r.date === draft.date);
  }).map(r => ({ ...r, conflicts: (category === 'hotel'
    ? ['checkIn', 'checkOut', 'price', 'currency', 'status']
    : category === 'flight' ? ['date', 'departure', 'arrival'] : ['date', 'time'])
    .filter(k => draft[k] !== undefined && draft[k] !== '' &&
      r[k] !== undefined && r[k] !== '' &&
      String(r[k]).toLowerCase() !== String(draft[k]).toLowerCase()) }));
}

const pathSafe = /^trip\/(?:destinations\/\d+\/(?:hotels|flights|activities)\/\d+|hotelBookings\/[A-Za-z0-9_-]+)$/;
/** Build a single atomic Firebase multipath update. Never copy email bodies or PINs. */
export function prepareApproval(trip, queue, emailId, options) {
  const item = queue?.[emailId];
  if (!item || !['pending', 'approved'].includes(item.status))
    throw new Error('This email is not available for review.');
  if (trip?.emailImports?.[emailId]) throw new Error('This email was already linked.');
  if (item.cancellationFlag)
    throw new Error('Cancellation emails require manual handling; they cannot confirm a booking.');
  const { destinationId, category, existingPath = '', replaceConflicts = false } = options;
  if (!CATEGORIES.includes(category)) throw new Error('Select Stays, Flights or Activities.');
  const idx = destinationIndex(trip?.destinations, destinationId);
  if (idx < 0) throw new Error('Choose a destination from this trip.');
  const dest = trip.destinations[idx], input = options.draft || {};
  const title = safe(input.title, 140);
  if (!title) throw new Error('Enter the property, flight or activity name.');
  const now = Date.now();
  const base = { status: 'confirmed', source: 'Gmail review',
    reviewedAt: now, reviewedEmails: { [emailId]: true } };
  let record, field, updatesPrivate = null;
  if (category === 'hotel') {
    const checkIn = date(input.checkIn), checkOut = date(input.checkOut);
    if (!checkIn || !checkOut || checkOut <= checkIn)
      throw new Error('Confirm both check-in and check-out before approving.');
    const place = safe(input.place || dest.name, 100);
    if (!cityMatches(place, dest.name))
      throw new Error('Hotel city and selected destination do not match.');
    record = { ...base, name: title, city: dest.name, checkIn, checkOut,
      notes: safe(input.notes, 350) };
    if (input.price !== undefined && input.price !== '') {
      const n = Number(input.price);
      if (!Number.isFinite(n) || n < 0 || n > 1e9)
        throw new Error('Enter a valid non-negative hotel price.');
      if (!['USD', 'ARS', 'ILS'].includes(input.currency))
        throw new Error('Choose the booking currency.');
      record.price = n; record.currency = input.currency;
      if (record.currency === 'USD') record.priceUsd = n;
    }
    const address = safe(input.address, 250), phone = safe(input.phone, 40);
    const propertyEmail = safe(input.propertyEmail, 150);
    const confirmationNumber = safe(input.confirmationNumber, 60);
    const bookingLink = safe(input.bookingLink, 1000);
    const cancellationDeadline = safe(input.cancellationDeadline, 32);
    if (propertyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(propertyEmail))
      throw new Error('Invalid property email.');
    if (bookingLink) {
      let url;
      try { url = new URL(bookingLink); } catch { throw new Error('Invalid Booking.com URL.'); }
      if (url.protocol !== 'https:' || !/(^|\.)booking\.com$/i.test(url.hostname))
        throw new Error('Use an HTTPS Booking.com reservation URL.');
    }
    if (cancellationDeadline && !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(cancellationDeadline))
      throw new Error('Confirm the cancellation deadline in local property time.');
    Object.assign(record, { address, phone, propertyEmail,
      cancellationDeadline });
    // The trip node is readable by family viewers. Never publish confirmation
    // numbers or reservation URLs there, even when their URL looks un-tokenized.
    // Store both under the editor-only Gmail import tree instead.
    if (confirmationNumber || bookingLink) {
      updatesPrivate = { confirmationNumber, bookingLink };
    }
    field = 'hotels';
  } else if (category === 'flight') {
    const flightDate = date(input.date || input.checkIn);
    if (!flightDate || !safe(input.number, 30) || !safe(input.from, 90) ||
        !safe(input.to, 90))
      throw new Error('Confirm flight number, date and both airports before approving.');
    record = { ...base, airline: safe(input.airline || title, 100),
      number: safe(input.number, 30).toUpperCase(), date: flightDate,
      from: safe(input.from, 90), to: safe(input.to, 90),
      departure: safe(input.departure, 80), arrival: safe(input.arrival, 80),
      notes: safe(input.notes, 350) };
    field = 'flights';
  } else {
    const activityDate = date(input.date || input.checkIn);
    if (!activityDate) throw new Error('Confirm the activity date before approving.');
    record = { ...base, name: title, date: activityDate,
      time: safe(input.time, 60), organizer: safe(input.organizer, 120),
      meetingPoint: safe(input.meetingPoint, 150), description: safe(input.notes, 350) };
    field = 'activities';
  }
  const updates = {
    ['gmailImport/reviewQueue/' + emailId + '/status']: 'approved',
    ['gmailImport/reviewQueue/' + emailId + '/reviewedAt']: now,
    ['gmailImport/reviewQueue/' + emailId + '/destinationId']: String(destinationId)
  };
  let path;
  if (existingPath) {
    if (!pathSafe.test(existingPath)) throw new Error('Invalid match path.');
    const previous = existingRecords(trip, category, destinationId)
      .find(r => r.sourcePath === existingPath);
    if (!previous) throw new Error('Selected match no longer exists. Reload and review again.');
    path = existingPath;
    updates[path + '/reviewedEmails/' + emailId] = true;
    // Fill missing fields; preserve existing confirmed screenshot/manual information.
    for (const [key, value] of Object.entries(record)) {
      if (['reviewedEmails', 'source', 'reviewedAt'].includes(key) ||
          value === '' || value == null) continue;
      const old = previous[key];
      if (old !== undefined && old !== null && old !== '' &&
          String(old).toLowerCase() !== String(value).toLowerCase() &&
          !replaceConflicts) continue;
      if (old !== value) updates[path + '/' + key] = value;
    }
    if (!previous.reviewedAt) updates[path + '/reviewedAt'] = now;
  } else {
    const similar = likelyMatches(trip, category, destinationId,
      { ...input, title, place: input.place || dest.name });
    if (similar.length) throw new Error('Matching booking exists. Choose it instead of making a duplicate.');
    const rows = Array.isArray(dest[field]) ? dest[field] : [];
    path = 'trip/destinations/' + idx + '/' + field + '/' + rows.length;
    record.id = 'gmail_' + emailId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 55);
    updates[path] = record;
  }
  if (updatesPrivate) {
    updates['gmailImport/privateBookings/' + emailId] = {
      ...updatesPrivate, targetPath: path, updatedAt: now
    };
  }
  updates['trip/emailImports/' + emailId] = {
    category, destinationId: String(destinationId), targetPath: path, importedAt: now
  };
  return { updates, path, result: existingPath ? 'updated' : 'created' };
}

/** Approve every leg of a multi-flight receipt as one atomic operation.
 * Repeated passenger emails enrich the same shared flight records.
 * No passenger identity, ticket or loyalty number is published to trip.
 */
export function prepareMultiFlightApproval(trip, queue, emailId, destinationId) {
  const item = queue?.[emailId];
  if (!item || item.status !== 'pending' || item.cancellationFlag ||
      trip?.emailImports?.[emailId]) throw new Error('Email is not available for approval.');
  const legs = item.segments;
  if (!Array.isArray(legs) || legs.length < 2)
    throw new Error('This email does not contain multiple parsed flights.');
  const idx = destinationIndex(trip?.destinations, destinationId);
  if (idx < 0) throw new Error('Choose a destination.');
  const dest = trip.destinations[idx];
  const flights = Array.isArray(dest.flights) ? dest.flights : [];
  const now = Date.now(), updates = {}, paths = [], reserved = new Set();
  for (const leg of legs) {
    const number = safe(leg.number, 30).toUpperCase();
    const flightDate = date(leg.date);
    const from = safe(leg.from, 90), to = safe(leg.to, 90);
    if (!number || !flightDate || !from || !to || !/^([01]\d|2[0-3]):[0-5]\d$/.test(leg.departure || ''))
      throw new Error('Verify each leg’s flight number, airports, date and departure time.');
    const matching = flights.map((row, i) => ({ row, i })).filter(({ row }) =>
      norm(row.number) === norm(number) &&
      (!row.date || row.date === flightDate) &&
      (!row.from || norm(row.from) === norm(from)) &&
      (!row.to || norm(row.to) === norm(to)));
    if (matching.length > 1) throw new Error('Ambiguous existing flight: resolve duplicates manually.');
    const path = 'trip/destinations/' + idx + '/flights/' +
      (matching.length ? matching[0].i : flights.length + reserved.size);
    if (paths.includes(path)) throw new Error('Two legs unexpectedly resolve to the same flight.');
    const record = { status: 'confirmed', airline: safe(item.airline || 'Airline', 100),
      number, date: flightDate, from, to,
      departure: safe(leg.departure, 20), arrival: safe(leg.arrival, 20),
      arrivalDate: leg.arrivalDate ? date(leg.arrivalDate) : '',
      source: 'Gmail review' };
    if (matching.length) {
      const previous = matching[0].row;
      updates[path + '/reviewedEmails/' + emailId] = true;
      for (const [key, value] of Object.entries(record)) {
        if (value && (previous[key] === undefined || previous[key] === null || previous[key] === ''))
          updates[path + '/' + key] = value;
      }
    } else {
      reserved.add(path);
      updates[path] = { ...record, id: 'gmail_' + emailId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 45) +
        '_' + paths.length, reviewedEmails: { [emailId]: true }, reviewedAt: now };
    }
    paths.push(path);
  }
  updates['gmailImport/reviewQueue/' + emailId + '/status'] = 'approved';
  updates['gmailImport/reviewQueue/' + emailId + '/reviewedAt'] = now;
  updates['gmailImport/reviewQueue/' + emailId + '/destinationId'] = String(destinationId);
  updates['trip/emailImports/' + emailId] = {
    category: 'flight', destinationId: String(destinationId), targetPath: paths[0],
    targetPaths: paths, importedAt: now
  };
  return { updates, path: paths.join(', '), result: 'linked ' + paths.length + ' flights' };
}

export function screenshotImportPlan(trip, destinationId, rows, confirmedOnly = true) {
  const idx = destinationIndex(trip?.destinations, destinationId);
  if (idx < 0) throw new Error('Choose a destination.');
  const dest = trip.destinations[idx];
  const existing = existingRecords(trip, 'hotel', destinationId);
  const accept = [], duplicate = [], excluded = [];
  const fingerprint = r => norm(r.name) + '|' + hotelCity(r.city) + '|' +
    (r.checkIn || '') + '|' + (r.checkOut || '');
  const seen = new Set(existing.map(fingerprint));
  if (!Array.isArray(rows) || rows.length > 100)
    throw new Error('Import at most 100 bookings.');
  for (const raw of rows) {
    if (!cityMatches(raw.city, dest.name) ||
        (confirmedOnly && norm(raw.status) !== 'confirmed')) {
      excluded.push(raw); continue;
    }
    if (!safe(raw.name) || !date(raw.checkIn) || !date(raw.checkOut))
      throw new Error('Every imported booking needs a name and dates.');
    const key = fingerprint(raw);
    if (seen.has(key)) duplicate.push(raw);
    else { seen.add(key); accept.push(raw); }
  }
  return { accept, duplicate, excluded, destinationIndex: idx };
}
