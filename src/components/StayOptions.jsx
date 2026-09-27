import React, { useMemo, useState } from 'react';
import { existingRecords, cityMatches, isMisplacedStay } from '../utils/tripReview.js';
import { groupHotelOptions } from '../utils/hotels.js';
import './HotelBookings.css';
import './StayOptions.css';

const confirmed = s => /confirm|booked/i.test(String(s || '')) &&
  !/cancel/i.test(String(s || ''));
const statusLabel = s => /cancel/i.test(String(s || '')) ? 'Cancelled'
  : confirmed(s) ? 'Confirmed' : 'Option / not confirmed';
const secureLink = v => { try { const u = new URL(v); return u.protocol === 'https:'; } catch { return false; } };
const mapsLink = address => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address);
const wazeLink = address => 'https://waze.com/ul?q=' + encodeURIComponent(address) + '&navigate=yes';
const whatsappLink = phone => { const digits = String(phone || '').replace(/\D/g, ''); return digits.length >= 8 ? 'https://wa.me/' + digits : ''; };

export default function StayOptions({ trip, destination, userRole, onSelect, onImport, onMoveStay, onArchiveStay }) {
  const editor = userRole === 'edit';
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const rows = useMemo(() => existingRecords(trip, 'hotel', destination.id),
    [trip, destination.id]);
  const archived = rows.filter(row => row.status === 'superseded');
  const misplaced = rows.map(row => ({ ...row,
    correctDestination: isMisplacedStay(trip, destination, row) }))
    .filter(row => row.correctDestination && row.status !== 'superseded');
  const activeRows = rows.filter(row => row.status !== 'superseded' &&
    !isMisplacedStay(trip, destination, row));
  const groups = useMemo(() => groupHotelOptions(activeRows), [rows, trip, destination]);
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
      {misplaced.length > 0 && <section className="hotel-stay" aria-label="Bookings assigned to wrong visit">
        <h4>Bookings assigned to the wrong visit</h4>
        <p>These stays are not counted as accommodation for {destination.name}.
          Move them to their correct visit after checking the dates.</p>
        {misplaced.map(hotel => <article className="hotel-card" key={hotel.sourcePath}>
          <strong>{hotel.name}</strong>
          <p>{hotel.checkIn} → {hotel.checkOut} · belongs to {hotel.correctDestination.name}</p>
          {editor && <button disabled={busy} onClick={async () => {
            if (!window.confirm('Move this booking to ' + hotel.correctDestination.name +
              '? Its original record will be removed from this visit. The real reservation is unchanged.')) return;
            setBusy(true); setFeedback('');
            try {
              await onMoveStay(hotel, hotel.correctDestination.id);
              setFeedback('Booking moved to ' + hotel.correctDestination.name + '.');
            } catch (error) { setFeedback(error.message || 'Move failed.'); }
            finally { setBusy(false); }
          }}>Move to {hotel.correctDestination.name}</button>}
        </article>)}
      </section>}
      {archived.length > 0 && <section className="hotel-stay">
        <button type="button" onClick={() => setShowArchived(v => !v)}>
          {showArchived ? 'Hide' : 'Show'} {archived.length} archived booking(s)
        </button>
        {showArchived && archived.map(hotel => <article key={hotel.sourcePath} className="hotel-card">
          <strong>{hotel.name}</strong> · {hotel.checkIn} → {hotel.checkOut}
          <p>Removed from active trip display. This does not cancel a reservation.</p>
          {editor && <button disabled={busy} onClick={async () => {
            setBusy(true); setFeedback('');
            try { await onArchiveStay(hotel, false); setFeedback('Booking restored.'); }
            catch (error) { setFeedback(error.message || 'Restore failed.'); }
            finally { setBusy(false); }
          }}>Restore to trip</button>}
        </article>)}
      </section>}
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
                  {hotel.confirmationNumber && <p>Confirmation: {secureLink(hotel.bookingLink) ?
                    <a href={hotel.bookingLink} target="_blank" rel="noopener noreferrer">{hotel.confirmationNumber} ↗</a> :
                    <span>{hotel.confirmationNumber}</span>}</p>}
                  {hotel.address && <p>📍 {hotel.address} · <a href={mapsLink(hotel.address)} target="_blank" rel="noopener noreferrer">Google Maps</a> · <a href={wazeLink(hotel.address)} target="_blank" rel="noopener noreferrer">Waze</a></p>}
                  {hotel.phone && <p>Phone: {hotel.phone} {whatsappLink(hotel.phone) && <a href={whatsappLink(hotel.phone)} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>}</p>}
                  {hotel.propertyEmail && <p>Email: <a href={'mailto:' + hotel.propertyEmail}>{hotel.propertyEmail}</a></p>}
                  {hotel.cancellationDeadline && <p>Free cancellation until: {hotel.cancellationDeadline} (property local time)</p>}
                  {hotel.rooms && <p>{hotel.rooms} room(s)</p>}
                  {hotel.cancellationPolicy && <p>{hotel.cancellationPolicy}</p>}
                  {hotel.description && <p>{hotel.description}</p>}
                  {hotel.notes && <p>{hotel.notes}</p>}
                  {secureLink(hotel.bookingLink) &&
                    <a target="_blank" rel="noopener noreferrer" href={hotel.bookingLink}>View booking</a>}
                  {editor && <button type="button" disabled={busy} onClick={async () => {
                    if (!window.confirm('Remove this outdated booking from the active trip? ' +
                      'This does not cancel the real reservation. You can restore it later.')) return;
                    setBusy(true); setFeedback('');
                    try { await onArchiveStay(hotel, true); setFeedback('Outdated booking archived.'); }
                    catch (error) { setFeedback(error.message || 'Archive failed.'); }
                    finally { setBusy(false); }
                  }}>Remove outdated booking</button>}
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
