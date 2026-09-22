import React, { useEffect, useMemo, useState } from 'react';
import { database, ref, onValue, update } from '../firebase';
import '../styles/GmailSync.css';

const QUEUE_PATH = 'gmailImport/reviewQueue';
const EMPTY_DRAFT = { title: '', place: '', checkIn: '', checkOut: '', notes: '' };

function safeSummary(item, draft) {
  // ONLY this explicit allowlist is copied to the family-visible trip node.
  // Never publish email bodies, PINs, ticket numbers, booking links or confirmation codes.
  return {
    title: String(draft.title || '').trim().slice(0, 140),
    place: String(draft.place || '').trim().slice(0, 100),
    checkIn: String(draft.checkIn || '').trim().slice(0, 10),
    checkOut: String(draft.checkOut || '').trim().slice(0, 10),
    notes: String(draft.notes || '').trim().slice(0, 350),
    category: ['hotel', 'flight', 'flight_extra', 'transport', 'other'].includes(item.category)
      ? item.category : 'other',
    source: 'gmail',
    status: 'reviewed',
    reviewedAt: Date.now()
  };
}

function ReviewCard({ item, itemId, duplicates, onAction, saving }) {
  const [draft, setDraft] = useState(() => ({
    ...EMPTY_DRAFT, title: item.title || '', place: item.place || '',
    checkIn: item.checkIn || '', checkOut: item.checkOut || '', notes: item.notes || ''
  }));
  useEffect(() => {
    setDraft({
      title: item.title || '', place: item.place || '',
      checkIn: item.checkIn || '', checkOut: item.checkOut || '', notes: item.notes || ''
    });
  }, [item.title, item.place, item.checkIn, item.checkOut, item.notes]);
  const setField = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));
  const canApprove = draft.title.trim() && draft.place.trim() && !item.cancellationFlag;
  return (
    <article className="gmail-review-card">
      <header className="gmail-review-head">
        <span className="gmail-review-category">{item.category || 'other'}</span>
        <span className={item.cancellationFlag ? 'gmail-caution' : 'gmail-muted'}>
          {item.cancellationFlag ? 'Possible cancellation — verify manually' : 'Awaiting review'}
        </span>
      </header>
      <h4>{item.subject || 'Travel email'}</h4>
      <p className="gmail-muted">Received: {item.receivedAt ? new Date(item.receivedAt).toLocaleString() : 'Unknown'}</p>
      {duplicates > 0 && <p className="gmail-warning">Another email may refer to the same reservation. Check before approving.</p>}
      <div className="gmail-review-fields">
        <label>Title<input value={draft.title} maxLength={140} onChange={(e) => setField('title', e.target.value)} /></label>
        <label>City / location<input value={draft.place} maxLength={100} onChange={(e) => setField('place', e.target.value)} /></label>
        <label>Check-in / travel date<input type="date" value={draft.checkIn} onChange={(e) => setField('checkIn', e.target.value)} /></label>
        <label>Check-out / end date<input type="date" value={draft.checkOut} onChange={(e) => setField('checkOut', e.target.value)} /></label>
        <label className="gmail-review-notes">Notes for family (no PINs, confirmation codes or private data)
          <textarea rows={2} value={draft.notes} maxLength={350} onChange={(e) => setField('notes', e.target.value)} />
        </label>
      </div>
      <div className="gmail-review-actions">
        {item.gmailUrl && <a href={item.gmailUrl} target="_blank" rel="noreferrer">Open original in Gmail</a>}
        <button disabled={saving} onClick={() => onAction(itemId, item, draft, 'reject')}>Dismiss</button>
        <button disabled={saving || !canApprove} className="gmail-approve"
          onClick={() => onAction(itemId, item, draft, 'approve')}>Approve summary</button>
      </div>
      {item.cancellationFlag && <p className="gmail-warning">
        A cancellation does not automatically remove an existing itinerary booking. Check and adjust the trip manually.
      </p>}
    </article>
  );
}

