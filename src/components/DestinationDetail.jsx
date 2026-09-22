import React, { useEffect, useState } from 'react';
import './DestinationDetail.css';
import CostTracker from './CostTracker';

export default function DestinationDetail({ destinations, selectedId, userRole, onUpdateBooking, onUpdateCosts, onOpenHotelBookings }) {
  const [expandedId, setExpandedId] = useState(selectedId || (destinations ? destinations[0]?.id : null));
  const [activeTab, setActiveTab] = useState('stays');
  const [editingBookingId, setEditingBookingId] = useState(null);
  const [bookingLink, setBookingLink] = useState('');

  // Selecting a pin on the map must change the currently displayed destination.
  useEffect(() => {
    if (selectedId && destinations?.some(dest => dest.id === selectedId)) {
      setExpandedId(selectedId);
      setActiveTab('stays');
    }
  }, [selectedId, destinations]);

  const current = destinations?.find(d => d.id === expandedId);

  if (!current) return <div>Loading...</div>;

  return (
    <div className="destination-detail">
      <div className="dest-selector">
        {destinations?.map(dest => (
          <button
            key={dest.id}
            className={`dest-btn ${expandedId === dest.id ? 'active' : ''}`}
            onClick={() => {
              setExpandedId(dest.id);
              setActiveTab('stays');
            }}
          >
            {dest.emoji} {dest.name}
          </button>
        ))}
      </div>

      <div className="destination-card">
        <h2>{current.emoji} {current.name}</h2>
        <p className="dest-dates">{current.dates}</p>

        <div className="dest-tabs">
          <button
            className={activeTab === 'stays' ? 'active' : ''}
            onClick={() => setActiveTab('stays')}
          >
            Stays
          </button>
          <button
            className={activeTab === 'flights' ? 'active' : ''}
            onClick={() => setActiveTab('flights')}
          >
            Flights
          </button>
          <button
            className={activeTab === 'activities' ? 'active' : ''}
            onClick={() => setActiveTab('activities')}
          >
            Activities
          </button>
          <button
            className={activeTab === 'nearby' ? 'active' : ''}
            onClick={() => setActiveTab('nearby')}
          >
            Nearby
          </button>
          <button
            className={activeTab === 'costs' ? 'active' : ''}
            onClick={() => setActiveTab('costs')}
          >
            Costs
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'stays' && (
            <section className="destination-stays-redirect">
              <h3>Accommodation in {current.name}</h3>
              <p>Compare every hotel and alternative for this destination,
                review cancellation status and see which booking is active.</p>
              <button type="button" onClick={() => onOpenHotelBookings?.(current.id)}>
                Open Hotels &amp; bookings
              </button>
            </section>
          )}
          {activeTab === 'flights' && (
            <div>
              <h3>Flights</h3>
              {current.flights?.length > 0 ? current.flights.map((flight, idx) => (
                <div key={idx} className="flight-card">
                  <div className="flight-header">
                    <h4>{flight.airline} {flight.number}</h4>
                    <span className="status">{flight.status}</span>
                  </div>
                  <div className="flight-details">
                    <div><strong>{flight.from}</strong> → {flight.departure}</div>
                    <div><strong>{flight.to}</strong> → {flight.arrival}</div>
                  </div>
                  {flight.bookingLink && (
                    <div className="booking-link">
                      <a href={flight.bookingLink} target="_blank" rel="noopener noreferrer">
                        🔗 View Booking
                      </a>
                    </div>
                  )}
                  {userRole === 'edit' && (
                    <div className="edit-booking">
                      {editingBookingId === `flight-${idx}` ? (
                        <div className="booking-input">
                          <input
                            type="text"
                            placeholder="Flight confirmation link or booking number"
                            value={bookingLink}
                            onChange={(e) => setBookingLink(e.target.value)}
                          />
                          <button onClick={() => {
                            onUpdateBooking?.(current.id, `flight-${idx}`, bookingLink);
                            setEditingBookingId(null);
                          }}>Save</button>
                          <button onClick={() => setEditingBookingId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => {
                          setEditingBookingId(`flight-${idx}`);
                          setBookingLink(flight.bookingLink || '');
                        }}>
                          {flight.bookingLink ? '✏️ Edit Link' : '+ Add Booking Link'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )) : <p>No flights available</p>}
            </div>
          )}

          {activeTab === 'activities' && (
            <div>
              <h3>Activities & Tours</h3>
              {current.activities?.map((activity, idx) => (
                <div key={idx} className="activity-card">
                  <h4>{activity.name}</h4>
                  <p>{activity.description}</p>
                  <p className="date">{activity.date}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'nearby' && (
            <div>
              <h3>Nearby Recommendations</h3>
              {current.nearby?.map((place, idx) => (
                <div key={idx} className="nearby-card">
                  <div className="nearby-icon">{place.icon}</div>
                  <div className="nearby-content">
                    <h4>{place.name}</h4>
                    <p className="category">{place.category}</p>
                    <p className="distance">📍 {place.distance}</p>
                    <p className="description">{place.description}</p>
                    <p className="rating">⭐ {place.rating}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {activeTab === 'costs' && (
            <div>
              <h3>Cost Estimates</h3>
              <CostTracker key={current.id} destination={current}
                userRole={userRole} onUpdateCosts={onUpdateCosts} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
