import React, { useState } from 'react';
import '../styles/ArgentinaMap.css';

export default function ArgentinaMap({ destinations }) {
  const [selectedDest, setSelectedDest] = useState(null);

  const coordinates = {
    ba1: { lat: -34.6, lng: -58.4 },
    ushuaia: { lat: -54.8, lng: -68.3 },
    chalten: { lat: -49.3, lng: -73.2 },
    calafate: { lat: -50.3, lng: -72.3 },
    mendoza: { lat: -32.9, lng: -68.8 },
    ba2: { lat: -34.6, lng: -58.4 }
  };

  const mapWidth = 500;
  const mapHeight = 700;
  const minLat = -56;
  const maxLat = -21;
  const minLng = -73.5;
  const maxLng = -53.5;

  const latToY = (lat) => ((maxLat - lat) / (maxLat - minLat)) * mapHeight;
  const lngToX = (lng) => ((lng - minLng) / (maxLng - minLng)) * mapWidth;

  return (
    <div className="argentina-map-container">
      <h2>Map of Argentina</h2>
      <div className="map-wrapper">
        <svg width={mapWidth} height={mapHeight} className="argentina-map-svg" viewBox={`0 0 ${mapWidth} ${mapHeight}`}>
          <path d="M 50 50 L 450 80 L 480 200 L 470 400 L 450 500 L 400 600 L 300 650 L 150 620 L 80 500 L 50 300 Z" fill="#f0f0f0" stroke="#999" strokeWidth="2"/>
          {destinations && destinations.map((dest) => {
            const coords = coordinates[dest.id];
            if (!coords) return null;
            const x = lngToX(coords.lng);
            const y = latToY(coords.lat);
            const isSelected = selectedDest?.id === dest.id;
            return (
              <g key={dest.id}>
                <circle cx={x} cy={y} r={isSelected ? 12 : 8} fill={isSelected ? '#667eea' : '#ff6b6b'} stroke="white" strokeWidth="2" style={{ cursor: 'pointer' }} onClick={() => setSelectedDest(dest)}/>
                <text x={x} y={y - (isSelected ? 18 : 14)} textAnchor="middle" fontSize={isSelected ? '20' : '16'} style={{ cursor: 'pointer', pointerEvents: 'none' }}>{dest.emoji}</text>
              </g>
            );
          })}
        </svg>
        {selectedDest && (
          <div className="dest-panel">
            <div className="panel-header">
              <h3>{selectedDest.emoji} {selectedDest.name}</h3>
              <button className="close-btn" onClick={() => setSelectedDest(null)}>✕</button>
            </div>
            <div className="panel-content">
              <p className="dates">📅 {selectedDest.dates}</p>
              <p className="description">{selectedDest.description}</p>
              {selectedDest.hotels && selectedDest.hotels.length > 0 && (
                <div className="hotels">
                  <strong>🏨 Hotels:</strong>
                  {selectedDest.hotels.map(hotel => (<div key={hotel.id} className="hotel-item">{hotel.name}</div>))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="map-legend">
        <p>💡 Click on any pin to see destination details</p>
      </div>
    </div>
  );
}
