import React, { useEffect, useState } from 'react';
import { database, ref, onValue, update, set, auth, signOut } from './firebase';
import './App.css';
import ArgentinaMap from './components/ArgentinaMap';
import GmailSync from './components/GmailSync';
import DestinationDetail from './components/DestinationDetail';
import Budget from './components/Budget';
import LoginPage from './components/LoginPage';
import { groupHotelOptions } from './utils/hotels';
import { existingRecords, screenshotImportPlan, cityMatches, resolveStayVisit } from './utils/tripReview.js';

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


  const editorOnly = () => {
    if (userRole !== 'edit') throw new Error('Only Gennady and Marina can change stays.');
  };

  const selectPreferred = async (groupKey, hotel) => {
    editorOnly();
    const groups = tripData.destinations.flatMap(dest =>
      groupHotelOptions(existingRecords(tripData, 'hotel', dest.id)));
    const group = groups.find(g => g.key === groupKey &&
      (!hotel || g.hotels.some(row => row.sourcePath === hotel.sourcePath)));
    if (!group) throw new Error('This stay changed. Refresh your browser.');
    if (hotel && !/confirm|booked/i.test(String(hotel.status || '')) ||
        hotel && /cancel/i.test(String(hotel.status || ''))) {
      throw new Error('Only a confirmed, non-cancelled booking can be Preferred.');
    }
    const updates = {};
    for (const alias of group.aliases) updates['trip/hotelSelections/' + alias] = null;
    updates['trip/hotelSelections/' + group.key] = hotel?.id || 'none';
    await update(ref(database), updates);
  };

  // A hotel approved into the first Buenos Aires visit can be moved safely to
  // the departure visit. Do not modify or delete the Gmail approval itself.
  const moveStay = async (hotel, targetDestinationId) => {
    editorOnly();
    const source = hotel?.sourcePath || '';
    if (!/^trip\\/(?:destinations\\/\\d+\\/hotels\\/\\d+|hotelBookings\\/[A-Za-z0-9_-]+)$/.test(source))
      throw new Error('Unsupported booking record. Refresh and try again.');
    const targetIndex = tripData.destinations.findIndex(d => String(d.id) === String(targetDestinationId));
    const target = tripData.destinations[targetIndex];
    if (!target || !cityMatches(hotel.city, target.name))
      throw new Error('Choose a destination in the hotel city.');
    const expected = resolveStayVisit(tripData, hotel.city, hotel.checkIn, hotel.checkOut);
    if (!expected || String(expected.id) !== String(target.id))
      throw new Error('Booking dates do not match the target visit.');
    const current = source.split('/')[1] === 'destinations'
      ? tripData.destinations[Number(source.split('/')[2])]?.hotels?.[Number(source.split('/')[4])]
      : tripData.hotelBookings?.[source.split('/')[2]];
    if (!current || String(current.id) !== String(hotel.originalId || hotel.id))
      throw new Error('Booking has changed. Reload before moving.');
    const sourceIndex = source.match(/^trip\\/destinations\\/(\\d+)\\/hotels\\//);
    if (sourceIndex && Number(sourceIndex[1]) === targetIndex)
      throw new Error('Booking is already in the correct visit.');
    const targetHotels = target.hotels || [];
    const same = targetHotels.find(h => h && h.id === current.id);
    if (same) throw new Error('This booking already exists in the target visit. Review the duplicate first.');
    const newPath = 'trip/destinations/' + targetIndex + '/hotels/' + targetHotels.length;
    const updates = { [newPath]: { ...current, city: target.name }, [source]: null };
    for (const [emailId, link] of Object.entries(tripData.emailImports || {})) {
      if (link?.targetPath === source) {
        updates['trip/emailImports/' + emailId + '/targetPath'] = newPath;
        updates['gmailImport/privateBookings/' + emailId + '/targetPath'] = newPath;
      }
    }
    await update(ref(database), updates);
  };

  // Reversible removal from the visible itinerary. Never cancel a real
  // reservation, delete its approval, or destroy its historical metadata.
  const setStayArchived = async (hotel, archived) => {
    editorOnly();
    const path = hotel?.sourcePath || '';
    if (!/^trip\\/(?:destinations\\/\\d+\\/hotels\\/\\d+|hotelBookings\\/[A-Za-z0-9_-]+)$/.test(path))
      throw new Error('Unsupported hotel path.');
    const live = path.split('/')[1] === 'destinations'
      ? tripData.destinations[Number(path.split('/')[2])]?.hotels?.[Number(path.split('/')[4])]
      : tripData.hotelBookings?.[path.split('/')[2]];
    if (!live || live.id !== (hotel.originalId || hotel.id))
      throw new Error('Booking changed; refresh before continuing.');
    if (archived && /cancel/i.test(live.status || ''))
      throw new Error('Cancelled booking is already excluded from preferred stays.');
    const updates = {
      [path + '/status']: archived ? 'superseded' : (live.previousStatus || 'confirmed'),
      [path + '/previousStatus']: archived ? (live.status || 'confirmed') : null,
      [path + '/archivedAt']: archived ? Date.now() : null
    };
    if (archived) {
      for (const [key, selectedId] of Object.entries(tripData.hotelSelections || {}))
        if (selectedId === hotel.id || selectedId === hotel.originalId)
          updates['trip/hotelSelections/' + key] = null;
    }
    await update(ref(database), updates);
  };

  const importScreenshot = async (rows) => {
    editorOnly();
    if (!Array.isArray(rows) || rows.length > 100)
      throw new Error('Import an array of up to 100 bookings.');
    const updates = {};
    let added = 0, enriched = 0, duplicates = 0, unmatched = 0;
    const normalized = value => String(value || '').normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const pendingByDest = {};
    for (const row of rows) {
      if (!/confirm|booked/i.test(String(row.status || '')) ||
          /cancel/i.test(String(row.status || ''))) continue;
      const match = tripData.destinations.find(dest => cityMatches(row.city, dest.name));
      if (!match) { unmatched++; continue; }
      // Validate dates and duplicate fingerprints before preparing any database writes.
      const plan = screenshotImportPlan(tripData, match.id, [row]);
      const index = plan.destinationIndex;
      const existing = existingRecords(tripData, 'hotel', match.id).find(h =>
        normalized(h.name) === normalized(row.name) &&
        (!h.checkIn || h.checkIn === row.checkIn) &&
        (!h.checkOut || h.checkOut === row.checkOut));
      if (existing) {
        const additions = {
          checkIn: row.checkIn, checkOut: row.checkOut,
          ...(Number.isFinite(Number(row.price)) && row.price !== '' && row.price != null
            ? { price: Number(row.price), currency: row.currency || 'USD' } : {}),
          ...(row.cancellationPolicy ? { cancellationPolicy: String(row.cancellationPolicy).slice(0,200) } : {})
        };
        let changed = false;
        for (const [field,value] of Object.entries(additions)) {
          if (value !== '' && (existing[field] === '' || existing[field] == null)) {
            updates[existing.sourcePath + '/' + field] = value; changed = true;
          }
        }
        if (changed) enriched++; else duplicates++;
        continue;
      }
      if (!plan.accept.length) { duplicates++; continue; }
      const next = (tripData.destinations[index].hotels?.length || 0) +
        (pendingByDest[index] || 0);
      pendingByDest[index] = (pendingByDest[index] || 0) + 1;
      updates['trip/destinations/' + index + '/hotels/' + next] = {
        id: 'screenshot_' + index + '_' + next,
        name: String(row.name).slice(0,160), city: match.name,
        checkIn: row.checkIn, checkOut: row.checkOut,
        status: 'confirmed', source: 'Booking screenshot',
        ...(row.price != null && row.price !== '' && Number.isFinite(Number(row.price))
          ? { price: Number(row.price), currency: row.currency || 'USD' } : {}),
        ...(row.cancellationPolicy
          ? { cancellationPolicy: String(row.cancellationPolicy).slice(0,200) } : {})
      };
      added++;
    }
    if (Object.keys(updates).length) await update(ref(database), updates);
    return { added, enriched, duplicates, unmatched };
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
          ['home', 'Home'], ['destinations', 'Destinations'], ['budget', 'Budget'],
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
            <ArgentinaMap destinations={destinations} onOpenDestination={(id) => {
              setSelectedDestination(id);
              setCurrentTab('destinations');
            }} />
            <section className="trip-summary">
              <h2>Trip overview</h2>
              <div className="summary-item"><span>Travelers</span><span>5 people</span></div>
              <div className="summary-item"><span>Route stops</span><span>{destinations.length}</span></div>
              <div className="summary-item"><span>Active hotel selections</span>
                <span>{Object.values(tripData.hotelSelections || {}).filter(id => id && id !== 'none').length}</span></div>
              <div className="summary-item"><span>Gmail-linked records</span>
                <span>{Object.keys(tripData.emailImports || {}).length}</span></div>
              <div className="summary-item"><span>Status</span><span>Planning in progress</span></div>
            </section>
          </div>
        )}
        {currentTab === 'destinations' && (
          <DestinationDetail trip={tripData}
            destinations={destinations} selectedId={selectedDestination}
            onUpdateBooking={handleUpdateBooking}
            onUpdateCosts={handleUpdateCosts} userRole={userRole}
            onSelectPreferred={selectPreferred}
            onImportScreenshot={importScreenshot}
            onMoveStay={moveStay} onArchiveStay={setStayArchived}
          />
        )}
        {currentTab === 'budget' && <Budget tripData={tripData} />}
        {currentTab === 'gmail' && userRole === 'edit' &&
          <GmailSync currentEmail={userEmail} trip={tripData} />}
      </main>
      <footer className="footer">Argentina Trip Planner • Live trip data</footer>
    </div>
  );
}
