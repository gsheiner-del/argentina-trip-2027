import React, { useEffect, useMemo, useState } from 'react';
import { database, ref, onValue, update } from '../firebase';
import { existingRecords, likelyMatches, prepareApproval } from '../utils/tripReview.js';
import { cityMatches } from '../utils/tripReview.js';
import '../styles/GmailSync.css';

const QUEUE_PATH = 'gmailImport/reviewQueue';
const options = [['hotel', 'Stays'], ['flight', 'Flights'], ['activity', 'Activities & Tours']];
const initDraft = item => ({
  title: item.title || '', place: item.place || '',
  checkIn: item.checkIn || '', checkOut: item.checkOut || '',
  date: item.date || item.checkIn || '',
  number: item.number || '', airline: item.airline || '',
  from: item.from || '', to: item.to || '',
  departure: item.departure || '', arrival: item.arrival || '',
  time: item.time || '', organizer: item.organizer || '',
  meetingPoint: item.meetingPoint || '',
  price: item.price == null ? '' : String(item.price),
  currency: item.currency || 'USD', notes: item.notes || ''
});
const initialCategory = item => item.category === 'flight_extra' ? 'flight'
  : item.category === 'hotel' ? 'hotel'
  : item.category === 'flight' ? 'flight' : 'activity';

