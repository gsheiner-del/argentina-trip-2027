import React, { useEffect, useMemo, useState } from 'react';
import { COST_CATEGORIES, aggregateCosts, convertPlanningEstimate, selectedHotelCosts, bookedDomesticFlights } from '../utils/budget';
import { fetchUsdQuote, currentDisplay, formatMoney, FX_ATTRIBUTION_URL } from '../utils/fx';
import './Budget.css';

const CURRENCIES = [
  { code: 'USD', label: '🇺🇸 USD' },
  { code: 'ARS', label: '🇦🇷 ARS' },
  { code: 'ILS', label: '🇮🇱 ILS' }
];
const LEGACY_ITEMS = [
  ['domesticFlights', '✈️ Domestic Flights'],
  ['hotels', '🏨 Hotels'],
  ['transport', '🚗 Ground Transport'],
  ['activities', '🎯 Activities & Tours'],
  ['meals', '🍽️ Meals & Dining'],
  ['other', '📱 Other']
];
export default function Budget({ tripData }) {
  const budget = tripData?.budget || {};
  const destinations = tripData?.destinations || [];
  const [currency, setCurrency] = useState('USD');
  const [quote, setQuote] = useState(null);
  const [fxError, setFxError] = useState('');
  const [fxLoading, setFxLoading] = useState(true);

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
  const pendingCount = report.issues.filter(x => x.state === 'pending').length;
  const invalidCount = report.issues.filter(x => x.state === 'invalid').length;
  const missingCount = report.issues.filter(x => x.state === 'rate_missing').length;
  return (
    <div className="budget-container">
      <h2>💰 Trip Budget</h2>
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
          <div className="budget-row"><span>✈️ Booked domestic flights ({flightReport.count})</span><span>{converted(flightReport.total)}</span></div>
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
        <p className="budget-note">Original planning estimate. Actual share is pending an explicit allocation per booking. Detailed cost-sharing
          rules for new tracked expenses have not been defined.</p>
        <div className="budget-row">
          <span>Personal-cost estimate</span>
          <span>{convertedEstimate(budget.daughterShare)}</span>
        </div>
      </section>
    </div>
  );
}
