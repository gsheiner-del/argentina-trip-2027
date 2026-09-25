/**
 * Argentina Trip 2027 — private Gmail -> Firebase staging import.
 * Run as gsheiner@gmail.com. No message body or booking PIN is stored in Firebase.
 * Required Script Property: FIREBASE_SERVICE_ACCOUNT_JSON (entire service-account JSON).
 * Before use: configure Firebase Database Rules as described in GMAIL_SYNC.md.
 */
const IMPORTER_VERSION = '2026-09-25-elal-source-v7';
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
function flightFields_(subject, body, html) {
  const head = subject + '\n' + body.slice(0, 3500);
  const airline = /el al/i.test(head) ? 'EL AL' :
    /aerolineas argentinas|aerolíneas argentinas/i.test(head) ? 'Aerolíneas Argentinas' : '';
  // EL AL ticket receipts put route, flight, departure and arrival in a table,
  // rather than on individually labelled lines. Parse each HTML row as cells.
  const rows = [...String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(cell => cell[1].replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()))
    .filter(cells => cells.length >= 4);
  const airport = text => {
    const t = clean_(text);
    if (/\btlv\b|tel aviv|ben gurion/.test(t)) return 'TLV';
    if (/\beze\b|ministro pistarini|ezeiza/.test(t)) return 'EZE';
    if (/\baep\b|aeroparque/.test(t)) return 'AEP';
    return (String(text || '').match(/\b(?:USH|FTE|BRC|MDZ|IGR|REL|PMY|COR|SCL)\b/i) || [])[0] || '';
  };
  const segments = rows.map(cells => {
    const number = (cells.join(' ').match(/\b(?:LY|AR|FO|LA|JA|IB|KL|AF|LH|UX)\s?\d{2,4}\b/i) || [])[0];
    if (!number) return null;
    const dateTimes = cells.flatMap(cell => [...cell.matchAll(/(\d{1,2}:\d{2})\s*(\d{2}[A-Z]{3}20\d{2})/gi)]
      .map(m => ({ time: m[1], date: parseDate_(m[2].replace(/(\d{2})([A-Z]{3})(20\d{2})/i, '$1 $2 $3')) })));
    return { number: number.replace(/\s/g, '').toUpperCase(),
      from: airport(cells[0]), to: airport(cells[1]),
      date: dateTimes[0]?.date || '', departure: dateTimes[0]?.time || '',
      arrivalDate: dateTimes[1]?.date || '', arrival: dateTimes[1]?.time || '' };
  }).filter(x => x && x.from && x.to && x.date);
  // Multiple segments in one receipt must be reviewed as a round trip; never
  // silently turn the return flight into a duplicate outbound booking.

  // Forwarded EL AL receipts often arrive as plain-text columns instead of
  // HTML tables. Each leg follows: FROM, TO, LY flight, departure time/date,
  // arrival time/date. Detect both legs rather than mistaking the return
  // date for the outbound flight. Dates and times are never guessed.
  if (!segments.length) {
    const lines = String(body || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    const isCompactDate = /^\d{1,2}[a-z]{3}20\d{2}$/i;
    const compactDate = value => parseDate_(String(value || '')
      .replace(/^(\d{1,2})([a-z]{3})(20\d{2})$/i, '$1 $2 $3'));
    for (let i = 0; i < lines.length; i++) {
      const flight = lines[i].match(/^(LY|AR|FO|LA|JA|IB|KL|AF|LH|UX)\s?(\d{2,4})$/i);
      if (!flight) continue;
      const preceding = lines.slice(Math.max(0, i - 9), i)
        .map(line => airport(line)).filter(Boolean);
      // Two distinct terminal codes immediately before this flight.
      const route = preceding.slice(-2);
      if (route.length !== 2 || route[0] === route[1]) continue;
      const after = lines.slice(i + 1, i + 9);
      const stamps = [];
      for (let j = 0; j + 1 < after.length; j++) {
        const time = after[j].match(/^([01]?\d|2[0-3]):[0-5]\d$/);
        const date = isCompactDate.test(after[j + 1]) ? compactDate(after[j + 1]) : '';
        if (time && date) {
          stamps.push({ time: after[j], date });
          j++;
        }
      }
      if (stamps.length >= 2) {
        segments.push({
          number: flight[1].toUpperCase() + flight[2],
          from: route[0], to: route[1],
          date: stamps[0].date, departure: stamps[0].time,
          arrivalDate: stamps[1].date, arrival: stamps[1].time
        });
      }
    }
  }
  const first = segments[0];
  if (first) return { airline, ...first, segments };
  const numberLine = labelledLine_(body, 'flight(?: number| no\\.?| #)?|vuelo(?: número)?');
  const flightMatch = (numberLine || subject).match(/\b(?:LY|AR|FO|LA|JA|IB|KL|AF|LH|UX)\s?\d{2,4}\b/i);
  const departureLine = labelledLine_(body, 'departure date|flight date|fecha de vuelo');
  const origin = labelledLine_(body, 'from|origin airport|departure airport');
  const destination = labelledLine_(body, 'to|destination airport|arrival airport');
  return { airline, number: flightMatch ? flightMatch[0].replace(/\s+/g, '').toUpperCase() : '',
    date: parseDate_(departureLine), from: airport(origin), to: airport(destination),
    segments: [] };
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
  const confirmation = body.match(/(?:confirmation(?: number)?|booking number|reservation number|numero de confirmacion|numero de reserva)\s*[:#]?\s*([0-9]{6,14})/i);
  // Booking.com may use either a direct reservation URL or a tracking redirect.
  // Only direct booking.com URLs are offered as booking-management links.
  const anchor = [...html.matchAll(/href\s*=\s*["'](https:\/\/[^"'<> ]+)["']/gi)]
    .map(x => x[1].replace(/&amp;/g, '&')).find(url => {
      const host = (url.match(/^https:\/\/([^/:?#]+)/i) || [])[1] || '';
      return /(^|\.)booking\.com$/i.test(host) &&
        /(?:booking|reservation|manage|confirmation)/i.test(url);
    });
  const email = field('(?:property |hotel )?e-?mail|contact email');
  const phone = field('(?:property |hotel )?(?:phone|telephone|tel\\.?|telefono)');
  // Booking.com uses several plaintext and HTML arrangements for the
  // Cancellation cost table. Prefer the explicit zero-fee window:
  // "until March 7, 2027 11:59 PM: US$0".
  // Generic text such as "until 1 day before arrival" is intentionally
  // insufficient, since we must not invent a timezone-specific deadline.
  const cancellationSource = [plain, stripped].map(src => src
    .replace(/\u00a0|&nbsp;|&#160;/gi, ' ')
    .replace(/[ \t\r\n]+/g, ' '));
  let cancellationDeadline = '';
  const months = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
  const dateAndTime = '(' + months + '\\s+\\d{1,2},?\\s+20\\d{2}\\s+\\d{1,2}:\\d{2}\\s*[AP]M)';
  const zeroFee = '(?:US\\$|USD|AR\\$|ARS|ILS|₪|\\$)\\s*0(?:[.,]00?)?\\b';
  const explicitCost = new RegExp(
    'cancellation\\s+cost[\\s\\S]{0,400}?until\\s+' + dateAndTime +
    '\\s*:?\\s*(?:[-–•]\\s*)?' + zeroFee, 'i');
  const directDeadline = new RegExp(
    '(?:free\\s+cancellation\\s+(?:until|through)|cancel\\s+for\\s+free\\s+(?:until|through))\\s+' +
    dateAndTime, 'i');
  for (const source of cancellationSource) {
    const match = source.match(explicitCost) || source.match(directDeadline);
    if (!match) continue;
    const value = match[1];
    const isoDate = parseDate_(value);
    const time = value.match(/(\d{1,2}):(\d{2})\s*([AP])M/i);
    if (!isoDate || !time) continue;
    const hour = Number(time[1]) % 12 + (time[3].toUpperCase() === 'P' ? 12 : 0);
    cancellationDeadline = isoDate + 'T' + String(hour).padStart(2, '0') + ':' + time[2];
    break;
  }
  // Labelled ISO date-time is also unambiguous if explicitly described as a
  // cancellation deadline in this booking message.
  if (!cancellationDeadline) {
    const labelled = field('free cancellation until|cancel for free until|cancellation deadline|cancelacion gratuita hasta');
    const match = labelled.match(/(20\d{2}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    if (match && parseDate_(match[1])) cancellationDeadline = match[1] + 'T' + match[2];
  }
  return {
    address: field('(?:property )?address|location|direccion'),
    phone: (phone.match(/\+?[0-9][0-9 ()-]{7,22}/) || [])[0] || '',
    propertyEmail: (email.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '',
    confirmationNumber: anchor && confirmation ? confirmation[1] : '',
    bookingLink: anchor || '',
    cancellationDeadline
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
      ? flightFields_(subject, body, typeof message.getBody === 'function' ? message.getBody() : '') : activityFields_(body);
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
    departure: extracted.departure || '', arrival: extracted.arrival || '',
    arrivalDate: extracted.arrivalDate || '', segments: extracted.segments || [],
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

/** Join an EL AL ancillary/EMD email to a separately received itinerary.
 * The full booking code and passenger name are used IN MEMORY ONLY, never
 * written to Firebase or printed in Apps Script execution logs. An exact
 * booking code AND the exact passenger from the subject must match.
 * A common family booking code alone is NOT sufficient.
 */
function flightPairKey_(message) {
  const subject = String(message.getSubject() || '');
  if (!/el\s*al/i.test(subject)) return '';
  const passenger = subject.match(/\b([A-Z][A-Z'-]{1,})\/([A-Z][A-Z'-]{1,})\s*:/i);
  // Gmail's plain body and HTML body may differ, especially for forwarded
  // airline tickets. Check BOTH; never persist or log the matched code.
  const plain = String(message.getPlainBody() || '');
  const html = typeof message.getBody === 'function'
    ? String(message.getBody() || '') : '';
  const htmlText = html.replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/\s+/g, ' ');
  const body = plain + '\n' + htmlText;
  const code = body.match(/\bbooking\s+code\s*:?\s*([A-Z0-9]{5,12})\b/i);
  if (!passenger || !code) return '';
  return (passenger[1] + '/' + passenger[2] + ':' + code[1]).toUpperCase();
}
function flightSignature_(segments) {
  // Flights and dates must match. Ignore optional times here because one copy
  // of an EL AL email may omit them, whereas a forwarded ticket has both.
  return segments.map(leg =>
    [leg.number, leg.from, leg.to, leg.date].join('|')).join(';');
}
function buildFlightDonors_(messages) {
  const donorMap = {};
  const ambiguous = new Set();
  for (const message of messages) {
    const key = flightPairKey_(message);
    if (!key) continue;
    const parsed = extract_(message);
    if (!parsed || !Array.isArray(parsed.segments) ||
        parsed.segments.length < 1 ||
        parsed.segments.some(leg => !leg.number || !leg.date || !leg.from || !leg.to)) continue;
    const signature = flightSignature_(parsed.segments);
    const incumbent = donorMap[key];
    if (incumbent && incumbent.signature !== signature) {
      ambiguous.add(key);
      delete donorMap[key];
      continue;
    }
    if (ambiguous.has(key)) continue;
    // Prefer the most complete confirmed ticket copy; a missing optional field
    // in one email must not invalidate the matching full itinerary.
    const completeness = parsed.segments.reduce((n, leg) => n +
      ['departure', 'arrivalDate', 'arrival'].filter(f => leg[f]).length, 0);
    if (!incumbent || completeness > incumbent.completeness) {
      donorMap[key] = { signature, completeness, data: parsed };
    }
  }
  return { donorMap, ambiguous };
}
function linkedFlightDetails_(message, parsed, donors) {
  if (!parsed || !['flight', 'flight_extra'].includes(parsed.category)) return parsed;
  if (Array.isArray(parsed.segments) && parsed.segments.length) return parsed;
  const key = flightPairKey_(message);
  const donor = key && !donors.ambiguous.has(key) ? donors.donorMap[key] : null;
  if (!donor) return parsed;
  const keys = ['number', 'date', 'from', 'to', 'departure', 'arrival',
    'arrivalDate', 'segments', 'airline'];
  const result = { ...parsed };
  for (const field of keys) {
    if (result[field] == null || result[field] === '' ||
        (Array.isArray(result[field]) && !result[field].length)) {
      result[field] = donor.data[field];
    }
  }
  result.flightDetailsSource = 'Matching EL AL itinerary email';
  return result;
}
function allLabelMessages_(label) {
  const messages = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = label.getThreads(offset, 100);
    for (const thread of page) messages.push(...thread.getMessages());
    if (page.length < 100) break;
  }
  return messages;
}

function missingFields_(existing, parsed) {
  const allowed = ['checkIn', 'checkOut', 'date', 'number', 'airline', 'from', 'to',
    'departure', 'arrival', 'arrivalDate', 'segments', 'time', 'meetingPoint', 'price', 'currency', 'place', 'address', 'phone', 'propertyEmail', 'confirmationNumber', 'bookingLink', 'cancellationDeadline', 'flightDetailsSource'];
  const updates = {};
  for (const key of allowed) {
    const empty = existing[key] == null || existing[key] === '' ||
      (Array.isArray(existing[key]) && existing[key].length === 0);
    const incoming = parsed[key] !== undefined && parsed[key] !== null &&
      parsed[key] !== '' && (!Array.isArray(parsed[key]) || parsed[key].length > 0);
    if (empty && incoming) {
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
  const messages = allLabelMessages_(label);
  const donors = buildFlightDonors_(messages);
  for (const message of messages) {
    const id = 'm_' + message.getId();
    if (existing[id] || incoming[id]) continue; // Never reset past approvals.
    const parsed = linkedFlightDetails_(message, extract_(message), donors);
    if (parsed) {
      if (parsed.category === 'hotel' && parsed.place && routeCities.length &&
          !routeCities.includes(clean_(parsed.place))) parsed.status = 'outside_itinerary';
      incoming[id] = parsed;
      matched++;
    }
  }
  if (matched) firebase_('patch', TRIP_CONFIG.queuePath, incoming);
  firebase_('put', 'gmailImport/meta', {
    lastSyncAt: new Date().toISOString(),
    newlyStaged: matched,
    label: TRIP_CONFIG.label,
    importerVersion: IMPORTER_VERSION
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
  const messages = allLabelMessages_(label);
  const donors = buildFlightDonors_(messages);
  for (const message of messages) {
    const id = 'm_' + message.getId();
    if (!existing[id]) continue;
    examined++;
    const parsed = linkedFlightDetails_(message, extract_(message), donors);
    if (!parsed) continue;
    const missing = missingFields_(existing[id], parsed);
    for (const [key, value] of Object.entries(missing)) {
      changes[id + '/' + key] = value;
      existing[id][key] = value;
    }
    if (Object.keys(missing).length) enriched++;
  }
  if (Object.keys(changes).length) firebase_('patch', TRIP_CONFIG.queuePath, changes);
  firebase_('patch', 'gmailImport/meta', {
    lastBackfillAt: new Date().toISOString(),
    backfillExamined: examined,
    backfillEnriched: enriched,
    importerVersion: IMPORTER_VERSION
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

/**
 * Read-only diagnostic: NO raw mail content, passenger identifiers or booking
 * codes are logged. This function DOES NOT modify Firebase.
 *
 * Run diagnoseGmailSync once from Apps Script and share ONLY these aggregate
 * counters from Execution log (never Script Properties or credential JSON).
 * It distinguishes the wrong script version, unrecognized Gmail messages,
 * missing source metadata and failed/previously completed Firebase backfill.
 */
function diagnoseGmailSync() {
  checkAccount_();
  const label = GmailApp.getUserLabelByName(TRIP_CONFIG.label);
  if (!label) throw new Error('Gmail label Argentina2027 was not found.');
  const current = firebase_('get', TRIP_CONFIG.queuePath) || {};
  const meta = firebase_('get', 'gmailImport/meta') || {};
  // Apps Script getThreads(start, max) accepts at most 500 per call.
  // Use paginated batches to avoid quota/argument errors on diagnosis.
  const allThreads = [];
  const pageSize = 100;
  for (let offset = 0; offset < 1000; offset += pageSize) {
    const page = label.getThreads(offset, pageSize);
    allThreads.push(...page);
    if (page.length < pageSize) break;
  }
  const counters = {
    importerVersion: IMPORTER_VERSION,
    lastSyncAt: meta.lastSyncAt || '(never)',
    lastBackfillAt: meta.lastBackfillAt || '(never)',
    previousBackfillExamined: meta.backfillExamined || 0,
    previousBackfillEnriched: meta.backfillEnriched || 0,
    firebaseQueueSize: Object.keys(current).length,
    gmailLabelThreads: allThreads.length,
    matchedMessages: 0,
    sourceRecognized: 0,
    extractionFailures: 0,
    linkedFlightEmails: 0,
    completeItineraryDonors: 0,
    ambiguousItineraries: 0,
    unmatchedAncillaryEmails: 0,
    firebaseIdsMatched: 0,
    rowsWithMissingFields: 0,
    fieldsReadyToFill: {},
    byType: {},
    sampleCategories: [],
    fieldCoverage: {
      hotel: { messages: 0, extracted: {}, stored: {}, bothEmpty: {} },
      flight: { messages: 0, extracted: {}, stored: {}, bothEmpty: {} },
      flight_extra: { messages: 0, extracted: {}, stored: {}, bothEmpty: {} },
      other: { messages: 0, extracted: {}, stored: {}, bothEmpty: {} }
    }
  };
  const donors = buildFlightDonors_(allThreads.flatMap(thread => thread.getMessages()));
  counters.completeItineraryDonors = Object.keys(donors.donorMap).length;
  counters.ambiguousItineraries = donors.ambiguous.size;
  // Aggregate stage counters identify which gate fails, without exposing
  // traveler names, message IDs, email text or private booking codes.
  counters.subjectAndBookingMatched = 0;
  counters.itinerariesWithSegments = 0;
  counters.matchableItineraries = 0;
  counters.unmatchedDueToMissingCodeOrSubject = 0;
  const allMessages = allThreads.flatMap(thread => thread.getMessages());
  for (const diagnosticMsg of allMessages) {
    const extracted = extract_(diagnosticMsg);
    const full = extracted?.category === 'flight' &&
      Array.isArray(extracted.segments) && extracted.segments.length;
    const linked = !!flightPairKey_(diagnosticMsg);
    if (linked) counters.subjectAndBookingMatched++;
    if (full) counters.itinerariesWithSegments++;
    if (full && linked) counters.matchableItineraries++;
    if (full && !linked) counters.unmatchedDueToMissingCodeOrSubject++;
  }
  for (const thread of allThreads) {
    for (const msg of thread.getMessages()) {
      const id = 'm_' + msg.getId();
      const present = current[id];
      if (present) counters.firebaseIdsMatched++;
      let parsed;
      try { parsed = linkedFlightDetails_(msg, extract_(msg), donors); } catch {
        counters.extractionFailures++;
        continue;
      }
      if (!parsed) continue;
      counters.matchedMessages++;
      if (parsed.flightDetailsSource) counters.linkedFlightEmails++;
      if (parsed.category === 'flight_extra' &&
          !(Array.isArray(parsed.segments) && parsed.segments.length)) {
        counters.unmatchedAncillaryEmails++;
      }
      counters.byType[parsed.category] = (counters.byType[parsed.category] || 0) + 1;
      const coverage = counters.fieldCoverage[parsed.category] || counters.fieldCoverage.other;
      coverage.messages++;
      const fields = parsed.category === 'hotel'
        ? ['checkIn', 'checkOut', 'address', 'phone', 'bookingLink', 'cancellationDeadline']
        : parsed.category === 'flight' || parsed.category === 'flight_extra'
          ? ['number', 'date', 'from', 'to', 'departure', 'arrival', 'segments']
          : ['date', 'time', 'meetingPoint'];
      for (const field of fields) {
        const hasValue = (object) => object &&
          object[field] != null && object[field] !== '' &&
          (!Array.isArray(object[field]) || object[field].length > 0);
        if (hasValue(parsed)) coverage.extracted[field] = (coverage.extracted[field] || 0) + 1;
        if (hasValue(present)) coverage.stored[field] = (coverage.stored[field] || 0) + 1;
        if (!hasValue(parsed) && !hasValue(present))
          coverage.bothEmpty[field] = (coverage.bothEmpty[field] || 0) + 1;
      }
      const populated = Object.keys(parsed).filter(key =>
        ['number','date','from','to','departure','arrival','segments','checkIn','checkOut',
          'address','phone','bookingLink','cancellationDeadline'].includes(key) &&
        parsed[key] != null && parsed[key] !== '' &&
        (!Array.isArray(parsed[key]) || parsed[key].length > 0));
      if (populated.length) counters.sourceRecognized++;
      if (present) {
        const missing = missingFields_(present, parsed);
        const keys = Object.keys(missing);
        if (keys.length) counters.rowsWithMissingFields++;
        for (const field of keys) {
          counters.fieldsReadyToFill[field] = (counters.fieldsReadyToFill[field] || 0) + 1;
        }
      }
    }
  }
  // Deliberately no message IDs, subjects, passenger data or booking credentials.
  Logger.log('Argentina Gmail diagnostics: ' + JSON.stringify(counters));
}
