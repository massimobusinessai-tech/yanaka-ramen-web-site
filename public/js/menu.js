/**
 * Yanaka Ramen — Menu Module
 * Handles menu data loading, category filtering, and rendering
 */

const MenuModule = (() => {
  'use strict';

  let menuData = null;
  let activeCategory = 'antipasti';

  /**
   * Load menu from API
   */
  async function loadMenu() {
    try {
      const res = await fetch('/api/menu');
      const data = await res.json();
      menuData = data.categories || {};
      return data;
    } catch (err) {
      console.error('Errore caricamento menu:', err);
      document.getElementById('menu-grid-container').innerHTML =
        '<p class="menu-loading">Errore nel caricamento del menu. Riprova più tardi.</p>';
      return null;
    }
  }

  /**
   * Render a single menu item card
   */
  function renderMenuItem(item) {
    const div = document.createElement('div');
    div.className = 'menu-item';
    div.dataset.menuId = item.id;

    const priceFormatted = '€' + item.price.toFixed(2).replace('.', ',');

    div.innerHTML =
      '<div class="menu-item-name">' + item.name + '</div>' +
      '<div class="menu-item-desc">' + item.description + '</div>' +
      '<div class="menu-item-actions">' +
        '<span class="menu-item-price">' + priceFormatted + '</span>' +
        '<button class="btn-add" data-menu-id="' + item.id + '">+ Aggiungi</button>' +
      '</div>';

    // Add event listener for the add button
    div.querySelector('.btn-add').addEventListener('click', function(e) {
      e.stopPropagation();
      CartModule.addItem(item);
      // Visual feedback
      const btn = this;
      btn.textContent = 'Aggiunto!';
      btn.classList.add('added');
      setTimeout(() => {
        btn.textContent = '+ Aggiungi';
        btn.classList.remove('added');
      }, 1000);
    });

    return div;
  }

  /**
   * Render a category's grid of menu items
   */
  function renderCategory(category) {
    const items = menuData[category];
    if (!items) return;

    const grid = document.getElementById('menu-grid-container');
    const contentDiv = document.getElementById('menu-content-' + category);

    if (!contentDiv) return;

    const gridEl = contentDiv.querySelector('.menu-grid') || contentDiv;
    gridEl.innerHTML = '';

    items.forEach(item => {
      gridEl.appendChild(renderMenuItem(item));
    });
  }

  /**
   * Switch active category
   */
  function showCategory(category) {
    if (activeCategory === category) return;
    activeCategory = category;

    // Update tab buttons
    document.querySelectorAll('.menu-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === category);
    });

    // Update content visibility
    document.querySelectorAll('.menu-content').forEach(el => {
      el.classList.toggle('active', el.id === 'menu-content-' + category);
    });
  }

  /**
   * Initialize menu: load data and render all categories
   */
  async function init() {
    const data = await loadMenu();
    if (!data) return;

    // Create content divs for each category
    const categories = ['antipasti', 'gyoza', 'sando', 'ramen', 'donburi', 'dolci'];
    const container = document.getElementById('menu-grid-container');
    container.innerHTML = ''; // Clear the loading message

    categories.forEach(cat => {
      const div = document.createElement('div');
      div.className = 'menu-content' + (cat === activeCategory ? ' active' : '');
      div.id = 'menu-content-' + cat;

      const grid = document.createElement('div');
      grid.className = 'menu-grid';
      div.appendChild(grid);

      container.appendChild(div);

      // Render items for this category
      const items = data.categories[cat];
      if (items) {
        items.forEach(item => {
          grid.appendChild(renderMenuItem(item));
        });
      }
    });
  }

  return {
    init,
    showCategory,
    getMenuData: () => menuData,
    getItemById: (id) => {
      if (!menuData) return null;
      for (const cat in menuData) {
        const found = menuData[cat].find(item => item.id === id);
        if (found) return found;
      }
      return null;
    }
  };
})();

// Expose showMenuCategory for onclick attributes
window.showMenuCategory = function(category) {
  MenuModule.showCategory(category);
};