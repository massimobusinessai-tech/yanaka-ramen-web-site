/**
 * Netlify Function: Stripe Checkout
 * Creates a Stripe Checkout Session for order payment
 * Available at: /.netlify/functions/checkout
 */
import Stripe from 'stripe';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

// Menu loading
function loadMenu() {
  // Try multiple paths for the menu.json
  const paths = [
    join(__dirname, '..', '..', 'data', 'menu.json'),
    join(__dirname, '..', '..', 'menu.json'),
    join(process.cwd(), 'data', 'menu.json'),
    join(process.cwd(), 'menu.json')
  ];

  for (const p of paths) {
    try {
      if (existsSync(p)) {
        const raw = readFileSync(p, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {}
  }
  return [];
}

function getItemById(id) {
  return loadMenu().find(item => item.id === id) || null;
}

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

export const handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Check Stripe is configured
  if (!STRIPE_SECRET_KEY) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        testMode: true,
        message: 'Stripe non configurato. Visita /admin.html per gestire gli ordini.'
      })
    };
  }

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const { customerName, customerPhone, pickupTime, notes, items: cartItems } = JSON.parse(event.body);

    // Validate
    if (!customerName || !customerName.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Il nome è obbligatorio' }) };
    }
    if (!customerPhone || !customerPhone.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Il telefono è obbligatorio' }) };
    }
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Il carrello è vuoto' }) };
    }

    // Validate items against server menu
    const validation = validateCartItems(cartItems);
    if (!validation.valid) {
      return { statusCode: 400, body: JSON.stringify({ error: validation.errors.join(', ') }) };
    }

    // Create Stripe Checkout Session
    const lineItems = validation.items.map(item => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.name,
          description: 'Quantità: ' + item.quantity
        },
        unit_amount: Math.round(item.price * 100)
      },
      quantity: item.quantity
    }));

    const BASE_URL = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_creation: 'if_required',
      metadata: {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        pickupTime: pickupTime || '',
        notes: notes || '',
        items: JSON.stringify(validation.items)
      },
      success_url: BASE_URL + '/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: BASE_URL + '/#menu'
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        sessionId: session.id,
        url: session.url
      })
    };
  } catch (err) {
    console.error('Checkout error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Errore durante la creazione del checkout' })
    };
  }
};