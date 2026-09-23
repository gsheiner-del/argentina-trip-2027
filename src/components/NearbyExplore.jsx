import React, { useMemo, useState } from 'react';
import { existingRecords } from '../utils/tripReview.js';
import { groupHotelOptions } from '../utils/hotels.js';
import './NearbyExplore.css';

// These are clickable live Google Maps searches, NOT unverified named businesses.
const EXPLORE = [
  ['food', '🥩', 'Parrillas & steakhouses', 'parrilla steakhouse'],
  ['food', '🍲', 'Local restaurants', 'best local restaurants'],
  ['food', '🥟', 'Empanadas & casual food', 'empanadas casual food'],
  ['food', '☕', 'Coffee & breakfast', 'cafes breakfast'],
  ['food', '🍷', 'Wine bars & dining', 'wine bars'],
  ['sights', '🌄', 'Scenic viewpoints', 'scenic viewpoints'],
  ['sights', '🚶', 'Walks & parks', 'public parks walking trails'],
  ['sights', '🏛️', 'Museums & culture', 'museums cultural sights'],
  ['sights', '🛍️', 'Markets & local shops', 'local markets'],
  ['practical', '🛒', 'Groceries', 'supermarkets'],
  ['practical', '💊', 'Pharmacies', 'pharmacies'],
  ['practical', '🚕', 'Transport', 'taxi ranks transport']
];
const urlFor = query => 'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent(query);

export default function NearbyExplore({ destination, trip }) {
  const [category, setCategory] = useState('all');
  const hotels = useMemo(() => existingRecords(trip, 'hotel', destination.id),
    [trip, destination.id]);
  const groups = useMemo(() => groupHotelOptions(hotels), [hotels]);
  const selections = trip?.hotelSelections || {};
  const preferred = groups.flatMap(g => g.hotels).find(h =>
    Object.values(selections).includes(h.id));
  const anchor = preferred?.address
    ? preferred.address + ', ' + destination.name
    : preferred?.name
      ? preferred.name + ', ' + destination.name
      : destination.name + ', Argentina';
  const shown = EXPLORE.filter(([group]) => category === 'all' || category === group);
  return (
    <section className="nearby-explore">
      <h3>Explore near {destination.name}</h3>
      <p>Open current map results near {preferred ? 'your Preferred stay' : 'this city'}.
        Actual distances, availability and ratings are provided by Google Maps,
        not stored as unverified recommendations in the itinerary.</p>
      <p className="nearby-anchor">📍 Search around: {anchor}</p>
      <div className="nearby-filters" aria-label="Explore categories">
        {[['all', 'All places'], ['food', 'Food & coffee'], ['sights', 'Sights & shopping'],
          ['practical', 'Useful nearby']].map(([key, label]) =>
          <button key={key} type="button" className={category === key ? 'active' : ''}
            onClick={() => setCategory(key)}>{label}</button>)}
      </div>
      <div className="nearby-explore-grid">
        {shown.map(([group, emoji, label, query]) => <a key={label}
          href={urlFor(query + ' near ' + anchor)} target="_blank" rel="noopener noreferrer">
          <span>{emoji}</span><strong>{label}</strong>
          <small>Find on Google Maps ↗</small>
        </a>)}
      </div>
      {Array.isArray(destination.nearby) && destination.nearby.length > 0 && <>
        <h4>Existing trip recommendations</h4>
        <div className="nearby-explore-grid">
          {destination.nearby.map((place, index) => <a key={index}
            href={/^https:\/\//i.test(place.url || '') ? place.url :
              urlFor(place.name + ' ' + destination.name + ' Argentina')}
            target="_blank" rel="noopener noreferrer">
            <span>{place.icon || '📍'}</span><strong>{place.name}</strong>
            <small>{place.category || 'Local recommendation'}</small>
            {place.description && <small>{place.description}</small>}
            <small>Open map ↗</small>
          </a>)}
        </div>
      </>}
    </section>
  );
}
