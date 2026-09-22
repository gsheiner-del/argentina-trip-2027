import React, { useState, useEffect } from 'react';
import { database, ref, onValue, update, auth, signOut } from './firebase';
import './App.css';
import RouteMap from './components/RouteMap';
import ArgentinaMap from './components/ArgentinaMap';
import GmailSync from './components/GmailSync';
import DestinationDetail from './components/DestinationDetail';
import Budget from './components/Budget';
import LoginPage from './components/LoginPage';

const USER_WHITELIST = {
  'gsheiner@gmail.com': { role: 'edit', display: 'Gennady' },
  'msheiner@gmail.com': { role: 'edit', display: 'Marina' },
  'michsheiner@gmail.com': { role: 'view', display: 'Michelle' },
  'glivne21@gmail.com': { role: 'view', display: 'Gilad' },
  'ori.sheiner@gmail.com': { role: 'view', display: 'Ori' }
};

export default function App() {
  const [currentTab, setCurrentTab] = useState('home');
  const [tripData, setTripData] = useState(null);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [userRole, setUserRole] = useState('view');
  const [userEmail, setUserEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        const email = user.email.toLowerCase();
        setUserEmail(email);

        if (USER_WHITELIST[email]) {
          setDisplayName(USER_WHITELIST[email].display);
          setUserRole(USER_WHITELIST[email].role);
          setIsAuthorized(true);

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
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        setIsAuthorized(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsAuthenticated(false);
      setIsAuthorized(false);
      setTripData(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <LoginPage auth={auth} onLoginSuccess={() => {}} />;
  }

  if (isAuthenticated && !isAuthorized) {
    return (
      <div className="app">
        <header className="header">
          <h1>🇦🇷 Argentina Trip 2027</h1>
        </header>
        <div className="not-authorized">
          <h2>❌ Access Denied</h2>
          <p>Your email ({userEmail}) is not authorized to access this trip planner.</p>
          <p>This app is restricted to family members only.</p>
          <button onClick={handleLogout} className="logout-btn">Sign Out</button>
        </div>
      </div>
    );
  }

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

  const handleUpdateBooking = (destination, bookingId, link) => {
    if (userRole === 'edit' && tripData) {
      const destIndex = tripData.destinations.findIndex(d => d.id === destination);
      if (bookingId.startsWith('flight-')) {
        const flightIdx = parseInt(bookingId.split('-')[1]);
        const path = `trip/destinations/${destIndex}/flights/${flightIdx}/bookingLink`;
        update(ref(database), { [path]: link });
      } else {
        const path = `trip/destinations/${destIndex}/hotels`;
        const hotelIndex = tripData.destinations[destIndex].hotels.findIndex(h => h.id === bookingId);
        const bookingPath = `trip/destinations/${destIndex}/hotels/${hotelIndex}/bookingLink`;
        update(ref(database), { [bookingPath]: link });
      }
    }
  };

  if (!tripData) {
    return <div className="loading">Loading trip data...</div>;
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div>
            <h1>Argentina Trip 2027</h1>
            <p>March 7 - 25, 2027 • 5 Travelers: Gennady, Marina, Michelle, Gilad, Ori</p>
            <p className="user-info">Logged in as: <strong>{displayName}</strong> ({userRole === 'edit' ? '✏️ Edit' : '👁️ View Only'})</p>
          </div>
          <button onClick={handleLogout} className="logout-btn-header">Sign Out</button>
        </div>
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
        <button
          className={currentTab === 'map' ? 'active' : ''}
          onClick={() => setCurrentTab('map')}
        >
          Map
        </button>
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

        {currentTab === 'route' {currentTab === 'route' && <RouteMap destinations={tripData.destinations} />}{currentTab === 'route' && <RouteMap destinations={tripData.destinations} />} <RouteMap destinations={tripData.destinations} />}

        {currentTab === 'map' {currentTab === 'route' && <RouteMap destinations={tripData.destinations} />}{currentTab === 'route' && <RouteMap destinations={tripData.destinations} />} <ArgentinaMap destinations={tripData.destinations} />}

        {currentTab === 'destinations' && (
          <DestinationDetail
            destinations={tripData.destinations}
            selectedId={selectedDestination}
            onSelectHotel={handleSelectHotel}
            onUpdateBooking={handleUpdateBooking}
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
