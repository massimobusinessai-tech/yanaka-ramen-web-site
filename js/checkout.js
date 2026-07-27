/**
 * Yanaka Ramen — Checkout Module
 * Handles checkout form, pickup slots, payment, and confirmation
 */

const CheckoutModule = (() => {
  'use strict';

  let currentSlots = [];
  let selectedSlot = null;
  let isProcessing = false;
  let confirmedOrder = null;

  /**
   * Open checkout modal with cart data
   */
  async function openCheckout() {
    const items = CartModule.getItems();
    if (items.length === 0) return;

    // Check if open
    try {
      const hoursRes = await fetch('/api/hours');
      const hoursData = await hoursRes.json();
      document.getElementById('checkout-modal').classList.add('show');
      document.body.classList.add('menu-open');

      if (!hoursData.open) {
        document.getElementById('hours-warning').style.display = 'block';
        document.getElementById('hours-warning').textContent = 'Il ristorante è chiuso in questo momento. Torna durante l\'orario di apertura (12:00-15:00 / 19:00-23:00).';
        document.getElementById('pay-btn').disabled = true;
      } else {
        document.getElementById('hours-warning').style.display = 'none';
        document.getElementById('pay-btn').disabled = false;
      }

      renderPickupSlots(hoursData.slots || []);
    } catch {
      // If we can't check hours, still allow checkout
      document.getElementById('checkout-modal').classList.add('show');
      document.body.classList.add('menu-open');
    }

    renderCheckoutSummary();
    selectedSlot = null;
  }

  /**
   * Close checkout modal
   */
  function closeCheckout() {
    document.getElementById('checkout-modal').classList.remove('show');
    document.body.classList.remove('menu-open');
  }

  /**
   * Render pickup time slots
   */
  function renderPickupSlots(slots) {
    const container = document.getElementById('pickup-slots');
    currentSlots = slots;
    container.innerHTML = '';

    if (slots.length === 0) {
      container.innerHTML = '<p style="color:#999;font-size:0.9rem;grid-column:1/-1">Nessuna fascia oraria disponibile</p>';
      return;
    }

    slots.forEach(slot => {
      const btn = document.createElement('button');
      btn.className = 'pickup-slot' + (slot.available ? '' : '');
      if (!slot.available) btn.disabled = true;
      btn.dataset.time = slot.time;

      let label = slot.time;
      if (slot.available) {
        label += ' <span class="remaining">(' + slot.remaining + ' posti)</span>';
      } else {
        label += ' <span class="remaining">Completo</span>';
      }
      btn.innerHTML = label;

      btn.addEventListener('click', function() {
        container.querySelectorAll('.pickup-slot').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
        selectedSlot = this.dataset.time;
      });

      container.appendChild(btn);
    });
  }

  /**
   * Render order summary in checkout
   */
  function renderCheckoutSummary() {
    const container = document.getElementById('checkout-summary-items');
    const totalSpan = document.getElementById('checkout-summary-total');
    const items = CartModule.getItems();

    container.innerHTML = '';
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'checkout-summary-item';
      div.innerHTML =
        '<span>' + item.name + ' ×' + item.quantity + '</span>' +
        '<span>€' + (item.price * item.quantity).toFixed(2) + '</span>';
      container.appendChild(div);
    });

    totalSpan.textContent = '€' + CartModule.getTotal().toFixed(2);
  }

  /**
   * Submit checkout — creates Stripe Checkout Session
   */
  async function submitCheckout() {
    if (isProcessing) return;

    const name = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    const notes = document.getElementById('order-notes').value.trim();

    // Validate
    let valid = true;
    document.querySelectorAll('.form-group').forEach(el => el.classList.remove('error'));

    if (!name) {
      document.getElementById('name-error').parentElement.classList.add('error');
      valid = false;
    }
    if (!phone) {
      document.getElementById('phone-error').parentElement.classList.add('error');
      valid = false;
    }
    if (!selectedSlot) {
      alert('Seleziona un orario di ritiro');
      valid = false;
    }

    if (!valid) return;

    // Get cart items
    const items = CartModule.getItems().map(item => ({
      id: item.menuItemId,
      quantity: item.quantity
    }));

    // Build pickup time ISO string
    const now = new Date();
    const [hours, mins] = selectedSlot.split(':');
    const pickupDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hours), parseInt(mins));
    const pickupISO = pickupDate.toISOString();

    // Submit
    isProcessing = true;
    const payBtn = document.getElementById('pay-btn');
    payBtn.disabled = true;
    payBtn.classList.add('loading');
    payBtn.textContent = 'Elaborazione...';

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name,
          customerPhone: phone,
          pickupTime: pickupISO,
          notes: notes,
          items: items
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Errore durante il checkout. Riprova.');
        isProcessing = false;
        payBtn.disabled = false;
        payBtn.classList.remove('loading');
        payBtn.textContent = 'Paga con Stripe';
        return;
      }

      if (data.testMode) {
        // Test mode — order created without Stripe
        CartModule.clearCart();
        closeCheckout();
        showConfirmation(data.orderId);
        return;
      }

      if (data.url) {
        // Redirect to Stripe
        window.location.href = data.url;
      } else {
        alert('Errore: URL di pagamento non trovato');
        isProcessing = false;
        payBtn.disabled = false;
        payBtn.classList.remove('loading');
        payBtn.textContent = 'Paga con Stripe';
      }
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Errore di connessione. Riprova.');
      isProcessing = false;
      payBtn.disabled = false;
      payBtn.classList.remove('loading');
      payBtn.textContent = 'Paga con Stripe';
    }
  }

  /**
   * Show confirmation after successful payment
   */
  function showConfirmation(orderId) {
    confirmedOrder = orderId;
    // Show confirmation modal
    document.getElementById('confirmation-modal').classList.add('show');
    document.getElementById('confirm-order-id').textContent = orderId;

    // Get order details
    fetch('/api/order/' + orderId)
      .then(res => res.json())
      .then(data => {
        if (data.order) {
          const order = data.order;
          const pickupDate = new Date(order.pickupTime);
          const timeStr = pickupDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
          const dateStr = pickupDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

          document.getElementById('confirm-details').innerHTML =
            '<p><strong>Cliente:</strong> ' + order.customerName + '</p>' +
            '<p><strong>Ritiro:</strong> ' + dateStr + ' alle ' + timeStr + '</p>' +
            (order.notes ? '<p><strong>Note:</strong> ' + order.notes + '</p>' : '') +
            '<div class="confirmation-items" id="confirm-items"></div>' +
            '<p style="margin-top:0.75rem;font-weight:700;color:var(--yanaka-red);font-size:1.1rem"><strong>Totale:</strong> €' + order.total.toFixed(2) + '</p>';

          const itemsContainer = document.getElementById('confirm-items');
          if (itemsContainer && order.items) {
            order.items.forEach(item => {
              const div = document.createElement('div');
              div.className = 'confirmation-item';
              div.innerHTML = '<span>' + item.name + ' ×' + item.quantity + '</span><span>€' + (item.price * item.quantity).toFixed(2) + '</span>';
              itemsContainer.appendChild(div);
            });
          }
        }
      })
      .catch(() => {
        document.getElementById('confirm-details').innerHTML = '<p>Ordine confermato! Il tuo codice ritiro: <strong>' + orderId + '</strong></p>';
      });
  }

  /**
   * Handle Stripe return — check session status
   */
  async function checkStripeReturn() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const orderId = params.get('order');

    if (!sessionId && !orderId) return;

    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);

    if (sessionId || orderId) {
      try {
        const url = '/api/order-status?session_id=' + (sessionId || '') + '&order=' + (orderId || '');
        const res = await fetch(url);
        const data = await res.json();

        if (data.found && data.status === 'paid' && data.order) {
          CartModule.clearCart();
          showConfirmation(data.order.id);
        } else if (data.found && data.status === 'pending') {
          // Still processing — poll a few times
          let attempts = 0;
          const poll = setInterval(async () => {
            attempts++;
            const pollRes = await fetch(url);
            const pollData = await pollRes.json();
            if (pollData.found && pollData.status === 'paid' && pollData.order) {
              clearInterval(poll);
              CartModule.clearCart();
              showConfirmation(pollData.order.id);
            } else if (attempts > 10) {
              clearInterval(poll);
              document.getElementById('confirmation-modal').classList.add('show');
              document.getElementById('confirm-order-id').textContent = orderId || 'In elaborazione...';
              document.getElementById('confirm-details').innerHTML =
                '<p>Il pagamento è in fase di elaborazione. Riceverai una notifica a breve.</p>' +
                '<p>Se hai già pagato, contatta il ristorante al <strong>+39 055 202 3759</strong></p>';
            }
          }, 2000);
        }
      } catch {
        // Silent fail
      }
    }
  }

  /**
   * Close confirmation
   */
  function closeConfirmation() {
    document.getElementById('confirmation-modal').classList.remove('show');
    document.body.classList.remove('menu-open');
  }

  /**
   * Initialize checkout module
   */
  function init() {
    // Close checkout modal
    document.getElementById('checkout-close')?.addEventListener('click', closeCheckout);

    // Close confirmation modal
    document.getElementById('confirm-continue')?.addEventListener('click', () => {
      closeConfirmation();
    });

    // Pay button
    document.getElementById('pay-btn')?.addEventListener('click', submitCheckout);

    // Check for Stripe return
    checkStripeReturn();
  }

  return {
    init,
    openCheckout,
    closeCheckout,
    showConfirmation,
    checkStripeReturn
  };
})();