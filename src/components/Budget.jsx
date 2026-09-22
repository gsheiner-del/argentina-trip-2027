import React, { useEffect, useMemo, useState } from 'react';
import { COST_CATEGORIES, aggregateCosts } from '../utils/budget';
import './Budget.css';

const CURRENCIES = [
  { code: 'USD', label: '🇺🇸 US Dollars', symbol: 'USD' },
  { code: 'ARS', label: '🇦🇷 Argentine Pesos', symbol: 'ARS' },
  { code: 'ILS', label: '🇮🇱 Shekels', symbol: '₪' }
];
const LEGACY_ITEMS = [
  ['internationalFlights', '✈️ International Flights'],
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
  const [rates, setRates] = useState(null);
  const [ratesDate, setRatesDate] = useState('');
  const [ratesError, setRatesError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((res) => {
        if (!res.ok) throw new Error('Rate API not available');
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        if (data.result === 'success' && Number.isFinite(data.rates?.ARS) &&
            Number.isFinite(data.rates?.ILS) && data.rates.ARS > 0 && data.rates.ILS > 0) {
          setRates(data.rates);
          setRatesDate(data.time_last_update_unix
            ? new Date(data.time_last_update_unix * 1000).toLocaleDateString()
            : 'date unavailable');
          setRatesError(false);
        } else {
          setRatesError(true);
        }
      })
      .catch(() => { if (active) setRatesError(true); });
    return () => { active = false; };
  }, []);

  const report = useMemo(() => aggregateCosts(destinations, rates), [destinations, rates]);
  const rate = currency === 'USD' ? 1 : rates?.[currency];
  const formatMoney = (usdAmount) => {
    const selected = CURRENCIES.find((c) => c.code === currency);
    const converted = usdAmount * (Number.isFinite(rate) && rate > 0 ? rate : 1);
    return `${Number.isFinite(rate) && rate > 0 ? selected.symbol : 'USD'} ${converted.toLocaleString(
      undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }
    )}`;
  };
  const missingRates = report.issues.filter((issue) => issue.state === 'rate_missing').length;
  const missingValues = report.issues.filter((issue) => issue.state === 'pending').length;
  const invalidValues = report.issues.filter((issue) => issue.state === 'invalid').length;

  return (
    <div className="budget-container">
      <h2>💰 Trip Budget</h2>
      <section className="budget-section">
        <h3>Tracked costs by destination</h3>
        <p className="budget-note">Amounts without a currency are treated as USD. Enter
          ARS or ILS explicitly to convert them before aggregation. The totals below
          contain only destination Costs entries, not the older planning estimates.</p>
        <div className="currency-toggle" aria-label="Display currency">
          {CURRENCIES.map((c) => (
            <button type="button" key={c.code}
              className={currency === c.code ? 'active' : ''}
              aria-pressed={currency === c.code}
              onClick={() => setCurrency(c.code)}
              disabled={c.code !== 'USD' && !rates}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="budget-table">
          {COST_CATEGORIES.map((cat) => (
            <div key={cat.key} className="budget-row">
              <span>{cat.label}</span>
              <span>{formatMoney(report.totals[cat.key])}</span>
            </div>
          ))}
        </div>
        <div className="budget-summary">
          <span>📊 Tracked total ({report.included} priced items)</span>
          <span className="total">{formatMoney(report.grandTotal)}</span>
        </div>
        {report.trackedItems === 0 && <p className="budget-note">No individual costs entered yet.</p>}
        {report.issues.length > 0 && (
          <div className="budget-issues" role="status">
            <strong>Incomplete tracked total:</strong> {missingValues} TBD,
            {' '}{invalidValues} invalid amounts, {missingRates} awaiting exchange rates.
            <details>
              <summary>Show excluded cost items</summary>
              <ul>
                {report.issues.map((issue, index) => (
                  <li key={index}>
                    {issue.destination}: {issue.item} — {issue.state === 'rate_missing'
                      ? `exchange rate for ${issue.currency} unavailable`
                      : issue.state === 'pending' ? 'TBD' : 'enter a numeric amount and optional USD/ARS/ILS'}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
        {rates && (
          <p className="budget-note">Indicative rates: 1 USD = {rates.ARS.toLocaleString()} ARS /
            {' '}{rates.ILS.toLocaleString()} ILS; updated {ratesDate}.
            Actual card/bank rates and fees may differ.</p>
        )}
        {ratesError && (
          <p className="budget-note" role="status">Live FX rates unavailable.
            Display remains in USD; ARS/ILS expense entries are excluded until rates load.</p>
        )}
      </section>

      <section className="budget-section">
        <h3>Existing planning estimates (separate)</h3>
        <p className="budget-note">Reference figures saved in the original budget.
          They are not included in the tracked total above to avoid double counting.</p>
        <div className="budget-table">
          {LEGACY_ITEMS.map(([key, label]) => (
            <div className="budget-row" key={key}>
              <span>{label}</span><span>{budget[key] || 'TBD'}</span>
            </div>
          ))}
        </div>
        <div className="budget-summary">
          <span>📊 Original estimated total</span>
          <span className="total">{budget.total || 'Not calculated'}</span>
        </div>
      </section>

      <section className="budget-section">
        <h3>Michelle & Gilad share</h3>
        <p className="budget-note">Original planning estimate only.
          No expense-allocation rules have been configured for the new tracked costs.</p>
        <div className="budget-table">
          <div className="budget-row">
            <span>Original personal-cost estimate</span>
            <span>{budget.daughterShare || 'Not calculated'}</span>
          </div>
          <div className="budget-row">
            <span>Shared transfers</span>
            <span>{budget.sharedTransferPayer || 'See trip arrangement'}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
