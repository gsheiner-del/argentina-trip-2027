import React, { useEffect, useMemo, useState } from 'react';
import { fetchUsdQuote, currentDisplay, FX_ATTRIBUTION_URL, formatMoney } from '../utils/fx';
import { hotelCity, hotelStayKey, importHotelRows } from '../utils/hotels';
import './HotelBookings.css';

const STATUS_LABEL = { confirmed: 'Confirmed', cancelled: 'Cancelled', pending: 'Pending', option: 'Option' };
const EMPTY = {
  name: '', city: '', checkIn: '', checkOut: '', price: '', currency: 'USD',
  status: 'confirmed', rooms: '', cancellationPolicy: '', bookingLink: ''
};
function canonicalStatus(value) {
  const s = String(value || '').toLowerCase();
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('confirm') || s.includes('booked')) return 'confirmed';
  if (s.includes('pending')) return 'pending';
  return 'option';
}
export function collectHotelBookings(destinations = [], imported = {}) {
  const legacy = [];
  for (const [d, destination] of (Array.isArray(destinations) ? destinations : []).entries()) {
    (destination.hotels || []).forEach((hotel, index) => {
      const rawId = String(hotel.id ?? index);
      legacy.push({
        ...hotel, id: 'legacy_' + String(destination.id) + '_' + rawId,
        originalId: rawId,
        city: hotel.city || destination.name,
        checkIn: hotel.checkIn || '',
        checkOut: hotel.checkOut || '',
        status: canonicalStatus(hotel.status),
        price: hotel.price ?? null,
        currency: hotel.currency || 'USD',
        rooms: hotel.rooms ?? null,
        priceUsd: hotel.priceUsd,
        legacySelected: destination.selectedHotel === hotel.id,
        sourcePath: 'trip/destinations/' + d + '/hotels/' + index
      });
    });
  }
  const added = Object.entries(imported || {}).map(([id, b]) => ({
    ...b, id, status: canonicalStatus(b.status),
    sourcePath: 'trip/hotelBookings/' + id, legacySelected: false
  }));
  return [...legacy, ...added];
}
function HotelCard({ hotel, active, editor, busy, onActivate, onEdit }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const open = () => {
    setForm({
      name: hotel.name || '', city: hotel.city || '',
      checkIn: hotel.checkIn || '', checkOut: hotel.checkOut || '',
      price: hotel.price ?? '', currency: hotel.currency || 'USD',
      status: hotel.status || 'option', rooms: hotel.rooms ?? '',
      cancellationPolicy: hotel.cancellationPolicy || '',
      bookingLink: /^https:\/\//i.test(hotel.bookingLink || '') ? hotel.bookingLink : ''
    });
    setEdit(true);
    setError('');
  };
  const save = async () => {
    setError('');
    try { await onEdit(hotel, form); setEdit(false); }
    catch (e) { setError(e.message || 'Could not save hotel.'); }
  };
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  return (
    <article className={'hotel-card' + (active ? ' active' : '') +
      (hotel.status === 'cancelled' ? ' cancelled' : '')}>
      <div className="hotel-topline">
        <span className={'hotel-pill ' + hotel.status}>{STATUS_LABEL[hotel.status]}</span>
        {active && <span className="hotel-pill active">✓ Active for this stay</span>}
      </div>
      <h4>{hotel.name}</h4>
      <p>{hotel.city} {hotel.checkIn && ' · ' + hotel.checkIn}
        {hotel.checkOut && ' → ' + hotel.checkOut}</p>
      {hotel.price !== null && hotel.price !== undefined && hotel.price !== '' &&
        <strong>{formatMoney(Number(hotel.price), hotel.currency || 'USD')}</strong>}
      {hotel.rooms && <p>{hotel.rooms} room(s)</p>}
      {hotel.cancellationPolicy && <p>{hotel.cancellationPolicy}</p>}
      {hotel.description && <p>{hotel.description}</p>}
      {hotel.fxSnapshot?.rateTimestamp && <p className="hotel-muted">
        USD value saved at rate published {new Date(hotel.fxSnapshot.rateTimestamp).toLocaleDateString()}.</p>}
      {/^https:\/\//i.test(hotel.bookingLink || '') &&
        <a href={hotel.bookingLink} target="_blank" rel="noopener noreferrer">Open booking</a>}
      {editor && <div className="hotel-actions">
        {hotel.status === 'confirmed'
          ? <button type="button" disabled={busy || active} className="hotel-primary"
              onClick={() => onActivate(hotel)}> {active ? 'Selected' : 'Set active'} </button>
          : <span className="hotel-muted">Only confirmed bookings can be made active.</span>}
        <button type="button" disabled={busy} onClick={open}>Edit details</button>
      </div>}
      {edit && <div className="hotel-form">
        <label>Property<input value={form.name} onChange={e => setField('name', e.target.value)} /></label>
        <label>City<input value={form.city} onChange={e => setField('city', e.target.value)} /></label>
        <label>Check in<input type="date" value={form.checkIn} onChange={e => setField('checkIn', e.target.value)} /></label>
        <label>Check out<input type="date" value={form.checkOut} onChange={e => setField('checkOut', e.target.value)} /></label>
        <label>Total price<input type="number" step="0.01" min="0" value={form.price}
          onChange={e => setField('price', e.target.value)} /></label>
        <label>Currency<select value={form.currency} onChange={e => setField('currency', e.target.value)}>
          <option value="USD">USD</option><option value="ARS">ARS</option><option value="ILS">ILS</option>
        </select></label>
        <label>Status<select value={form.status} onChange={e => setField('status', e.target.value)}>
          <option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option>
          <option value="pending">Pending</option><option value="option">Option</option>
        </select></label>
        <label>Rooms<input type="number" min="1" max="20" value={form.rooms}
          onChange={e => setField('rooms', e.target.value)} /></label>
        <label className="hotel-full">Cancellation terms<input value={form.cancellationPolicy}
          onChange={e => setField('cancellationPolicy', e.target.value)} /></label>
        <label className="hotel-full">Booking link (HTTPS)<input value={form.bookingLink}
          onChange={e => setField('bookingLink', e.target.value)} /></label>
        <p className="hotel-full hotel-muted">Foreign-currency prices are converted using the most
          recently published daily rate at Save. The USD equivalent and rate timestamp are stored.</p>
        {error && <p className="hotel-full hotel-error" role="alert">{error}</p>}
        <div className="hotel-full hotel-actions">
          <button className="hotel-primary" disabled={busy} onClick={save}>Save hotel</button>
          <button disabled={busy} onClick={() => setEdit(false)}>Cancel</button>
        </div>
      </div>}
    </article>
  );
}

