import React, { useEffect, useMemo, useState } from 'react';
import { COST_CATEGORIES, aggregateCosts, convertPlanningEstimate, selectedHotelCosts, bookedDomesticFlights } from '../utils/budget';
import { fetchUsdQuote, currentDisplay, formatMoney, FX_ATTRIBUTION_URL, snapshotExpense } from '../utils/fx';
import { COUPLE_CATEGORIES, normalizedCoupleAllocations, validateCoupleAllocations, calculateCoupleEstimate } from '../utils/coupleBudget.js';
import { TRIP_PAYERS, payerName } from '../utils/receipts.js';
import './Budget.css';

const CURRENCIES = [
  { code: 'USD', label: '🇺🇸 USD' },
  { code: 'ARS', label: '🇦🇷 ARS' },
  { code: 'ILS', label: '🇮🇱 ILS' }
];
const LEGACY_ITEMS = [
  ['domesticFlights', '✈️ Domestic flights'],
  ['hotels', '🏨 Hotels'],
  ['transport', '🚗 Ground transport'],
  ['activities', '🎯 Activities & tours'],
  ['meals', '🍽️ Meals & dining'],
  ['other', '📱 Other']
];
export default function Budget({ tripData, userRole, onSaveCoupleAllocations, onSaveDomesticFlightsPackage }) {
  const budget = tripData?.budget || {};
  const destinations = tripData?.destinations || [];
  const [currency, setCurrency] = useState('USD');
  const [quote, setQuote] = useState(null);
  const [fxError, setFxError] = useState('');
  const [fxLoading, setFxLoading] = useState(true);
  const [coupleSettings, setCoupleSettings] = useState(() =>
    normalizedCoupleAllocations(tripData?.budget?.coupleAllocations));
  const [coupleDirty, setCoupleDirty] = useState(false);
  const [coupleSaving, setCoupleSaving] = useState(false);
  const [coupleNotice, setCoupleNotice] = useState('');
  const [coupleError, setCoupleError] = useState('');
  const [flightPackageDraft, setFlightPackageDraft] = useState(() => ({
    amount: tripData?.budget?.actualDomesticFlights?.amount == null ? '' :
      String(tripData.budget.actualDomesticFlights.amount),
    currency: tripData?.budget?.actualDomesticFlights?.currency || 'ARS',
    paidBy: tripData?.budget?.actualDomesticFlights?.paidBy || '',
    note: tripData?.budget?.actualDomesticFlights?.note || 'Domestic flights package'
  }));
  const [flightPackageSaving, setFlightPackageSaving] = useState(false);
  const [flightPackageError, setFlightPackageError] = useState('');
  const [flightPackageNotice, setFlightPackageNotice] = useState('');
  useEffect(() => {
    if (!coupleDirty) setCoupleSettings(
      normalizedCoupleAllocations(tripData?.budget?.coupleAllocations));
  }, [tripData?.budget?.coupleAllocations, coupleDirty]);
  useEffect(() => {
    const saved = tripData?.budget?.actualDomesticFlights;
    setFlightPackageDraft({
      amount: saved?.amount == null ? '' : String(saved.amount),
      currency: saved?.currency || 'ARS',
      paidBy: saved?.paidBy || '',
      note: saved?.note || 'Domestic flights package'
    });
  }, [tripData?.budget?.actualDomesticFlights]);
  const setCoupleField = (category, field, value) => {
    setCoupleSettings(previous => ({
      ...previous, [category]: { ...previous[category], [field]: value }
    }));
    setCoupleDirty(true); setCoupleNotice(''); setCoupleError('');
  };
  const saveCoupleSettings = async () => {
    if (!onSaveCoupleAllocations || coupleSaving) return;
    setCoupleError(''); setCoupleNotice('');
    try {
      const validated = validateCoupleAllocations(coupleSettings);
      setCoupleSaving(true);
      await onSaveCoupleAllocations(validated);
      setCoupleDirty(false);
      setCoupleNotice('Allocation settings saved. The estimated share uses the current category estimates.');
    } catch (err) {
      setCoupleError(err.message || 'Could not save the allocation settings.');
    } finally {
      setCoupleSaving(false);
    }
  };


  const saveFlightPackage = async () => {
    if (!onSaveDomesticFlightsPackage || flightPackageSaving) return;
    setFlightPackageError(''); setFlightPackageNotice('');
    const amount = Number(String(flightPackageDraft.amount).replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount < 0) {
      setFlightPackageError('Enter a valid non-negative package amount.');
      return;
    }
    try {
      setFlightPackageSaving(true);
      const freshQuote = flightPackageDraft.currency === 'USD' ? null : await fetchUsdQuote();
      const snapshot = snapshotExpense(amount, flightPackageDraft.currency, freshQuote);
      await onSaveDomesticFlightsPackage({
        ...snapshot,
        paidBy: flightPackageDraft.paidBy || '',
        note: String(flightPackageDraft.note || '').trim().slice(0, 160),
        savedAt: Date.now()
      });
      setFlightPackageNotice('Domestic flights package saved in actual budget.');
    } catch (error) {
      setFlightPackageError(error.message || 'Could not save domestic flights package.');
    } finally {
      setFlightPackageSaving(false);
    }
  };

  const refreshQuote = async () => {
    setFxLoading(true);
    setFxError('');
    try {
      setQuote(await fetchUsdQuote());
    } catch (error) {
      setFxError(error.message || 'Current exchange rates could not be loaded.');
    } finally {
      setFxLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchUsdQuote()
      .then((q) => { if (active) setQuote(q); })
      .catch((error) => { if (active) setFxError(error.message); })
      .finally(() => { if (active) setFxLoading(false); });
    return () => { active = false; };
  }, []);

  const report = useMemo(() => aggregateCosts(destinations, quote), [destinations, quote]);
  const hotelReport = useMemo(() => selectedHotelCosts(tripData, quote), [tripData, quote]);
  const flightReport = useMemo(() => bookedDomesticFlights(tripData, quote), [tripData, quote]);
  const converted = (amountUsd) => {
    const result = currentDisplay(amountUsd, currency, quote);
    return result === null ? 'Exchange rate unavailable' : formatMoney(result, currency);
  };
  const convertedEstimate = (amount) => convertPlanningEstimate(amount, currency, quote);
  const coupleReport = useMemo(() =>
    calculateCoupleEstimate(budget, coupleSettings), [budget, coupleSettings]);
  const showCoupleAmount = amount => {
    if (amount === null || amount === undefined) return 'TBD';
    const value = currentDisplay(amount, currency, quote);
    return value == null ? 'Exchange rate unavailable' : formatMoney(value, currency);
  };
  const showCoupleRange = (row) => {
    if (row.missing) return 'TBD';
    if (row.excluded) return 'Excluded';
    const low = showCoupleAmount(row.minimum);
    if (row.openEnded) return low + '+';
    return row.maximum != null && Math.abs(row.maximum - row.minimum) > 0.009
      ? low + ' – ' + showCoupleAmount(row.maximum) : low;
  };

  const pendingCount = report.issues.filter(x => x.state === 'pending').length;
  const invalidCount = report.issues.filter(x => x.state === 'invalid').length;
  const missingCount = report.issues.filter(x => x.state === 'rate_missing').length;
  return (
    <div className="budget-container">
      <h2>💰 Budget</h2>
      <div className="currency-toggle" aria-label="Currency for entire Budget page">
        {CURRENCIES.map((c) => (
          <button key={c.code} type="button"
            aria-pressed={currency === c.code} className={currency === c.code ? 'active' : ''}
            onClick={() => setCurrency(c.code)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="budget-fx-banner">
        {quote
          ? <>Daily reference rate published {new Date(quote.rateTimestamp).toLocaleString()}.
              Display uses the latest available published quote; amounts saved in Costs retain their
              entry-time USD value. <button onClick={refreshQuote} disabled={fxLoading}>Refresh rate</button></>
          : <>{fxLoading ? 'Loading exchange rates…' : 'Reference rates unavailable.'}
              <button onClick={refreshQuote} disabled={fxLoading}>Retry rates</button></>}
        {fxError && <p role="alert">{fxError}</p>}
        <p><a href={FX_ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer">
          Rates by ExchangeRate-API</a> · indicative, not your card's actual conversion rate.</p>
      </div>

      <section className="budget-section">
        <h3>Tracked costs by destination</h3>
        <p className="budget-note">
          New entries retain the exchange rate published when saved. Older ARS/ILS entries
          without a snapshot are provisional and use the latest published rate.
        </p>
        <div className="budget-table">
          <div className="budget-row"><span>🏨 Preferred confirmed hotels ({hotelReport.count})</span><span>{converted(hotelReport.total)}</span></div>
          <div className="budget-row"><span>✈️ Domestic flights package{flightReport.flightCount ? ' · ' + flightReport.flightCount + ' confirmed flights' : ''}</span><span>{converted(flightReport.total)}</span></div>
          {COST_CATEGORIES.map(cat => (
            <div key={cat.key} className="budget-row">
              <span>{cat.label}</span>
              <span>{converted(report.totals[cat.key])}</span>
            </div>
          ))}
        </div>
        <div className="budget-summary">
          <span>📊 Tracked total · {report.included} priced items</span>
          <span className="total">{converted(report.grandTotal + hotelReport.total + flightReport.total)}</span>
        </div>
        {(hotelReport.unpriced + flightReport.unpriced) > 0 && <p className="budget-note">
          {hotelReport.unpriced + flightReport.unpriced} confirmed selected hotel / domestic flight item(s) have no convertible price yet.</p>}
        {userRole === 'edit' && <div className="flight-package-editor">
          <h4>Domestic flights package payment</h4>
          <p className="budget-note">Store the actual purchase as one payment. It is not divided across individual flight legs.</p>
          <div className="couple-allocation-editor">
            <label>Amount
              <input value={flightPackageDraft.amount}
                onChange={e => setFlightPackageDraft(v => ({...v, amount: e.target.value}))}
                inputMode="decimal" placeholder="0.00"/>
            </label>
            <label>Currency
              <select value={flightPackageDraft.currency}
                onChange={e => setFlightPackageDraft(v => ({...v, currency: e.target.value}))}>
                <option>USD</option><option>ARS</option><option>ILS</option>
              </select>
            </label>
            <label>Paid by
              <select value={flightPackageDraft.paidBy}
                onChange={e => setFlightPackageDraft(v => ({...v, paidBy: e.target.value}))}>
                <option value="">Not specified</option>
                {TRIP_PAYERS.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
            <label>Note
              <input value={flightPackageDraft.note}
                onChange={e => setFlightPackageDraft(v => ({...v, note: e.target.value}))}/>
            </label>
          </div>
          <div className="couple-save">
            <button type="button" onClick={saveFlightPackage} disabled={flightPackageSaving}>
              {flightPackageSaving ? 'Saving…' : 'Save package payment'}
            </button>
            {tripData?.budget?.actualDomesticFlights && <span>
              Saved{tripData.budget.actualDomesticFlights.paidBy
                ? ' · paid by ' + payerName(tripData.budget.actualDomesticFlights.paidBy) : ''}
            </span>}
            {flightPackageError && <p role="alert">{flightPackageError}</p>}
            {flightPackageNotice && <p role="status">{flightPackageNotice}</p>}
          </div>
        </div>}

        {report.provisionalCount > 0 &&
          <p className="budget-note">{report.provisionalCount} legacy foreign-currency item(s)
            do not have a saved exchange-rate snapshot. Edit and save them to lock in a rate.</p>}
        {report.issues.length > 0 && (
          <div className="budget-issues" role="status">
            <strong>Incomplete tracked total:</strong> {pendingCount} TBD,
            {' '}{invalidCount} invalid and {missingCount} without rates.
            <details><summary>Excluded items</summary><ul>
              {report.issues.map((issue, index) => (
                <li key={index}>{issue.destination}: {issue.item} — {issue.state === 'rate_missing'
                  ? 'rate missing for ' + issue.currency : issue.state}</li>
              ))}
            </ul></details>
          </div>
        )}
      </section>

      <section className="budget-section">
        <h3>Breakdown by category · original planning estimates</h3>
        <p className="budget-note">All convertible rows follow the currency selector above.
          These are planning estimates, not additional expenses in the tracked total.</p>
        <div className="budget-table">
          {LEGACY_ITEMS.map(([key, label]) => (
            <div key={key} className="budget-row">
              <span>{label}</span><span>{convertedEstimate(budget[key])}</span>
            </div>
          ))}
        </div>
        <div className="budget-summary">
          <span>📊 Original estimated total</span>
          <span className="total">{convertedEstimate(budget.total)}</span>
        </div>
      </section>

      <section className="budget-section">
        <h3>Michelle &amp; Gilad share</h3>
        <p className="budget-note">Live planning estimate from the current categories above.
          Initial assumptions: two of five travelers for per-person expenses and one of two
          rooms for hotels. Adjust these allocations to reflect the actual itinerary.
          Shared family transport and Other are excluded unless assigned explicitly.</p>
        <div className="couple-budget-breakdown">
          {coupleReport.rows.map(row => {
            const cat = COUPLE_CATEGORIES.find(c => c.key === row.key);
            const setting = coupleSettings[row.key];
            return <div className="couple-category" key={row.key}>
              <div className="budget-row">
                <span>{row.label}</span>
                <span>{showCoupleRange(row)}</span>
              </div>
              <p className="budget-note">
                Current category: {convertedEstimate(row.original)}
                {row.mode === 'ratio' ? ' · ' + setting.units + ' of ' + setting.totalUnits + ' units'
                  : row.mode === 'exclude' ? ' · excluded' : ' · explicit USD amount'}
                {row.missing ? ' · enter an estimate above or a fixed allocation below' : ''}
              </p>
              {userRole === 'edit' && <div className="couple-allocation-editor">
                <label>Allocation
                  <select aria-label={row.label + ' allocation method'} value={setting.mode}
                    onChange={e => setCoupleField(row.key, 'mode', e.target.value)}>
                    <option value="ratio">Share of current category</option>
                    <option value="fixed">Specific USD amount</option>
                    <option value="exclude">Exclude / not allocated</option>
                  </select>
                </label>
                {setting.mode === 'ratio' && <>
                  <label>Their units
                    <input type="number" min="0" max="1000" step="any" value={setting.units}
                      aria-label={row.label + ' their units'}
                      onChange={e => setCoupleField(row.key, 'units', e.target.value)}/>
                  </label>
                  <label>Total units
                    <input type="number" min="0.01" max="1000" step="any" value={setting.totalUnits}
                      aria-label={row.label + ' total units'}
                      onChange={e => setCoupleField(row.key, 'totalUnits', e.target.value)}/>
                  </label>
                </>}
                {setting.mode === 'fixed' && <label>Their amount (USD)
                  <input type="number" min="0" step="0.01" value={setting.fixedUsd}
                    aria-label={row.label + ' fixed amount USD'}
                    onChange={e => setCoupleField(row.key, 'fixedUsd', e.target.value)}/>
                </label>}
                <p className="budget-note">{cat.description}</p>
              </div>}
            </div>;
          })}
        </div>
        {userRole === 'edit' && <div className="couple-save">
          <button type="button" disabled={!coupleDirty || coupleSaving}
            onClick={saveCoupleSettings}>
            {coupleSaving ? 'Saving…' : 'Save allocation settings'}
          </button>
          <button type="button" disabled={!coupleDirty || coupleSaving}
            onClick={() => {
              setCoupleSettings(normalizedCoupleAllocations(budget.coupleAllocations));
              setCoupleDirty(false); setCoupleError(''); setCoupleNotice('');
            }}>Discard edits</button>
          {coupleDirty && <span>Unsaved allocation changes</span>}
          {coupleError && <p role="alert">{coupleError}</p>}
          {coupleNotice && <p role="status">{coupleNotice}</p>}
        </div>}
        <div className="budget-table">
          <div className="budget-row">
            <span>Estimated share</span>
            <span>{coupleReport.incomplete ? 'TBD · missing category estimates'
              : coupleReport.openEnded ? showCoupleAmount(coupleReport.minimum) + '+'
                : coupleReport.maximum != null &&
                  Math.abs(coupleReport.maximum - coupleReport.minimum) > 0.009
                  ? showCoupleAmount(coupleReport.minimum) + ' – ' +
                    showCoupleAmount(coupleReport.maximum)
                  : showCoupleAmount(coupleReport.minimum)}</span>
          </div>
          <div className="budget-row">
            <span>Actual share</span>
            <span>TBD</span>
          </div>
        </div>
        <p className="budget-note">The estimate updates when the planning categories or allocations
          change. Actual share remains TBD until confirmed expenses are explicitly
          assigned to Michelle &amp; Gilad. Neither value duplicates the tracked total.</p>
      </section>
    </div>
  );
}
