import React, { useEffect, useState } from 'react';
import { database, ref, onValue, update, set, auth, signOut } from './firebase';
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
  const [dataError, setDataError] = useState('');

  useEffect(() => {
    let stopTrip = () => {};
    const stopAuth = auth.onAuthStateChanged((user) => {
      stopTrip();
      stopTrip = () => {};
      setTripData(null);
      setDataError('');

      const email = user?.email?.toLowerCase() || '';
      const member = USER_WHITELIST[email];
      setUserEmail(email);
      setIsAuthenticated(Boolean(user));
      setIsAuthorized(Boolean(member));
      setUserRole(member?.role || 'view');
      setDisplayName(member?.display || '');
      setLoading(false);

      if (member) {
        stopTrip = onValue(ref(database, 'trip'), (snapshot) => {
          setTripData(snapshot.val());
          setDataError(snapshot.exists() ? '' : 'Trip data has not been initialized in Firebase.');
        }, () => {
          setDataError('Unable to read trip data. Check your Firebase permissions.');
        });
      }
    });
    return () => {
      stopTrip();
      stopAuth();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      setDataError('Sign-out failed. Please try again.');
    }
  };

  const updateDestination = async (destinationId, changes) => {
    if (userRole !== 'edit' || !Array.isArray(tripData?.destinations)) return;
    const index = tripData.destinations.findIndex((d) => d.id === destinationId);
    if (index < 0) return;
    try {
      await update(ref(database, `trip/destinations/${index}`), changes);
      setDataError('');
    } catch (error) {
      setDataError('Could not save the change. Check your Firebase access.');
    }
  };

  const handleUpdateBooking = (destinationId, bookingId, link) => {
    const index = tripData?.destinations?.findIndex((d) => d.id === destinationId) ?? -1;
    if (index < 0 || userRole !== 'edit') return;
    const destination = tripData.destinations[index];
    const flightIndex = bookingId.startsWith('flight-') ? Number(bookingId.slice(7)) : -1;
    const hotelIndex = destination.hotels?.findIndex((h) => h.id === bookingId) ?? -1;
    const relativePath = flightIndex >= 0 && Number.isInteger(flightIndex) && flightIndex < (destination.flights?.length || 0)
      ? `flights/${flightIndex}/bookingLink`
      : hotelIndex >= 0 ? `hotels/${hotelIndex}/bookingLink` : null;
    if (!relativePath) return;
    set(ref(database, `trip/destinations/${index}/${relativePath}`), link)
      .catch(() => setDataError('Could not save this booking link.'));
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!isAuthenticated) return <LoginPage auth={auth} onLoginSuccess={() => {}} />;
  if (!isAuthorized) {
    return (
      <div className="app">
        <header className="header"><h1>Argentina Trip 2027</h1></header>
        <main className="not-authorized">
          <h2>Access denied</h2>
          <p>This Google account is not authorized to view the trip.</p>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </main>
      </div>
    );
  }
  if (!tripData) return (
    <div className="loading">
      {dataError || 'Loading trip data...'}
    </div>
  );

  const destinations = Array.isArray(tripData.destinations) ? tripData.destinations : [];

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div>
            <h1>Argentina Trip 2027</h1>
            <p>March 2027 • {destinations.length} route stops</p>
            <p className="user-info">Signed in as <strong>{displayName}</strong> ({userRole === 'edit' ? 'Editor' : 'View only'})</p>
          </div>
          <button onClick={handleLogout} className="logout-btn-header">Sign out</button>
        </div>
      </header>
      <nav className="nav-tabs" aria-label="Trip sections">
        {[
          ['home', 'Home'], ['route', 'Route'], ['destinations', 'Destinations'],
          ['map', 'Interactive map'], ['budget', 'Budget'],
          ...(userRole === 'edit' ? [['gmail', 'Gmail review']] : [])
        ].map(([id, label]) => (
          <button key={id} className={currentTab === id ? 'active' : ''}
            onClick={() => setCurrentTab(id)}>{label}</button>
        ))}
      </nav>
      <main className="content">
        {dataError && <p className="app-error" role="alert">{dataError}</p>}
        {currentTab === 'home' && (
          <div className="home-screen">
            <section className="trip-summary">
              <h2>Trip overview</h2>
              <div className="summary-item"><span>Travelers</span><span>5 people</span></div>
              <div className="summary-item"><span>Route stops</span><span>{destinations.length}</span></div>
              <div className="summary-item"><span>Status</span><span>Planning in progress</span></div>
            </section>
            <section className="quick-route">
              <h2>Trip route</h2>
              <div className="route-steps">
                {destinations.map((dest) => (
                  <button key={dest.id} className="route-step" onClick={() => {
                    setSelectedDestination(dest.id);
                    setCurrentTab('destinations');
                  }}>
                    <span className="step-icon">{dest.emoji}</span>
                    <span className="step-info"><span className="step-name">{dest.name}</span>
                    <span className="step-dates">{dest.dates}</span></span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
        {currentTab === 'route' && <RouteMap destinations={destinations} />}
        {currentTab === 'map' && <ArgentinaMap destinations={destinations} onOpenDestination={(id) => {
          setSelectedDestination(id);
          setCurrentTab('destinations');
        }} />}
        {currentTab === 'destinations' && (
          <DestinationDetail
            destinations={destinations} selectedId={selectedDestination}
            onSelectHotel={(id, hotelId) => updateDestination(id, { selectedHotel: hotelId })}
            onUpdateBooking={handleUpdateBooking} userRole={userRole}
          />
        )}
        {currentTab === 'budget' && <Budget tripData={tripData} />}
        {currentTab === 'gmail' && userRole === 'edit' &&
          <GmailSync currentEmail={userEmail} />}
      </main>
      <footer className="footer">Argentina Trip Planner • Live trip data</footer>
    </div>
  );
}
