import React, { useState } from 'react';
import './DestinationDetail.css';

export default function DestinationDetail({ destinations, selectedId, onSelectHotel, userRole, onUpdateBooking }) {
  const [expandedId, setExpandedId] = useState(selectedId || (destinations ? destinations[0]?.id : null));
  const [activeTab, setActiveTab] = useState('stays');
  const [editingBookingId, setEditingBookingId] = useState(null);
  const [bookingLink, setBookingLink] = useState('');

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
        </div>

        <div className="tab-content">
          {activeTab === 'stays' && (
            <div>
              <h3>Accommodation Options</h3>
              {current.hotels?.length > 0 ? current.hotels.map(hotel => (
                <div
                  key={hotel.id}
                  className={`option-card ${current.selectedHotel === hotel.id ? 'selected' : ''}`}
                  onClick={() => userRole === 'edit' && onSelectHotel(current.id, hotel.id)}
                  style={{ cursor: userRole === 'edit' ? 'pointer' : 'default' }}
                >
                  <div className="hotel-header">
                    <h4>{hotel.name}</h4>
                    {current.selectedHotel === hotel.id && <span className="badge">✓ Selected</span>}
                  </div>
                  <p className="hotel-info">{hotel.description}</p>
                  <p className="hotel-status">{hotel.status}</p>
                  {hotel.bookingLink && (
                    <div className="booking-link">
                      <a href={hotel.bookingLink} target="_blank" rel="noopener noreferrer">
                        🔗 View Booking
                      </a>
                    </div>
                  )}
                  {userRole === 'edit' && (
                    <div className="edit-booking">
                      {editingBookingId === hotel.id ? (
                        <div className="booking-input">
                          <input
                            type="text"
                            placeholder="Booking.com link or confirmation ID"
                            value={bookingLink}
                            onChange={(e) => setBookingLink(e.target.value)}
                          />
                          <button onClick={() => {
                            onUpdateBooking?.(current.id, hotel.id, bookingLink);
                            setEditingBookingId(null);
                          }}>Save</button>
                          <button onClick={() => setEditingBookingId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => {
                          setEditingBookingId(hotel.id);
                          setBookingLink(hotel.bookingLink || '');
                        }}>
                          {hotel.bookingLink ? '✏️ Edit Link' : '+ Add Booking Link'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )) : <p>No accommodation options available</p>}
            </div>
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
        </div>
      </div>
    </div>
  );
}
