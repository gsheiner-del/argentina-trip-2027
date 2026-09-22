import React, { useMemo } from 'react';
import './ApprovedBookings.css';

const LABELS = {
  hotel: 'Accommodation',
  flight: 'Flight',
  flight_extra: 'Flight extras',
  transport: 'Transport',
  other: 'Trip information'
};

export default function ApprovedBookings({ bookingSummaries = {} }) {
  const bookings = useMemo(() => Object.entries(bookingSummaries || {})
    .filter(([, entry]) => entry && entry.status === 'reviewed')
    .map(([id, entry]) => ({ ...entry, id }))
    .sort((a, b) => {
      const aDate = a.checkIn || '9999-12-31';
      const bDate = b.checkIn || '9999-12-31';
      return aDate.localeCompare(bDate) || a.title.localeCompare(b.title);
    }), [bookingSummaries]);

  return (
    <section className="approved-bookings">
      <div className="approved-bookings-header">
        <div>
          <h2>Reviewed travel information</h2>
          <p>Only summaries explicitly approved by the trip editors appear here.
            Always check the original provider for last-minute changes.</p>
        </div>
        <span className="approved-count">{bookings.length} items</span>
      </div>
      {!bookings.length && (
        <p className="approved-empty">No reviewed bookings yet. Editors can review new items in Gmail review.</p>
      )}
      <div className="approved-bookings-list">
        {bookings.map((item) => (
          <article className="approved-booking" key={item.id}>
            <div className="approved-booking-top">
              <span className="approved-category">{LABELS[item.category] || LABELS.other}</span>
              <span className="approved-check">Reviewed by trip editor</span>
            </div>
            <h3>{item.title}</h3>
            <p className="approved-location">📍 {item.place || 'Location to be confirmed'}</p>
            {(item.checkIn || item.checkOut) && (
              <p className="approved-dates">📅 {item.checkIn || 'Date not provided'}
                {item.checkOut ? ` — ${item.checkOut}` : ''}</p>
            )}
            {item.notes && <p className="approved-notes">{item.notes}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