export default function HotelBookings({
  destinations = [], hotelBookings = {}, hotelSelections = {}, userRole,
  destinationId = null, onImport, onAdd, onEdit, onSelect
}) {
  const editor = userRole === 'edit';
  const [upload, setUpload] = useState(null);
  const [newForm, setNewForm] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [quote, setQuote] = useState(null);
  const [fxMessage, setFxMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    fetchUsdQuote().then(q => { if (mounted) setQuote(q); })
      .catch(e => { if (mounted) setFxMessage(e.message); });
    return () => { mounted = false; };
  }, []);

  const all = useMemo(() => collectHotelBookings(destinations, hotelBookings),
    [destinations, hotelBookings]);
  const destination = destinations.find(d => d.id === destinationId);
  const shown = destination ? all.filter(x => hotelCity(x.city) === hotelCity(destination.name)) : all;
  const byStay = new Map();
  for (const hotel of shown) {
    const key = hotelStayKey(hotel);
    if (!byStay.has(key)) byStay.set(key, []);
    byStay.get(key).push(hotel);
  }
  const groups = [...byStay].sort(([a], [b]) => a.localeCompare(b));
  const existing = useMemo(() => all, [all]);

  const importFile = async (event) => {
    setMessage(''); setUpload(null);
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 100000) return setMessage('Choose a JSON file smaller than 100 KB.');
    try {
      const json = JSON.parse(await file.text());
      const records = importHotelRows(json, existing);
      setUpload(records);
    } catch (e) { setMessage(e.message || 'Could not parse the file.'); }
  };

  const doImport = async () => {
    if (!upload?.accepted?.length || busy) return;
    setBusy(true); setMessage('');
    try {
      await onImport(upload.accepted);
      setMessage('Imported ' + upload.accepted.length + ' choices. No active hotel was selected.');
      setUpload(null);
    } catch (e) { setMessage(e.message || 'Import failed.'); }
    finally { setBusy(false); }
  };

  const saveBooking = async (hotel, form) => {
    setBusy(true); setMessage('');
    try { await onEdit(hotel, form); }
    catch (e) { throw e; }
    finally { setBusy(false); }
  };

  const saveNew = async () => {
    setBusy(true); setMessage('');
    try {
      await onAdd({ ...newForm, source: 'Manual entry' });
      setNewForm(null);
      setMessage('Booking added as an option. Choose Set active explicitly if applicable.');
    } catch (e) { setMessage(e.message || 'Could not add booking.'); }
    finally { setBusy(false); }
  };

  return (
    <section className="hotel-bookings">
      <header className="hotel-heading">
        <div>
          <h2>Hotels &amp; bookings</h2>
          <p>Keep multiple alternatives, including cancelled history. Gennady and Marina
            can select one confirmed booking for each city and check-in date.</p>
        </div>
        <span>{shown.length} option(s)</span>
      </header>
      <div className="hotel-toolbar">
        <label>Display prices<select value={currency} onChange={e => setCurrency(e.target.value)}>
          <option value="USD">USD</option><option value="ARS">ARS</option><option value="ILS">ILS</option>
        </select></label>
        {quote ? <small>Daily rate: {new Date(quote.rateTimestamp).toLocaleDateString()} ·
          {' '}<a href={FX_ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer">Rates by ExchangeRate-API</a></small>
          : <small>{fxMessage || 'Loading latest published reference rate…'}</small>}
      </div>
      {editor && !destinationId && (
        <div className="hotel-import">
          <h3>Import your Booking.com screenshot list</h3>
          <p>Choose the private JSON transcription file. Duplicate name/city/date entries
            are skipped. Nothing becomes active automatically.</p>
          <input type="file" accept=".json,application/json" onChange={importFile} />
          {upload && <div>
            <p>{upload.accepted.length} new records; {upload.skipped.length} already present.
              Review the file before confirming.</p>
            <ul>{upload.accepted.map(r => <li key={r.id}>
              {r.name} · {r.city} · {r.checkIn} · {r.currency} {r.price} · {r.status}
            </li>)}</ul>
            <button disabled={busy || !upload.accepted.length} onClick={doImport}>Confirm import</button>
            <button onClick={() => setUpload(null)} disabled={busy}>Cancel</button>
          </div>}
        </div>
      )}
      {editor && !newForm && <button className="hotel-add" disabled={busy}
        onClick={() => setNewForm({ ...EMPTY, city: destination?.name || '' })}>+ Add booking option</button>}
      {editor && newForm && <div className="hotel-form hotel-create">
        <h3 className="hotel-full">New hotel option</h3>
        {['name','city','checkIn','checkOut','price','rooms','cancellationPolicy','bookingLink'].map(field =>
          <label key={field}>{field}<input
            type={field === 'checkIn' || field === 'checkOut' ? 'date' :
              field === 'price' || field === 'rooms' ? 'number' : 'text'}
            min={field === 'price' ? '0' : undefined}
            step={field === 'price' ? '0.01' : undefined}
            value={newForm[field]} onChange={e => setNewForm({ ...newForm, [field]: e.target.value })}/></label>)}
        <label>Currency<select value={newForm.currency}
          onChange={e => setNewForm({ ...newForm, currency: e.target.value })}>
          <option>USD</option><option>ARS</option><option>ILS</option>
        </select></label>
        <label>Status<select value={newForm.status}
          onChange={e => setNewForm({ ...newForm, status: e.target.value })}>
          <option value="confirmed">Confirmed</option><option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option><option value="option">Option</option>
        </select></label>
        <div className="hotel-full hotel-actions">
          <button className="hotel-primary" disabled={busy} onClick={saveNew}>Save option</button>
          <button disabled={busy} onClick={() => setNewForm(null)}>Cancel</button>
        </div>
      </div>}
      {message && <p className="hotel-message" role="status">{message}</p>}
      {groups.map(([key, list]) => {
        const storedChoice = Object.prototype.hasOwnProperty.call(hotelSelections, key)
          ? hotelSelections[key] : undefined;
        const selected = storedChoice === 'none'
          ? null : storedChoice || list.find(x => x.legacySelected)?.id || null;
        return <section className="hotel-stay" key={key}>
          <div className="hotel-stay-heading">
            <h3>📍 {list[0].city} · {list[0].checkIn || 'Dates to be confirmed'}</h3>
            <span>{selected ? 'Active selection saved' : 'No active hotel selected'}</span>
            {editor && selected &&
              <button type="button" disabled={busy} onClick={async () => {
                setBusy(true); try { await onSelect(key, null); }
                catch (e) { setMessage(e.message); } finally { setBusy(false); }
              }}>Clear selection</button>}
          </div>
          <div className="hotel-grid">{list.map(hotel => (
            <div key={hotel.id}>
              <HotelCard hotel={hotel} active={selected === hotel.id} editor={editor} busy={busy}
                onActivate={async (item) => {
                  setBusy(true); setMessage('');
                  try { await onSelect(key, item); }
                  catch (e) { setMessage(e.message || 'Could not select this booking.'); }
                  finally { setBusy(false); }
                }}
                onEdit={saveBooking} />
              {hotel.price !== null && hotel.price !== undefined && hotel.price !== '' &&
                <p className="hotel-converted">
                  {(() => {
                    const usd = Number.isFinite(hotel.priceUsd) ? hotel.priceUsd
                      : hotel.currency === 'USD' ? Number(hotel.price)
                        : quote?.rates?.[hotel.currency] ? Number(hotel.price) / quote.rates[hotel.currency] : null;
                    const displayed = usd === null ? null : currentDisplay(usd, currency, quote);
                    return displayed === null
                      ? 'Displayed conversion unavailable'
                      : currency === hotel.currency ? 'Original price' :
                        '≈ ' + formatMoney(displayed, currency) +
                        (Number.isFinite(hotel.priceUsd) ? ' (stored USD basis)' : ' (current indicative rate)');
                  })()}
                </p>}
            </div>))}
          </div>
        </section>;
      })}
      {!shown.length && <p>No hotel booking options have been entered yet.</p>}
    </section>
  );
}
