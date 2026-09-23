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

// Date extraction deliberately uses only labelled booking/flight fields. A generic
// date in an email may be the booking date or free-cancellation deadline.
const MONTHS = {
  january: 1, jan: 1, enero: 1, february: 2, feb: 2, febrero: 2,
  march: 3, mar: 3, marzo: 3, april: 4, apr: 4, abril: 4,
  may: 5, mayo: 5, june: 6, jun: 6, junio: 6,
  july: 7, jul: 7, julio: 7, august: 8, aug: 8, agosto: 8,
  september: 9, sept: 9, sep: 9, septiembre: 9, setiembre: 9,
  october: 10, oct: 10, octubre: 10, november: 11, nov: 11, noviembre: 11,
  december: 12, dec: 12, diciembre: 12
};
function dateIso_(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  if (y < 2026 || y > 2032 || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m ||
      date.getUTCDate() !== d) return '';
  return String(y) + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function parseDate_(input) {
  const text = clean_(input).replace(/[,()]/g, ' ').replace(/\s+/g, ' ');
  let match = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (match) return dateIso_(match[1], match[2], match[3]);
  const months = Object.keys(MONTHS).join('|');
  match = text.match(new RegExp('\\b(' + months + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(20\\d{2})\\b'));
  if (match) return dateIso_(match[3], MONTHS[match[1]], match[2]);
  match = text.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:de\\s+)?(' +
    months + ')\\s+(?:de\\s+)?(20\\d{2})\\b'));
  if (match) return dateIso_(match[3], MONTHS[match[2]], match[1]);
  // Numeric dates are accepted ONLY when not ambiguous; "03/04/2027" requires
  // human review rather than silently swapping day and month.
  match = text.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})\b/);
  if (match) {
    const a = Number(match[1]), b = Number(match[2]);
    if (a > 12 && b <= 12) return dateIso_(match[3], b, a);
    if (b > 12 && a <= 12) return dateIso_(match[3], a, b);
  }
  return '';
}
function labelledLine_(body, labels) {
  const lines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const re = new RegExp('^(?:' + labels + ')(?:\\s+date)?\\s*:?\\s*(.*)$', 'i');
  for (let i = 0; i < lines.length; i++) {
    const found = lines[i].match(re);
    if (!found) continue;
    return (found[1] || '').trim() || lines[i + 1] || '';
  }
  return '';
}
function stayDates_(body) {
  let checkIn = parseDate_(labelledLine_(body,
    'check[ -]?in|arrival|entrada|fecha de entrada'));
  let checkOut = parseDate_(labelledLine_(body,
    'check[ -]?out|departure|salida|fecha de salida'));
  // Explicit "Stay ... to ..." wording, not unrelated cancellation deadlines.
  if (!checkIn || !checkOut) {
    const line = body.split(/\r?\n/).find(v => /^\s*(?:stay|dates of stay|estancia)\s*[: ]/i.test(v));
    if (line) {
      const parts = line.replace(/^\s*[^:]*?:\s*/, '').replace(/^\s*(?:stay|estancia)\s+/i, '')
        .split(/\s+(?:to|through|until|hasta)\s+|\s+[–—]\s+/i);
      if (parts.length === 2) {
        if (!checkIn) checkIn = parseDate_(parts[0]);
        if (!checkOut) checkOut = parseDate_(parts[1]);
      }
    }
  }
  if (checkIn && checkOut && checkOut <= checkIn) checkOut = '';
  return { checkIn, checkOut };
}
function price_(body) {
  const line = labelledLine_(body, 'total price|total amount|precio total|booking total');
  const text = String(line || '').replace(/,/g, '');
  const matched = text.match(/(US\$|USD|AR\$|ARS|ILS|₪)\s*(\d+(?:\.\d{1,2})?)/i);
  if (!matched) return {};
  const raw = matched[1].toUpperCase();
  const currency = raw === 'US$' || raw === 'USD' ? 'USD' :
    raw === 'AR$' || raw === 'ARS' ? 'ARS' : 'ILS';
  const value = Number(matched[2]);
  return Number.isFinite(value) && value >= 0 ? { price: value, currency } : {};
}
function flightFields_(subject, body) {
  const head = subject + '\n' + body.slice(0, 2800);
  const airline = /el al/i.test(head) ? 'EL AL' :
    /aerolineas argentinas|aerolíneas argentinas/i.test(head) ? 'Aerolíneas Argentinas' : '';
  const numberLine = labelledLine_(body, 'flight(?: number| no\\.?| #)?|vuelo(?: número)?');
  const flightMatch = (numberLine || subject).match(/\b(?:LY|AR|FO|LA|JA|IB|KL|AF|LH|UX)\s?\d{2,4}\b/i);
  const departureLine = labelledLine_(body, 'departure date|flight date|fecha de vuelo');
  const date = parseDate_(departureLine);
  const origin = labelledLine_(body, 'from|origin airport|departure airport');
  const destination = labelledLine_(body, 'to|destination airport|arrival airport');
  const airport = text => (String(text || '').match(/\b(?:TLV|EZE|AEP|USH|FTE|BRC|MDZ|IGR|REL|PMY|COR|SCL)\b/i) || [])[0] || '';
  return { airline, number: flightMatch ? flightMatch[0].replace(/\s+/g, '').toUpperCase() : '',
    date, from: airport(origin), to: airport(destination) };
}
function activityFields_(body) {
  const dateLine = labelledLine_(body, 'tour date|activity date|excursion date|fecha de excursión');
  return { date: parseDate_(dateLine),
    time: labelledLine_(body, 'meeting time|start time|hora de encuentro').slice(0, 55),
    meetingPoint: labelledLine_(body, 'meeting point|punto de encuentro').slice(0, 130) };
}

