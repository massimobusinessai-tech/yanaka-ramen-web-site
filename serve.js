import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import Stripe from 'stripe';
import 'dotenv/config';

// Lib modules
import { isCurrentlyOpen, isValidPickupTime, generatePickupSlots } from './lib/hours.js';
import {
  createOrder, getOrder, getOrderBySessionId, updateOrderStatus,
  getAllOrders, generateOrderId, markTelegramSent, deleteOrder
} from './lib/orders.js';
import { sendTelegramOrderNotification, sendTelegramTestMessage } from './lib/telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'http://localhost:' + PORT;

// ─── Stripe Init ─────────────────────────────────────────────────────────────
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// ─── Session Store (in-memory, maps Stripe session ID to pending order data) ──
const sessionStore = new Map();

// ─── Menu Cache ──────────────────────────────────────────────────────────────
let menuCache = null;
let menuCacheTime = 0;
const MENU_CACHE_TTL = 60000; // 1 minute

function loadMenu() {
  const now = Date.now();
  if (menuCache && (now - menuCacheTime) < MENU_CACHE_TTL) {
    return menuCache;
  }
  const menuPath = path.join(__dirname, 'data', 'menu.json');
  const raw = readFileSync(menuPath, 'utf-8');
  menuCache = JSON.parse(raw);
  menuCacheTime = now;
  return menuCache;
}

function getItemById(id) {
  return loadMenu().find(item => item.id === id) || null;
}

/**
 * Validate cart items against server-side menu.
 * Never trusts frontend prices.
 */
function validateCartItems(items) {
  const errors = [];
  const validatedItems = [];
  let total = 0;

  for (const item of items) {
    const menuItem = getItemById(item.id);
    if (!menuItem) {
      errors.push('Prodotto non trovato: ' + item.id);
      continue;
    }
    if (!menuItem.available) {
      errors.push('Prodotto non disponibile: ' + menuItem.name);
      continue;
    }
    const qty = Math.max(1, Math.min(99, parseInt(item.quantity, 10) || 1));
    const price = menuItem.price;
    total += price * qty;
    validatedItems.push({
      id: menuItem.id,
      name: menuItem.name,
      price: price,
      quantity: qty
    });
  }

  return { valid: errors.length === 0, errors, items: validatedItems, total };
}

// ─── Middleware ───────────────────────────────────────────────────────────────

// Stripe webhook route — MUST be before express.json() (needs raw body)
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(200).json({ received: true, note: 'Stripe not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const sessionId = session.id;

    // Check if order already exists (idempotency)
    const existingOrder = getOrderBySessionId(sessionId);
    if (existingOrder) {
      console.log('Order already processed for session:', sessionId);
      return res.json({ received: true });
    }

    // Reconstruct order from session store or metadata
    const storedData = sessionStore.get(sessionId);
    const metadata = session.metadata || {};

    const customerName = storedData?.customerName || metadata.customerName || 'Cliente';
    const customerPhone = storedData?.customerPhone || metadata.customerPhone || '';
    const pickupTime = storedData?.pickupTime || metadata.pickupTime || '';
    const itemsRaw = storedData?.items || (metadata.items ? JSON.parse(metadata.items) : []);
    const notes = storedData?.notes || metadata.notes || '';
    const total = (session.amount_total || 0) / 100;

    try {
      // Create the order
      const order = createOrder({
        customerName,
        customerPhone,
        pickupTime,
        items: itemsRaw,
        total,
        notes,
        stripeSessionId: sessionId,
        paymentStatus: 'paid'
      });

      // Send Telegram notification
      const notifResult = await sendTelegramOrderNotification(order);
      if (notifResult.sent) {
        markTelegramSent(order.id);
      }

      console.log('Order confirmed:', order.id);
    } catch (err) {
      console.error('Error processing completed order:', err);
    }
  }

  res.json({ received: true });
});

// Regular JSON parsing for all other routes
app.use(express.json());

// ─── API Routes ──────────────────────────────────────────────────────────────

/**
 * GET /api/menu
 * Returns the full menu or filtered by category
 */
app.get('/api/menu', (req, res) => {
  try {
    const menu = loadMenu();
    const category = req.query.category;

    if (category) {
      const filtered = menu.filter(item => item.category === category);
      const categoryMap = {};
      categoryMap[category] = filtered;
      res.json({ items: filtered, categories: categoryMap });
    } else {
      // Group by category for frontend convenience
      const categories = {};
      for (const item of menu) {
        if (!categories[item.category]) categories[item.category] = [];
        categories[item.category].push(item);
      }
      res.json({ items: menu, categories });
    }
  } catch (err) {
    console.error('Menu load error:', err);
    res.status(500).json({ error: 'Errore nel caricamento del menu' });
  }
});

/**
 * GET /api/hours
 * Returns opening status and available pickup slots
 */