export default function GmailSync({ currentEmail }) {
  const [queue, setQueue] = useState({});
  const [approved, setApproved] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    const stopQueue = onValue(ref(database, QUEUE_PATH), (snapshot) => {
      setQueue(snapshot.val() || {});
      setLoading(false);
      setError('');
    }, () => { setLoading(false); setError('Gmail review queue is not readable. Check your Firebase rules.'); });
    const stopApproved = onValue(ref(database, 'trip/bookingSummaries'), (snapshot) => {
      setApproved(snapshot.val() || {});
    }, () => setError('Approved summaries could not be loaded.'));
    return () => { stopQueue(); stopApproved(); };
  }, []);

  const items = useMemo(() => Object.entries(queue)
    .filter(([, item]) => item && typeof item === 'object')
    .sort((a, b) => (b[1].receivedAt || '').localeCompare(a[1].receivedAt || '')), [queue]);
  const pending = items.filter(([, item]) => (item.status || 'pending') === 'pending');
  const displayed = filter === 'pending' ? pending : items.filter(([, item]) => item.status === filter);
  const groupCount = useMemo(() => {
    const groups = {};
    for (const [, item] of items) {
      if (item.bookingGroup) groups[item.bookingGroup] = (groups[item.bookingGroup] || 0) + 1;
    }
    return groups;
  }, [items]);

  const act = async (itemId, item, draft, action) => {
    if (busyId || item.status !== 'pending') return;
    setBusyId(itemId);
    setError('');
    const changes = {
      [`${QUEUE_PATH}/${itemId}/status`]: action === 'approve' ? 'approved' : 'rejected',
      [`${QUEUE_PATH}/${itemId}/reviewedAt`]: Date.now(),
      [`${QUEUE_PATH}/${itemId}/reviewedBy`]: currentEmail || ''
    };
    if (action === 'approve') {
      if (!draft.title.trim() || !draft.place.trim() || item.cancellationFlag) {
        setBusyId(null);
        return;
      }
      changes[`trip/bookingSummaries/${itemId}`] = safeSummary(item, draft);
    }
    try {
      // One atomic multipath write: no partial status change if publication fails.
      await update(ref(database), changes);
    } catch (e) {
      setError('Could not save the review. Please check database write permissions.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="gmail-sync-container">
      <div className="gmail-review-top">
        <div><h2>Gmail booking review</h2>
          <p>Only editors can access imported email metadata. Nothing is published to the family until you approve it.</p>
        </div>
        <span className="gmail-count">{pending.length} pending</span>
      </div>
      <div className="gmail-security-note">
        Source: Gmail label <strong>Argentina2027</strong>. Sync runs separately through Google Apps Script.
        The importer must be authorized and configured before emails appear here.
        Only safe, manually approved summaries are added to the trip.
      </div>
      <div className="gmail-filter" role="group" aria-label="Review filter">
        {[['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Dismissed']].map(([id, title]) => (
          <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{title}</button>
        ))}
      </div>
      {error && <p className="gmail-error" role="alert">{error}</p>}
      {loading && <p>Loading review queue...</p>}
      {!loading && displayed.length === 0 && !error && <p className="gmail-empty">
        No {filter} emails. {filter === 'pending' ? 'New matching mail appears here after the sync script runs.' : ''}
      </p>}
      <div className="gmail-review-grid">
        {displayed.map(([id, item]) => filter === 'pending'
          ? <ReviewCard key={id} itemId={id} item={item} saving={busyId === id}
              duplicates={Math.max(0, (groupCount[item.bookingGroup] || 0) - 1)} onAction={act} />
          : <article key={id} className="gmail-review-card">
              <h4>{item.title || item.subject || 'Travel email'}</h4>
              <p className="gmail-muted">Status: {item.status}; {item.place || 'No city provided'}</p>
              {filter === 'approved' && approved[id] && <p>Family summary: {approved[id].title} — {approved[id].place}</p>}
              {item.gmailUrl && <a href={item.gmailUrl} target="_blank" rel="noreferrer">View in Gmail</a>}
            </article>)}
      </div>
    </section>
  );
}
