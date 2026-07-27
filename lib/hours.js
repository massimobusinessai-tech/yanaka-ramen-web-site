import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Opening hours: every day of the week
const OPENING_HOURS = [
  { label: 'Pranzo', start: 12 * 60, end: 15 * 60 },   // 12:00 - 15:00
  { label: 'Cena', start: 19 * 60, end: 23 * 60 }        // 19:00 - 23:00
];

const MAX_ORDERS_PER_SLOT = parseInt(process.env.MAX_ORDERS_PER_SLOT || '5', 10);
const MIN_PREP_TIME_MINUTES = 30;
const SLOT_INTERVAL_MINUTES = 15;

/**
 * Get minutes since midnight for a given date
 */
function getMinutes(date) {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Get minutes since midnight for current server time
 */
function nowMinutes() {
  return getMinutes(new Date());
}

/**
 * Check if a given time (in minutes since midnight) falls within any opening window
 */
function isWithinWindow(mins) {
  return OPENING_HOURS.find(w => mins >= w.start && mins < w.end) || null;
}

/**
 * Check if the restaurant is currently open
 */
export function isCurrentlyOpen() {
  const now = nowMinutes();
  const window = isWithinWindow(now);
  return {
    open: !!window,
    currentWindow: window ? { ...window } : null
  };
}

/**
 * Validate a pickup time string (ISO format).
 * Must be within opening hours, at least MIN_PREP_TIME in the future,
 * and not exceed max orders per slot.
 */
export function isValidPickupTime(isoString) {
  const pickup = new Date(isoString);
  if (isNaN(pickup.getTime())) {
    return { valid: false, error: 'Orario non valido' };
  }

  const now = new Date();
  const diffMs = pickup.getTime() - now.getTime();

  // Must be at least MIN_PREP_TIME_MINUTES in the future
  if (diffMs < MIN_PREP_TIME_MINUTES * 60 * 1000) {
    return { valid: false, error: 'Seleziona un orario con almeno 30 minuti di anticipo' };
  }

  // Must be within an opening window
  const mins = getMinutes(pickup);
  const window = isWithinWindow(mins);
  if (!window) {
    return { valid: false, error: 'Il ristorante è chiuso in questo orario' };
  }

  // Check slot capacity
  const slotKey = getSlotKey(pickup);
  const orderCount = getOrdersForSlot(slotKey);
  if (orderCount >= MAX_ORDERS_PER_SLOT) {
    return { valid: false, error: 'Fascia oraria al completo' };
  }

  return { valid: true };
}

/**
 * Generate available pickup slots as 15-minute intervals
 * Returns array of { time: string (HH:MM), available: boolean, remaining: number }
 */
export function generatePickupSlots() {
  const now = new Date();
  const currentMins = nowMinutes();
  const slots = [];

  // Only generate slots if currently open
  const status = isCurrentlyOpen();
  if (!status.open) return slots;

  const window = status.currentWindow;
  const interval = SLOT_INTERVAL_MINUTES;

  // Start from max(now + MIN_PREP_TIME, window.start), rounded up to next interval
  let start = Math.max(currentMins + MIN_PREP_TIME_MINUTES, window.start);
  start = Math.ceil(start / interval) * interval;

  const end = window.end;

  for (let m = start; m < end; m += interval) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const timeStr = hh + ':' + mm;

    // Check capacity
    const slotDate = new Date(now);
    slotDate.setHours(Math.floor(m / 60), m % 60, 0, 0);
    const slotKey = getSlotKey(slotDate);
    const orderCount = getOrdersForSlot(slotKey);
    const remaining = MAX_ORDERS_PER_SLOT - orderCount;

    slots.push({
      time: timeStr,
      available: remaining > 0,
      remaining: Math.max(0, remaining)
    });
  }

  return slots;
}

/**
 * Get a slot key (YYYY-MM-DD-HH:MM rounded to 15min) for deduplication
 */
function getSlotKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(Math.floor(date.getMinutes() / 15) * 15).padStart(2, '0');
  return y + '-' + m + '-' + d + '-' + hh + ':' + mm;
}

/**
 * Count orders already booked for a given slot
 */
function getOrdersForSlot(slotKey) {
  try {
    const ordersPath = join(__dirname, '..', 'data', 'orders.json');
    const raw = readFileSync(ordersPath, 'utf-8');
    const orders = JSON.parse(raw);

    return orders.filter(o => {
      if (o.status === 'cancelled') return false;
      const oDate = new Date(o.pickupTime);
      return getSlotKey(oDate) === slotKey;
    }).length;
  } catch {
    return 0;
  }
}

export { MAX_ORDERS_PER_SLOT, MIN_PREP_TIME_MINUTES, OPENING_HOURS };