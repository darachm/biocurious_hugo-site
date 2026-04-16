/* BioCurious Cart — plain JS, no dependencies */
(function () {
  'use strict';

  const CHECKOUT_ENDPOINT = '/.netlify/functions/create-checkout';

  let cart = [];

  /* ── Helpers ── */
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }
  function fmt(n) { return '$' + Number(n).toLocaleString(); }

  function getQty(card) {
    const v = card.querySelector('.qty-val');
    return v ? parseInt(v.textContent) : 1;
  }

  /* ── Cart logic ── */
  function addItem(card) {
    const id = card.dataset.id;
    const qty = getQty(card);
    if (cart.find(i => i.id === id)) {
      removeItem(id);
      return;
    }
    cart.push({
      id,
      name: card.dataset.name,
      price: parseFloat(card.dataset.price),
      setup: parseFloat(card.dataset.setup || 0),
      freq: card.dataset.freq,
      qty,
      hasQty: card.dataset.qty === 'true',
    });
    renderCart();
    updateButtons();
    openCart();
  }

  function removeItem(id) {
    cart = cart.filter(i => i.id !== id);
    renderCart();
    updateButtons();
  }

  function updateQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty = Math.max(1, item.qty + delta);
    renderCart();
  }

  function monthlyTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
  function setupTotal() { return cart.reduce((s, i) => s + i.setup, 0); }
  function todayTotal() { return monthlyTotal() + setupTotal(); }

  /* ── Render cart drawer ── */
  function renderCart() {
    const itemsEl = $('#cart-items');
    const footerEl = $('#cart-footer');
    const countEl = $('#cart-count');
    const fabEl = $('#cart-fab');
    const fabCount = $('#fab-count');
    const fabTotal = $('#fab-total');

    countEl.textContent = '(' + cart.length + ')';

    if (cart.length === 0) {
      itemsEl.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
      footerEl.style.display = 'none';
      fabEl.style.display = 'none';
      return;
    }

    fabEl.style.display = 'flex';
    fabCount.textContent = cart.length;
    fabTotal.textContent = fmt(todayTotal());
    footerEl.style.display = 'block';

    itemsEl.innerHTML = cart.map(item => `
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item-info">
          <strong>${item.name}${item.qty > 1 ? ' ×' + item.qty : ''}</strong>
          <span>${fmt(item.price * item.qty)}/${item.freq}${item.setup > 0 ? ' <em>+ ' + fmt(item.setup) + ' setup</em>' : ''}</span>
        </div>
        <div class="cart-item-actions">
          ${item.hasQty ? `
            <div class="qty-control">
              <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
              <span>${item.qty}</span>
              <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
            </div>` : ''}
          <button class="remove-btn" data-id="${item.id}">Remove</button>
        </div>
      </div>
    `).join('');

    // totals
    const mt = monthlyTotal(), st = setupTotal();
    $('#total-monthly').textContent = fmt(mt) + '/mo';
    const setupRow = $('#setup-row');
    if (st > 0) {
      setupRow.style.display = 'flex';
      $('#total-setup').textContent = fmt(st);
    } else {
      setupRow.style.display = 'none';
    }
    $('#total-today').textContent = fmt(mt + st);

    // bind item buttons
    $$('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeItem(btn.dataset.id)));
    $$('.qty-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        updateQty(btn.dataset.id, btn.dataset.action === 'inc' ? 1 : -1);
      });
    });
  }

  /* ── Update add-to-cart buttons ── */
  function updateButtons() {
    $$('[data-id]').forEach(card => {
      const btn = card.querySelector('.add-to-cart');
      if (!btn) return;
      const inCart = cart.find(i => i.id === card.dataset.id);
      if (inCart) {
        btn.textContent = '✓ In Cart — Remove';
        btn.classList.add('in-cart');
      } else {
        btn.textContent = card.closest('.membership-card') ? 'Add to Cart' : 'Add to Cart';
        btn.classList.remove('in-cart');
      }
    });
  }

  /* ── Drawer open/close ── */
  function openCart() {
    $('#cart-drawer').classList.add('open');
    $('#cart-overlay').classList.add('open');
  }
  function closeCart() {
    $('#cart-drawer').classList.remove('open');
    $('#cart-overlay').classList.remove('open');
  }

  /* ── Checkout modal ── */
  function openModal() {
    closeCart();
    const modal = $('#modal-overlay');
    modal.style.display = 'flex';

    // order summary
    const summary = $('#order-summary');
    summary.innerHTML = cart.map(i =>
      `<div class="summary-row"><span>${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}</span><span>${fmt(i.price * i.qty)}/mo</span></div>`
    ).join('') + (setupTotal() > 0 ? `<div class="summary-row setup"><span>Setup fee(s)</span><span>${fmt(setupTotal())}</span></div>` : '')
      + `<div class="summary-row total"><span>Today</span><span>${fmt(todayTotal())}</span></div>`;

    validateForm();
  }

  function closeModal() {
    $('#modal-overlay').style.display = 'none';
    $('#checkout-error').style.display = 'none';
  }

  function validateForm() {
    const name = $('#cust-name').value.trim();
    const email = $('#cust-email').value.trim();
    $('#pay-btn').disabled = !(name && email && email.includes('@'));
  }

  async function submitCheckout() {
    const name = $('#cust-name').value.trim();
    const email = $('#cust-email').value.trim();
    const payBtn = $('#pay-btn');
    const errEl = $('#checkout-error');

    payBtn.textContent = 'Connecting to Stripe...';
    payBtn.disabled = true;
    errEl.style.display = 'none';

    try {
      const res = await fetch(CHECKOUT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(i => ({
            id: i.id, name: i.name, price: i.price,
            freq: i.freq, setup: i.setup, qty: i.qty,
          })),
          customerName: name,
          customerEmail: email,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      window.location.href = data.url;
    } catch (err) {
      errEl.textContent = '⚠ ' + err.message;
      errEl.style.display = 'block';
      payBtn.textContent = 'Pay with Stripe →';
      payBtn.disabled = false;
    }
  }

  /* ── Qty controls on product cards ── */
  function bindCardQtyButtons() {
    $$('.qty-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.closest('.addon-card, .membership-card').querySelector('.qty-val');
        val.textContent = Math.max(1, parseInt(val.textContent) - 1);
      });
    });
    $$('.qty-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.closest('.addon-card, .membership-card').querySelector('.qty-val');
        val.textContent = parseInt(val.textContent) + 1;
      });
    });
  }

  /* ── Init ── */
  document.addEventListener('DOMContentLoaded', () => {
    // add to cart buttons
    $$('.add-to-cart').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('[data-id]');
        addItem(card);
      });
    });

    bindCardQtyButtons();

    // cart open/close
    $('#cart-fab').addEventListener('click', openCart);
    $('#cart-close').addEventListener('click', closeCart);
    $('#cart-overlay').addEventListener('click', closeCart);

    // checkout
    $('#checkout-btn').addEventListener('click', openModal);
    $('#modal-cancel').addEventListener('click', closeModal);
    $('#modal-overlay').addEventListener('click', e => { if (e.target === $('#modal-overlay')) closeModal(); });
    $('#pay-btn').addEventListener('click', submitCheckout);
    $('#cust-name').addEventListener('input', validateForm);
    $('#cust-email').addEventListener('input', validateForm);

    // check Stripe cancelled
    const params = new URLSearchParams(window.location.search);
    if (params.get('cancelled') === 'true') {
      const notice = document.createElement('div');
      notice.className = 'cancel-notice';
      notice.innerHTML = 'Payment was cancelled. Your cart is still saved. <button onclick="this.parentElement.remove()">✕</button>';
      $('#store').prepend(notice);
      history.replaceState({}, '', '/membership/');
    }
  });

})();
