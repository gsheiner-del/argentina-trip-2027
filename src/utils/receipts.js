export const TRIP_PAYERS = [
  { id: 'gennady', name: 'Gennady' },
  { id: 'marina', name: 'Marina' },
  { id: 'michelle', name: 'Michelle' },
  { id: 'gilad', name: 'Gilad' },
  { id: 'ori', name: 'Ori' }
];

export function payerName(id) {
  return TRIP_PAYERS.find(person => person.id === id)?.name || '';
}

export function validateReceiptFile(file) {
  if (!file) return { ok: true };
  const type = String(file.type || '').toLowerCase();
  if (!type.startsWith('image/')) return { ok: false, error: 'Receipt must be an image.' };
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: 'Receipt image is empty.' };
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: 'Receipt image must be 8 MB or smaller.' };
  return { ok: true };
}

function safeSegment(value) {
  return String(value || 'unknown').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60) || 'unknown';
}

function extensionFor(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/heic' || type === 'image/heif') return type.slice(6);
  if (type === 'image/gif') return 'gif';
  return 'jpg';
}

export function receiptStoragePath(destinationId, category, file, now = Date.now(), nonce = '') {
  const stamp = Number.isFinite(now) ? Math.floor(now) : Date.now();
  const token = safeSegment(nonce || Math.random().toString(36).slice(2, 10));
  return ['receipts', safeSegment(destinationId), safeSegment(category),
    stamp + '-' + token + '.' + extensionFor(file)].join('/');
}
