import React, { useEffect, useState } from 'react';
import { database, ref, onValue, update, set, auth, signOut } from './firebase';
import './App.css';
import ArgentinaMap from './components/ArgentinaMap';
import GmailSync from './components/GmailSync';
import DestinationDetail from './components/DestinationDetail';
import Budget from './components/Budget';
import ApprovedBookings from './components/ApprovedBookings';
import LoginPage from './components/LoginPage';
import HotelBookings from './components/HotelBookings';
import { push } from 'firebase/database';
import { sanitizeHotel, hotelStayKey } from './utils/hotels';
import { fetchUsdQuote, snapshotExpense } from './utils/fx';

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
  const [hotelFilterId, setHotelFilterId] = useState(null);
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

  const handleUpdateCosts = async (destinationId, costs) => {
    // Keep the per-destination Costs tab introduced on main and update only its
    // own Firebase path, preserving hotel/flight changes made by other editors.
    if (userRole !== 'edit' || !Array.isArray(tripData?.destinations)) return;
    const index = tripData.destinations.findIndex((dest) => dest.id === destinationId);
    if (index < 0) return;
    try {
      await set(ref(database, `trip/destinations/${index}/costs`), costs);
      setDataError('');
    } catch {
      setDataError('Could not save destination costs. Check Firebase permissions.');
      throw new Error('Could not save destination costs.');
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


  // All hotel writes are restricted by both the editor UI and the deployed
  // Firebase database rules. Do not write guest-specific codes or email bodies.
  const editorOnly = () => {
    if (userRole !== 'edit') throw new Error('Only trip editors can change bookings.');
  };

  const pricedHotel = async (hotel) => {
    // The quote is fetched at the moment the booking price is SAVED.
    // This historical USD basis is never changed by subsequent display conversions.
    if (hotel.price === null) {
      return { ...hotel, priceUsd: null, fxSnapshot: null };
    }
    const quote = hotel.currency === 'USD' ? null : await fetchUsdQuote();
    const converted = snapshotExpense(hotel.price, hotel.currency, quote);
    return { ...hotel, priceUsd: converted.usdValue, fxSnapshot: converted.fxSnapshot };
  };

  const addHotel = async (form) => {
    editorOnly();
    const newRef = push(ref(database, 'trip/hotelBookings'));
    const clean = await pricedHotel(sanitizeHotel(form, newRef.key));
    await set(newRef, clean);
  };

  const importHotels = async (rows) => {
    editorOnly();
    if (!Array.isArray(rows) || rows.length > 100) throw new Error('Import at most 100 hotels.');
    // Collect changes first so network/validation failures do not partially import the list.
    const accepted = rows.map((row) => sanitizeHotel(row, push(ref(database, 'trip/hotelBookings')).key));
    const needsQuote = accepted.some((hotel) => hotel.price !== null && hotel.currency !== 'USD');
    const quote = needsQuote ? await fetchUsdQuote() : null;
    const updates = {};
    for (const hotel of accepted) {
      const result = hotel.price === null
        ? { ...hotel, priceUsd: null, fxSnapshot: null }
        : (() => {
            const snap = snapshotExpense(hotel.price, hotel.currency, quote);
            return { ...hotel, priceUsd: snap.usdValue, fxSnapshot: snap.fxSnapshot };
          })();
      updates['trip/hotelBookings/' + hotel.id] = result;
    }
    if (Object.keys(updates).length) await update(ref(database), updates);
  };

  const editHotel = async (hotel, form) => {
    editorOnly();
    const clean = sanitizeHotel({ ...form,
      source: hotel.source || 'Manual entry' }, hotel.originalId || hotel.id);

    const priceUnchanged = clean.price === (hotel.price === '' || hotel.price == null
      ? null : Number(hotel.price)) && clean.currency === (hotel.currency || 'USD');
    const updatedHotel = priceUnchanged && Number.isFinite(hotel.priceUsd) &&
        hotel.fxSnapshot
      ? { ...clean, priceUsd: hotel.priceUsd, fxSnapshot: hotel.fxSnapshot }
      : await pricedHotel(clean);

    const writePath = hotel.sourcePath;
    if (!/^trip\/(?:destinations\/\d+\/hotels\/\d+|hotelBookings\/[A-Za-z0-9_-]+)$/.test(writePath || '')) {
      throw new Error('Booking record path is not recognized.');
    }

    const patch = { ...updatedHotel };
    if (writePath.startsWith('trip/destinations/')) delete patch.id;
    const changes = Object.fromEntries(Object.entries(patch).map(([field, value]) =>
      [writePath + '/' + field, value]));

    // A cancelled or re-dated booking must not remain implicitly active.
    const oldGroup = hotelStayKey(hotel);
    const newGroup = hotelStayKey(updatedHotel);
    if (tripData.hotelSelections?.[oldGroup] === hotel.id &&
        (updatedHotel.status !== 'confirmed' || oldGroup !== newGroup)) {
      changes['trip/hotelSelections/' + oldGroup] = null;
    }
    await update(ref(database), changes);
  };

  const selectHotel = async (stayKey, hotel) => {
    editorOnly();
    const allRecords = [
      ...destinations.flatMap((dest, index) =>
        (dest.hotels || []).map((item, hotelIndex) => ({
          ...item,
          id: 'legacy_' + dest.id + '_' + String(item.id ?? hotelIndex),
          city: item.city || dest.name,
          checkIn: item.checkIn || '',
          sourcePath: 'trip/destinations/' + index + '/hotels/' + hotelIndex
        }))),
      ...Object.entries(tripData.hotelBookings || {}).map(([id, item]) => ({ ...item, id }))
    ];
    if (hotel) {
      const valid = allRecords.some((candidate) => candidate.id === hotel.id &&
        hotelStayKey(candidate) === stayKey &&
        /confirm|booked/i.test(String(candidate.status || '')));
      if (!valid) throw new Error('Select a confirmed booking from this stay group.');
    }
    await update(ref(database), { ['trip/hotelSelections/' + stayKey]: hotel?.id || null });
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
          ['home', 'Home'], ['destinations', 'Destinations'],
          ['hotels', 'Hotels & bookings'], ['budget', 'Budget'], ['bookings', 'Reviewed bookings'],
          ...(userRole === 'edit' ? [['gmail', 'Gmail review']] : [])
        ].map(([id, label]) => (
          <button key={id} className={currentTab === id ? 'active' : ''}
            onClick={() => {
              if (id === 'hotels') setHotelFilterId(null);
              setCurrentTab(id);
            }}>{label}</button>
        ))}
      </nav>
      <main className="content">
        {dataError && <p className="app-error" role="alert">{dataError}</p>}
        {currentTab === 'home' && (
          <div className="home-screen">
            <ArgentinaMap destinations={destinations} onOpenDestination={(id) => {
              setSelectedDestination(id);
              setCurrentTab('destinations');
            }} />
            <section className="trip-summary">
              <h2>Trip overview</h2>
              <div className="summary-item"><span>Travelers</span><span>5 people</span></div>
              <div className="summary-item"><span>Route stops</span><span>{destinations.length}</span></div>
              <div className="summary-item"><span>Active hotel selections</span>
                <span>{Object.values(tripData.hotelSelections || {}).filter(Boolean).length}</span></div>
              <div className="summary-item"><span>Reviewed bookings</span>
                <span>{Object.keys(tripData.bookingSummaries || {}).length}</span></div>
              <div className="summary-item"><span>Status</span><span>Planning in progress</span></div>
            </section>
          </div>
        )}
        {currentTab === 'destinations' && (
          <DestinationDetail
            destinations={destinations} selectedId={selectedDestination}
            onSelectHotel={(id, hotelId) => updateDestination(id, { selectedHotel: hotelId })}
            onUpdateBooking={handleUpdateBooking}
            onUpdateCosts={handleUpdateCosts} userRole={userRole}
            onOpenHotelBookings={(id) => {
              setSelectedDestination(id);
              setHotelFilterId(id);
              setCurrentTab('hotels');
            }}
          />
        )}
        {currentTab === 'hotels' && (
          <HotelBookings
            destinations={destinations}
            destinationId={hotelFilterId}
            hotelBookings={tripData.hotelBookings || {}}
            hotelSelections={tripData.hotelSelections || {}}
            userRole={userRole}
            onImport={importHotels} onAdd={addHotel} onEdit={editHotel}
            onSelect={selectHotel}
          />
        )}
        {currentTab === 'budget' && <Budget tripData={tripData} />}
        {currentTab === 'bookings' && <ApprovedBookings bookingSummaries={tripData.bookingSummaries} />}
        {currentTab === 'gmail' && userRole === 'edit' &&
          <GmailSync currentEmail={userEmail} />}
      </main>
      <footer className="footer">Argentina Trip Planner • Live trip data</footer>
    </div>
  );
}