app.get('/api/hours', (req, res) => {
  try {
    const status = isCurrentlyOpen();
    const slots = generatePickupSlots();

    res.json({
      open: status.open,
      currentWindow: status.currentWindow,
      slots
    });
  } catch (err) {
    console.error('Hours error:', err);
    res.status(500).json({ error: 'Errore nel recupero orari' });
  }
});

/**
 * GET /api/pickup-slots
 * Returns available pickup slots with availability
 */
app.get('/api/pickup-slots', (req, res) => {
  try {
    const slots = generatePickupSlots();
    res.json({ slots });
  } catch (err) {
    console.error('Pickup slots error:', err);
    res.status(500).json({ error: 'Errore nel recupero fasce orarie' });
  }
});

/**
 * POST /api/checkout
 * Creates a Stripe Checkout Session
 * Validates everything server-side
 */
app.post('/api/checkout', async (req, res) => {
  try {
    const { customerName, customerPhone, pickupTime, notes, items: cartItems } = req.body;

    // Validate required fields
    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ error: 'Il nome è obbligatorio' });
    }
    if (!customerPhone || !customerPhone.trim()) {
      return res.status(400).json({ error: 'Il telefono è obbligatorio' });
    }
    if (!pickupTime) {
      return res.status(400).json({ error: "L'orario di ritiro è obbligatorio" });
    }
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: 'Il carrello è vuoto' });
    }

    // Validate pickup time
    const timeValidation = isValidPickupTime(pickupTime);
    if (!timeValidation.valid) {
      return res.status(400).json({ error: timeValidation.error });
    }

    // Validate items against server menu (NEVER trust client prices)
    const validation = validateCartItems(cartItems);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(', ') });
    }

    // Generate order ID upfront for reference
    const orderId = generateOrderId();

    if (!stripe) {
      // Stripe not configured — create order directly (test/dev mode)
      const order = createOrder({
        orderId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        pickupTime,
        items: validation.items,
        total: validation.total,
        notes: notes || '',
        paymentStatus: 'paid'
      });

      const notifResult = await sendTelegramOrderNotification(order);
      if (notifResult.sent) {
        markTelegramSent(order.id);
      }

      return res.json({
        orderId: order.id,
        total: order.total,
        testMode: true,
        message: 'Ordine creato in modalità test (Stripe non configurato)'
      });
    }

    // Create Stripe Checkout Session
    const lineItems = validation.items.map(item => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.name,
          description: 'Quantità: ' + item.quantity
        },
        unit_amount: Math.round(item.price * 100) // Stripe uses cents
      },
      quantity: item.quantity
    }));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_creation: 'if_required',
      metadata: {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        pickupTime,
        notes: notes || '',
        orderId,
        items: JSON.stringify(validation.items)
      },
      success_url: BASE_URL + '/?session_id={CHECKOUT_SESSION_ID}&order=' + orderId,
      cancel_url: BASE_URL + '/#menu'
    });

    // Store pending order data for webhook processing
    sessionStore.set(session.id, {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickupTime,
      items: validation.items,
      notes: notes || '',
      total: validation.total,
      orderId
    });

    // Create pending order
    createOrder({
      orderId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickupTime,
      items: validation.items,
      total: validation.total,
      notes: notes || '',
      stripeSessionId: session.id,
      paymentStatus: 'pending'
    });

    res.json({
      sessionId: session.id,
      url: session.url,
      orderId
    });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Errore durante la creazione del checkout' });
  }
});

/**
 * GET /api/order-status
 * Check order status after Stripe redirect (used for polling)
 */
app.get('/api/order-status', (req, res) => {
  try {
    const sessionId = req.query.session_id;
    const orderId = req.query.order;

    let order = null;

    if (orderId) {
      order = getOrder(orderId);
    }
    if (!order && sessionId) {
      order = getOrderBySessionId(sessionId);
    }

    if (!order) {
      return res.status(404).json({ found: false, error: 'Ordine non trovato' });
    }

    if (order.paymentStatus === 'paid') {
      return res.json({ found: true, status: 'paid', order });
    }

    // Check with Stripe if payment went through
    if (stripe && sessionId) {
      stripe.checkout.sessions.retrieve(sessionId).then(session => {
        if (session.payment_status === 'paid') {
          // Update order
          updateOrderStatus(order.id, null, 'paid');
          order.paymentStatus = 'paid';

          // Send Telegram notification if not already sent
          sendTelegramOrderNotification(order).then(r => {
            if (r.sent) markTelegramSent(order.id);
          });

          return res.json({ found: true, status: 'paid', order });
        }

        return res.json({ found: true, status: order.paymentStatus, order });
      }).catch(() => {
        return res.json({ found: true, status: order.paymentStatus, order });
      });
    } else {
      return res.json({ found: true, status: order.paymentStatus, order });
    }
  } catch (err) {
    console.error('Order status error:', err);
    res.status(500).json({ error: 'Errore nel recupero dello stato ordine' });
  }
});

