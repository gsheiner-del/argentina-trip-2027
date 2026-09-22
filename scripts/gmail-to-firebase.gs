/**
 * Argentina Trip 2027 — private Gmail -> Firebase staging import.
 * Run as gsheiner@gmail.com. No message body or booking PIN is stored in Firebase.
 * Required Script Property: FIREBASE_SERVICE_ACCOUNT_JSON (entire service-account JSON).
 * Before use: configure Firebase Database Rules as described in GMAIL_SYNC.md.
 */
const TRIP_CONFIG = {
  label: 'Argentina2027',
  expectedAccount: 'gsheiner@gmail.com',
  databaseUrl: 'https://argentina-trip-2027-default-rtdb.firebaseio.com',
  queuePath: 'gmailImport/reviewQueue'
};

const LOCATIONS = [
  ['ushuaia', 'Ushuaia'], ['el chalten', 'El Chaltén'], ['el calafate', 'El Calafate'],
  ['buenos aires', 'Buenos Aires'], ['bariloche', 'Bariloche'], ['mendoza', 'Mendoza'],
  ['puerto iguazu', 'Puerto Iguazú'], ['iguazu', 'Puerto Iguazú'],
  ['puerto madryn', 'Puerto Madryn'], ['trelew', 'Trelew'],
  ['puerto natales', 'Puerto Natales'], ['punta arenas', 'Punta Arenas']
];

function clean_(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function onlyTripMessage_(subject, body) {
  const text = clean_(subject + ' ' + body.slice(0, 6000));
  if (/verification code|verify email|one.time (code|password)|security code|sign.in code/.test(text.slice(0, 500))) return false;
  const hasTripYear = /2027/.test(text);
  const mentionsRegion = /argentin|patagoni|aerolineas|el al|buenos aires|ushuaia|el chalten|el calafate|bariloche|mendoza|iguazu/.test(text);
  const airlineDocument = /el al|aerolineas/.test(text.slice(0, 350)) &&
    /\b(bue|eze|aep|ush|fte|mdz|brc)\b/.test(text);
  // Carrier seat documents sometimes omit the travel year; stage them for review.
  return mentionsRegion && (hasTripYear || airlineDocument);
}

function category_(subject, body) {
  const title = clean_(subject);
  const text = clean_(subject + ' ' + body.slice(0, 1400));
  if (/electronic miscellaneous document|chargeable seat/.test(text)) return 'flight_extra';
  if (/booking.+(?:hotel|apartment|apart|alojamiento)|confirmed at|booking canceled/.test(title)) return 'hotel';
  if (/flight|itinerary|e.ticket|el al|aerolineas|boarding/.test(title)) return 'flight';
  if (/transfer|rent.a.car|car rental|shuttle/.test(title)) return 'transport';
  if (/booking|apartment|hotel|stay|alojamiento|cabanas|apart/.test(text)) return 'hotel';
  return 'other';
}

function city_(subject, body) {
  const subjectCity = LOCATIONS.find(([term]) => clean_(subject).includes(term));
  if (subjectCity) return subjectCity[1];
  const front = clean_(body.slice(0, 2500));
  const cities = LOCATIONS.filter(([term]) => front.includes(term))
    .map(([, city]) => city).filter((city, idx, all) => all.indexOf(city) === idx);
  // Multiple mentioned cities are common in itinerary/flight emails. Do not guess.
  return cities.length === 1 ? cities[0] : '';
}

function bookingGroup_(subject, body) {
  const booking = body.match(/(?:confirmation(?: number)?|booking (?:code|reference))\s*[:#]?\s*([A-Z0-9]{6,12})/i);
  const base = clean_(subject).replace(/[^a-z0-9]+/g, ' ').slice(0, 100);
  const key = (booking?.[1] || base).toUpperCase();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key);
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
}

function extract_(message) {
  const subject = message.getSubject() || '';
  const body = message.getPlainBody() || '';
  if (!onlyTripMessage_(subject, body)) return null;
  const cancellationFlag = /booking cancelle?d|booking canceled|reservation (?:has been )?cancelled|reserva cancelada/i.test(subject + ' ' + body.slice(0, 500));
  const category = category_(subject, body);
  let title = subject.replace(/^\s*(?:🛄\s*)?(?:Thanks!?\s*Your booking is confirmed at|You have a message from)\s*/i, '').trim();
  if (category === 'flight_extra') title = 'Airline seat / supplementary document';
  else if (category === 'flight') title = 'Flight or ticket — confirm details';
  if (cancellationFlag) title = 'Cancellation — review original email';
  return {
    subject: subject.slice(0, 180),
    title: title.slice(0, 140),
    category,
    place: city_(subject, body),
    checkIn: '',
    checkOut: '',
    notes: '',
    cancellationFlag,
    bookingGroup: bookingGroup_(subject, body),
    receivedAt: message.getDate().toISOString(),
    gmailUrl: 'https://mail.google.com/mail/u/0/#all/' + message.getId(),
    status: 'pending'
  };
}

function base64Url_(data) {
  return Utilities.base64EncodeWebSafe(data).replace(/=+$/, '');
}

function serviceAccount_() {
  const raw = PropertiesService.getScriptProperties().getProperty('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON Script Property.');
  const data = JSON.parse(raw);
  if (!data.client_email || !data.private_key) throw new Error('Invalid Firebase service account credentials.');
  return data;
}

function accessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('firebase-access-token');
  if (cached) return cached;
  const sa = serviceAccount_();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url_(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3300
  }));
  const unsigned = header + '.' + payload;
  const signature = Utilities.computeRsaSha256Signature(unsigned, sa.private_key);
  const assertion = unsigned + '.' + base64Url_(signature);
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }
  });
  if (response.getResponseCode() !== 200) throw new Error('Failed to obtain Firebase access token.');
  const token = JSON.parse(response.getContentText()).access_token;
  if (!token) throw new Error('Firebase access token was not returned.');
  cache.put('firebase-access-token', token, 3200);
  return token;
}

