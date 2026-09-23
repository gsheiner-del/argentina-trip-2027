import React, { useEffect, useState } from 'react';
import './DestinationDetail.css';
import CostTracker from './CostTracker';
import StayOptions from './StayOptions';
import NearbyExplore from './NearbyExplore';

export default function DestinationDetail({ trip, destinations, selectedId, userRole, onUpdateBooking, onUpdateCosts, onSelectPreferred, onImportScreenshot }) {
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
  }, [selectedId]);

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
            <StayOptions trip={trip} destination={current} userRole={userRole}
              onSelect={onSelectPreferred} onImport={onImportScreenshot}/>
          )}

          {activeTab === 'flights' && (
            <section className="destination-flights">
              <h3>Flights</h3>
              <p>Confirmed flights from Gmail Review appear alongside previously entered flight plans.
                Duplicate passenger confirmations can enrich the same flight card.</p>
              {current.flights?.length ? current.flights.map((flight, idx) => (
                <article className="flight-card" key={flight.id || idx}>
                  <div className="flight-header">
                    <h4>{flight.airline} {flight.number}</h4>
                    <span className="status">{flight.status || 'Planning'}</span>
                    {flight.reviewedEmails && <span className="badge">✓ Approved via Gmail</span>}
                  </div>
                  {flight.date && <p>📅 {flight.date}</p>}
                  <div className="flight-details">
                    <div><strong>{flight.from || 'Departure TBD'}</strong> → {flight.departure || 'Time TBD'}</div>
                    <div><strong>{flight.to || 'Arrival TBD'}</strong> → {flight.arrival || 'Time TBD'}</div>
                  </div>
                  {flight.notes && <p>{flight.notes}</p>}
                  {/^https:\/\//i.test(flight.bookingLink || '') && (
                    <div className="booking-link"><a href={flight.bookingLink}
                      target="_blank" rel="noopener noreferrer">View airline ↗</a></div>
                  )}
                  {userRole === 'edit' && (
                    <div className="edit-booking">
                      {editingBookingId === 'flight-' + idx ? (
                        <div className="booking-input">
                          <input type="url" placeholder="Public airline link (HTTPS, not booking code)"
                            value={bookingLink} onChange={e => setBookingLink(e.target.value)}/>
                          <button onClick={() => {
                            onUpdateBooking?.(current.id, 'flight-' + idx, bookingLink);
                            setEditingBookingId(null);
                          }}>Save</button>
                          <button onClick={() => setEditingBookingId(null)}>Cancel</button>
                        </div>
                      ) : <button onClick={() => {
                        setEditingBookingId('flight-' + idx);
                        setBookingLink(flight.bookingLink || '');
                      }}>{flight.bookingLink ? 'Edit link' : '+ Add airline link'}</button>}
                    </div>
                  )}
                </article>
              )) : <p>No flights added yet. Use Gmail Review to approve confirmed flight details.</p>}
            </section>
          )}

          {activeTab === 'activities' && (
            <section className="destination-activities">
              <h3>Activities &amp; Tours</h3>
              {current.activities?.length ? current.activities.map((activity, idx) => (
                <article key={activity.id || idx} className="activity-card">
                  <h4>{activity.name}</h4>
                  {activity.reviewedEmails && <span className="badge">✓ Approved via Gmail</span>}
                  {activity.description && <p>{activity.description}</p>}
                  <p className="date">{activity.date || 'Date to be confirmed'}
                    {activity.time ? ' · ' + activity.time : ''}</p>
                  {activity.organizer && <p>Organizer: {activity.organizer}</p>}
                  {activity.meetingPoint && <p>Meeting point: {activity.meetingPoint}</p>}
                  {/^https:\/\//i.test(activity.bookingLink || '') &&
                    <a target="_blank" rel="noopener noreferrer"
                      href={activity.bookingLink}>View tour ↗</a>}
                </article>
              )) : <p>No activities yet. Confirm tours in Gmail Review or add them to this destination.</p>}
            </section>
          )}

          {activeTab === 'nearby' && (
            <NearbyExplore destination={current} trip={trip}/>
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