function ReviewCard({ item, itemId, trip, saving, onAction }) {
  const [category, setCategory] = useState(() => initialCategory(item));
  const [draft, setDraft] = useState(() => initDraft(item));
  const [destinationId, setDestinationId] = useState(() =>
    (trip.destinations || []).find(dest => cityMatches(item.place, dest.name))?.id || '');
  const [existingPath, setExistingPath] = useState('');
  const [replaceConflicts, setReplaceConflicts] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setDraft(prev => Object.fromEntries(Object.entries(initDraft(item)).map(([key, val]) =>
      [key, prev[key] || val])));
  }, [item.checkIn, item.checkOut, item.date, item.from, item.to, item.number]);

  const setField = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));
  const matches = useMemo(() =>
    destinationId ? likelyMatches(trip, category, destinationId, draft) : [],
    [trip, category, destinationId, draft]);
  const matchList = useMemo(() =>
    destinationId ? existingRecords(trip, category, destinationId) : [],
    [trip, category, destinationId]);
  const selected = matchList.find(m => m.sourcePath === existingPath);
  const conflicts = matches.find(m => m.sourcePath === existingPath)?.conflicts || [];
  const canApprove = !item.cancellationFlag && draft.title.trim() && destinationId &&
    (existingPath || matches.length === 0);

  const approve = async () => {
    setError('');
    try {
      await onAction(itemId, item, 'approve', {
        category, destinationId, existingPath,
        replaceConflicts, draft
      });
    } catch (e) { setError(e.message || 'Could not approve this record.'); }
  };
  return (
    <article className="gmail-review-card">
      <header className="gmail-review-head">
        <span className="gmail-review-category">{item.category || 'other'} email</span>
        {item.status === 'approved'
          ? <span className="gmail-muted">Older approval — link to a destination</span>
          : <span className="gmail-muted">Pending confirmation</span>}
      </header>
      <h4>{item.subject || 'Travel email'}</h4>
      <p className="gmail-muted">Received: {item.receivedAt
        ? new Date(item.receivedAt).toLocaleString() : 'Date unknown'}</p>
      {item.cancellationFlag &&
        <p className="gmail-warning">Cancellation detected. Do not approve as a confirmed booking.
          Verify the original message and update the reservation manually.</p>}
      <div className="gmail-review-fields">
        <label>Send to
          <select value={category} onChange={e => {
            setCategory(e.target.value); setExistingPath('');
          }}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <label>Destination
          <select value={destinationId} onChange={e => {
            setDestinationId(e.target.value); setExistingPath('');
          }}>
            <option value="">Select destination</option>
            {(trip.destinations || []).map(dest =>
              <option key={dest.id} value={dest.id}>{dest.name}</option>)}
          </select>
        </label>
        <label>Property / flight / activity name
          <input value={draft.title} maxLength={140}
            onChange={e => setField('title', e.target.value)}/></label>
        {category === 'hotel' && <>
          <label>City / place<input value={draft.place} maxLength={100}
            onChange={e => setField('place', e.target.value)}/></label>
          <label>Check-in<input type="date" value={draft.checkIn}
            onChange={e => setField('checkIn', e.target.value)}/></label>
          <label>Check-out<input type="date" value={draft.checkOut}
            onChange={e => setField('checkOut', e.target.value)}/></label>
          <label>Optional total price<input type="number" min="0" step=".01"
            value={draft.price} onChange={e => setField('price', e.target.value)}/></label>
          <label>Price currency<select value={draft.currency}
            onChange={e => setField('currency', e.target.value)}>
            <option>USD</option><option>ARS</option><option>ILS</option>
          </select></label>
        </>}
        {category === 'flight' && <>
          <label>Flight number<input value={draft.number}
            onChange={e => setField('number', e.target.value)}/></label>
          <label>Airline<input value={draft.airline}
            onChange={e => setField('airline', e.target.value)}/></label>
          <label>Flight date<input type="date" value={draft.date}
            onChange={e => setField('date', e.target.value)}/></label>
          <label>From airport<input value={draft.from}
            onChange={e => setField('from', e.target.value)}/></label>
          <label>To airport<input value={draft.to}
            onChange={e => setField('to', e.target.value)}/></label>
          <label>Departure time<input value={draft.departure}
            onChange={e => setField('departure', e.target.value)}/></label>
          <label>Arrival time<input value={draft.arrival}
            onChange={e => setField('arrival', e.target.value)}/></label>
        </>}
        {category === 'activity' && <>
          <label>Activity date<input type="date" value={draft.date}
            onChange={e => setField('date', e.target.value)}/></label>
          <label>Time<input value={draft.time}
            onChange={e => setField('time', e.target.value)}/></label>
          <label>Organizer<input value={draft.organizer}
            onChange={e => setField('organizer', e.target.value)}/></label>
          <label>Meeting point<input value={draft.meetingPoint}
            onChange={e => setField('meetingPoint', e.target.value)}/></label>
        </>}
        <label className="gmail-review-notes">
          Public trip notes — no PINs, ticket numbers or personal booking codes
          <textarea rows={2} maxLength={350} value={draft.notes}
            onChange={e => setField('notes', e.target.value)}/>
        </label>
      </div>
      {destinationId && <div className="gmail-match-panel">
        <strong>Link this email to a destination record</strong>
        {matches.length > 0 &&
          <p className="gmail-warning">{matches.length} potential duplicate(s) found.
            Select an existing record. Creating a duplicate is disabled.</p>}
        <select value={existingPath} onChange={e => {
          setExistingPath(e.target.value); setReplaceConflicts(false);
        }}>
          <option value="">{matches.length
            ? 'Select an existing match before approval'
            : 'Create new confirmed record in selected destination'}</option>
          {matchList.map(record =>
            <option key={record.sourcePath} value={record.sourcePath}>
              {record.displayName || record.name} — {record.checkIn || record.date || 'undated'}
              {matches.some(x => x.sourcePath === record.sourcePath) ? ' ★ likely match' : ''}
            </option>)}
        </select>
        {selected && <p className="gmail-muted">
          Existing: {selected.displayName || selected.name}; only missing fields are
          filled automatically. Existing confirmed data will not be overwritten.
        </p>}
        {conflicts.length > 0 && <label className="gmail-conflict">
          <input type="checkbox" checked={replaceConflicts}
            onChange={e => setReplaceConflicts(e.target.checked)}/>
          Replace conflicting existing fields ({conflicts.join(', ')}) — only after checking Gmail.
        </label>}
      </div>}
      {error && <p role="alert" className="gmail-error">{error}</p>}
      <div className="gmail-review-actions">
        {item.gmailUrl &&
          <a href={item.gmailUrl} target="_blank" rel="noreferrer">Open original Gmail ↗</a>}
        {item.status === 'pending' &&
          <button disabled={saving} onClick={() => onAction(itemId, item, 'reject')
            .catch(e => setError(e.message))}>Dismiss</button>}
        <button className="gmail-approve" disabled={saving || !canApprove}
          onClick={approve}>{saving ? 'Saving…' : 'Approve → Destination'}</button>
      </div>
    </article>
  );
}

