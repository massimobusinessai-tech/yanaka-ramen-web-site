import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ORDERS_PATH = join(__dirname, '..', 'data', 'orders.json');
const DATA_DIR = dirname(ORDERS_PATH);

// Ensure data directory and file exist
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}
if (!existsSync(ORDERS_PATH)) {
  writeFileSync(ORDERS_PATH, '[]', 'utf-8');
}

/**
 * Load all orders from JSON file
 */
function loadOrders() {
  try {
    const raw = readFileSync(ORDERS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Save orders array to JSON file
 */
function saveOrders(orders) {
  writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2), 'utf-8');
}

/**
 * Generate a unique order ID: ORD-YYYYMMDD-XXXX
 */
export function generateOrderId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const dateStr = y + m + d;

  // 4 random alphanumeric chars
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return 'ORD-' + dateStr + '-' + rand;
}

/**
 * Create a new order
 */
export function createOrder({
  orderId,
  customerName,
  customerPhone,
  pickupTime,
  items,
  total,
  notes,
  stripeSessionId,
  paymentStatus
}) {
  const orders = loadOrders();

  const order = {
    id: orderId || generateOrderId(),
    customerName,
    customerPhone,
    pickupTime,
    items,
    total,
    notes: notes || '',
    status: 'pending',
    paymentStatus: paymentStatus || 'unpaid',
    stripeSessionId: stripeSessionId || '',
    createdAt: new Date().toISOString(),
    telegramSent: false
  };

  orders.push(order);
  saveOrders(orders);
  return order;
}

/**
 * Get an order by ID
 */
export function getOrder(orderId) {
  const orders = loadOrders();
  return orders.find(o => o.id === orderId) || null;
}

/**
 * Get an order by Stripe session ID
 */
export function getOrderBySessionId(sessionId) {
  const orders = loadOrders();
  return orders.find(o => o.stripeSessionId === sessionId) || null;
}

/**
 * Update order status and/or payment status
 */
export function updateOrderStatus(orderId, status, paymentStatus) {
  const orders = loadOrders();
  const index = orders.findIndex(o => o.id === orderId);
  if (index === -1) return null;

  if (status) orders[index].status = status;
  if (paymentStatus) orders[index].paymentStatus = paymentStatus;

  saveOrders(orders);
  return orders[index];
}

/**
 * Mark Telegram notification as sent
 */
export function markTelegramSent(orderId) {
  const orders = loadOrders();
  const index = orders.findIndex(o => o.id === orderId);
  if (index === -1) return null;

  orders[index].telegramSent = true;
  saveOrders(orders);
  return orders[index];
}

/**
 * Get all orders, newest first
 */
export function getAllOrders() {
  const orders = loadOrders();
  return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Delete an order by ID
 * Returns true if deleted, false if not found
 */
export function deleteOrder(orderId) {
  const orders = loadOrders();
  const index = orders.findIndex(o => o.id === orderId);
  if (index === -1) return false;

  orders.splice(index, 1);
  saveOrders(orders);
  return true;
}

export { loadOrders };