import React, { useMemo, useState } from 'react';
import { existingRecords, cityMatches } from '../utils/tripReview.js';
import { groupHotelOptions } from '../utils/hotels.js';
import { formatMoney } from '../utils/fx.js';
import './HotelBookings.css';
import './StayOptions.css';

const confirmed = s => /confirm|booked/i.test(String(s || '')) &&
  !/cancel/i.test(String(s || ''));
const statusLabel = s => /cancel/i.test(String(s || '')) ? 'Cancelled'
  : confirmed(s) ? 'Confirmed' : 'Option / not confirmed';
const secureLink = v => typeof v === 'string' && /^https:\/\//i.test(v);

export default function StayOptions({ trip, destination, userRole, onSelect, onImport }) {
  const editor = userRole === 'edit';
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const rows = useMemo(() => existingRecords(trip, 'hotel', destination.id),
    [trip, destination.id]);
  const groups = useMemo(() => groupHotelOptions(rows), [rows]);
  const selections = trip?.hotelSelections || {};

  const readFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setFeedback(''); setPreview(null);
    if (!file) return;
    if (file.size > 100_000) return setFeedback('Choose a JSON file smaller than 100 KB.');
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data) || data.length > 100)
        throw new Error('The file must contain an array of up to 100 booking options.');
      const confirmedRows = data.filter(row => confirmed(row.status));
      const excluded = data.length - confirmedRows.length;
      const unmatched = confirmedRows.filter(row =>
        !(trip.destinations || []).some(d => cityMatches(row.city, d.name)));
      setPreview({ rows: confirmedRows, excluded, unmatched });
    } catch (error) { setFeedback(error.message || 'Could not open this JSON file.'); }
  };

  const applyImport = async () => {
    if (!preview || busy) return;
    setBusy(true); setFeedback('');
    try {
      const result = await onImport(preview.rows);
      setFeedback('Added ' + result.added + ', enriched ' + result.enriched +
        ', skipped ' + result.duplicates + ' existing matches. ' +
        result.unmatched + ' records could not be linked to this trip.');
      setPreview(null);
    } catch (error) { setFeedback(error.message || 'Could not import bookings.'); }
    finally { setBusy(false); }
  };

  return (
    <section className="stay-options">
      <div className="stay-intro">
        <h3>Stays · {destination.name}</h3>
        <p>All existing and Gmail-approved bookings for this destination appear here.
          Confirmed alternatives remain visible; selecting Preferred never cancels another reservation.</p>
      </div>
      {editor && <details className="stay-private-import">
        <summary>Import confirmed bookings from your Booking.com screenshot (one-time setup)</summary>
        <p>Upload the previously prepared JSON transcription. All matching trip destinations
          are included in one import. Cancelled entries are excluded by default, and
          existing properties are enriched rather than duplicated. Review the preview first.</p>
        <input type="file" accept=".json,application/json" onChange={readFile} disabled={busy}/>
        {preview && <>
          <p>{preview.rows.length} confirmed, {preview.excluded} excluded (not confirmed),
            {' '}{preview.unmatched.length} without a matching trip destination.</p>
          <ul>{preview.rows.map((row, i) => <li key={String(row.id || i)}>
            {row.name} · {row.city} · {row.checkIn} → {row.checkOut}
            {preview.unmatched.includes(row) && ' (no matching destination)'}
          </li>)}</ul>
          <button disabled={busy} onClick={applyImport}>Confirm import across destinations</button>
          <button disabled={busy} onClick={() => setPreview(null)}>Cancel</button>
        </>}
      </details>}
      {feedback && <p className="stay-feedback" role="status">{feedback}</p>}
      {groups.length === 0 && <p>No accommodation is currently linked to this destination.
        Confirm bookings through Gmail Review or import your confirmed screenshot list.</p>}
      {groups.map(group => {
        const alias = group.aliases.find(a => Object.prototype.hasOwnProperty.call(selections, a));
        const explicit = alias ? selections[alias] : undefined;
        const legacy = group.hotels.find(h => confirmed(h.status) &&
          destination.selectedHotel != null &&
          String(destination.selectedHotel) === String(h.originalId || h.id))?.id;
        const active = explicit === 'none' ? null : explicit || legacy || null;
        const selected = group.hotels.some(h => h.id === active && confirmed(h.status)) ? active : null;
        return (
          <section className="hotel-stay" key={group.key}>
            <div className="hotel-stay-heading">
              <h4>{group.from || 'Dates to confirm'} {group.to ? '→ ' + group.to : ''}</h4>
              <span>{selected ? 'Preferred selected' : 'No preferred stay selected'}</span>
              {editor && selected &&
                <button disabled={busy} onClick={async () => {
                  setBusy(true);
                  try { await onSelect(group.key, null); setFeedback('Preference cleared.'); }
                  catch (error) { setFeedback(error.message); }
                  finally { setBusy(false); }
                }}>Clear preference</button>}
            </div>
            <div className="hotel-grid">
              {group.hotels.map(hotel =>
                <article key={hotel.sourcePath} className={'hotel-card' +
                  (selected === hotel.id ? ' active' : '') +
                  (/cancel/i.test(hotel.status || '') ? ' cancelled' : '')}>
                  <div className="hotel-topline">
                    <span className={'hotel-pill ' + (confirmed(hotel.status) ? 'confirmed' : 'option')}>
                      {statusLabel(hotel.status)}
                    </span>
                    {selected === hotel.id && <span className="hotel-pill active">✓ Preferred</span>}
                    {hotel.reviewedEmails && <span className="hotel-pill">Gmail verified</span>}
                  </div>
                  <h4>{hotel.name}</h4>
                  <p>{hotel.checkIn || 'Check-in TBD'} → {hotel.checkOut || 'Check-out TBD'}</p>
                  {hotel.price != null && hotel.price !== '' &&
                    <strong>{formatMoney(Number(hotel.price),
                      hotel.currency || 'USD')}</strong>}
                  {hotel.rooms && <p>{hotel.rooms} room(s)</p>}
                  {hotel.cancellationPolicy && <p>{hotel.cancellationPolicy}</p>}
                  {hotel.description && <p>{hotel.description}</p>}
                  {hotel.notes && <p>{hotel.notes}</p>}
                  {secureLink(hotel.bookingLink) &&
                    <a target="_blank" rel="noopener noreferrer" href={hotel.bookingLink}>View booking</a>}
                  {editor && confirmed(hotel.status) && selected !== hotel.id &&
                    <button className="stay-prefer" disabled={busy} onClick={async () => {
                      setBusy(true); setFeedback('');
                      try { await onSelect(group.key, hotel); setFeedback('Preference saved.'); }
                      catch (error) { setFeedback(error.message); }
                      finally { setBusy(false); }
                    }}>Set as Preferred</button>}
                </article>)}
            </div>
          </section>
        );
      })}
    </section>
  );
}