/**
 * GET /api/order/:id
 * Get order by ID
 */
app.get('/api/order/:id', (req, res) => {
  try {
    const order = getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }
    res.json({ order });
  } catch (err) {
    console.error('Order fetch error:', err);
    res.status(500).json({ error: 'Errore nel recupero ordine' });
  }
});

/**
 * POST /api/test-order
 * Create a test order directly without Stripe payment
 * Useful for testing the full flow (Telegram, admin, etc.)
 */
app.post('/api/test-order', async (req, res) => {
  try {
    const { customerName, customerPhone, pickupTime, notes, items: cartItems } = req.body;

    // Validate required fields
    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ error: 'Il nome è obbligatorio' });
    }
    if (!customerPhone || !customerPhone.trim()) {
      return res.status(400).json({ error: 'Il telefono è obbligatorio' });
    }
    if (!pickupTime) {
      return res.status(400).json({ error: "L'orario di ritiro è obbligatorio" });
    }
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: 'Il carrello è vuoto' });
    }

    // Validate items against server menu
    const validation = validateCartItems(cartItems);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(', ') });
    }

    // Create order directly with paymentStatus 'paid'
    const order = createOrder({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickupTime,
      items: validation.items,
      total: validation.total,
      notes: notes || '',
      paymentStatus: 'paid'
    });

    // Send Telegram notification
    const notifResult = await sendTelegramOrderNotification(order);
    if (notifResult.sent) {
      markTelegramSent(order.id);
    }

    res.json({
      orderId: order.id,
      total: order.total,
      testMode: true,
      telegramSent: notifResult.sent,
      message: 'Ordine di test creato con successo'
    });
  } catch (err) {
    console.error('Test order error:', err);
    res.status(500).json({ error: 'Errore nella creazione dell\'ordine di test' });
  }
});

// ─── Admin Routes ────────────────────────────────────────────────────────────

/**
 * Simple admin auth middleware
 */
function adminAuth(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  // No password set — allow access for development
  if (!adminPassword) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autenticazione richiesta' });
  }

  const token = authHeader.split(' ')[1];
  if (token !== adminPassword) {
    return res.status(403).json({ error: 'Password non valida' });
  }

  next();
}

/**
 * GET /api/admin/orders
 * Returns all orders (admin only)
 */
app.get('/api/admin/orders', adminAuth, (req, res) => {
  try {
    const orders = getAllOrders();
    res.json({ orders });
  } catch (err) {
    console.error('Admin orders error:', err);
    res.status(500).json({ error: 'Errore nel recupero ordini' });
  }
});

/**
 * PATCH /api/admin/order/:id/status
 * Update order status (admin only)
 */
app.patch('/api/admin/order/:id/status', adminAuth, (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Stato non valido: ' + validStatuses.join(', ') });
    }

    const order = updateOrderStatus(req.params.id, status, null);
    if (!order) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }

    res.json({ order });
  } catch (err) {
    console.error('Admin status update error:', err);
    res.status(500).json({ error: 'Errore nell\'aggiornamento dello stato' });
  }
});

/**
 * DELETE /api/admin/order/:id
 * Delete an order permanently (admin only)
 */
app.delete('/api/admin/order/:id', adminAuth, (req, res) => {
  try {
    const deleted = deleteOrder(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }

    res.json({ success: true, message: 'Ordine eliminato' });
  } catch (err) {
    console.error('Admin order delete error:', err);
    res.status(500).json({ error: 'Errore nell\'eliminazione dell\'ordine' });
  }
});

/**
 * POST /api/admin/login
 * Verify admin password and return token
 */
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    // No password set — allow access
    return res.json({ token: 'dev-mode', admin: true });
  }

  if (password === adminPassword) {
    return res.json({ token: adminPassword, admin: true });
  }

  res.status(401).json({ error: 'Password non valida' });
});

/**
 * GET /api/admin/test-telegram
 * Send test Telegram message
 */
app.get('/api/admin/test-telegram', adminAuth, async (req, res) => {
  try {
    const result = await sendTelegramTestMessage();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Static files & SPA fallback ─────────────────────────────────────────────
// Serve from /public first, then fall back to root files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Fallback: serve index.html for any unmatched route (SPA-like behavior)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('🍜 Yanaka Ramen — Server in esecuzione su http://localhost:' + PORT);
  console.log('   Menu API:     http://localhost:' + PORT + '/api/menu');
  console.log('   Orari API:    http://localhost:' + PORT + '/api/hours');
  console.log('   Admin:         http://localhost:' + PORT + '/admin.html');

  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('   ⚠️  Stripe non configurato (modalità test)');
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('   ⚠️  Telegram non configurato');
  }
  if (!process.env.ADMIN_PASSWORD) {
    console.log('   ⚠️  Admin password non configurata (accesso senza password)');
  }
});