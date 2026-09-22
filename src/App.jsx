import React, { useState, useEffect } from 'react';
import { database, ref, onValue, update } from './firebase';
import './App.css';
import RouteMap from './components/RouteMap';
import DestinationDetail from './components/DestinationDetail';
import Budget from './components/Budget';

const ALLOWED_USERS = {
  gennady: { role: 'edit', display: 'Gennady' },
  marina: { role: 'edit', display: 'Marina' },
  michelle: { role: 'view', display: 'Michelle' },
  gilad: { role: 'view', display: 'Gilad' },
  ori: { role: 'view', display: 'Ori' }
};

export default function App() {
  const [currentTab, setCurrentTab] = useState('home');
  const [tripData, setTripData] = useState(null);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [userRole, setUserRole] = useState('view');
  const [userName, setUserName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Check user on load (case-insensitive)
    const urlParams = new URLSearchParams(window.location.search);
    const user = (urlParams.get('user') || 'guest').toLowerCase();

    if (ALLOWED_USERS[user]) {
      setUserName(user);
      setDisplayName(ALLOWED_USERS[user].display);
      setUserRole(ALLOWED_USERS[user].role);
      setIsAuthorized(true);

      // Load trip data from Firebase only if authorized
      const tripRef = ref(database, 'trip');
      onValue(tripRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setTripData(data);
        }
      });
    } else {
      setIsAuthorized(false);
      setDisplayName('Unknown User');
    }
  }, []);

  const handleSelectHotel = (destination, hotelId) => {
    if (userRole === 'edit' && tripData) {
      const destinationPath = `trip/destinations/${tripData.destinations.findIndex(d => d.id === destination)}/selectedHotel`;
      update(ref(database), { [destinationPath]: hotelId });
    }
  };

  const handleUpdateNote = (destination, note) => {
    if (userRole === 'edit' && tripData) {
      const destIndex = tripData.destinations.findIndex(d => d.id === destination);
      const notePath = `trip/destinations/${destIndex}/notes`;
      update(ref(database), { [notePath]: note });
    }
  };

  if (!isAuthorized) {
    return (
      <div className="app">
        <header className="header">
          <h1>🇦🇷 Argentina Trip 2027</h1>
        </header>
        <div className="not-authorized">
          <h2>❌ Access Denied</h2>
          <p>This trip planner is restricted to authorized users only.</p>
          <p>Authorized users: Gennady, Marina, Michelle, Gilad, Ori</p>
          <p>Please use a valid URL like: <code>?user=gennady</code></p>
        </div>
      </div>
    );
  }

  if (!tripData) {
    return <div className="loading">Loading trip data...</div>;
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🇦🇷 Argentina Trip 2027</h1>
        <p>March 7 - 25, 2027 • 5 Travelers: Gennady, Marina, Michelle, Gilad, Ori</p>
        <p className="user-info">Logged in as: <strong>{displayName}</strong> ({userRole === 'edit' ? '✏️ Edit' : '👁️ View Only'})</p>
      </header>

      <nav className="nav-tabs">
        <button
          className={currentTab === 'home' ? 'active' : ''}
          onClick={() => setCurrentTab('home')}
        >
          Home
        </button>
        <button
          className={currentTab === 'route' ? 'active' : ''}
          onClick={() => setCurrentTab('route')}
        >
          Route Map
        </button>
        <button
          className={currentTab === 'destinations' ? 'active' : ''}
          onClick={() => setCurrentTab('destinations')}
        >
          Destinations
        </button>
        <button
          className={currentTab === 'budget' ? 'active' : ''}
          onClick={() => setCurrentTab('budget')}
        >
          Budget
        </button>
      </nav>

      <main className="content">
        {currentTab === 'home' && (
          <div className="home-screen">
            <section className="trip-summary">
              <h2>Trip Overview</h2>
              <div className="summary-item">
                <span>Total Travelers:</span>
                <span>5 people</span>
              </div>
              <div className="summary-item">
                <span>Duration:</span>
                <span>19 days</span>
              </div>
              <div className="summary-item">
                <span>Status:</span>
                <span>Planning in progress</span>
              </div>
            </section>

            <section className="quick-route">
              <h2>Quick Route View</h2>
              <div className="route-steps">
                {tripData.destinations && tripData.destinations.slice(0, 6).map(dest => (
                  <div
                    key={dest.id}
                    className="route-step"
                    onClick={() => {
                      setSelectedDestination(dest.id);
                      setCurrentTab('destinations');
                    }}
                  >
                    <div className="step-icon">{dest.emoji}</div>
                    <div className="step-info">
                      <div className="step-name">{dest.name}</div>
                      <div className="step-dates">{dest.dates}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {currentTab === 'route' && <RouteMap destinations={tripData.destinations} />}

        {currentTab === 'destinations' && (
          <DestinationDetail
            destinations={tripData.destinations}
            selectedId={selectedDestination}
            onSelectHotel={handleSelectHotel}
            userRole={userRole}
          />
        )}

        {currentTab === 'budget' && <Budget tripData={tripData} />}
      </main>

      <footer className="footer">
        <p>Argentina Trip Planner • Real-time Sync Enabled</p>
      </footer>
    </div>
  );
}
