import React, { useState, useEffect } from 'react';
import { database, ref, onValue, update } from './firebase';
import './App.css';
import RouteMap from './components/RouteMap';
import DestinationDetail from './components/DestinationDetail';
import Budget from './components/Budget';

export default function App() {
  const [currentTab, setCurrentTab] = useState('home');
  const [tripData, setTripData] = useState(null);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [userRole, setUserRole] = useState('view'); // 'edit' or 'view'
  const [userName, setUserName] = useState('');

  useEffect(() => {
    // Load trip data from Firebase
    const tripRef = ref(database, 'trip');
    onValue(tripRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTripData(data);
      }
    });

    // Check user on load
    const urlParams = new URLSearchParams(window.location.search);
    const user = urlParams.get('user') || 'guest';
    setUserName(user);

    // Edit access for you and Marina only
    if (user === 'you' || user === 'marina') {
      setUserRole('edit');
    }
  }, []);

  const handleSelectHotel = (destination, hotelId) => {
    if (userRole === 'edit' && tripData) {
      const updatedData = {
        ...tripData,
        destinations: tripData.destinations.map(d =>
          d.id === destination ? { ...d, selectedHotel: hotelId } : d
        )
      };
      update(ref(database, 'trip'), updatedData);
    }
  };

  if (!tripData) {
    return <div className="loading">Loading trip data...</div>;
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🇦🇷 Argentina Trip 2027</h1>
        <p>March 7 - 25, 2027 • 5 Travelers: You, Marina, Michelle & Gilad, Ori</p>
        <p className="user-info">Logged in as: <strong>{userName}</strong> ({userRole === 'edit' ? '✏️ Edit' : '👁️ View Only'})</p>
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
