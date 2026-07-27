/**
 * Yanaka Ramen — Admin Dashboard Module
 * Handles authentication and order management
 */

const AdminModule = (() => {
  'use strict';

  let authToken = localStorage.getItem('yanaka-admin-token');
  let orders = [];

  const STATUS_MAP = {
    pending: 'In attesa',
    paid: 'Pagato',
    preparing: 'In preparazione',
    ready: 'Pronto',
    completed: 'Completato',
    cancelled: 'Cancellato'
  };

  /**
   * Check if authenticated, show login if not
   */
  function checkAuth() {
    if (!authToken) {
      document.getElementById('login-view').style.display = 'block';
      document.getElementById('dashboard-view').style.display = 'none';
      return false;
    }
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';
    document.getElementById('test-telegram-btn').style.display = '';
    document.getElementById('logout-btn').style.display = '';
    return true;
  }

  /**
   * Login with password
   */
  async function login() {
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('login-error');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();

      if (data.admin && data.token) {
        authToken = data.token;
        localStorage.setItem('yanaka-admin-token', authToken);
        errorEl.style.display = 'none';
        checkAuth();
        loadOrders();
      } else {
        errorEl.textContent = 'Password non valida';
        errorEl.style.display = 'block';
      }
    } catch {
      errorEl.textContent = 'Errore di connessione';
      errorEl.style.display = 'block';
    }
  }

  /**
   * Logout
   */
  function logout() {
    authToken = null;
    localStorage.removeItem('yanaka-admin-token');
    document.getElementById('test-telegram-btn').style.display = 'none';
    document.getElementById('logout-btn').style.display = 'none';
    checkAuth();
  }

  /**
   * Load orders from API
   */
  async function loadOrders() {
    if (!authToken) return;

    try {
      const res = await fetch('/api/admin/orders', {
        headers: { Authorization: 'Bearer ' + authToken }
      });

      if (res.status === 401 || res.status === 403) {
        logout();
        return;
      }

      const data = await res.json();
      orders = data.orders || [];
      renderActiveOrders();
      renderCompletedOrders();
      renderStats();
    } catch {
      document.getElementById('orders-container').innerHTML =
        '<p class="admin-no-orders">Errore nel caricamento ordini</p>';
    }
  }

  /**
   * Render statistics
   */
  function renderStats() {
    const total = orders.length;
    const active = orders.filter(o => o.status !== 'completed').length;
    const pending = orders.filter(o => o.status === 'pending' || o.status === 'paid').length;
    const preparing = orders.filter(o => o.status === 'preparing').length;
    const completed = orders.filter(o => o.status === 'completed').length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-preparing').textContent = preparing;
    document.getElementById('stat-completed').textContent = completed;

    // Update tab badges
    document.getElementById('tab-active-count').textContent = active;
    document.getElementById('tab-completed-count').textContent = completed;
  }

  /**
   * Switch between tabs
   */
  function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector('.admin-tab[data-tab="' + tab + '"]').classList.add('active');
    document.getElementById('tab-content-' + tab).classList.add('active');
  }

  /**
   * Render active (non-completed) orders
   */
  function renderActiveOrders() {
    const container = document.getElementById('orders-container');
    const activeOrders = orders.filter(o => o.status !== 'completed');

    if (activeOrders.length === 0) {
      container.innerHTML = '<p class="admin-no-orders">Nessun ordine attivo</p>';
      return;
    }

    container.innerHTML = '';
    activeOrders.forEach(order => {
      container.appendChild(createOrderCard(order));
    });
  }

  /**
   * Render completed orders grouped by day
   */
  function renderCompletedOrders() {
    const container = document.getElementById('completed-orders-container');
    const completedOrders = orders
      .filter(o => o.status === 'completed')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (completedOrders.length === 0) {
      container.innerHTML = '<p class="admin-no-orders">Nessun ordine completato</p>';
      return;
    }

    // Group by date (day only)
    const groups = {};
    completedOrders.forEach(order => {
      const d = new Date(order.pickupTime || order.createdAt);
      const key = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(order);
    });

    container.innerHTML = '';
    Object.keys(groups).forEach(dateStr => {
      const dayTotal = groups[dateStr].reduce((sum, o) => sum + o.total, 0);
      const dayCount = groups[dateStr].length;

      const group = document.createElement('div');
      group.className = 'completed-day-group';

      group.innerHTML =
        '<div class="completed-day-header">' +
          '<div class="completed-day-date">📅 ' + dateStr + '</div>' +
          '<div class="completed-day-summary">' + dayCount + ' ordini — €' + dayTotal.toFixed(2) + '</div>' +
        '</div>' +
        '<div class="completed-day-orders"></div>';

      const ordersContainer = group.querySelector('.completed-day-orders');
      groups[dateStr].forEach(order => {
        ordersContainer.appendChild(createCompletedOrderCard(order));
      });

      container.appendChild(group);
    });
  }

  /**
   * Create a single order card (for active orders)
   */
  function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    card.id = 'order-' + order.id;

    const pickupDate = new Date(order.pickupTime);
    const timeStr = pickupDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const dateStr = pickupDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const createdDate = new Date(order.createdAt);
    const createdStr = createdDate.toLocaleString('it-IT');

    const itemsHtml = order.items.map(item =>
      '<div>' + item.name + ' ×' + item.quantity + ' — €' + (item.price * item.quantity).toFixed(2) + '</div>'
    ).join('');

    const actionsHtml = getActionsHtml(order);

    card.innerHTML =
      '<div class="order-card-header">' +
        '<div>' +
          '<div class="order-id">#' + order.id + '</div>' +
          '<div class="order-time">' + createdStr + '</div>' +
        '</div>' +
        '<div class="order-status-badge status-' + order.status + '">' + (STATUS_MAP[order.status] || order.status) + '</div>' +
      '</div>' +
      '<div class="order-card-info">' +
        '<div><strong>Cliente:</strong> ' + order.customerName + '</div>' +
        '<div><strong>Telefono:</strong> ' + order.customerPhone + '</div>' +
        '<div><strong>Ritiro:</strong> ' + dateStr + ' alle ' + timeStr + '</div>' +
        '<div><strong>Pagamento:</strong> ' + (order.paymentStatus === 'paid' ? '✅ Pagato' : '⏳ In attesa') + '</div>' +
        (order.notes ? '<div style="grid-column:1/-1"><strong>Note:</strong> ' + order.notes + '</div>' : '') +
      '</div>' +
      '<div class="order-card-items">' + itemsHtml + '</div>' +
      '<div class="order-card-total">Totale: €' + order.total.toFixed(2) + '</div>' +
      '<div class="order-actions">' + actionsHtml + '</div>';

    card.querySelectorAll('.order-action-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        updateOrderStatus(order.id, this.dataset.status);
      });
    });

    return card;
  }

  /**
   * Create a compact completed order card with delete button
   */
  function createCompletedOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'completed-order-card';
    card.id = 'completed-order-' + order.id;

    const pickupDate = new Date(order.pickupTime);
    const timeStr = pickupDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    const itemsHtml = order.items.map(item =>
      item.name + ' ×' + item.quantity
    ).join(', ');

    card.innerHTML =
      '<div class="completed-order-left">' +
        '<div class="completed-order-id">#' + order.id + '</div>' +
        '<div class="completed-order-customer">' + order.customerName + '</div>' +
        '<div class="completed-order-items">' + itemsHtml + '</div>' +
      '</div>' +
      '<div class="completed-order-right">' +
        '<div class="completed-order-time">' + timeStr + '</div>' +
        '<div class="completed-order-total">€' + order.total.toFixed(2) + '</div>' +
        '<button class="completed-order-delete" data-order-id="' + order.id + '" title="Elimina ordine">🗑️</button>' +
      '</div>';

    card.querySelector('.completed-order-delete').addEventListener('click', function() {
      deleteOrderById(order.id);
    });

    return card;
  }

  /**
   * Generate action buttons based on order status
   */
  function getActionsHtml(order) {
    const status = order.status;
    let html = '';

    const isActive = status !== 'completed' && status !== 'cancelled';
    if (!isActive) return '<span style="font-size:0.85rem;color:#999">Ordine ' + (status === 'completed' ? 'completato' : 'cancellato') + '</span>';

    if (status === 'pending' || status === 'paid') {
      html += '<button class="order-action-btn preparing" data-status="preparing">▶ Inizia Preparazione</button>';
    }
    if (status === 'preparing') {
      html += '<button class="order-action-btn ready" data-status="ready">✅ Pronto</button>';
    }
    if (status === 'ready') {
      html += '<button class="order-action-btn completed" data-status="completed">📦 Completa</button>';
    }
    if (status !== 'cancelled') {
      html += '<button class="order-action-btn cancel" data-status="cancelled">✕ Cancella</button>';
    }

    return html;
  }

  /**
   * Update order status via API
   */
  async function updateOrderStatus(orderId, newStatus) {
    try {
      const res = await fetch('/api/admin/order/' + orderId + '/status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + authToken
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Errore');
        return;
      }

      loadOrders();
    } catch {
      alert('Errore di connessione');
    }
  }

  /**
   * Delete an order with confirmation
   */
  function deleteOrderById(orderId) {
    const order = orders.find(o => o.id === orderId);
    const name = order ? order.customerName : orderId;
    if (!confirm('Eliminare permanentemente l\'ordine di ' + name + '?')) return;

    fetch('/api/admin/order/' + orderId, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + authToken }
    })
    .then(res => {
      if (!res.ok) throw new Error('Errore');
      loadOrders();
    })
    .catch(() => alert('Errore nell\'eliminazione'));
  }

  /**
   * Test Telegram notification
   */
  async function testTelegram() {
    try {
      const res = await fetch('/api/admin/test-telegram', {
        headers: { Authorization: 'Bearer ' + authToken }
      });
      const data = await res.json();

      if (data.success) {
        alert('✅ Messaggio di test Telegram inviato!');
      } else {
        alert('⚠️ Telegram: ' + (data.error || 'errore'));
      }
    } catch {
      alert('Errore di connessione');
    }
  }

  /**
   * Initialize admin module
   */
  function init() {
    // Login button
    document.getElementById('login-btn')?.addEventListener('click', login);

    // Login on Enter key
    document.getElementById('admin-password')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') login();
    });

    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', logout);

    // Test Telegram button
    document.getElementById('test-telegram-btn')?.addEventListener('click', testTelegram);

    // Tab switching
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        switchTab(this.dataset.tab);
      });
    });

    // Check auth
    if (checkAuth()) {
      loadOrders();
      // Auto-refresh every 30 seconds
      setInterval(loadOrders, 30000);
    }
  }

  return { init };
})();

// Init on page load
document.addEventListener('DOMContentLoaded', () => AdminModule.init());