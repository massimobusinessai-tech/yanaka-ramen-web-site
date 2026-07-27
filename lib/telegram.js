/**
 * Telegram Bot notification module
 * Sends order notifications to the restaurant owner via Telegram Bot API
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

/**
 * Format order data into an HTML message for Telegram
 */
export function formatTelegramMessage(order) {
  // Build items list
  let itemsList = '';
  if (order.items && order.items.length > 0) {
    itemsList = order.items.map(item => {
      return '  • ' + item.name + ' ×' + item.quantity + ' — €' + (item.price * item.quantity).toFixed(2);
    }).join('\n');
  } else {
    itemsList = '  Nessun dettaglio disponibile';
  }

  // Format pickup time safely
  let pickupTimeStr = 'Da confermare';
  let pickupDateStr = '';
  if (order.pickupTime) {
    const pickupDate = new Date(order.pickupTime);
    if (!isNaN(pickupDate.getTime())) {
      pickupTimeStr = pickupDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      pickupDateStr = pickupDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' alle ';
    }
  }

  // Use raw emoji characters (not \u escapes — Telegram API renders them correctly)
  const msg = [
    '<b>🆕 NUOVO ORDINE #' + order.id + '</b>',
    '',
    '👤 <b>Cliente:</b> ' + (order.customerName || 'Non specificato'),
    '📞 <b>Telefono:</b> ' + (order.customerPhone || 'Non specificato'),
    '📅 <b>Ritiro:</b> ' + pickupDateStr + pickupTimeStr,
    order.notes ? '📝 <b>Note:</b> ' + order.notes : '',
    '',
    '🍜 <b>Piatti Ordinati:</b>',
    itemsList,
    '',
    '<b>💰 Totale: €' + order.total.toFixed(2) + '</b>',
    '',
    '✅ <b>Stato: PAGATO</b> (Stripe)',
    '🆔 <b>Ordine:</b> ' + order.id
  ].filter(Boolean).join('\n');

  return msg;
}

/**
 * Send order notification to Telegram
 * Handles errors gracefully without breaking order processing
 */
export async function sendTelegramOrderNotification(order) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env');
    return { sent: false, error: 'Telegram not configured' };
  }

  const message = formatTelegramMessage(order);
  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      console.error('Telegram API error:', result.description || response.statusText);
      return { sent: false, error: result.description || 'Telegram API error' };
    }

    console.log('Telegram notification sent for order', order.id);
    return { sent: true };
  } catch (err) {
    // Graceful error handling — don't break order processing
    console.error('Telegram send failed (non-fatal):', err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Send a test message to verify Telegram configuration
 */
export async function sendTelegramTestMessage() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return { success: false, error: 'Telegram not configured' };
  }

  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: '<b>Yanaka Ramen</b> — Sistema ordini attivo\nIl bot funziona correttamente!',
        parse_mode: 'HTML'
      })
    });

    return { success: response.ok };
  } catch (err) {
    return { success: false, error: err.message };
  }
}