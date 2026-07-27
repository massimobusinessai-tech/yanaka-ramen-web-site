/**
 * Netlify Function: Order Status
 * Checks Stripe session status and returns order info
 * Available at: /.netlify/functions/order-status
 */
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

export const handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const sessionId = params.session_id || '';
    const orderId = params.order || '';

    // Simple order lookup from query params
    if (!sessionId && !orderId) {
      return {
        statusCode: 404,
        body: JSON.stringify({ found: false, error: 'Nessun parametro fornito' })
      };
    }

    // Check Stripe session status
    if (STRIPE_SECRET_KEY && sessionId) {
      try {
        const stripe = new Stripe(STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid') {
          // Build order info from session metadata
          const metadata = session.metadata || {};
          const items = metadata.items ? JSON.parse(metadata.items) : [];
          const total = (session.amount_total || 0) / 100;

          return {
            statusCode: 200,
            body: JSON.stringify({
              found: true,
              status: 'paid',
              order: {
                id: orderId || sessionId.slice(-8),
                customerName: metadata.customerName || 'Cliente',
                customerPhone: metadata.customerPhone || '',
                pickupTime: metadata.pickupTime || '',
                items: items,
                total: total,
                paymentStatus: 'paid',
                status: 'paid'
              }
            })
          };
        }

        // Payment not yet completed
        return {
          statusCode: 200,
          body: JSON.stringify({
            found: true,
            status: 'pending',
            order: null
          })
        };
      } catch (stripeErr) {
        console.error('Stripe retrieve error:', stripeErr.message);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ found: false, error: 'Ordine non trovato' })
    };
  } catch (err) {
    console.error('Order status error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Errore nel recupero dello stato ordine' })
    };
  }
};