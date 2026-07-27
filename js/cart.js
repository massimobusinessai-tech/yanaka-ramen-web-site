/**
 * Yanaka Ramen — Cart Module
 * Manages cart state, localStorage persistence, and cart drawer UI
 */

const CartModule = (() => {
  'use strict';

  const STORAGE_KEY = 'yanaka-cart';
  let cartItems = [];
  let isOpen = false;

  /**
   * Load cart from localStorage
   */
  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      cartItems = raw ? JSON.parse(raw) : [];
    } catch {
      cartItems = [];
    }
    // Ensure all items have quantity > 0
    cartItems = cartItems.filter(item => item.quantity > 0);
  }

  /**
   * Save cart to localStorage
   */
  function saveCart() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
    updateBadge();
  }

  /**
   * Add item to cart (or increment quantity)
   */
  function addItem(menuItem) {
    const existing = cartItems.find(item => item.menuItemId === menuItem.id);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + 1, 99);
    } else {
      cartItems.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: 1
      });
    }
    saveCart();
    renderCart();
  }

  /**
   * Update item quantity
   */
  function updateQuantity(menuItemId, delta) {
    const item = cartItems.find(i => i.menuItemId === menuItemId);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
      cartItems = cartItems.filter(i => i.menuItemId !== menuItemId);
    } else if (item.quantity > 99) {
      item.quantity = 99;
    }
    saveCart();
    renderCart();
  }

  /**
   * Remove item from cart
   */
  function removeItem(menuItemId) {
    cartItems = cartItems.filter(i => i.menuItemId !== menuItemId);
    saveCart();
    renderCart();
  }

  /**
   * Clear entire cart
   */
  function clearCart() {
    cartItems = [];
    saveCart();
    renderCart();
  }

  /**
   * Get cart items
   */
  function getItems() {
    return [...cartItems];
  }

  /**
   * Get item count (sum of quantities)
   */
  function getItemCount() {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }

  /**
   * Get total price
   */
  function getTotal() {
    return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  /**
   * Update cart badge in navigation
   */
  function updateBadge() {
    const badge = document.getElementById('cart-badge');
    const count = getItemCount();
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  /**
   * Format price for display (€X,XX)
   */
  function formatPrice(amount) {
    return '€' + amount.toFixed(2).replace('.', ',');
  }

  /**
   * Render cart drawer contents
   */
  function renderCart() {
    const itemsContainer = document.getElementById('cart-items');
    const emptyEl = document.getElementById('cart-empty');
    const footerEl = document.getElementById('cart-footer');
    const totalSpan = document.getElementById('cart-total');
    const checkoutBtn = document.getElementById('checkout-btn');

    if (!itemsContainer) return;

    const count = getItemCount();

    // Show/hide empty state
    if (emptyEl) {
      emptyEl.style.display = count === 0 ? 'block' : 'none';
    }
    if (footerEl) {
      footerEl.style.display = count === 0 ? 'none' : 'block';
    }

    // Render items
    itemsContainer.innerHTML = '';
    cartItems.forEach(item => {
      const div = document.createElement('div');
      div.className = 'cart-item';
      div.innerHTML =
        '<div class="cart-item-info">' +
          '<div class="cart-item-name">' + item.name + '</div>' +
          '<div class="cart-item-price">' + formatPrice(item.price) + '</div>' +
        '</div>' +
        '<div class="cart-item-qty">' +
          '<button class="qty-btn" data-action="decrease" data-id="' + item.menuItemId + '">−</button>' +
          '<span class="qty-num">' + item.quantity + '</span>' +
          '<button class="qty-btn" data-action="increase" data-id="' + item.menuItemId + '">+</button>' +
        '</div>' +
        '<div class="cart-item-line-total">' + formatPrice(item.price * item.quantity) + '</div>';
      itemsContainer.appendChild(div);
    });

    // Attach quantity events
    itemsContainer.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.dataset.id;
        const action = this.dataset.action;
        updateQuantity(id, action === 'increase' ? 1 : -1);
      });
    });

    // Update total
    if (totalSpan) {
      totalSpan.textContent = formatPrice(getTotal());
    }

    // Enable/disable checkout button
    if (checkoutBtn) {
      checkoutBtn.disabled = count === 0;
    }

    updateBadge();
  }

  /**
   * Open cart drawer
   */
  function openCart() {
    if (isOpen) return;
    isOpen = true;
    renderCart();
    document.getElementById('cart-drawer').classList.add('open');
    document.getElementById('cart-overlay').classList.add('show');
    document.body.classList.add('menu-open');
  }

  /**
   * Close cart drawer
   */
  function closeCart() {
    if (!isOpen) return;
    isOpen = false;
    document.getElementById('cart-drawer').classList.remove('open');
    document.getElementById('cart-overlay').classList.remove('show');
    document.body.classList.remove('menu-open');
  }

  /**
   * Initialize cart module
   */
  function init() {
    loadCart();

    // Cart toggle button in nav
    const cartToggleNav = document.getElementById('cart-toggle-nav');
    if (cartToggleNav) {
      cartToggleNav.addEventListener('click', openCart);
    }

    // Cart overlay click to close
    const cartOverlay = document.getElementById('cart-overlay');
    if (cartOverlay) {
      cartOverlay.addEventListener('click', closeCart);
    }

    // Cart close button
    const cartClose = document.getElementById('cart-close');
    if (cartClose) {
      cartClose.addEventListener('click', closeCart);
    }

    // Checkout button
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        closeCart();
        CheckoutModule.openCheckout();
      });
    }

    renderCart();
  }

  return {
    init,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    getItems,
    getItemCount,
    getTotal,
    openCart,
    closeCart
  };
})();