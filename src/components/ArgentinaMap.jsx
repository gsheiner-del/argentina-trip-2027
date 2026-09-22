import React, { useEffect, useMemo, useState } from 'react';
import { divIcon, latLngBounds } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '../styles/ArgentinaMap.css';

// City coordinates are fallbacks only. Explicit coordinates in trip data take precedence.
const CITY_COORDINATES = [
  { terms: ['buenos aires', 'ezeiza'], point: [-34.6037, -58.3816] },
  { terms: ['ushuaia'], point: [-54.8019, -68.303] },
  { terms: ['el chalten', 'chalten'], point: [-49.3315, -72.8868] },
  { terms: ['el calafate', 'calafate'], point: [-50.3379, -72.2648] },
  { terms: ['bariloche'], point: [-41.1335, -71.3103] },
  { terms: ['mendoza'], point: [-32.8895, -68.8458] },
  { terms: ['iguazu', 'iguassu'], point: [-25.5972, -54.5786] },
  { terms: ['puerto madryn'], point: [-42.7692, -65.0385] },
  { terms: ['trelew'], point: [-43.2533, -65.3094] },
  { terms: ['puerto natales'], point: [-51.7269, -72.506] },
  { terms: ['punta arenas'], point: [-53.1638, -70.9171] },
  { terms: ['santiago'], point: [-33.4489, -70.6693] }
];

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function validPoint(item) {
  if (!item) return null;
  const lat = Number(item.lat ?? item.latitude);
  const lng = Number(item.lng ?? item.lon ?? item.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 ? [lat, lng] : null;
}

function destinationPoint(destination) {
  const explicit = validPoint(destination.coordinates) || validPoint(destination.location);
  if (explicit) return explicit;
  const name = normalize(destination.name);
  const known = CITY_COORDINATES.find(({ terms }) => terms.some((term) => name.includes(term)));
  return known?.point || null;
}

function markerIcon(emoji, selected = false) {
  const text = String(emoji || '📍').replace(/[<>&"']/g, '');
  return divIcon({
    className: 'trip-map-marker',
    html: `<span class="trip-map-pin ${selected ? 'trip-map-pin-selected' : ''}">${text}</span>`,
    iconSize: [38, 42],
    iconAnchor: [19, 42],
    popupAnchor: [0, -34]
  });
}

function FitStops({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(latLngBounds(points), { padding: [36, 36], maxZoom: 9 });
    else if (points.length === 1) map.setView(points[0], 10);
  }, [map, points]);
  return null;
}

export default function ArgentinaMap({ destinations = [], onOpenDestination }) {
  const [selectedId, setSelectedId] = useState(null);
  const stops = useMemo(() => destinations
    .map((destination, order) => ({ destination, order, point: destinationPoint(destination) }))
    .filter(({ point }) => point), [destinations]);
  const bounds = useMemo(() => stops.map(({ point }) => point), [stops]);
  const missing = destinations.filter((destination) => !destinationPoint(destination));

  return (
    <section className="argentina-map-container">
      <div className="map-heading">
        <div>
          <h2>Interactive trip map</h2>
          <p>Stops come from your current trip data. Route lines are illustrative, not driving or flight directions.</p>
        </div>
        <span className="map-count">{stops.length} mapped stops</span>
      </div>
      <div className="map-layout">
        <div className="map-canvas">
          <MapContainer center={[-40.5, -65]} zoom={4} scrollWheelZoom={false}
            className="trip-leaflet-map">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={18}
            />
            <FitStops points={bounds} />
            {bounds.length > 1 &&
              <Polyline positions={bounds} pathOptions={{ color: '#386aa7', weight: 3, dashArray: '6 8', opacity: 0.75 }} />}
            {stops.map(({ destination, order, point }) => (
              <Marker key={destination.id || order} position={point}
                icon={markerIcon(destination.emoji, selectedId === destination.id)}
                eventHandlers={{ click: () => setSelectedId(destination.id) }}>
                <Popup>
                  <strong>{order + 1}. {destination.name}</strong><br />
                  {destination.dates || 'Dates not yet selected'}<br />
                  {destination.description && <span>{destination.description}<br /></span>}
                  {destination.hotels?.length > 0 && <span>{destination.hotels.length} accommodation option(s)<br /></span>}
                  <button type="button" className="map-popup-button"
                    onClick={() => onOpenDestination?.(destination.id)}>View destination</button>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
        <aside className="map-stop-list" aria-label="Trip stops">
          <h3>Trip stops</h3>
          {stops.map(({ destination, order }) => (
            <button type="button" key={destination.id || order}
              className={selectedId === destination.id ? 'map-stop active' : 'map-stop'}
              onClick={() => {
                setSelectedId(destination.id);
                onOpenDestination?.(destination.id);
              }}>
              <span className="map-stop-number">{order + 1}</span>
              <span><strong>{destination.emoji} {destination.name}</strong><small>{destination.dates}</small></span>
            </button>
          ))}
          {missing.length > 0 && (
            <div className="map-unmapped" role="note">
              Location needed for: {missing.map((dest) => dest.name).join(', ')}.
              Add coordinates to these destinations in Firebase to show them on the map.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