/** Read text and HTML separately: HTML anchors carry Booking.com reservation URLs. */
function bookingMetadata_(message) {
  const plain = message.getPlainBody() || '';
  const html = (typeof message.getBody === 'function' ? message.getBody() : '') || '';
  const stripped = html.replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const body = plain + '\n' + stripped;
  const field = labels => labelledLine_(body, labels).slice(0, 250);
  const confirmation = body.match(/(?:confirmation number|booking number|reservation number|numero de confirmacion|numero de reserva)\s*[:#]?\s*([0-9]{6,14})/i);
  const anchor = [...html.matchAll(/href\s*=\s*["'](https:\/\/[^"'<> ]+)["']/gi)]
    .map(x => x[1].replace(/&amp;/g, '&')).find(url => {
      try { const u = new URL(url); return /(^|\.)booking\.com$/i.test(u.hostname) &&
        /(?:booking|reservation|manage|confirmation)/i.test(u.pathname + u.search); }
      catch { return false; }
    });
  const email = field('(?:property |hotel )?e-?mail|contact email');
  const phone = field('(?:property |hotel )?(?:phone|telephone|tel\\.?|telefono)');
  const deadline = field('free cancellation until|cancel for free until|cancellation deadline|cancelacion gratuita hasta');
  const dateMatch = deadline.match(/20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}/);
  return {
    address: field('(?:property )?address|direccion'),
    phone: (phone.match(/\+?[0-9][0-9 ()-]{7,22}/) || [])[0] || '',
    propertyEmail: (email.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '',
    confirmationNumber: confirmation ? confirmation[1] : '',
    bookingLink: anchor || '',
    cancellationDeadline: dateMatch ? dateMatch[0].replace(' ', 'T') : ''
  };
}

function extract_(message) {
  const subject = message.getSubject() || '';
  const body = message.getPlainBody() || '';
  if (!onlyTripMessage_(subject, body)) return null;
  const cancellationFlag = /booking cancelle?d|booking canceled|reservation (?:has been )?cancelled|reserva cancelada/i.test(
    subject + ' ' + body.slice(0, 500));
  const category = category_(subject, body);
  let title = subject.replace(/^\s*(?:🛄\s*)?(?:Thanks!?\s*Your booking is confirmed at|You have a message from)\s*/i, '').trim();
  if (category === 'flight_extra') title = 'Airline seat / supplementary document';
  else if (category === 'flight') title = 'Flight or ticket — confirm details';
  if (cancellationFlag) title = 'Cancellation — review original email';
  const extracted = category === 'hotel' ? { ...stayDates_(body + '\n' + (typeof message.getBody === 'function' ? message.getBody() : '').replace(/<[^>]+>/g, '\n')), ...price_(body), ...bookingMetadata_(message) } :
    category === 'flight' || category === 'flight_extra'
      ? flightFields_(subject, body) : activityFields_(body);
  return {
    subject: subject.slice(0, 180),
    title: title.slice(0, 140),
    category,
    place: city_(subject, body),
    checkIn: extracted.checkIn || '',
    checkOut: extracted.checkOut || '',
    date: extracted.date || '',
    number: extracted.number || '',
    airline: extracted.airline || '',
    from: extracted.from || '',
    to: extracted.to || '',
    time: extracted.time || '',
    meetingPoint: extracted.meetingPoint || '',
    ...(Number.isFinite(extracted.price) ? { price: extracted.price, currency: extracted.currency } : {}),
    notes: '',
    ...(category === 'hotel' ? {
      address: extracted.address || '', phone: extracted.phone || '',
      propertyEmail: extracted.propertyEmail || '',
      confirmationNumber: extracted.confirmationNumber || '',
      bookingLink: extracted.bookingLink || '',
      cancellationDeadline: extracted.cancellationDeadline || ''
    } : {}),
    cancellationFlag,
    bookingGroup: bookingGroup_(subject, body),
    receivedAt: message.getDate().toISOString(),
    gmailUrl: 'https://mail.google.com/mail/u/0/#all/' + message.getId(),
    status: 'pending'
  };
}
function missingFields_(existing, parsed) {
  const allowed = ['checkIn', 'checkOut', 'date', 'number', 'airline', 'from', 'to',
    'time', 'meetingPoint', 'price', 'currency', 'place', 'address', 'phone', 'propertyEmail', 'confirmationNumber', 'bookingLink', 'cancellationDeadline'];
  const updates = {};
  for (const key of allowed) {
    if ((existing[key] == null || existing[key] === '') &&
        parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== '') {
      updates[key] = parsed[key];
    }
  }
  return updates;
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

/* Run once manually; then set a DAILY 12 AM–1 AM Asia/Jerusalem trigger. */
function syncGmailToFirebase() {
  checkAccount_();
  const label = GmailApp.getUserLabelByName(TRIP_CONFIG.label);
  if (!label) throw new Error('Gmail label not found: ' + TRIP_CONFIG.label);
  const existing = firebase_('get', TRIP_CONFIG.queuePath) || {};
  const trip = firebase_('get', 'trip') || {};
  const routeCities = (trip.destinations || []).map(d => clean_(d.name || ''));
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
        if (parsed) {
          // Known locations removed from the itinerary are archived, not shown in review.
          if (parsed.category === 'hotel' && parsed.place && routeCities.length && !routeCities.includes(clean_(parsed.place)))
            parsed.status = 'outside_itinerary';
          incoming[id] = parsed; matched++;
        }
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


/**
 * Run this function ONCE after replacing the old script. It enriches the
 * already-staged emails with missing dates/flight information and never
 * overwrites manually edited fields, statuses, notes or review decisions.
 * It does NOT re-stage dismissed emails and does NOT publish to the trip.
 */
function backfillGmailMetadata() {
  checkAccount_();
  const label = GmailApp.getUserLabelByName(TRIP_CONFIG.label);
  if (!label) throw new Error('Gmail label not found.');
  const existing = firebase_('get', TRIP_CONFIG.queuePath) || {};
  const changes = {};
  let examined = 0, enriched = 0;
  const pageSize = 100;
  for (let offset = 0; offset < 1000; offset += pageSize) {
    const threads = label.getThreads(offset, pageSize);
    if (!threads.length) break;
    for (const thread of threads) {
      for (const message of thread.getMessages()) {
        const id = 'm_' + message.getId();
        if (!existing[id]) continue;
        examined++;
        const parsed = extract_(message);
        if (!parsed) continue;
        const missing = missingFields_(existing[id], parsed);
        for (const [key, value] of Object.entries(missing)) {
          changes[id + '/' + key] = value;
          existing[id][key] = value;
        }
        if (Object.keys(missing).length) enriched++;
      }
    }
    if (threads.length < pageSize) break;
  }
  if (Object.keys(changes).length) firebase_('patch', TRIP_CONFIG.queuePath, changes);
  firebase_('patch', 'gmailImport/meta', {
    lastBackfillAt: new Date().toISOString(),
    backfillExamined: examined,
    backfillEnriched: enriched
  });
  Logger.log('Backfill complete: examined ' + examined + '; enriched ' + enriched +
    ' existing emails. All review statuses and manually entered fields were preserved.');
}

/** One-time full rescan: stage new messages and enrich existing review rows without
 * resetting decisions. Run manually after installing this version. */
function rescanAllTripMail() {
  syncGmailToFirebase();
  backfillGmailMetadata();
}

/** Install a daily time trigger for this function separately from Gmail sync.
 * Requires Apps Script MailApp authorization. The exact local deadline must
 * have been reviewed and saved in YYYY-MM-DDTHH:mm format. */
function sendCancellationReminders() {
  checkAccount_();
  const trip = firebase_('get', 'trip') || {};
  const sent = firebase_('get', 'gmailImport/cancellationRemindersSent') || {};
  const now = new Date();
  const records = [];
  const routeCities = new Set((trip.destinations || []).map(d => clean_(d.name || '')));
  for (const dest of trip.destinations || []) {
    for (const stay of dest.hotels || []) if (stay) records.push(stay);
  }
  for (const stay of Object.values(trip.hotelBookings || {}))
    if (stay && routeCities.has(clean_(stay.city || ''))) records.push(stay);
  const seen = new Set();
  for (const stay of records) {
    if (stay.outsideItinerary || stay.archived) continue;
    if (!/confirm|booked/i.test(stay.status || '') || /cancel/i.test(stay.status || '')) continue;
    if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stay.cancellationDeadline || '')) continue;
    // Without a verified property time zone, the deadline cannot be safely
    // converted to an instant. Use calendar dates to avoid false precision.
    const deadlineDate = new Date(stay.cancellationDeadline.slice(0, 10) + 'T00:00:00Z');
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const days = Math.round((deadlineDate - today) / 86400000);
    if (![7, 1].includes(days)) continue;
    const id = String(stay.id || stay.name + '_' + stay.checkIn).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 110);
    const key = id + '_' + stay.cancellationDeadline.replace(/[^0-9]/g, '') + '_' + days;
    if (sent[key] || seen.has(key)) continue;
    seen.add(key);
    MailApp.sendEmail('gsheiner@gmail.com',
      'Argentina 2027: cancellation deadline in ' + days + ' day(s) — ' + stay.name,
      'Stay: ' + stay.name + '\nDeadline (property local time): ' +
      stay.cancellationDeadline + '\nReview your original confirmation in Gmail before cancelling.');
    firebase_('patch', 'gmailImport/cancellationRemindersSent', { [key]: new Date().toISOString() });
  }
}
