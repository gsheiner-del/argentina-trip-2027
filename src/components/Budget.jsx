import React from 'react';
import './Budget.css';

export default function Budget({ tripData }) {
  const budget = tripData?.budget || {};

  return (
    <div className="budget-container">
      <h2>💰 Trip Budget</h2>

      <div className="budget-section">
        <h3>Breakdown by Category</h3>
        <div className="budget-table">
          <div className="budget-row">
            <span>✈️ International Flights</span>
            <span>{budget.internationalFlights || 'TBD'}</span>
          </div>
          <div className="budget-row">
            <span>✈️ Domestic Flights</span>
            <span>{budget.domesticFlights || 'USD 4,170'}</span>
          </div>
          <div className="budget-row">
            <span>🏨 Hotels</span>
            <span>{budget.hotels || 'USD 2,408'}</span>
          </div>
          <div className="budget-row">
            <span>🚗 Ground Transport</span>
            <span>{budget.transport || 'USD 710'}</span>
          </div>
          <div className="budget-row">
            <span>🎯 Activities & Tours</span>
            <span>{budget.activities || 'USD 2,900+'}</span>
          </div>
          <div className="budget-row">
            <span>🍽️ Meals & Dining</span>
            <span>{budget.meals || 'USD 1,500'}</span>
          </div>
          <div className="budget-row">
            <span>📱 Other</span>
            <span>{budget.other || 'USD 300'}</span>
          </div>
        </div>

        <div className="budget-summary">
          <span>📊 Estimated Total</span>
          <span className="total">{budget.total || 'USD 12,000 - 15,000'}</span>
        </div>
      </div>

      <div className="budget-section">
        <h3>👧 Michelle & Gilad Share</h3>
        <div className="budget-table">
          <div className="budget-row">
            <span>Personal costs (2/5 share)</span>
            <span>{budget.daughterShare || 'Estimated USD 4,000-5,000'}</span>
          </div>
          <div className="budget-row">
            <span>Shared transfers</span>
            <span className="paid">Paid by Father</span>
          </div>
        </div>
      </div>

      <div className="budget-section">
        <h3>⚠️ Outstanding Items</h3>
        <div className="outstanding">
          <div className="item">
            <span>✓ Hotel selections pending</span>
          </div>
          <div className="item">
            <span>✓ Flight connection corrected</span>
          </div>
          <div className="item">
            <span>✓ Mendoza accommodation not booked</span>
          </div>
          <div className="item">
            <span>✓ International flight fare TBD</span>
          </div>
        </div>
      </div>
    </div>
  );
}