export default function GmailSync({ currentEmail, trip }) {
  const [queue, setQueue] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [syncMeta, setSyncMeta] = useState(null);

  useEffect(() => {
    const stopQueue = onValue(ref(database, QUEUE_PATH), snapshot => {
      setQueue(snapshot.val() || {}); setLoading(false); setError('');
    }, () => { setLoading(false); setError('Gmail queue is not readable. Check Firebase rules.'); });
    const stopMeta = onValue(ref(database, 'gmailImport/meta'),
      snap => setSyncMeta(snap.val()), () => setSyncMeta(null));
    return () => { stopQueue(); stopMeta(); };
  }, []);

  const items = Object.entries(queue).filter(([, item]) => item && typeof item === 'object')
    .sort((a, b) => (b[1].receivedAt || '').localeCompare(a[1].receivedAt || ''));
  const pending = items.filter(([, item]) => (item.status || 'pending') === 'pending');
  const unlinked = items.filter(([id, item]) =>
    item.status === 'approved' && !trip?.emailImports?.[id]);
  const displayed = filter === 'pending' ? pending : filter === 'approved' ? unlinked
    : items.filter(([, item]) => item.status === 'rejected');

  const act = async (id, item, action, opts = {}) => {
    if (busyId) throw new Error('Wait for the current review to finish.');
    setBusyId(id); setError(''); setNotice('');
    try {
      if (action === 'approve') {
        // Perform an atomic multipath update, linking an approved email directly
        // to a destination; avoid a second, contradictory Reviewed bookings store.
        const { updates, path, result } = prepareApproval(trip, queue, id, opts);
        updates['gmailImport/reviewQueue/' + id + '/reviewedBy'] = currentEmail;
        await update(ref(database), updates);
        setNotice('Approved: ' + result + ' ' + path + '. See the Destination tab.');
      } else {
        if (item.status !== 'pending') throw new Error('This email is already reviewed.');
        await update(ref(database), {
          ['gmailImport/reviewQueue/' + id + '/status']: 'rejected',
          ['gmailImport/reviewQueue/' + id + '/reviewedAt']: Date.now(),
          ['gmailImport/reviewQueue/' + id + '/reviewedBy']: currentEmail
        });
        setNotice('Email dismissed without changing the trip.');
      }
    } finally { setBusyId(null); }
  };
  return (
    <section className="gmail-sync-container">
      <div className="gmail-review-top">
        <div><h2>Gmail review</h2>
          <p>Approve a hotel, flight or activity directly into Destinations.
            Matching reservations are enriched, never silently duplicated.</p></div>
        <span className="gmail-count">{loading ? 'Loading' : error ? 'Unavailable'
          : pending.length + ' pending'}</span>
      </div>
      <div className="gmail-security-note">
        Gmail label <strong>Argentina2027</strong> · daily Apps Script import.
        {syncMeta?.lastSyncAt
          ? <p>Last sync {new Date(syncMeta.lastSyncAt).toLocaleString()} ·
            {syncMeta.newlyStaged || 0} newly staged on last run.</p>
          : <p>No completed import reported yet. Verify Apps Script.</p>}
      </div>
      <div className="gmail-filter">
        {[
          ['pending', 'Pending (' + pending.length + ')'],
          ['approved', 'Older approved emails to link (' + unlinked.length + ')'],
          ['rejected', 'Dismissed']
        ].map(([key, label]) =>
          <button key={key} className={key === filter ? 'active' : ''}
            onClick={() => setFilter(key)}>{label}</button>)}
      </div>
      {error && <p className="gmail-error" role="alert">{error}</p>}
      {notice && <p className="gmail-security-note" role="status">{notice}</p>}
      {loading && <p>Loading review queue…</p>}
      {!loading && !error && !displayed.length &&
        <p className="gmail-empty">No {filter === 'approved' ? 'older approvals to link' : filter} emails.</p>}
      <div className="gmail-review-grid">
        {!error && displayed.map(([id, item]) => filter === 'rejected'
          ? <article key={id} className="gmail-review-card">
              <h4>{item.subject || 'Travel email'}</h4>
              <p>Dismissed. No changes were made to the trip.</p>
              {item.gmailUrl && <a href={item.gmailUrl} target="_blank" rel="noreferrer">
                View in Gmail</a>}
            </article>
          : <ReviewCard key={id} itemId={id} item={item} trip={trip}
              saving={busyId === id} onAction={act}/>)}
      </div>
    </section>
  );
}
