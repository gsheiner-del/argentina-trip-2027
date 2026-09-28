import React, { useEffect, useState } from 'react';
import { fetchUsdQuote, snapshotExpense, currencyToUsd, FX_ATTRIBUTION_URL } from '../utils/fx';
import { COST_CATEGORIES, parseCost } from '../utils/budget';
import { storage, storageRef, uploadBytes, getDownloadURL, deleteObject } from '../firebase';
import { TRIP_PAYERS, payerName, validateReceiptFile, receiptStoragePath } from '../utils/receipts';
import '../styles/CostTracker.css';

const EMPTY = { groundTransport: [], meals: [], activities: [], other: [] };
const emptyDraft = () => ({
  item: '', amount: '', currency: 'USD', paidBy: '',
  receipt: null, receiptFile: null, removeReceipt: false
});
function draftFor(row) {
  if (!row) return emptyDraft();
  const parsed = row.amount !== undefined
    ? { state: 'valid', amount: row.amount, currency: row.currency }
    : parseCost(row.estimatedCost);
  return {
    item: row.item || '',
    amount: parsed.state === 'valid' ? String(parsed.amount) : '',
    currency: parsed.state === 'valid' ? parsed.currency : 'USD',
    paidBy: row.paidBy || '',
    receipt: row.receipt || null,
    receiptFile: null,
    removeReceipt: false
  };
}
const validAmount = (value) => /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value.trim()) &&
  Number(value.replace(/,/g, '')) >= 0;

function randomToken() {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2); }
}

