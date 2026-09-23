import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
test('Home shows map first, trip overview below, without duplicate Route or Map tabs', () => {
  const home = app.indexOf("{currentTab === 'home' && (");
  const map = app.indexOf('<ArgentinaMap', home);
  const overview = app.indexOf('<section className="trip-summary">', home);
  const end = app.indexOf("{currentTab === 'destinations' && (", home);
  assert.ok(home >= 0 && map > home && overview > map && end > overview);
  assert.equal(app.includes("['route', 'Route']"), false);
  assert.equal(app.includes("['map', 'Interactive map']"), false);
  assert.equal(app.includes('<RouteMap'), false);
  assert.equal(app.slice(home, end).includes('quick-route'), false);
  assert.ok(app.includes("['hotels', 'Hotels & bookings']"));
});