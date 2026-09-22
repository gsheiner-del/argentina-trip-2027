import React, { useEffect, useState } from 'react';
import { fetchUsdQuote, snapshotExpense, currencyToUsd, FX_ATTRIBUTION_URL } from '../utils/fx';
import { COST_CATEGORIES, parseCost } from '../utils/budget';
import '../styles/CostTracker.css';

const EMPTY = { groundTransport: [], meals: [], activities: [], other: [] };
const initialDraft = { item: '', amount: '', currency: 'USD' };
function draftFor(row) {
  if (!row) return { ...initialDraft };
  const parsed = row.amount !== undefined
    ? { state: 'valid', amount: row.amount, currency: row.currency }
    : parseCost(row.estimatedCost);
  return {
    item: row.item || '',
    amount: parsed.state === 'valid' ? String(parsed.amount) : '',
    currency: parsed.state === 'valid' ? parsed.currency : 'USD'
  };
}
const validAmount = (value) => /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value.trim()) &&
  Number(value.replace(/,/g, '')) >= 0;

export default function CostTracker({ destination, userRole, onUpdateCosts }) {
  const costs = destination?.costs || EMPTY;
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(initialDraft);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (draft.currency === 'USD') return;
    let alive = true;
    fetchUsdQuote()
      .then(q => { if (alive) { setQuote(q); setQuoteError(''); } })
      .catch(e => { if (alive) { setQuote(null); setQuoteError(e.message); } });
    return () => { alive = false; };
  }, [draft.currency]);

  const start = (category, index) => {
    setEditing({ category, index });
    setDraft(draftFor(index < 0 ? null : costs[category]?.[index]));
    setError('');
  };
  const save = async () => {
    if (!editing || saving || userRole !== 'edit') return;
    if (!draft.item.trim()) return setError('Enter an expense description.');
    if (draft.amount.trim() !== '' && !validAmount(draft.amount)) {
      return setError('Enter a non-negative amount with at most two decimals, or leave it blank for TBD.');
    }
    setSaving(true);
    setError('');
    try {
      let expense = { item: draft.item.trim(), estimatedCost: 'TBD' };
      if (draft.amount.trim() !== '') {
        // Fetch again at SAVE, even if a preview was loaded earlier.
        // Daily-provider rate timestamps are saved with the expense and NEVER recomputed later.
        const freshQuote = draft.currency === 'USD' ? null : await fetchUsdQuote();
        expense = {
          item: draft.item.trim(),
          ...snapshotExpense(Number(draft.amount.replace(/,/g, '')), draft.currency, freshQuote)
        };
        if (freshQuote) setQuote(freshQuote);
      }
      const updated = { ...EMPTY, ...costs };
      const list = [...(Array.isArray(costs[editing.category]) ? costs[editing.category] : [])];
      if (editing.index < 0) list.push(expense);
      else if (editing.index < list.length) list[editing.index] = expense;
      else throw new Error('This item was changed by another editor. Refresh the page and try again.');
      updated[editing.category] = list;
      await onUpdateCosts(destination.id, updated);
      setEditing(null);
      setDraft(initialDraft);
    } catch (e) {
      setError(e.message || 'Expense could not be saved.');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (category, index) => {
    if (saving || userRole !== 'edit') return;
    setSaving(true);
    setError('');
    try {
      const updated = { ...EMPTY, ...costs };
      updated[category] = (costs[category] || []).filter((_, i) => i !== index);
      await onUpdateCosts(destination.id, updated);
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
      <p className="cost-explainer">Choose the currency when entering an expense. For ARS or ILS
        the app retrieves the latest published daily rate <strong>again when you save</strong>
        and stores the rate and its publication timestamp with that entry.</p>
      {error && <p className="cost-error" role="alert">{error}</p>}
      {COST_CATEGORIES.map(cat => (
        <section className="cost-category" key={cat.key}>
          <h4>{cat.label}</h4>
          <div className="cost-items">
            {(costs[cat.key] || []).map((row, index) => (
              <div className="cost-item" key={index}>
                <span className="item-name">{row.item}</span>
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
                  {saving ? 'Retrieving rate / saving…' : 'Save with current rate'}
                </button>
                <button type="button" disabled={saving} onClick={() => { setEditing(null); setError(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