export default function CostTracker({ destination, userRole, onUpdateCosts }) {
  const costs = destination?.costs || EMPTY;
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [receiptPreview, setReceiptPreview] = useState('');

  useEffect(() => {
    if (draft.currency === 'USD') return;
    let alive = true;
    fetchUsdQuote()
      .then(q => { if (alive) { setQuote(q); setQuoteError(''); } })
      .catch(e => { if (alive) { setQuote(null); setQuoteError(e.message); } });
    return () => { alive = false; };
  }, [draft.currency]);

  useEffect(() => {
    if (!draft.receiptFile) {
      setReceiptPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(draft.receiptFile);
    setReceiptPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.receiptFile]);

  const start = (category, index) => {
    setEditing({ category, index });
    setDraft(draftFor(index < 0 ? null : costs[category]?.[index]));
    setError('');
  };

  const selectReceipt = event => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    const check = validateReceiptFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError('');
    setDraft(previous => ({
      ...previous, receiptFile: file, removeReceipt: false
    }));
  };

  const openReceipt = async receipt => {
    if (!receipt?.storagePath) return;
    const tab = window.open('about:blank', '_blank', 'noopener,noreferrer');
    try {
      const url = await getDownloadURL(storageRef(storage, receipt.storagePath));
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch {
      if (tab) tab.close();
      setError('Could not open this receipt. Check Firebase Storage permissions.');
    }
  };

  const save = async () => {
    if (!editing || saving || userRole !== 'edit') return;
    if (!draft.item.trim()) return setError('Enter an expense description.');
    if (draft.amount.trim() !== '' && !validAmount(draft.amount)) {
      return setError('Enter a non-negative amount with at most two decimals, or leave it blank for TBD.');
    }
    if (draft.receiptFile) {
      const check = validateReceiptFile(draft.receiptFile);
      if (!check.ok) return setError(check.error);
    }

    setSaving(true);
    setError('');
    let uploadedPath = '';
    try {
      let expense = {
        item: draft.item.trim(),
        estimatedCost: 'TBD',
        paidBy: draft.paidBy || ''
      };
      if (draft.amount.trim() !== '') {
        // Fetch again at SAVE, even if a preview was loaded earlier.
        // Daily-provider rate timestamps are saved with the expense and NEVER recomputed later.
        const freshQuote = draft.currency === 'USD' ? null : await fetchUsdQuote();
        expense = {
          item: draft.item.trim(),
          paidBy: draft.paidBy || '',
          ...snapshotExpense(Number(draft.amount.replace(/,/g, '')), draft.currency, freshQuote)
        };
        if (freshQuote) setQuote(freshQuote);
      }

      let receipt = draft.removeReceipt ? null : draft.receipt;
      if (draft.receiptFile) {
        uploadedPath = receiptStoragePath(destination.id, editing.category,
          draft.receiptFile, Date.now(), randomToken());
        await uploadBytes(storageRef(storage, uploadedPath), draft.receiptFile, {
          contentType: draft.receiptFile.type || 'image/jpeg',
          customMetadata: {
            destinationId: String(destination.id),
            category: String(editing.category)
          }
        });
        receipt = {
          storagePath: uploadedPath,
          originalName: String(draft.receiptFile.name || 'receipt').slice(0, 160),
          contentType: String(draft.receiptFile.type || 'image/jpeg').slice(0, 80),
          uploadedAt: new Date().toISOString()
        };
      }
      if (receipt) expense.receipt = receipt;

      const updated = { ...EMPTY, ...costs };
      const list = [...(Array.isArray(costs[editing.category]) ? costs[editing.category] : [])];
      const previous = editing.index >= 0 ? list[editing.index] : null;
      if (editing.index < 0) list.push(expense);
      else if (editing.index < list.length) list[editing.index] = expense;
      else throw new Error('This item was changed by another editor. Refresh the page and try again.');
      updated[editing.category] = list;
      await onUpdateCosts(destination.id, updated);

      const oldPath = previous?.receipt?.storagePath;
      if (oldPath && oldPath !== receipt?.storagePath &&
          (draft.removeReceipt || draft.receiptFile)) {
        try { await deleteObject(storageRef(storage, oldPath)); } catch { /* DB state is already correct. */ }
      }
      setEditing(null);
      setDraft(emptyDraft());
    } catch (e) {
      if (uploadedPath) {
        try { await deleteObject(storageRef(storage, uploadedPath)); } catch { /* best effort */ }
      }
      setError(e?.code === 'storage/unauthorized'
        ? 'Receipt upload is not authorized. Firebase Storage access must be enabled for signed-in trip editors.'
        : e.message || 'Expense could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (category, index) => {
    if (saving || userRole !== 'edit') return;
    setSaving(true);
    setError('');
    const oldReceipt = costs[category]?.[index]?.receipt;
    try {
      const updated = { ...EMPTY, ...costs };
      updated[category] = (costs[category] || []).filter((_, i) => i !== index);
      await onUpdateCosts(destination.id, updated);
      if (oldReceipt?.storagePath) {
        try { await deleteObject(storageRef(storage, oldReceipt.storagePath)); } catch { /* best effort */ }
      }
      setEditing(null);
    } catch (e) {
      setError(e.message || 'Could not delete this expense.');
    } finally {
      setSaving(false);
    }
  };

  const previewValue = validAmount(draft.amount)
    ? (() => {
        try { return currencyToUsd(Number(draft.amount.replace(/,/g, '')), draft.currency, quote); }
        catch { return null; }
      })() : null;

  return (
    <div className="cost-tracker">
      <p className="cost-explainer">Add expenses manually or attach a receipt photo from your
        camera / photo library. Paid by identifies who actually paid; it does not by itself
        decide how the expense should be shared.</p>
      {error && <p className="cost-error" role="alert">{error}</p>}
      {COST_CATEGORIES.map(cat => (
        <section className="cost-category" key={cat.key}>
          <h4>{cat.label}</h4>
          <div className="cost-items">
            {(costs[cat.key] || []).map((row, index) => (
              <div className="cost-item" key={index}>
                <span className="item-name">
                  {row.item}
                  <small>Paid by: {payerName(row.paidBy) || 'Not specified'}</small>
                  {row.receipt?.storagePath &&
                    <button type="button" className="receipt-link"
                      onClick={() => openReceipt(row.receipt)}>🧾 View receipt</button>}
                </span>
                <span className="cost-value">
                  {row.estimatedCost || 'TBD'}
                  {Number.isFinite(row.usdValue) &&
                    <small>Saved ≈ USD {row.usdValue.toFixed(2)}
                      {row.fxSnapshot?.rateTimestamp &&
                        ' · rate ' + new Date(row.fxSnapshot.rateTimestamp).toLocaleDateString()}</small>}
                </span>
                {userRole === 'edit' && <>
                  <button type="button" disabled={saving} onClick={() => start(cat.key, index)}
                    aria-label={'Edit ' + row.item}>Edit</button>
                  <button type="button" disabled={saving} className="remove-btn"
                    onClick={() => remove(cat.key, index)} aria-label={'Remove ' + row.item}>✕</button>
                </>}
              </div>
            ))}
          </div>
          {userRole === 'edit' && (
            <button type="button" className="add-btn" disabled={saving}
              onClick={() => start(cat.key, -1)}>+ Add expense</button>
          )}
          {editing?.category === cat.key && (
            <div className="cost-editor">
              <label>Description<input value={draft.item} maxLength={160}
                onChange={(e) => setDraft({ ...draft, item: e.target.value })} /></label>
              <label>Amount (blank = TBD)<input inputMode="decimal" value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                placeholder="0.00" /></label>
              <label>Currency<select value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
                <option value="USD">USD — US dollars</option>
                <option value="ARS">ARS — Argentine pesos</option>
                <option value="ILS">ILS — Israeli shekels</option>
              </select></label>
              <label>Paid by<select value={draft.paidBy}
                onChange={(e) => setDraft({ ...draft, paidBy: e.target.value })}>
                <option value="">Not specified</option>
                {TRIP_PAYERS.map(person =>
                  <option key={person.id} value={person.id}>{person.name}</option>)}
              </select></label>

              <div className="receipt-editor">
                <label className="receipt-picker">
                  📷 Take photo / Upload receipt
                  <input type="file" accept="image/*" capture="environment"
                    onChange={selectReceipt} disabled={saving} />
                </label>
                <small>Image only · max 8 MB. On phones this can open the rear camera.</small>
                {draft.receiptFile && <>
                  <strong>New receipt: {draft.receiptFile.name || 'camera photo'}</strong>
                  {receiptPreview && <img src={receiptPreview} alt="New receipt preview" />}
                  <button type="button" onClick={() =>
                    setDraft(previous => ({ ...previous, receiptFile: null }))}>Remove new photo</button>
                </>}
                {!draft.receiptFile && draft.receipt?.storagePath && !draft.removeReceipt && <>
                  <span>Existing receipt attached.</span>
                  <div>
                    <button type="button" onClick={() => openReceipt(draft.receipt)}>View receipt</button>
                    <button type="button" onClick={() =>
                      setDraft(previous => ({ ...previous, removeReceipt: true }))}>Remove receipt</button>
                  </div>
                </>}
                {draft.removeReceipt && <div>
                  <span>Receipt will be removed when you save.</span>
                  <button type="button" onClick={() =>
                    setDraft(previous => ({ ...previous, removeReceipt: false }))}>Keep receipt</button>
                </div>}
              </div>

              {draft.currency !== 'USD' && <>
                <p className="cost-fx-info">
                  {quote
                    ? <>Preview: {previewValue === null ? 'enter amount' : '≈ USD ' + previewValue.toFixed(2)};
                      rate published {new Date(quote.rateTimestamp).toLocaleString()}.</>
                    : 'Waiting for a current daily reference rate…'}
                  {quoteError && <span role="alert">{quoteError}</span>}
                </p>
                <p className="cost-fx-info"><a href={FX_ATTRIBUTION_URL} target="_blank"
                  rel="noopener noreferrer">Rates by ExchangeRate-API</a></p>
              </>}
              <div className="cost-editor-actions">
                <button type="button" disabled={saving} onClick={save}>
                  {saving ? 'Uploading / saving…' : 'Save expense'}
                </button>
                <button type="button" disabled={saving} onClick={() => {
                  setEditing(null); setDraft(emptyDraft()); setError('');
                }}>Cancel</button>
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