function firebase_(method, path, payload) {
  const url = TRIP_CONFIG.databaseUrl + '/' + path + '.json';
  const options = {
    method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + accessToken_() }
  };
  if (payload !== undefined) options.payload = JSON.stringify(payload);
  const res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300)
    throw new Error('Firebase returned HTTP ' + res.getResponseCode() + '. Check database permissions and service account.');
  return JSON.parse(res.getContentText() || 'null');
}

function checkAccount_() {
  const email = Session.getEffectiveUser().getEmail();
  if (email !== TRIP_CONFIG.expectedAccount)
    throw new Error('Run this script from the authorized Gmail account only: ' + TRIP_CONFIG.expectedAccount);
}

/** First run manually, then add a time-driven hourly trigger. */
function syncGmailToFirebase() {
  checkAccount_();
  const label = GmailApp.getUserLabelByName(TRIP_CONFIG.label);
  if (!label) throw new Error('Gmail label not found: ' + TRIP_CONFIG.label);
  const existing = firebase_('get', TRIP_CONFIG.queuePath) || {};
  const incoming = {};
  let matched = 0;
  const pageSize = 100;
  const maxThreads = 1000; // Increase only if your label is unusually large.
  for (let offset = 0; offset < maxThreads; offset += pageSize) {
    const threads = label.getThreads(offset, pageSize);
    if (!threads.length) break;
    for (const thread of threads) {
      for (const message of thread.getMessages()) {
        const id = 'm_' + message.getId();
        if (existing[id] || incoming[id]) continue; // Never reset past approvals.
        const parsed = extract_(message);
        if (parsed) { incoming[id] = parsed; matched++; }
      }
    }
    if (threads.length < pageSize) break;
  }
  if (matched) firebase_('patch', TRIP_CONFIG.queuePath, incoming);
  firebase_('put', 'gmailImport/meta', {
    lastSyncAt: new Date().toISOString(),
    newlyStaged: matched,
    label: TRIP_CONFIG.label
  });
  Logger.log('Staged ' + matched + ' new emails for manual review.');
}
