import React from 'react';
import './RouteMap.css';

export default function RouteMap({ destinations }) {
  return (
    <div className="route-map-container">
      <h2>Route Map</h2>
      <div className="route-timeline">
        {destinations && destinations.map((dest, idx) => (
          <div key={dest.id} className="timeline-item">
            <div className="timeline-dot"></div>
            <div className="timeline-content">
              <div className="timeline-date">{dest.dates}</div>
              <div className="timeline-location">{dest.emoji} {dest.name}</div>
              <div className="timeline-description">{dest.description}</div>
            </div>
            {idx < destinations.length - 1 && <div className="timeline-line"></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
